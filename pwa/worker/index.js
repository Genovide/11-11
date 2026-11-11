import selection from './wave-selection.cjs';
import queries from './wave-query.cjs';
const ASSETS = {}; // Replaced by scripts/build.mjs; assets are bundled, not fetched remotely.
const BASE = 'https://api-v2.soundcloud.com/';
const { selectDiverse, identity, artistKey, owner } = selection;
const pageUrl = (value) => {
  const u = new URL(String(value));
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(
      u.hostname
    )
  )
    throw Error('Нужна ссылка SoundCloud');
  return u.href;
};
function apiTrack(t) {
  const publisher = t.publisher_metadata || {},
    split = String(t.title || '').match(/^(.+?)\s+[-–—]\s+(.+)$/),
    artist = publisher.artist || split?.[1] || t.user?.username || 'SoundCloud',
    url = pageUrl(t.permalink_url);
  return {
    id: 'sc-' + t.id,
    scId: String(t.id),
    url,
    pageUrl: url,
    title: publisher.artist ? t.title : split?.[2] || t.title || 'Без названия',
    artist,
    cover: t.artwork_url || t.user?.avatar_url || '',
    genre: t.genre || '',
    duration: (t.duration || 0) / 1000,
  };
}
function playable(t) {
  return (
    t &&
    t.kind === 'track' &&
    t.streamable !== false &&
    t.policy !== 'BLOCK' &&
    t.policy !== 'SNIP' &&
    t.access !== 'blocked' &&
    t.access !== 'preview'
  );
}
export function createSoundCloud(fetchImpl = fetch) {
  let client = '',
    clientJob = null;
  const cache = new Map(),
    pending = new Map();
  async function response(url) {
    const r = await fetchImpl(url, {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json, text/html;q=0.9' },
    });
    if (!r.ok) {
      const e = Error(
        r.status === 429
          ? 'SoundCloud ограничил частоту запросов. Попробуй чуть позже.'
          : 'SoundCloud временно недоступен (HTTP ' + r.status + ').'
      );
      e.status = r.status;
      throw e;
    }
    return r;
  }
  function memo(key, run) {
    const old = cache.get(key);
    if (old?.until > Date.now()) return Promise.resolve(old.data);
    if (pending.has(key)) return pending.get(key);
    const job = run()
      .then((data) => {
        cache.set(key, { until: Date.now() + 120000, data });
        while (cache.size > 100) cache.delete(cache.keys().next().value);
        return data;
      })
      .finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }
  async function clientId() {
    if (client) return client;
    if (clientJob) return clientJob;
    clientJob = (async () => {
      const html = await (await response('https://soundcloud.com/')).text(),
        match = (text) => text.match(/client_id\s*:\s*["']([a-zA-Z0-9]{32})["']/)?.[1];
      let found = match(html);
      const assets = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((s) => {
          try {
            const u = new URL(s);
            return u.protocol === 'https:' && u.hostname.endsWith('.sndcdn.com');
          } catch {
            return false;
          }
        })
        .reverse()
        .slice(0, 15);
      for (let i = 0; !found && i < assets.length; i += 3) {
        const scripts = await Promise.allSettled(
          assets.slice(i, i + 3).map(async (url) => (await response(url)).text())
        );
        for (const s of scripts) if (s.status === 'fulfilled' && (found = match(s.value))) break;
      }
      if (!found)
        throw Error('Поиск SoundCloud сейчас недоступен. Можно открыть трек по полной ссылке.');
      client = found;
      return found;
    })();
    try {
      return await clientJob;
    } finally {
      clientJob = null;
    }
  }
  async function api(endpoint, params = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = new URL(endpoint, BASE);
      if (url.origin !== new URL(BASE).origin) throw Error('Недопустимый адрес запроса');
      for (const [k, v] of Object.entries({ ...params, client_id: await clientId() }))
        url.searchParams.set(k, String(v));
      try {
        return await (await response(url)).json();
      } catch (e) {
        if (!attempt && [401, 403].includes(e.status)) {
          client = '';
          continue;
        }
        throw e;
      }
    }
  }
  async function resolve(value) {
    const url = pageUrl(value);
    return memo('resolve:' + url, async () => {
      try {
        const t = await api('resolve', { url });
        if (t.kind === 'playlist')
          return { ...apiTrack(t), title: t.title, artist: t.user?.username || 'SoundCloud' };
        if (!playable(t)) throw Error('Запись недоступна для воспроизведения');
        return apiTrack(t);
      } catch (error) {
        // Official oEmbed remains available when public discovery changes.
        const r = await response(
            'https://soundcloud.com/oembed?' + new URLSearchParams({ format: 'json', url })
          ),
          data = await r.json();
        if (!data.title) throw error;
        const artist = data.author_name || 'SoundCloud',
          suffix = ' by ' + artist;
        return {
          id: url,
          url,
          pageUrl: url,
          title: data.title.endsWith(suffix) ? data.title.slice(0, -suffix.length) : data.title,
          artist,
          cover: data.thumbnail_url || '',
        };
      }
    });
  }
  async function search(query, { offset = 0, genre = false } = {}) {
    query = String(query || '').trim();
    if (!query || query.length > 200) throw Error('Введи запрос до 200 символов');
    if (query.startsWith('https://')) return [await resolve(query)];
    return memo(`search:${genre}:${query}:${offset}`, async () => {
      const d = await api('search/tracks', {
        q: genre ? '' : query,
        offset,
        limit: 50,
        access: 'playable',
        ...(genre ? { 'filter.genre_or_tag': query } : {}),
      });
      return (d.collection || []).filter(playable).map(apiTrack);
    });
  }
  async function related(id) {
    const scId = String(id || '').replace(/^sc-/, '');
    if (!/^\d{1,20}$/.test(scId)) throw Error('Неверный идентификатор трека');
    return memo('related:' + scId, async () => {
      const d = await api('tracks/' + scId + '/related', { limit: 80, access: 'playable' });
      return (d.collection || []).filter(playable).map(apiTrack);
    });
  }
  const ids = (values) =>
    new Set(
      (Array.isArray(values) ? values : [])
        .filter((s) => typeof s === 'string' && s.length < 240)
        .slice(-1000)
    );
  function shuffled(items) {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  async function random(exclude) {
    const genres = shuffled([
      'rap',
      'rock',
      'electronic',
      'phonk',
      'jazz',
      'pop',
      'ambient',
      'techno',
      'metal',
    ]);
    const results = await Promise.allSettled(
      genres.slice(0, 2).map((g) =>
        search(g, {
          genre: true,
          offset: 50 * (crypto.getRandomValues(new Uint32Array(1))[0] % 4),
        })
      )
    );
    let pool = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (!pool.length) {
      const error = results.find((r) => r.status === 'rejected');
      if (error) throw error.reason;
      pool = await search(genres[0], { genre: true });
    }
    const skip = ids(exclude);
    return selectDiverse(shuffled(pool), { seenIds: skip, limit: 6 });
  }
  async function wave(input) {
    const request = queries.parseQuery({ query: input.query, mode: input.mode }),
      seen = ids(input.seen),
      seenIdentities = ids(input.seenIdentities);
    let anchors = [],
      seedArtists = [],
      seedOwners = [],
      pool = [],
      cursor = Number.isSafeInteger(input.cursor) ? Math.max(0, input.cursor) : 0,
      offset = Number.isSafeInteger(input.offset) ? Math.min(1000, Math.max(0, input.offset)) : 0;
    const continuing = Array.isArray(input.anchors) && input.anchors.length > 0;
    if (continuing) {
      anchors = input.anchors.slice(0, 3).map((t) => ({
        ...apiTrack({
          id: String(t.id).replace(/^sc-/, ''),
          kind: 'track',
          permalink_url: t.url,
          title: t.title,
          user: { username: t.artist },
        }),
        artist: String(t.artist || 'SoundCloud').slice(0, 200),
      }));
      seedArtists = Array.isArray(input.seedArtists)
        ? input.seedArtists.slice(0, 3).map(String)
        : [];
      seedOwners = anchors.map(owner);
    } else {
      const matches = await search(request.query, { genre: request.mode === 'genre' });
      if (!matches.length) throw Error('Не найдены треки для запуска волны');
      const exact = matches.filter((t) => artistKey(t.artist) === artistKey(request.query)),
        starting = exact.length ? exact : matches,
        first = starting[0];
      anchors = starting.filter((t) => artistKey(t.artist) === artistKey(first.artist)).slice(0, 3);
      if (request.mode === 'artist') {
        seedArtists = [first.artist];
        seedOwners = anchors.map(owner);
      } else pool = matches;
    }
    if (request.mode === 'artist') {
      const sources = [anchors[cursor++ % anchors.length]];
      if (
        continuing &&
        /^sc-\d+$/.test(input.currentId || '') &&
        !sources.some((t) => t.id === input.currentId)
      )
        sources.push({ id: input.currentId });
      else if (anchors.length > 1) sources.push(anchors[cursor++ % anchors.length]);
      const results = await Promise.allSettled(sources.map((t) => related(t.id)));
      pool = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      if (!pool.length) {
        const failure = results.find((r) => r.status === 'rejected');
        if (failure) throw failure.reason;
      }
    } else if (continuing) {
      offset += 50;
      pool = await search(request.query, { genre: request.mode === 'genre', offset });
    }
    let tracks = selectDiverse(pool, {
      seedArtists: request.mode === 'artist' ? seedArtists : [],
      seedOwners: request.mode === 'artist' ? seedOwners : [],
      seenIds: seen,
      seenIdentities,
      recentArtists: Array.isArray(input.recentArtists) ? input.recentArtists.slice(-9) : [],
      limit: 12,
    });
    if (request.mode === 'artist' && tracks.length < 4 && tracks[0]) {
      const bridge = await related(tracks[0].id).catch(() => []);
      tracks = selectDiverse([...pool, ...bridge], {
        seedArtists,
        seedOwners,
        seenIds: seen,
        seenIdentities,
        limit: 12,
      });
    }
    if (!tracks.length) throw Error('Новых связанных треков пока нет. Попробуй другой запрос.');
    for (const t of tracks) {
      seen.add(t.id);
      seenIdentities.add(identity(t));
    }
    return {
      tracks,
      station: {
        query: request.query,
        original: String(input.original || request.original).slice(0, 200),
        mode: request.mode,
        anchors: anchors.map((t) => ({ id: t.id, url: t.url, title: t.title, artist: t.artist })),
        seedArtists,
        seen: [...seen].slice(-1000),
        seenIdentities: [...seenIdentities].slice(-1000),
        cursor,
        offset,
        recentArtists: tracks.slice(-9).map((t) => t.artist),
      },
    };
  }
  async function stream(value, hlsOnly = false) {
    const url = pageUrl(value);
    return memo('stream:' + hlsOnly + ':' + url, async () => {
      const t = await api('resolve', { url });
      if (!playable(t)) throw Error('Запись недоступна для воспроизведения');
      const formats = (t.media?.transcodings || []).filter(
        (f) =>
          !f.snipped &&
          (!hlsOnly || f.format?.protocol === 'hls') &&
          ['progressive', 'hls'].includes(f.format?.protocol) &&
          !/encrypted|ctr-|cbc-/i.test(f.preset || '')
      );
      const score = (f) =>
        (f.format.protocol === 'progressive' ? 20 : 0) +
        (/mpeg|mp3/i.test(f.format.mime_type || f.preset || '') ? 10 : 0);
      formats.sort((a, b) => score(b) - score(a));
      for (const f of formats) {
        const d = await api(
          f.url,
          t.track_authorization ? { track_authorization: t.track_authorization } : {}
        ).catch(() => null);
        if (!d?.url) continue;
        const u = new URL(d.url);
        if (
          u.protocol === 'https:' &&
          !u.username &&
          !u.password &&
          !u.port &&
          ['sndcdn.com', 'soundcloud.com', 'soundcloud.cloud'].some(
            (h) => u.hostname === h || u.hostname.endsWith('.' + h)
          )
        )
          return u.href;
      }
      throw Error('Нет доступного потока для этого трека. Открой его в SoundCloud.');
    });
  }
  return { search, resolve, random, wave, stream };
}
const soundcloud = createSoundCloud();
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
const rate = new Map();
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        const audio = url.pathname === '/api/audio' && request.method === 'GET';
        if (request.method !== 'POST' && !audio) return json({ error: 'Нужен POST-запрос' }, 405);
        if (request.headers.get('Origin') && request.headers.get('Origin') !== url.origin)
          return json({ error: 'Недопустимый источник запроса' }, 403);
        const ip = request.headers.get('CF-Connecting-IP') || 'local',
          now = Date.now();
        let r = rate.get(ip);
        if (!r || r.until < now) {
          r = { count: 0, until: now + 60000 };
          rate.set(ip, r);
        }
        if (++r.count > 60) return json({ error: 'Слишком много запросов. Подожди минуту.' }, 429);
        if (rate.size > 1000) for (const [k, v] of rate) if (v.until < now) rate.delete(k);
        if (audio)
          return new Response(null, {
            status: 302,
            headers: {
              Location: await soundcloud.stream(
                url.searchParams.get('url'),
                url.searchParams.get('hls') === '1'
              ),
              'Cache-Control': 'no-store',
            },
          });
        const text = await request.text();
        if (text.length > 64000) return json({ error: 'Запрос слишком большой' }, 413);
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          return json({ error: 'Некорректный запрос' }, 400);
        }
        if (!body || typeof body !== 'object') return json({ error: 'Некорректный запрос' }, 400);
        switch (url.pathname) {
          case '/api/resolve':
            return json({ track: await soundcloud.resolve(body.url) });
          case '/api/search':
            return json({ tracks: await soundcloud.search(body.query) });
          case '/api/random':
            return json({ tracks: await soundcloud.random(body.exclude) });
          case '/api/wave':
            return json(await soundcloud.wave(body));
          default:
            return json({ error: 'Не найдено' }, 404);
        }
      } catch (error) {
        return json(
          { error: error.message || 'SoundCloud временно недоступен' },
          error.status === 429 ? 429 : 502
        );
      }
    }
    const name = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    const asset = ASSETS[name];
    if (!asset) return new Response('Not found', { status: 404 });
    const binary = Uint8Array.from(atob(asset.data), (c) => c.charCodeAt(0));
    return new Response(request.method === 'HEAD' ? null : binary, {
      headers: {
        'Content-Type': asset.type,
        'Cache-Control':
          name === 'sw.js' || name === 'index.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Service-Worker-Allowed': '/',
      },
    });
  },
};
