const themeSwitch = node('button', 'theme-switch');
themeSwitch.title = 'Переключить градиенты и однотонную тему';
function setFlatTheme(flat) {
  flat = !!flat;
  document.body.classList.toggle('flat-theme', flat);
  themeSwitch.textContent = flat ? '◐ Без градиентов' : '◐ Градиенты';
  themeSwitch.setAttribute('aria-pressed', String(flat));
  try {
    localStorage.setItem('flat-theme', String(flat));
  } catch {}
  // Send immediately; the main process finishes queued writes before quitting.
  window.lumen.themeSet(flat).catch(() => {});
}
themeSwitch.onclick = () => setFlatTheme(!document.body.classList.contains('flat-theme'));
document.querySelector('.sidebar-bottom').prepend(themeSwitch);
setFlatTheme(
  typeof window.initialFlatTheme === 'boolean'
    ? window.initialFlatTheme
    : document.body.classList.contains('flat-theme')
);
window.runThemeTest = () => {
  const original = document.body.classList.contains('flat-theme');
  try {
    setFlatTheme(true);
    const checks = {
      flat: document.body.classList.contains('flat-theme'),
      brand: document.title.includes('SoundSync'),
      logo: !!document.querySelector('.brand-logo'),
    };
    setFlatTheme(false);
    checks.toggle = !document.body.classList.contains('flat-theme');
    return { ok: Object.values(checks).every(Boolean), checks };
  } finally {
    setFlatTheme(original);
  }
};
