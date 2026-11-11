// Migrate existing browser preferences once; Data remains the durable source.
(() => {
  let saved = {};
  try {
    saved = window.lumen.preferencesGet() || {};
  } catch {}
  let flat = typeof saved.flatTheme === 'boolean' ? saved.flatTheme : true;
  try {
    if (typeof saved.flatTheme !== 'boolean') flat = localStorage.getItem('flat-theme') !== 'false';
  } catch {}
  const initial = { flatTheme: flat };
  if (Array.isArray(saved.favoriteIds))
    initial.favoriteIds = saved.favoriteIds.filter((id) => typeof id === 'string');
  else
    try {
      const ids = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (Array.isArray(ids)) initial.favoriteIds = ids.filter((id) => typeof id === 'string');
    } catch {}
  if (
    typeof saved.volume === 'number' &&
    Number.isFinite(saved.volume) &&
    saved.volume >= 0 &&
    saved.volume <= 1
  )
    initial.volume = saved.volume;
  else
    try {
      const value = localStorage.getItem('volume');
      if (value !== null && Number.isFinite(Number(value)))
        initial.volume = Math.max(0, Math.min(1, Number(value)));
    } catch {}
  if (Array.isArray(saved.recent))
    initial.recent = saved.recent.filter((id) => typeof id === 'string').slice(0, 100);
  else
    try {
      const value = JSON.parse(localStorage.getItem('soundsync-recent-v1') || '[]');
      if (Array.isArray(value))
        initial.recent = value.filter((id) => typeof id === 'string').slice(0, 100);
    } catch {}
  if (['library', 'soundcloud'].includes(saved.randomSourceChoice))
    initial.randomSourceChoice = saved.randomSourceChoice;
  if (Array.isArray(saved.playedTrackKeys))
    initial.playedTrackKeys = saved.playedTrackKeys.filter((id) => typeof id === 'string');
  else {
    const recent = initial.recent || [];
    initial.playedTrackKeys = recent.map((id) => (id.startsWith('sc-') ? id : 'local-' + id));
  }
  window.initialUiPreferences = initial;
  window.initialFlatTheme = flat;
  document.body.classList.toggle('flat-theme', flat);
  window.lumen.preferencesSet(initial).catch(() => {});
})();
