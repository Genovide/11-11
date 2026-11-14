const $ = (id) => document.getElementById(id),
  audio = $('audio');
audio.crossOrigin = 'anonymous';
let library = { tracks: [], folder: '' },
  view = 'tracks',
  albumFilter = null,
  shown = 100,
  current = null,
  queue = [],
  qi = -1,
  shuffle = false,
  repeat = false,
  ctx,
  analyser,
  freq,
  wave,
  activeLine = -1,
  lyricLines = [],
  effect = Number(localStorage.getItem('effect') ?? 2),
  busy = false;
const favorites = new Set(
  window.initialUiPreferences?.favoriteIds || JSON.parse(localStorage.getItem('favorites') || '[]')
);
const fmt = (s) => {
  s = Number.isFinite(s) ? s : 0;
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
};
const media = (t, cover = false) =>
  cover && t.customCover
    ? t.customCover
    : t.remote
      ? 'lumen://' + (cover ? 'sc-cover' : 'sc-stream') + '/' + t.id
      : 'lumen://media/' + t.id + (cover ? '-cover' : '');
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('toast').classList.add('hidden'), 5000);
}
function node(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function art(t, cls) {
  if (t.cover || t.customCover) {
    const im = node('img', cls);
    im.crossOrigin = 'anonymous';
    im.src = media(t, true);
    im.alt = '';
    im.loading = 'lazy';
    return im;
  }
  return node('div', cls + ' placeholder-art', '◒');
}
function filtered() {
  const q = $('search').value.trim().toLocaleLowerCase();
  return library.tracks.filter(
    (t) =>
      (view !== 'favorites' || favorites.has(t.id)) &&
      (view !== 'downloads' || t.downloaded) &&
      (!albumFilter || t.album + '\0' + t.albumartist === albumFilter) &&
      (!q || (t.title + ' ' + t.artist + ' ' + t.album).toLocaleLowerCase().includes(q))
  );
}
function persistFavoriteIds() {
  localStorage.setItem('favorites', JSON.stringify([...favorites]));
  window.lumen
    .preferencesSet({ favoriteIds: [...favorites] })
    .catch((e) => toast('Не удалось сохранить любимое: ' + e.message));
}
function toggleFavorite(id) {
  favorites.has(id) ? favorites.delete(id) : favorites.add(id);
  persistFavoriteIds();
  render();
  updateFavorite();
}
function updateFavorite() {
  $('now-favorite').classList.toggle('liked', !!current && favorites.has(current.id));
  $('now-favorite').textContent = current && favorites.has(current.id) ? '♥' : '♡';
}
function render() {
  const tracks = filtered();
  $('side-count').textContent = library.tracks.length.toLocaleString('ru');
  $('track-count').textContent = tracks.length.toLocaleString('ru');
  $('view-label').textContent =
    view === 'albums' ? 'Альбомы' : view === 'favorites' ? 'Любимое' : 'Все треки';
  $('collection-title').firstChild.textContent = albumFilter
    ? tracks[0]?.album || 'Альбом'
    : view === 'favorites'
      ? 'Любимое '
      : view === 'albums'
        ? 'Альбомы '
        : 'Все треки ';
  $('empty').classList.toggle('hidden', tracks.length > 0);
  $('empty').querySelector('h3').textContent = library.tracks.length
    ? 'Ничего не найдено'
    : 'Здесь будет твоя музыка';
  $('empty').querySelector('p').textContent = library.tracks.length
    ? 'Попробуй другой поиск или добавь треки в любимое.'
    : 'Выбери любую папку — найдём треки даже в подпапках.';
  $('empty-choose').classList.toggle('hidden', library.tracks.length > 0);
  $('clear-filter').classList.toggle('hidden', !albumFilter);
  const albumsView = view === 'albums' && !albumFilter;
  $('albums').classList.toggle('hidden', !albumsView || !tracks.length);
  $('track-area').classList.toggle('hidden', albumsView || !tracks.length);
  $('folder-label').textContent = library.folder || 'Выбери папку. Всё остальное мы найдём.';
  $('folder-label').title = library.folder;
  $('library-meta').textContent = library.tracks.length
    ? `${library.tracks.length.toLocaleString('ru')} треков · ${new Set(library.tracks.map((t) => t.album + '\0' + t.albumartist)).size} альбомов`
    : 'Твоя музыка начинается с папки';
  if (albumsView) {
    const groups = new Map();
    for (const t of tracks) {
      const key = t.album + '\0' + t.albumartist;
      if (!groups.has(key)) groups.set(key, { t, key, count: 0 });
      groups.get(key).count++;
    }
    const a = [...groups.values()];
    $('albums').replaceChildren(
      ...a.slice(0, shown).map(({ t, key, count }) => {
        const b = node('button', 'album-card');
        b.append(
          art(t, 'album-art'),
          node('strong', '', t.album),
          node('small', '', `${t.albumartist || t.artist} · ${count} треков`)
        );
        b.onclick = () => {
          albumFilter = key;
          shown = 100;
          render();
        };
        return b;
      })
    );
    $('more').classList.toggle('hidden', a.length <= shown);
    return;
  }
  $('track-list').replaceChildren(
    ...tracks.slice(0, shown).map((t, i) => {
      const row = node('div', 'track-row' + (current?.id === t.id ? ' playing' : ''));
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', t.title + ' — ' + t.artist);
      const info = node('div', 'track-info'),
        txt = node('div');
      txt.append(
        node('div', 'track-name', t.title),
        node('button', 'track-artist artist-link', t.artist)
      );
      info.append(art(t, 'track-cover'), txt);
      const heart = node(
        'button',
        'track-heart' + (favorites.has(t.id) ? ' liked' : ''),
        favorites.has(t.id) ? '♥' : '♡'
      );
      heart.setAttribute('aria-label', 'Любимое');
      heart.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(t.id);
      };
      row.append(
        node(
          'div',
          'track-number',
          current?.id === t.id && !audio.paused ? '♫' : String(i + 1).padStart(2, '0')
        ),
        info,
        node('div', 'track-album', t.album),
        node('div', 'track-time', t.duration ? fmt(t.duration) : '—'),
        heart
      );
      row.onclick = () => playList(tracks, i);
      row.onkeydown = (e) => {
        if (e.target === row && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          playList(tracks, i);
        }
      };
      return row;
    })
  );
  $('more').classList.toggle('hidden', tracks.length <= shown);
}
async function reloadLibrary() {
  library = await window.lumen.library();
  render();
}
window.reloadLibrary = reloadLibrary;
async function choose(rescan = false) {
  if (busy) return;
  busy = true;
  $('scan-status').textContent = 'Ищем музыку и читаем обложки…';
  $('scan-status').classList.remove('hidden');
  try {
    const l = await (rescan ? window.lumen.rescan() : window.lumen.chooseFolder());
    if (l) {
      library = l;
      shown = 100;
      render();
      toast(`Найдено ${l.tracks.length} треков` + (l.errors ? ` · не прочитано: ${l.errors}` : ''));
    }
  } catch (e) {
    toast('Не удалось прочитать папку: ' + e.message);
  } finally {
    busy = false;
    $('scan-status').classList.add('hidden');
  }
}
window.lumen.onProgress((p) => {
  $('scan-status').textContent =
    `Читаем библиотеку: ${p.done.toLocaleString('ru')} / ${p.total.toLocaleString('ru')}`;
});
function initAudio() {
  if (ctx) return;
  ctx = new AudioContext();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.85;
  ctx.createMediaElementSource(audio).connect(analyser);
  analyser.connect(ctx.destination);
  freq = new Uint8Array(analyser.frequencyBinCount);
  wave = new Uint8Array(analyser.fftSize);
}
async function start() {
  if (!current) {
    if (filtered().length) playList(filtered(), 0);
    else toast('Сначала выбери папку с музыкой');
    return;
  }
  try {
    initAudio();
    await ctx.resume();
    await audio.play();
  } catch (e) {
    if (e.name !== 'AbortError' && !window.localPlaybackRecovering?.has(current?.id))
      toast(
        current?.remote
          ? window.scPlaybackErrors?.get(current.id) ||
              'Не удалось запустить поток SoundCloud. Возможно, запись недоступна в публичном режиме.'
          : 'Не удалось воспроизвести этот файл. Возможно, формат не поддерживается.'
      );
  }
}
function playList(list, index) {
  queue = [...list];
  qi = index;
  load(queue[qi]);
  renderQueue();
}
function load(t) {
  if (!t) return;
  current = t;
  const savedLocally =
    !t.remote ||
    library.tracks.some((x) => x.downloaded && x.soundcloudId && x.soundcloudId === t.scId);
  document.querySelector('.now-kicker').textContent = savedLocally
    ? 'ТВОЙ ЛИЧНЫЙ САУНДТРЕК'
    : 'СЕЙЧАС В SOUNDCLOUD';
  localStorage.setItem('last-track', t.id);
  window.remoteSeekOffset = 0;
  audio.src = media(t);
  $('now-title').textContent = $('mini-title').textContent = t.title;
  $('now-artist').textContent = $('mini-artist').textContent = t.artist;
  $('now-cover').replaceChildren(t.cover || t.customCover ? art(t, '') : node('span', '', '◒'));
  $('mini-cover').replaceChildren(t.cover || t.customCover ? art(t, '') : node('span', '', '♪'));
  $('duration').textContent = fmt(t.duration);
  updateFavorite();
  setLyrics(t);
  setPalette(t);
  render();
  start();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album,
      artwork: [],
    });
  }
}
function advance(delta = 1, automatic = false) {
  if (!queue.length) return;
  if (automatic && repeat) {
    audio.currentTime = 0;
    start();
    return;
  }
  if (shuffle && delta > 0 && queue.length > 1) {
    let next;
    do {
      next = Math.floor(Math.random() * queue.length);
    } while (next === qi);
    qi = next;
  } else {
    qi += delta;
    if (qi >= queue.length) {
      qi = 0;
      if (automatic) {
        audio.pause();
        return;
      }
    }
    if (qi < 0) qi = queue.length - 1;
  }
  load(queue[qi]);
  renderQueue();
}
function renderQueue() {
  $('queue-count').textContent = queue.length;
  $('queue').replaceChildren(
    ...queue.slice(Math.max(0, qi + 1), Math.max(0, qi + 1) + 60).map((t) => {
      const b = node('button', '', t.title);
      b.append(node('small', '', t.artist));
      b.onclick = () => {
        qi = queue.indexOf(t);
        load(t);
        renderQueue();
      };
      return b;
    })
  );
  if (!queue.length) $('queue').append(node('p', 'quiet', 'Выбери трек — здесь появится очередь.'));
}
function setLyrics(t) {
  activeLine = -1;
  lyricLines = [];
  let raw = t.lyrics || '';
  for (const line of raw.split(/\r?\n/)) {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    const text = line.replace(/\[[^\]]*\]/g, '').trim();
    if (times.length)
      for (const m of times) lyricLines.push({ time: Number(m[1]) * 60 + Number(m[2]), text });
    else if (text) lyricLines.push({ time: null, text });
  }
  const synced = lyricLines.some((x) => x.time !== null);
  if (synced)
    lyricLines = lyricLines.filter((x) => x.time !== null).sort((a, b) => a.time - b.time);
  $('lyrics').classList.toggle('synced', synced);
  $('lyrics').replaceChildren();
  if (!lyricLines.length) {
    $('lyrics').append(
      node('span', 'lyrics-mark', '“'),
      node(
        'p',
        '',
        'В этом файле пока нет текста.\nМожно положить .lrc или .txt рядом с песней и обновить библиотеку.'
      )
    );
    return;
  }
  for (const line of lyricLines) {
    const e = node('button', 'lyric-line', line.text || '♪');
    if (line.time !== null)
      e.onclick = () => {
        audio.currentTime = line.time;
        start();
      };
    else {
      e.disabled = true;
      e.classList.add('plain');
    }
    $('lyrics').append(e);
  }
  $('lyrics').scrollTop = 0;
}
function syncLyrics() {
  if (!$('lyrics').classList.contains('synced')) return;
  let idx = -1;
  for (let i = 0; i < lyricLines.length; i++)
    if (lyricLines[i].time <= audio.currentTime) idx = i;
    else break;
  if (idx === activeLine) return;
  activeLine = idx;
  [...$('lyrics').children].forEach((e, i) => {
    e.classList.toggle('current', i === idx);
    e.classList.toggle('past', i < idx);
  });
  const line = $('lyrics').children[idx];
  if (line)
    $('lyrics').scrollTo({
      top: line.offsetTop - $('lyrics').offsetTop - $('lyrics').clientHeight * 0.35,
      behavior: effect ? 'smooth' : 'instant',
    });
}
let palette = CoverPalette.fallback.map((c) => [...c]),
  targetPalette = palette.map((c) => [...c]);
function applyCoverPalette(colors) {
  targetPalette = colors.map((c) => [...c]);
  for (const [i, name] of ['primary', 'secondary', 'tertiary'].entries())
    document.documentElement.style.setProperty(
      '--cover-' + name,
      'rgb(' + colors[i].join(',') + ')'
    );
  document.documentElement.style.setProperty(
    '--cover-tint',
    'rgba(' + colors[0].join(',') + ',.32)'
  );
}
function setPalette(t) {
  const reset = () => {
    if (current?.id === t.id) applyCoverPalette(CoverPalette.fallback);
  };
  if (!t.cover && !t.customCover) {
    reset();
    return;
  }
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    if (current?.id !== t.id) return;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 40;
      const context = c.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, 40, 40);
      applyCoverPalette(CoverPalette.fromPixels(context.getImageData(0, 0, 40, 40).data));
    } catch {
      reset();
    }
  };
  image.onerror = reset;
  image.src = media(t, true);
}
applyCoverPalette(targetPalette);
const canvas = $('atmosphere'),
  g = canvas.getContext('2d');
let width = 0,
  height = 0,
  lastFrame = 0,
  energy = 0,
  visualFrames = 0;
function resize() {
  const dpr = Math.min(devicePixelRatio, 1.5);
  width = innerWidth;
  height = innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
addEventListener('resize', resize);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
function draw(ms) {
  requestAnimationFrame(draw);
  if (document.hidden || ms - lastFrame < 32) return;
  lastFrame = ms;
  visualFrames++;
  const motion = effect && !reduced;
  let bass = 0;
  if (analyser && !audio.paused) {
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);
    bass = freq.slice(1, 24).reduce((a, b) => a + b, 0) / 23 / 255;
  }
  energy += (bass - energy) * 0.14;
  for (let i = 0; i < 3; i++)
    for (let k = 0; k < 3; k++) palette[i][k] += (targetPalette[i][k] - palette[i][k]) * 0.035;
  g.clearRect(0, 0, width, height);
  g.fillStyle = '#090d14';
  g.fillRect(0, 0, width, height);
  for (let i = 0; i < 3; i++) {
    const time = motion ? ms * 0.00009 : 0,
      x = width * (0.3 + i * 0.25) + Math.sin(time + i * 2) * width * 0.14,
      y = height * (0.3 + i * 0.18) + Math.cos(time * 0.8 + i) * height * 0.17,
      r = width * (0.4 + (motion ? energy * 0.09 : 0)),
      color = palette[i].map(Math.round);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${color},${effect === 2 ? 0.46 : effect === 1 ? 0.32 : 0.18})`);
    grad.addColorStop(1, `rgba(${color},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, width, height);
  }
  if (!motion) return;
  const color = palette[0].map(Math.round);
  for (let l = 0; l < 3; l++) {
    g.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const sample =
        wave && !audio.paused ? (wave[Math.floor((x / width) * (wave.length - 1))] - 128) / 128 : 0;
      const y =
        height * 0.62 +
        Math.sin((x / width) * 9 + ms * 0.0003 + l * 0.7) * 25 +
        sample * (35 + energy * 90) * (effect / 2) +
        l * 20;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.strokeStyle = `rgba(${color},${0.035 + energy * 0.06})`;
    g.lineWidth = 1.2;
    g.stroke();
  }
  for (let i = 0; i < 32; i++) {
    const x = (i * 173.17 + Math.sin(ms * 0.0001 + i) * 30) % width,
      y = (height + i * 91 - ms * 0.004 * (1 + energy * 3)) % height;
    g.beginPath();
    g.arc(x, y, 1 + (i % 3) * 0.4, 0, Math.PI * 2);
    g.fillStyle = `rgba(${color},${0.05 + energy * 0.15})`;
    g.fill();
  }
}
requestAnimationFrame(draw);
function updateEffects() {
  document.body.classList.toggle('effects-off', !effect);
  $('effects').classList.toggle('active', !!effect);
  $('effects').querySelector('b').textContent = ['ВЫКЛ', 'ТИХО', 'ВКЛ'][effect];
  localStorage.setItem('effect', effect);
}
updateEffects();
$('choose-folder').onclick = $('empty-choose').onclick = () => choose();
$('rescan').onclick = () => choose(true);
$('search').oninput = () => {
  shown = 100;
  render();
};
$('more').onclick = () => {
  shown += 100;
  render();
};
$('clear-filter').onclick = () => {
  albumFilter = null;
  shown = 100;
  render();
};
document.querySelectorAll('[data-view]').forEach(
  (b) =>
    (b.onclick = () => {
      view = b.dataset.view;
      albumFilter = null;
      shown = 100;
      document
        .querySelectorAll('[data-view]')
        .forEach((e) => e.classList.toggle('active', e === b));
      render();
    })
);
document
  .querySelectorAll('[data-window]')
  .forEach((b) => (b.onclick = () => window.lumen.window(b.dataset.window)));
$('play').onclick = () => (audio.paused ? start() : audio.pause());
$('play-all').onclick = () => (filtered().length ? playList(filtered(), 0) : choose());
$('shuffle-all').onclick = () => {
  const list = filtered();
  if (list.length) {
    shuffle = true;
    $('shuffle').classList.add('active');
    playList(list, Math.floor(Math.random() * list.length));
  } else choose();
};
$('next').onclick = () => advance();
$('previous').onclick = () => (audio.currentTime > 3 ? (audio.currentTime = 0) : advance(-1));
$('shuffle').onclick = () => {
  $('shuffle').classList.toggle('active', (shuffle = !shuffle));
};
$('repeat').onclick = () => {
  $('repeat').classList.toggle('active', (repeat = !repeat));
};
$('effects').onclick = () => {
  effect = (effect + 1) % 3;
  updateEffects();
};
$('now-favorite').onclick = () => current && toggleFavorite(current.id);
$('volume').value = window.initialUiPreferences?.volume ?? localStorage.getItem('volume') ?? '.7';
audio.volume = Number($('volume').value);
$('volume-value').textContent = Math.round(audio.volume * 100) + '%';
$('volume').oninput = () => {
  audio.volume = Number($('volume').value);
  $('volume-value').textContent = Math.round(audio.volume * 100) + '%';
  localStorage.setItem('volume', audio.volume);
  window.lumen.preferencesSet({ volume: audio.volume }).catch(() => {});
};
$('seek').oninput = () => {
  if (Number.isFinite(audio.duration))
    audio.currentTime = (Number($('seek').value) / 1000) * audio.duration;
};
audio.onloadedmetadata = () => {
  $('duration').textContent = fmt(
    Number.isFinite(audio.duration) ? audio.duration : current?.duration || 0
  );
  if (current && !current.remote) {
    current.duration = audio.duration;
    render();
  }
};
audio.ontimeupdate = () => {
  $('elapsed').textContent = fmt(audio.currentTime);
  $('seek').value = Number.isFinite(audio.duration)
    ? (audio.currentTime / audio.duration) * 1000
    : 0;
  syncLyrics();
};
audio.onended = () => advance(1, true);
audio.onplay = () => {
  $('play').textContent = 'Ⅱ';
  $('play').setAttribute('aria-label', 'Пауза');
  document.body.classList.add('is-playing');
  render();
};
audio.onpause = () => {
  $('play').textContent = '▶';
  $('play').setAttribute('aria-label', 'Воспроизвести');
  document.body.classList.remove('is-playing');
  render();
};
audio.onerror = () =>
  toast(
    current?.remote
      ? window.scPlaybackErrors?.get(current.id) ||
          'Поток SoundCloud недоступен. Попробуй другой трек.'
      : 'Файл недоступен или формат не поддерживается. Попробуй обновить библиотеку.'
  );
function panelTab(lyrics) {
  $('lyrics').classList.toggle('hidden', !lyrics);
  $('queue').classList.toggle('hidden', lyrics);
  $('lyrics-tab').classList.toggle('active', lyrics);
  $('queue-tab').classList.toggle('active', !lyrics);
}
$('lyrics-tab').onclick = () => panelTab(true);
$('queue-tab').onclick = () => {
  panelTab(false);
  renderQueue();
};
addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    $('search').focus();
  }
  if (e.target.matches?.('input,textarea,select,button,[role=button]')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    audio.paused ? start() : audio.pause();
  }
  if (e.code === 'ArrowRight' && Number.isFinite(audio.duration))
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  if (e.code === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
});
if ('mediaSession' in navigator) {
  for (const [key, handler] of Object.entries({
    play: start,
    pause: () => audio.pause(),
    previoustrack: () => advance(-1),
    nexttrack: () => advance(),
  }))
    navigator.mediaSession.setActionHandler(key, handler);
}
window.runSmokeTest = async () => {
  const checks = { library: library.tracks.length > 0, rows: $('track-list').children.length > 0 };
  const t =
    library.tracks.find((t) => t.artist.toLowerCase().includes('pyrokinesis') && t.cover) ||
    library.tracks.find((t) => t.cover) ||
    library.tracks[0];
  playList([t], 0);
  await new Promise((r) => setTimeout(r, 2500));
  checks.playback = !audio.paused && audio.currentTime > 0;
  checks.duration = Number.isFinite(audio.duration) && audio.duration > 0;
  audio.currentTime = 10;
  await new Promise((r) => setTimeout(r, 400));
  checks.seeking = audio.currentTime >= 10 && audio.currentTime < 13;
  checks.analyser = !!analyser;
  if (analyser) analyser.getByteFrequencyData(freq);
  checks.audioSignal = !!freq && freq.some((x) => x > 0);
  checks.cover = !t.cover || document.querySelector('#now-cover img')?.naturalWidth > 0;
  checks.animation = visualFrames > 0;
  const realLyrics = t.lyrics;
  setLyrics({ lyrics: '[00:00.00]Проверка первой строки\n[00:01.00]Проверка второй строки' });
  const beforeLyricTest = audio.currentTime;
  audio.currentTime = 1.5;
  syncLyrics();
  checks.syncedLyrics = activeLine === 1;
  audio.currentTime = beforeLyricTest;
  setLyrics(t);
  $('search').value = 'pyrokinesis';
  render();
  checks.search =
    filtered().length > 0 &&
    filtered().every((x) => (x.artist + x.album + x.title).toLowerCase().includes('pyrokinesis'));
  $('search').value = '';
  view = 'albums';
  render();
  checks.albums = $('albums').children.length > 0;
  view = 'tracks';
  render();
  const had = favorites.has(t.id);
  toggleFavorite(t.id);
  checks.favorites = favorites.has(t.id) !== had;
  toggleFavorite(t.id);
  audio.pause();
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    trackCount: library.tracks.length,
    scanErrors: library.errors || 0,
    track: t.title,
    palette: targetPalette,
  };
};
reloadLibrary();

const expand = node('button', 'expand-lyrics', '↗');
expand.title = 'Развернуть текст';
expand.setAttribute('aria-label', 'Развернуть текст');
document.querySelector('.now-heading span').replaceWith(expand);
