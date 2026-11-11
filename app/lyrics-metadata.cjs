'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path');
const identity = require('./track-identity.js');
module.exports = ({ app, ipcMain, getLibrary, getWindow, save }) => {
  const file = path.join(app.getPath('userData'), 'library-metadata.json');
  let entries = {},
    writes = Promise.resolve();
  const ready = fs
    .readFile(file, 'utf8')
    .then((s) => {
      const v = JSON.parse(s);
      if (v && typeof v === 'object' && !Array.isArray(v)) entries = v;
    })
    .catch(() => {});
  function restore(tracks) {
    for (const t of tracks) {
      const entry = entries[t.id];
      if (entry) {
        Object.assign(t, entry.patch);
        t.lyricsMetadataSource = entry.source;
        t.lyricsMetadataOriginal = entry.original;
      }
    }
  }
  async function persist() {
    const snapshot = JSON.stringify(entries);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file + '.tmp', snapshot);
        await fs.rename(file + '.tmp', file);
      });
    await writes;
  }
  ipcMain.handle('lyrics-metadata-apply', async (event, id, candidate, options = {}) => {
    if (event.sender !== getWindow()?.webContents) throw Error('Unknown window');
    await ready;
    const t = getLibrary().tracks.find((t) => t.id === id);
    if (!t) throw Error('Трек не найден в библиотеке');
    if (options.reset) {
      const previous = entries[id];
      if (previous) {
        delete entries[id];
        await persist();
        Object.assign(t, previous.original);
        delete t.lyricsMetadataSource;
        delete t.lyricsMetadataOriginal;
        await save();
      }
      return { ...t };
    }
    for (const key of ['title', 'artist', 'album'])
      if (
        candidate?.[key] !== undefined &&
        (typeof candidate[key] !== 'string' || candidate[key].length > 500)
      )
        throw Error('Некорректные данные LRCLIB');
    const patch = identity.metadataPatch(t, candidate, { automatic: options.automatic === true });
    if (!Object.keys(patch).length) return { ...t };
    const previous = entries[id],
      original =
        previous?.original ||
        Object.fromEntries(['title', 'artist', 'album', 'albumartist'].map((k) => [k, t[k] || '']));
    const source = { provider: 'LRCLIB', id: candidate.id || null, updatedAt: Date.now() };
    entries[id] = { original, patch: { ...previous?.patch, ...patch }, source };
    await persist();
    Object.assign(t, patch, { lyricsMetadataSource: source, lyricsMetadataOriginal: original });
    await save();
    return { ...t };
  });
  return { ready, restore };
};
