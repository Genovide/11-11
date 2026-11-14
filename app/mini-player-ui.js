(() => {
  const $ = (id) => document.getElementById(id);
  let state = {},
    dragging = false,
    source = '';
  const fmt = (s) => {
    s = Number.isFinite(s) ? s : 0;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  const command = (action, value) =>
    window.soundSyncMini.command(action, value, state.id).catch(() => {});

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      command('restore');
    }
  });
  const paths = {
    play: 'M9 5.5 19 12 9 18.5Z',
    pause: 'M8 6h2v12H8zM14 6h2v12h-2z',
    previous: 'M5 5v14M19 5l-10 7 10 7Z',
    next: 'M19 5v14M5 5l10 7-10 7Z',
    heart:
      'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    pin: 'M9 3h6l-1 6 4 4v2h-5v6l-1-2-1 2v-6H6v-2l4-4Z',
    restore: 'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4M14 3h7v7M21 3l-9 9',
    close: 'm6 6 12 12M18 6 6 18',
    volume: 'M11 5 6 9H3v6h3l5 4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
    muted: 'M11 5 6 9H3v6h3l5 4ZM16 9l5 6M21 9l-5 6',
  };
  function draw(id, name, filled = false) {
    const button = $(id),
      key = name + ':' + filled;
    if (button.dataset.icon === key) return;
    button.dataset.icon = key;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      p = document.createElementNS(svg.namespaceURI, 'path');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', filled ? 'currentColor' : 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', name === 'pause' ? '1' : '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('d', paths[name]);
    svg.append(p);
    button.replaceChildren(svg);
  }
  for (const [id, name, fill] of [
    ['previous', 'previous', true],
    ['next', 'next', true],
    ['play', 'play', true],
    ['favorite', 'heart', false],
    ['mini-pin', 'pin', false],
    ['mini-restore', 'restore', false],
    ['mini-close', 'close', false],
    ['mute', 'volume', false],
  ])
    draw(id, name, fill);
  let lastVolume = 0.7;
  $('mute').onclick = () => {
    if (state.volume > 0) {
      lastVolume = state.volume;
      command('volume', 0);
    } else command('volume', lastVolume || 0.7);
  };
  const fill = (element) => element.style.setProperty('--fill', Number(element.value) * 100 + '%');

  for (const [id, action] of [
    ['play', 'play'],
    ['previous', 'previous'],
    ['next', 'next'],
    ['favorite', 'favorite'],
    ['mini-restore', 'restore'],
    ['mini-close', 'close'],
    ['mini-pin', 'pin'],
  ])
    $(id).onclick = () => command(action);
  $('seek').onpointerdown = () => (dragging = true);
  $('seek').onchange = () => {
    command('seek', Number($('seek').value));
    dragging = false;
  };
  $('seek').onpointerup = () => (dragging = false);
  $('volume').oninput = () => {
    fill($('volume'));
    command('volume', Number($('volume').value));
  };
  $('seek').oninput = () => fill($('seek'));
  window.soundSyncMini.onState((value) => {
    state = value;
    $('title').textContent = state.title;
    $('artist').textContent = state.artist;
    $('title').title = state.title;
    $('artist').title = state.artist;
    draw('play', state.playing ? 'pause' : 'play', true);
    $('play').setAttribute('aria-label', state.playing ? 'Пауза' : 'Воспроизвести');
    $('play').title = state.playing ? 'Пауза' : 'Воспроизвести';
    draw('favorite', 'heart', state.liked);
    $('favorite').classList.toggle('liked', state.liked);
    $('favorite').setAttribute(
      'aria-label',
      state.liked ? 'Убрать из любимого' : 'Добавить в любимое'
    );
    $('mini-pin').setAttribute('aria-pressed', String(state.pinned));
    $('elapsed').textContent = fmt(state.position);
    $('duration').textContent = fmt(state.duration);
    if (!dragging) $('seek').value = state.duration ? state.position / state.duration : 0;
    if (document.activeElement !== $('volume')) $('volume').value = state.volume;
    draw('mute', state.volume ? 'volume' : 'muted');
    $('mute').setAttribute('aria-label', state.volume ? 'Выключить звук' : 'Включить звук');
    $('mute').title = state.volume ? 'Выключить звук' : 'Включить звук';
    if (state.volume > 0) lastVolume = state.volume;
    fill($('seek'));
    fill($('volume'));
    for (const id of ['previous', 'next', 'favorite']) $(id).disabled = !state.id;
    $('seek').disabled = !state.duration;
    if (source !== state.cover) {
      source = state.cover;
      $('cover').classList.toggle('has-cover', !!source);
      const image = document.createElement('img');
      image.src = source || 'brand.svg';
      image.alt = '';
      image.onerror = () => {
        image.onerror = null;
        image.src = 'brand.svg';
        $('cover').classList.remove('has-cover');
      };
      $('cover').replaceChildren(image);
    }
  });
})();
