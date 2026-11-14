(() => {
  const button = node('button', 'mini-player-toggle');
  button.id = 'open-mini-player';
  button.type = 'button';
  button.title = 'Открыть мини-плеер';
  button.setAttribute('aria-label', 'Открыть мини-плеер');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', 'M15 12V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h7M6 9V6h3');
  const rect = document.createElementNS(svg.namespaceURI, 'rect');
  for (const [k, v] of Object.entries({
    x: 10,
    y: 10,
    width: 11,
    height: 11,
    rx: 2,
    fill: 'currentColor',
    stroke: 'none',
  }))
    rect.setAttribute(k, v);
  svg.append(path, rect);
  button.append(svg);
  const cover = $('mini-cover'),
    launcher = node('div', 'player-cover-launcher');
  cover.before(launcher);
  launcher.append(cover, button);
  let last = 0;
  function publish(force = false) {
    const now = performance.now();
    if (!force && now - last < 350) return;
    last = now;
    const duration = current?.remote
      ? current.duration
      : Number.isFinite(audio.duration)
        ? audio.duration
        : current?.duration || 0;
    window.lumen.miniPlayerState({
      id: current?.id || '',
      title: current?.title || 'Пока тихо',
      artist: current?.artist || 'Выбери трек в библиотеке',
      cover: current && (current.cover || current.customCover) ? media(current, true) : '',
      playing: !audio.paused,
      liked: !!current && favorites.has(current.id),
      position: audio.currentTime + (current?.remote ? window.remoteSeekOffset || 0 : 0),
      duration,
      volume: audio.volume,
    });
  }
  button.onclick = async (event) => {
    event.stopPropagation();
    publish(true);
    try {
      await window.lumen.miniPlayerOpen();
    } catch (e) {
      toast('Не удалось открыть мини-плеер: ' + cleanError(e));
    }
  };
  for (const event of [
    'play',
    'pause',
    'loadedmetadata',
    'durationchange',
    'seeked',
    'volumechange',
    'emptied',
  ])
    audio.addEventListener(event, () => publish(true));
  audio.addEventListener('timeupdate', () => publish());
  window.addEventListener('track-card-changed', () => publish(true));
  const beforeFavorite = updateFavorite;
  updateFavorite = function () {
    beforeFavorite();
    publish(true);
  };
  window.lumen.onMiniPlayerCommand(({ action, value, id }) => {
    try {
      if (action === 'play') $('play').click();
      if (action === 'previous') $('previous').click();
      if (action === 'next') $('next').click();
      if (action === 'favorite' && current?.id === id) toggleFavorite(current.id);
      if (action === 'seek' && current?.id === id) {
        $('seek').value = Math.round(value * 1000);
        $('seek').dispatchEvent(new Event('input', { bubbles: true }));
      }
      if (action === 'volume') {
        $('volume').value = value;
        $('volume').dispatchEvent(new Event('input', { bubbles: true }));
      }
      publish(true);
    } catch (e) {
      toast(cleanError(e));
    }
  });
  publish(true);
})();
