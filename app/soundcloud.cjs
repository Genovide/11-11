const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { spawn } = require('node:child_process'),
  { Readable } = require('node:stream');
const pageUrl = (value) => {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(
      u.hostname
    )
  )
    throw Error('Нужна ссылка SoundCloud');
  return u.href;
};
const cdnUrl = (value) => {
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    !['sndcdn.com', 'soundcloud.com', 'soundcloud.cloud', 'cloudfront.net'].some(
      (h) => u.hostname === h || u.hostname.endsWith('.' + h)
    )
  )
    throw Error('SoundCloud вернул неизвестный адрес потока');
  return u.href;
};
function apiTrack(t) {
  const info = t.publisher_metadata || {},
    raw = t.title || 'Без названия',
    split = raw.match(/^(.+?)\s+[-–—]\s+(.+)$/),
    artist = t.metadata_artist || info.artist || split?.[1] || t.user?.username || 'SoundCloud';
  return require('./text-repair.js').repairTrackMetadata({
    ...require('./soundcloud-availability.cjs').availability(t),
    id: 'sc-' + String(t.id || t.urn?.split(':').pop()),
    scId: String(t.id || t.urn?.split(':').pop()),
    urn: t.urn,
    genre: t.genre || '',
    tags: t.tag_list || '',
    bpm: Number(t.bpm) || null,
    remote: true,
    originalTitle: raw,
    uploader: t.user?.username || '',
    publisherArtist: t.metadata_artist || info.artist || '',
    title: t.metadata_artist || info.artist ? raw : split?.[2] || raw,
    artist,
    albumartist: artist,
    album: info.album_title || 'SoundCloud Single',
    duration: (t.duration || 0) / 1000,
    cover: t.artwork_url || t.user?.avatar_url || '',
    pageUrl: t.permalink_url,
    lyrics: '',
    downloadable: !!t.downloadable,
    access: t.access,
    downloadUrl: t.download_url,
  });
}
module.exports = function setupSoundCloud({
  app,
  ipcMain,
  dialog,
  safeStorage,
  getWindow,
  getLibrary,
  save,
  refreshAllowed,
  readTrack,
  isAligning,
  send,
  fetchImpl = fetch,
  workerImpl,
  trashItem = (file) => require('electron').shell.trashItem(file),
}) {
  const dir = path.join(app.getPath('userData'), 'soundcloud'),
    python = require('./runtime-paths.cjs').python,
    script = require('./runtime-paths.cjs').script('soundcloud_worker.py');
  const identityStore = require('./metadata-overrides.cjs')({ dir });
  const metadataResolver = require('./metadata-resolver.cjs')({
    dir: path.join(dir, 'metadata'),
    fetchImpl,
  });
  const fast = require('./soundcloud-fast.cjs')({ dir, fetchImpl, mapTrack: apiTrack }),
    resolveJobs = new Map();
  const hlsManifests = new Map();
  const excludedTracks = new Map(),
    favoriteRevisions = new Map();
  let exclusionWrites = Promise.resolve();
  const savedFavorites = new Map();
  let favoriteWrites = Promise.resolve();
  const historyTracks = new Map();
  let historyWrites = Promise.resolve();
  const tracks = new Map(),
    coverCache = new Map(),
    resolved = new Map(),
    children = new Set(),
    busyDownloads = new Set();
  let config = {
      folder: path.join(app.getPath('music'), 'SoundSync'),
      allowStreamDownload: true,
      clientId: '',
    },
    secret = '',
    token = null,
    tokenJob = null,
    initial;
  const settingsFile = path.join(dir, 'settings.json');
  async function init() {
    await identityStore.ready;
    await fs.mkdir(dir, { recursive: true });
    try {
      const s = JSON.parse(await fs.readFile(settingsFile, 'utf8'));
      config = { ...config, ...s };
      if (s.encryptedSecret && safeStorage.isEncryptionAvailable())
        secret = safeStorage.decryptString(Buffer.from(s.encryptedSecret, 'base64'));
      delete config.encryptedSecret;
    } catch {}
    try {
      const list = JSON.parse(await fs.readFile(path.join(dir, 'excluded.json'), 'utf8'));
      for (const t of list)
        if (t?.id && t.pageUrl) {
          pageUrl(t.pageUrl);
          excludedTracks.set(t.id, t);
        }
    } catch {}
    try {
      const list = JSON.parse(await fs.readFile(path.join(dir, 'favorites.json'), 'utf8'));
      for (const t of register(list)) savedFavorites.set(t.id, t);
    } catch {}
    try {
      const list = JSON.parse(await fs.readFile(path.join(dir, 'history.json'), 'utf8'));
      for (const t of register(list.slice(0, 100))) historyTracks.set(t.id, t);
    } catch {}
    return status();
  }
  function status() {
    return {
      folder: config.folder,
      allowStreamDownload: !!config.allowStreamDownload,
      officialConfigured: !!(config.clientId && secret),
      clientId: config.clientId || '',
      mode: config.clientId && secret ? 'official' : 'public',
    };
  }
  initial = init();
  async function persist() {
    const stored = { ...config };
    if (secret) {
      if (!safeStorage.isEncryptionAvailable())
        throw Error('Windows не предоставила защищённое хранилище ключей');
      stored.encryptedSecret = safeStorage.encryptString(secret).toString('base64');
    }
    const tmp = settingsFile + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(stored));
    await fs.rename(tmp, settingsFile);
  }
  function worker(job, onProgress) {
    if (workerImpl) return workerImpl(job, onProgress);
    return new Promise((resolve, reject) => {
      const child = spawn(python, [script], {
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONDONTWRITEBYTECODE: '1',
          TEMP: dir,
          TMP: dir,
        },
      });
      children.add(child);
      let buffer = '',
        result,
        error = '',
        stderr = '';
      const timer = setTimeout(
        () => {
          error = 'SoundCloud не ответил вовремя';
          child.kill();
        },
        job.action === 'download' ? 15 * 60 * 1000 : 120000
      );
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (s) => {
        buffer += s;
        const rows = buffer.split(/\r?\n/);
        buffer = rows.pop();
        for (const row of rows) {
          try {
            const p = JSON.parse(row);
            if (p.kind === 'result') result = p;
            else if (p.kind === 'error') error = p.message;
            else if (p.kind === 'progress') onProgress?.(p);
          } catch {}
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (s) => {
        stderr = (stderr + s).slice(-6000);
      });
      child.on('error', (e) => {
        error = e.message;
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        children.delete(child);
        const missing = /ModuleNotFoundError: No module named ['"]([^'"]+)['"]/.exec(stderr);
        if (code || !result)
          reject(
            Error(
              error ||
                (missing
                  ? 'Не удалось запустить обработчик SoundCloud: не найден модуль ' + missing[1]
                  : 'Обработчик SoundCloud завершился без результата (код ' + code + ').')
            )
          );
        else resolve(result);
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify({ ...job, cache: dir }));
    });
  }
  async function jsonFetch(url, options = {}) {
    const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(30000) });
    if (!response.ok)
      throw Error(
        response.status === 429
          ? 'SoundCloud ограничил частоту запросов. Попробуй позже.'
          : `SoundCloud: HTTP ${response.status}`
      );
    return response.json();
  }
  async function accessToken() {
    if (token && token.expires > Date.now() + 60000) return token.access;
    if (tokenJob) return tokenJob;
    tokenJob = (async () => {
      const body = new URLSearchParams(
        token?.refresh
          ? {
              grant_type: 'refresh_token',
              refresh_token: token.refresh,
              client_id: config.clientId,
              client_secret: secret,
            }
          : { grant_type: 'client_credentials' }
      );
      const data = await jsonFetch('https://secure.soundcloud.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          ...(!token?.refresh
            ? {
                Authorization:
                  'Basic ' + Buffer.from(config.clientId + ':' + secret).toString('base64'),
              }
            : {}),
        },
        body: body.toString(),
      });
      token = {
        access: data.access_token,
        refresh: data.refresh_token,
        expires: Date.now() + (data.expires_in || 3600) * 1000,
      };
      return token.access;
    })();
    try {
      return await tokenJob;
    } finally {
      tokenJob = null;
    }
  }
  async function api(endpoint) {
    const url = new URL(endpoint, 'https://api.soundcloud.com');
    if (url.origin !== 'https://api.soundcloud.com') throw Error('Недопустимый API URL');
    return jsonFetch(url.href, {
      headers: { Authorization: 'OAuth ' + (await accessToken()), Accept: 'application/json' },
    });
  }
  function isExcluded(t) {
    return (
      excludedTracks.has(t.id) ||
      [...excludedTracks.values()].some(
        (x) =>
          require('./wave-selection.cjs').identity(x) ===
          require('./wave-selection.cjs').identity(t)
      )
    );
  }
  function register(items) {
    const result = [];
    for (let t of items) {
      if (t) t = identityStore.apply(require('./text-repair.js').repairTrackMetadata(t));
      if (t && isExcluded(t)) continue;
      if (!t?.scId || !t.pageUrl || t.access === 'blocked' || t.access === 'preview') continue;
      try {
        pageUrl(t.pageUrl);
      } catch {
        continue;
      }
      tracks.set(t.id, t);
      result.push(t);
    }
    while (tracks.size > 1000) tracks.delete(tracks.keys().next().value);
    return result.map((t) => ({ ...t, downloadUrl: undefined }));
  }
  const { buildProfile, filterProfile } = require('./discovery-profile.cjs');
  async function discoveryPage(request, offset = 0) {
    const profile = buildProfile(request);
    let list;
    if (status().officialConfigured) {
      const params = new URLSearchParams({
        limit: '50',
        offset: String(offset),
        access: 'playable',
        linked_partitioning: 'true',
      });
      if (request.mode === 'genre') params.set('genres', request.query);
      else params.set('q', request.query);
      const data = await api('/tracks?' + params);
      list = (data.collection || data).map(apiTrack);
    } else if (!workerImpl) {
      try {
        list = await fast.search(request.query, {
          offset,
          limit: 50,
          genre: request.mode === 'genre' ? request.query : undefined,
        });
      } catch {}
    }
    if (!list) list = (await worker({ action: 'search', query: request.query })).tracks;
    return filterProfile(register(list), profile);
  }
  async function search(value) {
    await initial;
    const request = require('./wave-query.cjs').parseQuery(value),
      query = request.query;
    if (query.startsWith('https://')) pageUrl(query);
    if (request.mode !== 'artist') {
      let results = await discoveryPage(request);
      if (results.length < 12) {
        const extra = await Promise.allSettled([
          discoveryPage(request, 50),
          discoveryPage(request, 100),
        ]);
        results.push(...extra.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));
      }
      return [...new Map(results.map((t) => [t.id, t])).values()].slice(0, 50);
    }
    if (status().officialConfigured) {
      const data = query.startsWith('https://')
        ? await api('/resolve?url=' + encodeURIComponent(pageUrl(query)))
        : await api(
            '/tracks?q=' +
              encodeURIComponent(query) +
              '&limit=25&access=playable&linked_partitioning=true'
          );
      const list = data.collection || data.tracks || (Array.isArray(data) ? data : [data]);
      return register(
        list.filter((t) => t.kind === 'track' || t.duration !== undefined).map(apiTrack)
      );
    }
    if (!workerImpl) {
      try {
        return register(await fast.search(query));
      } catch {}
    }
    return register((await worker({ action: 'search', query })).tracks);
  }

  async function related(id, query) {
    await initial;
    const t = tracks.get(id);
    if (t) {
      try {
        if (status().officialConfigured) {
          const data = await api(
            '/tracks/' + encodeURIComponent(t.urn || t.scId) + '/related?limit=25'
          );
          return register((data.collection || data).map(apiTrack));
        }
        if (!workerImpl) {
          try {
            return register(await fast.related(t));
          } catch {}
        }
        return register((await worker({ action: 'related', url: t.pageUrl })).tracks);
      } catch {}
    }
    return search(query || 'electronic');
  }
  const { normalize, artistKey, owner, identity, selectDiverse } = require('./wave-selection.cjs'),
    stations = new Map();
  const detailCache = new Map();
  async function enrichUnknown(items) {
    const unknown = items
      .filter((t) =>
        ['soundcloud', 'unknown', 'неизвестныйисполнитель'].includes(artistKey(t.artist))
      )
      .slice(0, 12);
    for (let offset = 0; offset < unknown.length; offset += 4)
      await Promise.allSettled(
        unknown.slice(offset, offset + 4).map(async (t) => {
          if (!detailCache.has(t.id)) {
            if (detailCache.size >= 500) detailCache.delete(detailCache.keys().next().value);
            detailCache.set(
              t.id,
              worker({ action: 'details', url: t.pageUrl })
                .then((result) => result.track)
                .catch(() => t)
            );
          }
          const detailed = await detailCache.get(t.id);
          register([detailed]);
          Object.assign(t, detailed);
        })
      );
    return items;
  }
  async function relatedStrict(t) {
    if (status().officialConfigured) {
      const data = await api(
        '/tracks/' + encodeURIComponent(t.urn || t.scId) + '/related?limit=80'
      );
      return register((data.collection || data).map(apiTrack));
    }
    if (!workerImpl) {
      try {
        return register(await fast.related(t));
      } catch {}
    }
    return enrichUnknown(register((await worker({ action: 'related', url: t.pageUrl })).tracks));
  }
  async function stationBatch(station, currentId, recentArtists = []) {
    if (station.mode !== 'artist' && !status().officialConfigured && !workerImpl) {
      try {
        const items = await discoveryPage(
          { query: station.query, mode: station.mode },
          station.offset
        );
        station.offset += 50;
        const batch = selectDiverse(items, {
          seenIds: station.seenIds,
          seenIdentities: station.seenIdentities,
          recentArtists,
        });
        if (batch.length >= 4) {
          for (const t of batch) {
            station.seenIds.add(t.id);
            station.seenIdentities.add(identity(t));
          }
          station.bridges = batch.slice(0, 3);
          return batch;
        }
      } catch {}
    }
    const sources = [];
    const original = station.anchors[station.cursor++ % station.anchors.length];
    sources.push(original);
    const current = tracks.get(currentId);
    if (current && artistKey(current.artist) !== artistKey(original.artist)) sources.push(current);
    else if (station.anchors.length > 1)
      sources.push(station.anchors[station.cursor++ % station.anchors.length]);
    const ranked = (list) => {
      list = filterProfile(list, station.profile);
      const counts = new Map();
      for (const t of list) counts.set(t.id, (counts.get(t.id) || 0) + 1);
      return list.map((t) => ({ ...t, relationVotes: counts.get(t.id) }));
    };
    const results = await Promise.allSettled(sources.map(relatedStrict));
    let candidates = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    let selected = selectDiverse(ranked(candidates), {
      seedArtists: station.seedArtists,
      seedOwners: station.seedOwners,
      seenIds: station.seenIds,
      seenIdentities: station.seenIdentities,
      recentArtists,
    });
    // Widen only through SoundCloud's relationship graph, never an unrelated library artist.
    if (selected.length < 4) {
      const extra = station.anchors[station.cursor++ % station.anchors.length];
      if (!sources.some((t) => t.id === extra.id)) {
        try {
          candidates.push(...(await relatedStrict(extra)));
        } catch {}
      }
      const bridge = selected[0] || station.bridges?.[station.cursor % station.bridges.length];
      if (bridge && !sources.some((t) => t.id === bridge.id)) {
        try {
          candidates.push(...(await relatedStrict(bridge)));
        } catch {}
      }
      selected = selectDiverse(ranked(candidates), {
        seedArtists: station.seedArtists,
        seedOwners: station.seedOwners,
        seenIds: station.seenIds,
        seenIdentities: station.seenIdentities,
        recentArtists,
      });
    }
    if (!selected.length) {
      const error = results.find((r) => r.status === 'rejected');
      if (!candidates.length && error) throw error.reason;
      throw Error(
        'SoundCloud пока не предложил новых похожих треков других артистов. Попробуй другую отправную песню.'
      );
    }
    station.bridges = selected.slice(0, 3);
    for (const t of selected) {
      station.seenIds.add(t.id);
      station.seenIdentities.add(identity(t));
    }
    station.touched = Date.now();
    return selected;
  }
  async function startStation(seed) {
    const request = require('./wave-query.cjs').parseQuery(seed);
    seed = request.query;
    const matches = await search(request);
    if (!matches.length)
      throw Error(
        request.mode === 'artist'
          ? 'Не удалось найти отправную песню'
          : 'Не найдены треки с подходящим жанром или тегами. Попробуй другое направление.'
      );
    const query = artistKey(seed),
      exact = matches.filter((t) => artistKey(t.artist) === query),
      starting = exact.length ? exact : matches;
    const first = starting[0],
      anchors = starting.filter((t) => artistKey(t.artist) === artistKey(first.artist)).slice(0, 4);
    const station = {
      profile: buildProfile(request),
      mode: request.mode,
      query: seed,
      offset: 150,
      anchors: anchors.length ? anchors : [first],
      seedArtists: [first.artist],
      seedOwners: [owner(first)],
      seenIds: new Set(),
      seenIdentities: new Set(),
      cursor: 0,
      touched: Date.now(),
    };
    let selected;
    if (request.mode === 'artist') selected = await stationBatch(station);
    else {
      station.seedArtists = [];
      station.seedOwners = [];
      selected = selectDiverse(matches, { limit: 12 });
      for (const t of selected) {
        station.seenIds.add(t.id);
        station.seenIdentities.add(identity(t));
      }
      station.bridges = selected.slice(0, 3);
      if (!selected.length) selected = await stationBatch(station);
    }
    const stationId = crypto.randomBytes(12).toString('hex');
    stations.set(stationId, station);
    while (stations.size > 5) stations.delete(stations.keys().next().value);
    return {
      stationId,
      tracks: selected,
      basedOn: request.mode === 'artist' ? first.artist.replace(/[,\s]+$/, '') : request.original,
      mode: request.mode,
      seedTrack: first.title,
    };
  }
  ipcMain.handle('sc-wave-start', (_, seed) => startStation(seed));
  ipcMain.handle('sc-wave-next', async (_, stationId, currentId, recentArtists) => {
    const station = stations.get(stationId);
    if (!station) throw Error('Сессия волны закончилась. Запусти её заново');
    if (station.busy) return { tracks: await station.busy };
    station.busy = stationBatch(
      station,
      currentId,
      Array.isArray(recentArtists)
        ? recentArtists.slice(-10).map((s) => String(s).slice(0, 300))
        : []
    );
    try {
      return { tracks: await station.busy };
    } finally {
      station.busy = null;
    }
  });
  async function resolve(id) {
    if (resolveJobs.has(id)) return resolveJobs.get(id);
    const job = resolveStream(id);
    resolveJobs.set(id, job);
    try {
      return await job;
    } finally {
      resolveJobs.delete(id);
    }
  }
  async function ffmpegPath() {
    const runtime = require('./runtime-paths.cjs');
    for (const site of ['Lib/site-packages', 'lib/python3.12/site-packages']) {
      const dir = path.join(runtime.base, 'runtime', site, 'imageio_ffmpeg/binaries');
      try {
        const files = await fs.readdir(dir);
        const name = files.find((n) =>
          process.platform === 'win32'
            ? /^ffmpeg.*win.*\.exe$/.test(n)
            : /^ffmpeg.*(?:macos|osx).*(?:arm64|aarch64)/.test(n)
        );
        if (name) return path.join(dir, name);
      } catch {}
    }
    return (await worker({ action: 'runtime' })).ffmpeg;
  }
  async function resolveStream(id) {
    const t = tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id);
    if (!t) throw Error('Трек устарел — выполни поиск ещё раз');
    const unavailable = require('./soundcloud-availability.cjs').unavailableError(t);
    if (unavailable) throw unavailable;
    const cached = resolved.get(id);
    if (cached && cached.until > Date.now()) return cached.value;
    let value;
    if (status().officialConfigured) {
      const urls = await api('/tracks/' + encodeURIComponent(t.urn || t.scId) + '/streams');
      const url =
        urls.http_mp3_128_url ||
        urls.hls_mp3_128_url ||
        urls.hls_aac_160_url ||
        Object.entries(urls).find(([k, v]) => k.includes('url') && typeof v === 'string')?.[1];
      if (!url) throw Error('У трека нет доступного потока');
      value = {
        url,
        ffmpeg: await ffmpegPath(),
        mp3: url === urls.http_mp3_128_url || url === urls.hls_mp3_128_url,
        protocol: url === urls.http_mp3_128_url ? 'progressive' : 'hls',
      };
    } else {
      if (!workerImpl) {
        try {
          value = await fast.resolve(t);
        } catch (e) {
          if (e.code?.startsWith('SC_')) throw e;
        }
      }
      if (!value) value = await worker({ action: 'resolve', url: t.pageUrl });
    }
    cdnUrl(value.url);
    resolved.set(id, { until: Date.now() + 180000, value });
    // Ссылки живут 3 минуты: выбрасываем просроченные, чтобы кэш не рос всю сессию.
    if (resolved.size > 200)
      for (const [key, entry] of resolved) if (entry.until <= Date.now()) resolved.delete(key);
    return value;
  }
  async function download(id) {
    await initial;
    const t = tracks.get(id);
    if (!t) throw Error('Сначала найди трек в SoundCloud');
    if (busyDownloads.has(id)) throw Error('Этот трек уже скачивается');
    const existing = getLibrary().tracks.find((x) => x.soundcloudId === t.scId);
    if (existing) {
      try {
        await fs.access(existing.path);
        return { track: existing, existing: true };
      } catch {}
    }
    busyDownloads.add(id);
    try {
      try {
        await improveMetadata(id);
      } catch {}
      let officialUrl;
      if (status().officialConfigured && t.downloadable) {
        const downloadEndpoint =
          t.downloadUrl ||
          'https://api.soundcloud.com/tracks/' + encodeURIComponent(t.urn || t.scId) + '/download';
        if (new URL(downloadEndpoint).origin !== 'https://api.soundcloud.com')
          throw Error('Недопустимый адрес оригинала');
        const response = await fetchImpl(downloadEndpoint, {
          redirect: 'manual',
          headers: { Authorization: 'OAuth ' + (await accessToken()) },
          signal: AbortSignal.timeout(30000),
        });
        if (response.status >= 300 && response.status < 400)
          officialUrl = cdnUrl(response.headers.get('location'));
        else if (response.ok) {
          const data = await response.json();
          officialUrl = cdnUrl(data.redirectUri || data.url);
        } else if (!config.allowStreamDownload)
          throw Error('Оригинал недоступен: HTTP ' + response.status);
      }
      const result = await worker(
        {
          action: 'download',
          url: t.pageUrl,
          folder: config.folder,
          allow_stream_download: config.allowStreamDownload,
          official_url: officialUrl,
          metadata_override:
            t.metadataSource || t.metadataEncodingFixed || t.metadataManual
              ? {
                  title:
                    t.title +
                    (t.metadataManual && t.metadataVersion ? ' (' + t.metadataVersion + ')' : ''),
                  artist: t.artist,
                  album: t.album,
                }
              : undefined,
          metadata_confirmed: !!(t.metadataSource || t.metadataManual),
          extractor_info: resolved.get(id)?.value?.extractor_info,
          official_metadata: officialUrl
            ? {
                id: t.scId,
                title: t.title,
                artist: t.artist,
                album: t.album,
                thumbnail: t.cover,
                webpage_url: t.pageUrl,
              }
            : undefined,
        },
        (p) => send('sc-progress', { id, ...p })
      );
      const local = await readTrack(result.path);
      local.soundcloudId = t.scId;
      local.soundcloudUrl = t.pageUrl;
      local.downloaded = true;
      const library = getLibrary();
      library.tracks = library.tracks.filter((x) => x.id !== local.id);
      library.tracks.push(local);
      refreshAllowed();
      await save();
      return { track: local, original: result.original, warning: result.artworkWarning };
    } finally {
      busyDownloads.delete(id);
    }
  }
  async function handleProtocol(request) {
    const u = new URL(request.url),
      id = u.pathname.slice(1),
      t = tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id);
    if (!t) return new Response('Track not found', { status: 404 });
    if (u.hostname === 'sc-cover') {
      try {
        const url = cdnUrl(t.cover);
        let bytes = coverCache.get(url);
        if (!bytes) {
          const candidates = require('./soundcloud-artwork.cjs').artworkCandidates(url);
          for (const candidate of candidates) {
            try {
              const r = await fetchImpl(candidate, { signal: AbortSignal.timeout(7000) });
              if (!r.ok) {
                await r.body?.cancel();
                continue;
              }
              const data = Buffer.from(await r.arrayBuffer());
              if (data.length > 10000000) continue;
              const mime = r.headers.get('content-type') || '';
              if (!mime.startsWith('image/')) continue;
              bytes = { data, mime };
              break;
            } catch {}
          }
          if (!bytes) throw Error();
          coverCache.set(url, bytes);
          if (coverCache.size > 100) coverCache.delete(coverCache.keys().next().value);
        }
        return new Response(bytes.data, {
          headers: { 'Content-Type': bytes.mime, 'Access-Control-Allow-Origin': '*' },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    }
    if (u.hostname !== 'sc-stream') return new Response(null, { status: 404 });
    if (request.signal?.aborted) return new Response(null, { status: 499 });

    try {
      let value = await resolve(id);
      const start = Math.max(
        0,
        Math.min(Math.max(0, (t.duration || 86400) - 0.1), Number(u.searchParams.get('start')) || 0)
      );
      if (!start && value.protocol === 'progressive' && value.mp3) {
        const headers = {};
        const range = request.headers.get('range');
        if (range) headers.Range = range;
        const url = cdnUrl(value.url);
        let upstream = await fetchImpl(url, { headers, signal: request.signal });
        if ([401, 403].includes(upstream.status)) {
          await upstream.body?.cancel();
          resolved.delete(id);
          fast.clear();
          value = await resolve(id);
          upstream = await fetchImpl(cdnUrl(value.url), { headers, signal: request.signal });
        }
        if (!upstream.ok) throw Error('Stream HTTP ' + upstream.status);
        const out = {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        };
        for (const h of ['Content-Length', 'Content-Range', 'Accept-Ranges'])
          if (upstream.headers.has(h)) out[h] = upstream.headers.get(h);
        return new Response(upstream.body, { status: upstream.status, headers: out });
      }
      let trimmed = null;
      if (start && value.protocol !== 'progressive') {
        try {
          let text = hlsManifests.get(value.url);
          if (!text) {
            const r = await fetchImpl(cdnUrl(value.url), {
              signal: AbortSignal.any([request.signal, AbortSignal.timeout(7000)]),
            });
            if (r.ok) {
              text = await r.text();
              if (text.length < 2000000) {
                hlsManifests.set(value.url, text);
                if (hlsManifests.size > 15) hlsManifests.delete(hlsManifests.keys().next().value);
              }
            }
          }
          if (text)
            trimmed = require('./hls-seek.cjs').trimHlsPlaylist(text, value.url, start, cdnUrl);
        } catch {}
      }
      if (request.signal?.aborted) return new Response(null, { status: 499 });
      for (const child of [...children]) if (child.scStream) child.kill();
      const args = [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-analyzeduration',
        '0',
        '-probesize',
        '32768',
      ];
      if (trimmed) {
        args.push('-protocol_whitelist', 'https,http,tcp,tls,pipe', '-allowed_extensions', 'ALL');
        if (trimmed.offset) args.push('-ss', String(trimmed.offset));
        args.push('-f', 'hls', '-i', 'pipe:0', '-vn');
      } else {
        if (start) args.push('-ss', String(start));
        args.push('-i', value.url, '-vn');
      }
      if (value.mp3) args.push('-c:a', 'copy');
      else args.push('-b:a', '192k');
      args.push('-f', 'mp3', 'pipe:1');
      const child = spawn(value.ffmpeg || (await ffmpegPath()), args, { windowsHide: true });
      child.scStream = true;
      children.add(child);
      child.stdin.on('error', () => {});
      if (trimmed) child.stdin.end(trimmed.playlist);
      else child.stdin.end();
      child.stderr.resume();
      child.on('error', () => child.stdout.destroy());
      child.on('close', () => children.delete(child));
      request.signal?.addEventListener('abort', () => child.kill(), { once: true });
      child.stdout.on('close', () => child.kill());
      return new Response(Readable.toWeb(child.stdout), {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        },
      });
    } catch (e) {
      send?.('sc-playback-error', {
        id,
        code: e.code || 'SC_STREAM',
        message: e.code?.startsWith('SC_')
          ? e.message
          : 'Не удалось получить поток SoundCloud. Попробуй ещё раз или выбери другую запись.',
      });
      return new Response('Stream unavailable', { status: 502 });
    }
  }
  async function removeTrack(id) {
    if (typeof id !== 'string') throw Error('Недопустимый трек');
    const t = getLibrary().tracks.find((x) => x.id === id);
    if (!t) throw Error('Трек не найден');
    if (isAligning(id)) throw Error('Сначала отмени синхронизацию текста');
    const confirmed = await dialog.showMessageBox(getWindow(), {
      type: 'warning',
      buttons: ['Отмена', 'Переместить в Корзину'],
      defaultId: 0,
      cancelId: 0,
      title: 'Удалить трек?',
      message: t.artist + ' — ' + t.title,
      detail:
        'Файл будет перемещён в Корзину, его можно восстановить:\n' +
        t.path +
        '\n\nТекст и тайминги сохранятся и вернутся, если восстановить файл и пересканировать медиатеку.',
    });
    if (confirmed.response !== 1) return { cancelled: true };
    try {
      await fs.access(t.path);
      await trashItem(t.path);
    } catch (e) {
      if (e.code !== 'ENOENT') throw Error('Не удалось переместить файл в Корзину: ' + e.message);
    }
    const lib = getLibrary();
    lib.tracks = lib.tracks.filter((x) => x.path !== t.path);
    refreshAllowed();
    await save();
    return { id, deleted: true };
  }
  async function persistFavorites() {
    const snapshot = JSON.stringify([...savedFavorites.values()]);
    favoriteWrites = favoriteWrites
      .catch(() => {})
      .then(async () => {
        const temp = path.join(dir, 'favorites.json.tmp');
        await fs.writeFile(temp, snapshot);
        await fs.rename(temp, path.join(dir, 'favorites.json'));
      });
    return favoriteWrites;
  }
  ipcMain.handle('sc-favorite-set', async (_, id, liked) => {
    await initial;
    if (typeof id !== 'string' || !/^sc-[a-zA-Z0-9:-]+$/.test(id) || typeof liked !== 'boolean')
      throw Error('Недопустимый трек');
    favoriteRevisions.set(id, (favoriteRevisions.get(id) || 0) + 1);
    if (liked) {
      const t = tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id);
      if (!t) throw Error('Сначала открой трек в SoundCloud');
      if (isExcluded(t)) throw Error('Сначала убери трек из списка «Не нравится»');
      const clean = { ...t, lyrics: '', alignment: undefined, downloadUrl: undefined };
      savedFavorites.set(id, clean);
    } else savedFavorites.delete(id);
    await persistFavorites();
    return { saved: liked };
  });
  ipcMain.handle('sc-favorite-tracks', async (_, ids = []) => {
    await initial;
    const missing = [...new Set(Array.isArray(ids) ? ids : [])]
      .filter((id) => typeof id === 'string' && /^sc-\d+$/.test(id) && !savedFavorites.has(id))
      .slice(0, 1000);
    for (let i = 0; i < missing.length; i += 4)
      await Promise.allSettled(
        missing.slice(i, i + 4).map(async (id) => {
          const revision = favoriteRevisions.get(id) || 0;
          const t = status().officialConfigured
            ? apiTrack(await api('/tracks/' + encodeURIComponent(id.slice(3))))
            : await fast.lookup(id.slice(3));
          if ((favoriteRevisions.get(id) || 0) === revision && register([t]).length)
            savedFavorites.set(id, t);
        })
      );
    if (missing.length) await persistFavorites();
    register([...savedFavorites.values()]);
    return [...savedFavorites.values()];
  });
  ipcMain.handle('sc-excluded-list', async () => {
    await initial;
    return [...excludedTracks.values()];
  });
  ipcMain.handle('sc-excluded-set', async (_, id, excluded) => {
    await initial;
    if (typeof id !== 'string' || !/^sc-[a-zA-Z0-9:-]+$/.test(id) || typeof excluded !== 'boolean')
      throw Error('Недопустимый трек');
    if (excluded) {
      const t = tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id);
      if (!t) throw Error('Сначала открой трек');
      excludedTracks.set(id, {
        id: t.id,
        scId: t.scId,
        title: t.title,
        artist: t.artist,
        pageUrl: t.pageUrl,
        remote: true,
      });
      for (const [key, t] of savedFavorites)
        if (isExcluded(t)) {
          savedFavorites.delete(key);
          favoriteRevisions.set(key, (favoriteRevisions.get(key) || 0) + 1);
        }
      await persistFavorites();
    } else excludedTracks.delete(id);
    const snapshot = JSON.stringify([...excludedTracks.values()]);
    exclusionWrites = exclusionWrites
      .catch(() => {})
      .then(async () => {
        const temp = path.join(dir, 'excluded.json.tmp');
        await fs.writeFile(temp, snapshot);
        await fs.rename(temp, path.join(dir, 'excluded.json'));
      });
    await exclusionWrites;
    return [...excludedTracks.values()];
  });
  async function improveMetadata(id, force = false) {
    await initial;
    const t = tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id);
    if (!t) throw Error('Сначала найди или открой этот трек');
    const improved = t.metadataManual ? t : await metadataResolver.resolve(t, { force });
    Object.assign(t, improved);
    register([t]);
    if (savedFavorites.has(id)) {
      savedFavorites.set(id, { ...t, lyrics: '', alignment: undefined });
      await persistFavorites();
    }
    return { ...t, downloadUrl: undefined };
  }
  ipcMain.handle('sc-metadata-set', async (event, id, patch) => {
    if (event.sender !== getWindow()?.webContents) throw Error('Unknown window');
    await initial;
    const t = tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id);
    if (!t) throw Error('Сначала открой трек SoundCloud');
    await identityStore.set(t, patch);
    register([t]);
    if (savedFavorites.has(id)) {
      savedFavorites.set(id, { ...t, lyrics: '', alignment: undefined });
      await persistFavorites();
    }
    return { ...t, downloadUrl: undefined };
  });
  ipcMain.handle('sc-metadata', (_, id, force) => improveMetadata(id, force === true));
  ipcMain.handle('sc-prefetch', async (_, id) => {
    if (typeof id !== 'string' || !tracks.has(id)) return false;
    await initial;
    await resolve(id);
    return true;
  });
  ipcMain.handle('sc-status', () => initial.then(status));
  ipcMain.handle('sc-settings', async (_, settings) => {
    await initial;
    if (typeof settings?.allowStreamDownload === 'boolean')
      config.allowStreamDownload = settings.allowStreamDownload;
    if (typeof settings?.clientId === 'string')
      config.clientId = settings.clientId.trim().slice(0, 300);
    if (settings?.clientSecret) secret = String(settings.clientSecret).trim().slice(0, 500);
    if (settings?.clearCredentials) {
      config.clientId = '';
      secret = '';
      token = null;
    }
    token = null;
    resolved.clear();
    fast.clear();
    await persist();
    return status();
  });
  ipcMain.handle('sc-folder', async () => {
    await initial;
    const result = await dialog.showOpenDialog(getWindow(), {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Куда сохранять треки SoundCloud?',
    });
    if (!result.canceled) {
      config.folder = result.filePaths[0];
      await persist();
    }
    return status();
  });
  async function randomTracks(excluded = []) {
    const skip = new Set(
      Array.isArray(excluded) ? excluded.filter((id) => typeof id === 'string').slice(-50000) : []
    );
    await initial;
    const genres = [
      'rap',
      'electronic',
      'rock',
      'pop',
      'jazz',
      'ambient',
      'techno',
      'phonk',
      'metal',
      'alternative rock',
    ];
    for (let i = genres.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [genres[i], genres[j]] = [genres[j], genres[i]];
    }
    const shuffled = genres.slice(0, 2);
    const batches = await Promise.allSettled(
      shuffled.map((query) => discoveryPage({ mode: 'genre', query }, crypto.randomInt(4) * 50))
    );
    let pool = [
      ...new Map(
        batches
          .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
          .filter((t) => !t.playbackUnavailable && !skip.has(t.id))
          .map((t) => [t.id, t])
      ).values(),
    ];
    if (!pool.length) {
      try {
        pool = await discoveryPage({ mode: 'genre', query: shuffled[0] }, 0);
      } catch {}
    }
    pool = pool.filter((t) => !skip.has(t.id) && !t.playbackUnavailable);
    if (!pool.length)
      throw Error('Не удалось загрузить случайные треки SoundCloud. Попробуй обновить подборку.');
    for (let i = pool.length - 1; i > 0; i--) {
      const j = crypto.randomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 6);
  }
  ipcMain.handle('sc-random', (_, excluded) => randomTracks(excluded));
  ipcMain.handle('sc-history', async () => {
    await initial;
    return [...historyTracks.values()].filter((t) => !isExcluded(t));
  });
  ipcMain.handle('sc-history-record', async (event, id) => {
    if (event.sender !== getWindow()?.webContents) throw Error('Unknown window');
    await initial;
    const t = tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id);
    if (!t || isExcluded(t)) return false;
    const saved = {};
    for (const key of [
      'id',
      'scId',
      'urn',
      'title',
      'artist',
      'albumartist',
      'album',
      'duration',
      'cover',
      'pageUrl',
      'genre',
      'tags',
      'uploader',
      'publisherArtist',
      'originalTitle',
      'metadataManual',
      'metadataVersion',
      'metadataOriginal',
      'metadataIdentity',
      'access',
    ])
      if (t[key] !== undefined) saved[key] = t[key];
    saved.remote = true;
    saved.lyrics = '';
    const items = [saved, ...[...historyTracks.values()].filter((x) => x.id !== id)].slice(0, 100);
    historyTracks.clear();
    for (const item of items) historyTracks.set(item.id, item);
    const snapshot = JSON.stringify(items);
    historyWrites = historyWrites
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(dir, { recursive: true });
        const temp = path.join(dir, 'history.json.tmp');
        await fs.writeFile(temp, snapshot);
        await fs.rename(temp, path.join(dir, 'history.json'));
      });
    await historyWrites;
    return true;
  });
  ipcMain.handle('sc-search', (_, q) => search(q));
  ipcMain.handle('sc-related', (_, id, q) => related(id, q));
  ipcMain.handle('sc-download', (_, id) => download(id));
  ipcMain.handle('sc-check-api', async () => {
    await initial;
    await accessToken();
    return { ok: true };
  });
  ipcMain.handle('track-delete', (_, id) => removeTrack(id));
  app.on('before-quit', () => {
    for (const child of children) child.kill();
  });
  return {
    flush: () => Promise.allSettled([historyWrites, favoriteWrites, exclusionWrites]),
    getTrack: (id) => tracks.get(id) || savedFavorites.get(id) || historyTracks.get(id),
    handleProtocol,
    status: () => initial.then(status),
    downloadRoots: async () => {
      await initial;
      return [
        config.folder,
        ...new Set(
          getLibrary()
            .tracks.filter((t) => t.downloaded)
            .map((t) => path.dirname(t.path))
        ),
      ];
    },
    register,
    search,
    related,
    removeTrack,
  };
};
module.exports.apiTrack = apiTrack;
module.exports.pageUrl = pageUrl;
module.exports.cdnUrl = cdnUrl;
