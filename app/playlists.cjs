const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const curated = require('./curated-playlists.json');
const FIELDS = [
  'id',
  'title',
  'artist',
  'album',
  'albumartist',
  'duration',
  'remote',
  'scId',
  'pageUrl',
  'cover',
  'genre',
  'tags',
  'description',
  'language',
];
function reference(t) {
  const clean = {};
  for (const key of FIELDS) if (t[key] !== undefined) clean[key] = t[key];
  if (!t.remote) {
    delete clean.cover;
    delete clean.pageUrl;
  }
  return clean;
}
module.exports = function ({
  app,
  ipcMain,
  getWindow,
  getLibrary,
  getRemoteTrack,
  registerRemote,
  readRemotePlaylist,
}) {
  const file = path.join(app.getPath('userData'), 'playlists.json');
  let state = { version: 1, playlists: [], plays: {} },
    writes = Promise.resolve();
  const previews = new Map(),
    playTokens = new Set();
  const ready = fs
    .readFile(file, 'utf8')
    .then((text) => {
      const v = JSON.parse(text);
      if (
        v.version !== 1 ||
        !Array.isArray(v.playlists) ||
        !v.plays ||
        typeof v.plays !== 'object' ||
        Array.isArray(v.plays)
      )
        throw Error('Файл плейлистов повреждён. Восстанови его из резервной копии.');
      state = v;
    })
    .catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  ready.catch(() => {});
  function authorize(e) {
    if (e.sender !== getWindow()?.webContents) throw Error('Неизвестное окно');
  }
  function title(value) {
    const name = String(value || '').trim();
    if (!name || name.length > 100) throw Error('Название должно содержать от 1 до 100 символов.');
    return name;
  }
  function find(id) {
    const list = state.playlists.find((p) => p.id === id);
    if (!list) throw Error('Плейлист не найден.');
    return list;
  }
  function track(id) {
    return getLibrary().tracks.find((t) => t.id === id) || getRemoteTrack(id);
  }
  function resolve(ref) {
    const current = track(ref.id);
    if (current) return { ...current };
    if (ref.remote) {
      const restored = registerRemote([ref])[0];
      if (restored) return restored;
    }
    return {
      ...ref,
      missing: true,
      playbackUnavailable: true,
      playbackError: 'Трек не найден в библиотеке или сейчас недоступен.',
    };
  }
  function metadata(p) {
    return {
      id: p.id,
      name: p.name,
      count: p.tracks.length,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      sourceUrl: p.sourceUrl || '',
      preview: p.tracks.slice(0, 4).map(resolve),
      cover: p.tracks.map((r) => track(r.id) || r).find((t) => t.cover)?.cover || '',
    };
  }
  function curatedMetadata(p) {
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      count: p.tracks.length,
      builtin: true,
      curated: true,
      cover: p.cover,
    };
  }
  function lists() {
    const plays = Object.values(state.plays);
    return [
      {
        id: 'builtin:frequent',
        name: 'Часто слушаю',
        count: plays.length,
        builtin: true,
        description: 'Треки, которые ты слушаешь чаще. Статистика накапливается с этого момента.',
      },
      ...curated.map(curatedMetadata),
      ...state.playlists.map(metadata),
    ];
  }
  function mutate(action) {
    const next = writes
      .catch(() => {})
      .then(async () => {
        await ready;
        const before = structuredClone(state);
        try {
          const result = await action();
          await fs.mkdir(path.dirname(file), { recursive: true });
          const temp = file + '.tmp';
          await fs.writeFile(temp, JSON.stringify(state));
          await fs.rename(temp, file);
          return result;
        } catch (e) {
          state = before;
          throw e;
        }
      });
    writes = next;
    return next;
  }
  function create(name, tracks = [], sourceUrl = '') {
    if (state.playlists.length >= 200) throw Error('Поддерживается до 200 плейлистов.');
    const now = Date.now(),
      p = {
        id: crypto.randomUUID(),
        name: title(name),
        createdAt: now,
        updatedAt: now,
        sourceUrl,
        tracks,
      };
    state.playlists.unshift(p);
    return metadata(p);
  }
  ipcMain.handle('playlists-list', async (e) => {
    authorize(e);
    await ready;
    await writes.catch(() => {});
    return lists();
  });
  ipcMain.handle('playlists-get', async (e, id) => {
    authorize(e);
    await ready;
    await writes.catch(() => {});
    const shared = curated.find((p) => p.id === id);
    if (shared) return { ...curatedMetadata(shared), tracks: shared.tracks.map(resolve) };
    if (id === 'builtin:frequent') {
      const ordered = Object.values(state.plays).sort(
        (a, b) => b.count - a.count || b.lastPlayed - a.lastPlayed
      );
      return {
        id,
        name: 'Часто слушаю',
        builtin: true,
        tracks: ordered.slice(0, 100).map((p) => ({ ...resolve(p.track), playCount: p.count })),
      };
    }
    const p = find(id);
    return { ...metadata(p), tracks: p.tracks.map(resolve) };
  });
  ipcMain.handle('playlists-create', (e, name) => {
    authorize(e);
    return mutate(() => create(name));
  });
  ipcMain.handle('playlists-rename', (e, id, name) => {
    authorize(e);
    return mutate(() => {
      const p = find(id);
      p.name = title(name);
      p.updatedAt = Date.now();
      return metadata(p);
    });
  });
  ipcMain.handle('playlists-delete', (e, id) => {
    authorize(e);
    return mutate(() => {
      find(id);
      state.playlists = state.playlists.filter((p) => p.id !== id);
      return { deleted: true };
    });
  });
  ipcMain.handle('playlists-add', (e, id, trackId) => {
    authorize(e);
    return mutate(() => {
      const p = find(id),
        t = track(trackId);
      if (!t) throw Error('Сначала открой трек в библиотеке или SoundCloud.');
      if (
        p.tracks.some(
          (x) => x.id === t.id || (x.scId && String(x.scId) === String(t.scId || t.soundcloudId))
        )
      )
        return { added: false };
      if (p.tracks.length >= 10000) throw Error('В плейлисте уже 10 000 треков.');
      p.tracks.push(reference(t));
      p.updatedAt = Date.now();
      return { added: true };
    });
  });
  ipcMain.handle('playlists-remove', (e, id, trackId) => {
    authorize(e);
    return mutate(() => {
      const p = find(id);
      p.tracks = p.tracks.filter((t) => t.id !== trackId);
      p.updatedAt = Date.now();
      return { removed: true };
    });
  });
  ipcMain.handle('playlists-order', (e, id, ids) => {
    authorize(e);
    return mutate(() => {
      const p = find(id);
      if (
        !Array.isArray(ids) ||
        ids.length !== p.tracks.length ||
        new Set(ids).size !== ids.length ||
        ids.some((x) => !p.tracks.some((t) => t.id === x))
      )
        throw Error('Некорректный порядок треков.');
      const map = new Map(p.tracks.map((t) => [t.id, t]));
      p.tracks = ids.map((id) => map.get(id));
      p.updatedAt = Date.now();
      return { ordered: true };
    });
  });
  ipcMain.handle('playlists-record', (e, id, token) => {
    authorize(e);
    if (typeof token !== 'string' || token.length > 120 || playTokens.has(token))
      return { recorded: false };
    playTokens.add(token);
    while (playTokens.size > 1000) playTokens.delete(playTokens.values().next().value);
    return mutate(() => {
      const t = track(id);
      if (!t) return { recorded: false };
      const old = state.plays[id];
      state.plays[id] = {
        track: reference(t),
        count: (old?.count || 0) + 1,
        lastPlayed: Date.now(),
      };
      return { recorded: true };
    });
  });
  ipcMain.handle('playlists-import-preview', async (e, url) => {
    authorize(e);
    const result = await readRemotePlaylist(url);
    if (!result.tracks.length) throw Error('В этом плейлисте нет доступных треков.');
    while (previews.size >= 3) previews.delete(previews.keys().next().value);
    const token = crypto.randomBytes(18).toString('hex');
    previews.set(token, { ...result, until: Date.now() + 15 * 60 * 1000 });
    return {
      token,
      name: result.name,
      sourceUrl: result.sourceUrl,
      count: result.tracks.length,
      total: result.total,
      unavailable: result.unavailable,
      duplicates: result.duplicates,
      sample: result.tracks.slice(0, 6).map((t) => ({ title: t.title, artist: t.artist })),
    };
  });
  ipcMain.handle('playlists-import-commit', async (e, token) => {
    authorize(e);
    const result = await mutate(() => {
      const p = previews.get(token);
      if (!p || p.until < Date.now()) throw Error('Предпросмотр устарел. Загрузи плейлист снова.');
      const old = state.playlists.find((x) => x.sourceUrl === p.sourceUrl);
      if (old) throw Error('Этот плейлист уже импортирован. Его можно найти в своих плейлистах.');
      return create(p.name, p.tracks.map(reference), p.sourceUrl);
    });
    previews.delete(token);
    return result;
  });
  return { flush: () => writes };
};
module.exports.reference = reference;
