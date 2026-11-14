'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs/promises'),
  os = require('node:os'),
  path = require('node:path');
(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'soundsync-track-card-'));
  const sender = {},
    event = { sender },
    handlers = new Map();
  let local = {
      id: 'local-1',
      title: 'Исходное название',
      artist: 'Артист',
      album: 'Альбом',
      albumartist: 'Артист',
      year: 2000,
    },
    remote = {
      id: 'sc-123',
      scId: '123',
      remote: true,
      title: 'Upload',
      artist: 'Uploader',
      album: 'SoundCloud Single',
      albumartist: 'Uploader',
    };
  let saves = 0;
  const config = {
    app: { getPath: () => dir },
    ipcMain: { handle: (n, f) => handlers.set(n, f) },
    getWindow: () => ({ webContents: sender }),
    getLibrary: () => ({ tracks: [local] }),
    getRemoteTrack: (id) => (id === remote.id ? remote : null),
    save: async () => {
      saves++;
    },
    refreshAllowed: () => {},
    dialog: { showOpenDialog: async () => ({ canceled: true }) },
    nativeImage: {},
  };
  const setup = require('../app/track-card.cjs');
  let service = setup(config);
  await service.ready;
  const change = {
    title: 'Правка',
    artist: 'Исполнитель',
    album: 'Издание',
    albumartist: 'Группа',
    year: '2026',
  };
  await assert.rejects(
    () => handlers.get('track-card-get')({ sender: {} }, local.id),
    /Unknown window/
  );
  await assert.rejects(
    () => handlers.get('track-card-save')(event, local.id, { ...change, title: '' }),
    /название/
  );
  assert.equal(local.title, 'Исходное название');
  await handlers.get('track-card-save')(event, local.id, change);
  assert.equal(local.title, 'Правка');
  assert.equal(local.year, 2026);
  local = { id: 'local-1', title: 'После сканирования', artist: 'Без тегов' };
  service.restore(local);
  assert.equal(local.title, 'Правка');
  await handlers.get('track-card-save')(event, remote.id, change);
  assert.equal(remote.metadataManual, true);
  assert.equal(remote.artist, 'Исполнитель');
  service = setup(config);
  await service.ready;
  remote = {
    id: 'sc-123',
    scId: '123',
    remote: true,
    title: 'New upload title',
    artist: 'Uploader',
  };
  service.restore(remote);
  assert.equal(remote.title, 'Правка');
  assert.equal(remote.metadataManual, true);
  await handlers.get('track-card-save')(event, remote.id, { reset: true });
  assert.equal(remote.title, 'Upload');
  assert.equal(remote.metadataManual, false);
  await handlers.get('track-card-save')(event, local.id, { reset: true });
  assert.equal(local.title, 'Исходное название');
  assert.equal(local.year, 2000);
  assert.equal(local.trackCardEdited, false);
  assert.equal((await service.cover({ url: 'lumen://track-cover/../../secret' })).status, 404);
  assert.equal(await handlers.get('track-card-cover')(event), null);
  assert.equal(saves, 4);
  console.log(
    'Track card: authorization, validation, rescan, restart, remote identity, reset and cover path protection passed'
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
