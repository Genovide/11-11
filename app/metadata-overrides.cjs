'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path');
module.exports = ({ dir }) => {
  const file = path.join(dir, 'identity-overrides.json');
  let overrides = {},
    writes = Promise.resolve();
  const ready = fs
    .readFile(file, 'utf8')
    .then((s) => {
      const value = JSON.parse(s);
      if (value && typeof value === 'object' && !Array.isArray(value)) overrides = value;
    })
    .catch(() => {});
  function apply(track) {
    if (!track) return track;
    track.metadataOriginal ||= {
      title: track.title,
      artist: track.artist,
      album: track.album,
      albumartist: track.albumartist,
    };
    const patch = overrides[track.id];
    if (patch) Object.assign(track, patch, { metadataManual: true });
    track.metadataIdentity = require('./track-identity.js').derive(track);
    return track;
  }
  async function set(track, patch) {
    await ready;
    if (patch?.reset) {
      delete overrides[track.id];
      Object.assign(track, track.metadataOriginal || {});
      track.metadataManual = false;
      delete track.metadataVersion;
    } else {
      if (
        !patch ||
        typeof patch.title !== 'string' ||
        typeof patch.artist !== 'string' ||
        !patch.title.trim() ||
        !patch.artist.trim()
      )
        throw Error('Укажи название и исполнителя');
      for (const key of ['title', 'artist', 'album', 'version'])
        if (patch[key] !== undefined && (typeof patch[key] !== 'string' || patch[key].length > 300))
          throw Error('Слишком длинное значение');
      overrides[track.id] = {
        title: patch.title.trim(),
        artist: patch.artist.trim(),
        albumartist: patch.artist.trim(),
        album: (patch.album || '').trim() || 'SoundCloud Single',
        metadataVersion: (patch.version || '').trim(),
      };
    }
    const snapshot = JSON.stringify(overrides);
    writes = writes
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file + '.tmp', snapshot);
        await fs.rename(file + '.tmp', file);
      });
    await writes;
    return apply(track);
  }
  return { ready, apply, set };
};
