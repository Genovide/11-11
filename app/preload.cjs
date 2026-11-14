const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lumen', {
  playlistsList: () => ipcRenderer.invoke('playlists-list'),
  playlistGet: (id) => ipcRenderer.invoke('playlists-get', id),
  playlistCreate: (name) => ipcRenderer.invoke('playlists-create', name),
  playlistRename: (id, name) => ipcRenderer.invoke('playlists-rename', id, name),
  playlistDelete: (id) => ipcRenderer.invoke('playlists-delete', id),
  playlistAdd: (id, trackId) => ipcRenderer.invoke('playlists-add', id, trackId),
  playlistRemove: (id, trackId) => ipcRenderer.invoke('playlists-remove', id, trackId),
  playlistOrder: (id, ids) => ipcRenderer.invoke('playlists-order', id, ids),
  playlistRecord: (id, token) => ipcRenderer.invoke('playlists-record', id, token),
  playlistImportPreview: (url) => ipcRenderer.invoke('playlists-import-preview', url),
  playlistImportCommit: (token) => ipcRenderer.invoke('playlists-import-commit', token),
  scImportPreview: (url) => ipcRenderer.invoke('sc-import-preview', url),
  scImportCommit: (token) => ipcRenderer.invoke('sc-import-commit', token),
  scImportCancel: () => ipcRenderer.invoke('sc-import-cancel'),
  onScImportProgress: (fn) => ipcRenderer.on('sc-import-progress', (_, p) => fn(p)),
  feedbackOpen: (payload) => ipcRenderer.invoke('feedback-open', payload),
  miniPlayerOpen: () => ipcRenderer.invoke('mini-player-open'),
  miniPlayerState: (state) => ipcRenderer.send('mini-player-state', state),
  onMiniPlayerCommand: (fn) => ipcRenderer.on('mini-player-command', (_, command) => fn(command)),
  trackCardGet: (id) => ipcRenderer.invoke('track-card-get', id),
  trackCardSave: (id, payload) => ipcRenderer.invoke('track-card-save', id, payload),
  trackCardCover: () => ipcRenderer.invoke('track-card-cover'),
  localPlaybackPrepare: (id) => ipcRenderer.invoke('local-playback-prepare', id),
  scRandom: (excluded) => ipcRenderer.invoke('sc-random', excluded),
  scHistory: () => ipcRenderer.invoke('sc-history'),
  scHistoryRecord: (id) => ipcRenderer.invoke('sc-history-record', id),
  preferencesGet: () => ipcRenderer.sendSync('ui-preferences-read'),
  preferencesSet: (patch) => ipcRenderer.invoke('ui-preferences-save', patch),
  themeGet: () => ipcRenderer.sendSync('ui-theme-read'),
  themeSet: (flat) => ipcRenderer.invoke('ui-theme-save', flat),
  lyricsMetadataApply: (id, candidate, options) =>
    ipcRenderer.invoke('lyrics-metadata-apply', id, candidate, options),
  scMetadataSet: (id, patch) => ipcRenderer.invoke('sc-metadata-set', id, patch),
  rztPage: (payload) => ipcRenderer.invoke('rzt-page', payload),
  rztReviewsOpen: () => ipcRenderer.invoke('rzt-reviews-open'),
  updatesCheck: () => ipcRenderer.invoke('updates-check'),
  updatesOpen: () => ipcRenderer.invoke('updates-open'),
  updatesDownload: () => ipcRenderer.invoke('updates-download'),
  updatesInstall: () => ipcRenderer.invoke('updates-install'),
  updatesLastResult: () => ipcRenderer.invoke('updates-last-result'),
  updatesShowLog: (file) => ipcRenderer.invoke('updates-show-log', file),
  onUpdatesProgress: (fn) => ipcRenderer.on('updates-progress', (_, p) => fn(p)),
  scWaveStart: (seed) => ipcRenderer.invoke('sc-wave-start', seed),
  scWaveNext: (station, id, recent) => ipcRenderer.invoke('sc-wave-next', station, id, recent),
  lyricsSearch: (track, query) => ipcRenderer.invoke('lyrics-search', track, query),
  alignmentEditor: (id) => ipcRenderer.invoke('alignment-editor', id),
  saveAlignment: (id, payload) => ipcRenderer.invoke('alignment-manual-save', id, payload),
  restoreManualAlignment: (id, revision) =>
    ipcRenderer.invoke('alignment-manual-restore', id, revision),
  onScPlaybackError: (fn) => ipcRenderer.on('sc-playback-error', (_, p) => fn(p)),
  scExcludedList: () => ipcRenderer.invoke('sc-excluded-list'),
  scExcludedSet: (id, excluded) => ipcRenderer.invoke('sc-excluded-set', id, excluded),
  scFavoriteSet: (id, liked) => ipcRenderer.invoke('sc-favorite-set', id, liked),
  scFavoriteTracks: (ids) => ipcRenderer.invoke('sc-favorite-tracks', ids),
  scMetadata: (id, force = false) => ipcRenderer.invoke('sc-metadata', id, force),
  insightStatus: () => ipcRenderer.invoke('insight-status'),
  insightSettings: (settings) => ipcRenderer.invoke('insight-settings', settings),
  insightCheck: () => ipcRenderer.invoke('insight-check'),
  insightCached: (id, lyrics) => ipcRenderer.invoke('insight-cached', id, lyrics),
  insightGenerate: (id, lyrics) => ipcRenderer.invoke('insight-generate', id, lyrics),
  scPrefetch: (id) => ipcRenderer.invoke('sc-prefetch', id),
  scStatus: () => ipcRenderer.invoke('sc-status'),
  scSettings: (settings) => ipcRenderer.invoke('sc-settings', settings),
  scFolder: () => ipcRenderer.invoke('sc-folder'),
  scSearch: (q) => ipcRenderer.invoke('sc-search', q),
  scRelated: (id, q) => ipcRenderer.invoke('sc-related', id, q),
  scDownload: (id) => ipcRenderer.invoke('sc-download', id),
  scCheckAPI: () => ipcRenderer.invoke('sc-check-api'),
  deleteTrack: (id) => ipcRenderer.invoke('track-delete', id),
  onDownloadProgress: (fn) => ipcRenderer.on('sc-progress', (_, p) => fn(p)),
  saveLyrics: (id, text) => ipcRenderer.invoke('lyrics-save', id, text),
  resetLyrics: (id) => ipcRenderer.invoke('lyrics-reset', id),
  align: (id) => ipcRenderer.invoke('alignment-start', id),
  cancelAlignment: () => ipcRenderer.invoke('alignment-cancel'),
  removeAlignment: (id) => ipcRenderer.invoke('alignment-remove', id),
  onAlignmentProgress: (fn) => ipcRenderer.on('alignment-progress', (_, p) => fn(p)),
  library: () => ipcRenderer.invoke('library'),
  chooseFolder: () => ipcRenderer.invoke('choose-folder'),
  rescan: () => ipcRenderer.invoke('rescan'),
  window: (action) => ipcRenderer.invoke('window', action),
  onProgress: (fn) => ipcRenderer.on('scan-progress', (_, p) => fn(p)),
});

if (process.platform === 'darwin')
  window.addEventListener(
    'DOMContentLoaded',
    () => {
      const controls = document.querySelector('.window-actions');
      if (controls) controls.style.display = 'none';
    },
    { once: true }
  );

if (process.platform === 'darwin')
  window.addEventListener('keydown', (event) => {
    if (event.metaKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      document.getElementById('search')?.focus();
    }
  });

window.addEventListener(
  'error',
  (event) =>
    ipcRenderer.send('renderer-diagnostic', {
      type: 'error',
      message: event.message || 'Resource failed: ' + event.target?.src,
      source: event.filename,
      line: event.lineno,
    }),
  true
);
window.addEventListener('unhandledrejection', (event) =>
  ipcRenderer.send('renderer-diagnostic', {
    type: 'rejection',
    message: String(event.reason?.stack || event.reason),
  })
);
