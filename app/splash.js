/* Заставка при запуске. Видео стартует, когда окно действительно видно (окно создаётся
   скрытым), пропускается кликом или клавишей, а при ошибке просто исчезает. */
(() => {
  'use strict';
  const splash = document.getElementById('splash'),
    video = splash?.querySelector('video');
  if (!splash) return;
  const params = new URLSearchParams(location.search);
  let finished = false;
  function finish(fast = false) {
    if (finished) return;
    finished = true;
    splash.classList.add('leaving');
    setTimeout(
      () => {
        splash.classList.add('gone');
        splash.remove();
      },
      fast ? 260 : 620
    );
  }
  // В тестовых прогонах заставка закрывала бы скриншоты проверок.
  if (params.has('nosplash') || !video) {
    splash.remove();
    return;
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    setTimeout(() => finish(true), 450);
    return;
  }
  video.addEventListener('ended', () => finish());
  video.addEventListener('error', () => finish(true));
  splash.addEventListener('click', () => finish(true));
  addEventListener('keydown', () => finish(true), { once: true, capture: true });
  // Запасной таймер: даже если видео не стартует, через 6 с приложение откроется.
  setTimeout(() => finish(true), 6000);
  const start = () => {
    if (document.visibilityState !== 'visible') return;
    document.removeEventListener('visibilitychange', start);
    video.currentTime = 0;
    video.play().catch(() => finish(true));
  };
  document.addEventListener('visibilitychange', start);
  start();
})();
