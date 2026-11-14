export function createPlayer(container, events = {}) {
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  container.innerHTML =
    '<audio playsinline preload="none"></audio><div class="sound-controls"><button type="button" class="sound-toggle" aria-label="Воспроизвести">▶</button><div class="sound-progress"><input id="sound-seek" type="range" min="0" max="1000" value="0" aria-label="Позиция воспроизведения"><div class="sound-times"><span id="sound-time">0:00</span><span id="sound-duration">0:00</span></div></div></div><label class="sound-volume">Громкость<input id="sound-volume" type="range" min="0" max="100" value="70" aria-label="Громкость"><output id="sound-volume-value">70%</output></label><p class="sound-system" hidden>Громкость — кнопками iPhone или через Пункт управления</p>';
  const audio = container.querySelector('audio'),
    toggle = container.querySelector('.sound-toggle'),
    seek = container.querySelector('#sound-seek'),
    volume = container.querySelector('#sound-volume'),
    value = container.querySelector('output');
  let hls = null,
    active = false,
    sequence = 0;
  const time = (n) => {
    n = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  };
  function refresh() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.disabled = !duration;
    seek.value = duration ? Math.round((audio.currentTime / duration) * 1000) : 0;
    container.querySelector('#sound-time').textContent = time(audio.currentTime);
    container.querySelector('#sound-duration').textContent = time(duration);
    toggle.textContent = audio.paused ? '▶' : 'Ⅱ';
    toggle.setAttribute('aria-label', audio.paused ? 'Воспроизвести' : 'Пауза');
  }
  function setVolume(n) {
    n = Math.min(100, Math.max(0, n));
    volume.value = n;
    value.textContent = n + '%';
    audio.volume = n / 100;
    try {
      localStorage.setItem('soundsync-pocket-volume', String(n));
    } catch {}
  }
  let saved;
  try {
    saved = localStorage.getItem('soundsync-pocket-volume');
  } catch {}
  setVolume(
    saved !== null && saved !== undefined && Number.isFinite(Number(saved)) ? Number(saved) : 70
  );
  if (ios) {
    container.querySelector('.sound-volume').hidden = true;
    container.querySelector('.sound-system').hidden = false;
  }
  volume.oninput = () => setVolume(Number(volume.value));
  seek.oninput = () => {
    if (Number.isFinite(audio.duration))
      audio.currentTime = (audio.duration * Number(seek.value)) / 1000;
  };
  function requestPlay() {
    const token = sequence;
    audio.play().catch((e) => {
      if (token !== sequence || e.name === 'AbortError') return;
      events.error?.(
        e.name === 'NotAllowedError'
          ? 'Нажми ▶ в плеере SoundSync для запуска.'
          : 'Не удалось воспроизвести этот трек. Попробуй другой или открой SoundCloud.'
      );
      refresh();
    });
  }
  toggle.onclick = () => (audio.paused ? requestPlay() : audio.pause());
  audio.addEventListener('playing', () => {
    refresh();
    if (active) events.playing?.();
  });
  audio.addEventListener('pause', () => {
    refresh();
    if (active) events.paused?.();
  });
  audio.addEventListener('ended', () => {
    refresh();
    if (active) events.ended?.();
  });
  for (const type of ['timeupdate', 'durationchange', 'loadedmetadata'])
    audio.addEventListener(type, refresh);
  audio.addEventListener('error', () => {
    if (active) events.error?.('Поток недоступен. Попробуй другой трек или открой SoundCloud.');
  });
  return {
    play(url) {
      active = true;
      sequence++;
      const source =
        './api/audio?' +
        new URLSearchParams({
          url,
          ...(!audio.canPlayType('application/vnd.apple.mpegurl') ? { hls: '1' } : {}),
        });
      if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = source;
        requestPlay();
      } else if (window.Hls?.isSupported()) {
        if (!hls) {
          hls = new window.Hls({ enableWorker: false });
          hls.attachMedia(audio);
          hls.on(window.Hls.Events.MANIFEST_PARSED, requestPlay);
          hls.on(window.Hls.Events.ERROR, (_, data) => {
            if (data.fatal && active)
              events.error?.('Не удалось загрузить поток SoundCloud. Попробуй другой трек.');
          });
        }
        hls.loadSource(source);
      } else
        events.error?.(
          'Этот браузер не поддерживает аудиопоток. Открой SoundSync в Safari, Chrome или Edge.'
        );
      refresh();
    },
    stop() {
      active = false;
      sequence++;
      hls?.destroy();
      hls = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      refresh();
    },
  };
}
