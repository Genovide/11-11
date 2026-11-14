const crypto = require('node:crypto');
module.exports = function ({
  ipcMain,
  getWindow,
  readLikes,
  getFavorites,
  getLibrary,
  readFavoriteIds,
  isExcluded,
  register,
  persist,
  onAdd = () => {},
}) {
  const previews = new Map(),
    jobs = new Map();
  function authorized(event) {
    if (event.sender !== getWindow()?.webContents) throw Error('Неизвестное окно');
  }
  async function plan(tracks) {
    const saved = getFavorites(),
      favoriteIds = new Set(await readFavoriteIds()),
      known = new Set([...saved.values()].map((t) => String(t.scId || t.id.replace(/^sc-/, ''))));
    for (const t of getLibrary().tracks || [])
      if (favoriteIds.has(t.id) && (t.scId || t.soundcloudId))
        known.add(String(t.scId || t.soundcloudId));
    let already = 0,
      excluded = 0;
    const add = [];
    for (const t of tracks) {
      if (known.has(String(t.scId))) {
        already++;
        continue;
      }
      if (isExcluded(t)) {
        excluded++;
        continue;
      }
      known.add(String(t.scId));
      add.push(t);
    }
    return { add, already, excluded };
  }
  ipcMain.handle('sc-import-preview', async (event, url) => {
    authorized(event);
    const sender = event.sender,
      id = sender.id || 0;
    const old = jobs.get(id);
    if (old) old.cancelled = true;
    const job = { cancelled: false };
    jobs.set(id, job);
    try {
      const result = await readLikes(url, {
        cancelled: () => job.cancelled || sender.isDestroyed?.(),
        onProgress: (p) => {
          if (!sender.isDestroyed?.()) sender.send('sc-import-progress', p);
        },
      });
      if (job.cancelled) throw Error('Импорт отменён.');
      const counts = await plan(result.tracks),
        token = crypto.randomBytes(18).toString('hex');
      for (const [k, v] of previews) if (v.until < Date.now()) previews.delete(k);
      while (previews.size >= 3) previews.delete(previews.keys().next().value);
      previews.set(token, { ...result, until: Date.now() + 15 * 60 * 1000 });
      return {
        token,
        profile: result.profile,
        stats: result.stats,
        found: result.tracks.length,
        already: counts.already,
        excluded: counts.excluded,
        toAdd: counts.add.length,
        sample: counts.add.slice(0, 8).map((t) => ({ title: t.title, artist: t.artist })),
      };
    } finally {
      if (jobs.get(id) === job) jobs.delete(id);
    }
  });
  ipcMain.handle('sc-import-cancel', (event) => {
    authorized(event);
    const job = jobs.get(event.sender.id || 0);
    if (job) job.cancelled = true;
    return { cancelled: !!job };
  });
  ipcMain.handle('sc-import-commit', async (event, token) => {
    authorized(event);
    const preview = previews.get(token);
    if (!preview || preview.until < Date.now())
      throw Error('Предпросмотр устарел. Загрузи список ещё раз.');
    const saved = getFavorites(),
      counts = await plan(preview.tracks),
      added = [];
    for (const t of register(counts.add)) {
      if (saved.has(t.id)) continue;
      const clean = { ...t, lyrics: '', alignment: undefined, downloadUrl: undefined };
      saved.set(t.id, clean);
      onAdd(t.id);
      added.push(clean);
    }
    try {
      await persist();
    } catch (error) {
      for (const t of added) if (saved.get(t.id) === t) saved.delete(t.id);
      throw error;
    }
    previews.delete(token);
    return {
      added: added.length,
      already: counts.already,
      excluded: counts.excluded,
      tracks: [...saved.values()],
    };
  });
};
