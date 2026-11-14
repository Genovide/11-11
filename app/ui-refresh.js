/* Единые SVG-иконки вместо символов-заглушек, понятные ползунки перемотки и громкости
   и небольшие анимации интерфейса. Подключается последним и только дополняет разметку. */
(() => {
  'use strict';
  // Иконки в стиле транспортных кнопок: 24×24, линия 1.8, скруглённые концы.
  Object.assign(svgPaths, {
    home: 'M3 10.5 12 3l9 7.5M5.5 8.6V20h4.5v-5.5h4V20h4.5V8.6',
    library:
      'M9 18V5.5l11-2V16M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 9.5l11-2',
    artists:
      'M12 3a3 3 0 0 0-3 3v5.5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM18.5 11a6.5 6.5 0 0 1-13 0M12 17.5V21M8.5 21h7',
    albums:
      'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM12 6.5a5.5 5.5 0 0 0-5.5 5.5',
    heart:
      'M12 20s-7.5-4.6-9.3-9C1.5 7.7 3.6 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.5 3.2 4.3 6.5C19.5 15.4 12 20 12 20z',
    playlists:
      'M3 6h11M3 11h11M3 16h6.5M16.5 18.5V5.5L21 4M16.5 18.5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
    upgrade: 'M12 20.5V9M6.5 14.5 12 9l5.5 5.5M5 4h14',
    reviews: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 7.5l3 3',
    cloud: 'M7 18.5h10.5a4.5 4.5 0 0 0 .3-9 6 6 0 0 0-11.5 1.6A4 4 0 0 0 7 18.5z',
    downloads: 'M12 3.5v11M7 10l5 5 5-5M4.5 20.5h15',
    search: 'M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5',
    sparkle:
      'M12 3.5l1.7 4.8 4.8 1.7-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.7zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    contrast: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 3v18M12 7.5h4.5M12 12h6M12 16.5h4.5',
    note: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    volumeMute: 'M4 9.5h3.5L12.5 5v14l-5-4.5H4zM16.5 9.5l5 5M21.5 9.5l-5 5',
    volumeLow: 'M4 9.5h3.5L12.5 5v14l-5-4.5H4zM16 9.5a3.5 3.5 0 0 1 0 5',
    volumeHigh: 'M4 9.5h3.5L12.5 5v14l-5-4.5H4zM16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10',
    waves:
      'M3 8c3-2.5 6 2.5 9 0s6-2.5 9 0M3 12.5c3-2.5 6 2.5 9 0s6-2.5 9 0M3 17c3-2.5 6 2.5 9 0s6-2.5 9 0',
    check: 'M20 6.5 9.5 17 4 11.5',
    alert: 'M12 3.5 2.5 20h19L12 3.5zM12 10v4.5M12 17.3v.2',
    keyboard: 'M3 6.5h18v11H3zM6.5 10h.01M9.5 10h.01M12.5 10h.01M15.5 10h.01M18 10h.01M7.5 14h9',
    arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  });
  const glyph = (text) => /^[^\p{L}\p{N}]{1,3}$/u.test(String(text || '').trim());
  const navIcons = {
    home: 'home',
    tracks: 'library',
    artists: 'artists',
    albums: 'albums',
    favorites: 'heart',
    playlists: 'playlists',
    soundcloud: 'cloud',
    downloads: 'downloads',
    'rzt-reviews': 'reviews',
    'upgrader-open': 'upgrade',
  };
  const navKey = (b) => {
    if (b.dataset.view) return b.dataset.view;
    if (b.id) return b.id;
    const text = b.textContent.trim();
    if (/Главная/.test(text)) return 'home';
    if (/Артисты/.test(text)) return 'artists';
    if (/Плейлисты/.test(text)) return 'playlists';
    return '';
  };
  function decorateNav(b) {
    if (b.dataset.iconified) return;
    const name = navIcons[navKey(b)];
    const first = [...b.children].find((e) => e.tagName === 'SPAN');
    if (!name || !first || !glyph(first.textContent)) return;
    first.replaceChildren(icon(name));
    first.classList.add('nav-icon');
    b.dataset.iconified = '1';
  }
  const sidebar = document.querySelector('.sidebar');
  const decorateSidebar = () => sidebar?.querySelectorAll('.nav').forEach(decorateNav);
  decorateSidebar();
  if (sidebar)
    new MutationObserver(decorateSidebar).observe(sidebar, { childList: true, subtree: true });

  // Символы в кнопках и полях — на иконки.
  const searchGlyph = document.querySelector('.search > span');
  if (searchGlyph && glyph(searchGlyph.textContent)) searchGlyph.replaceChildren(icon('search'));
  function leadingGlyphToIcon(element, name) {
    if (!element) return;
    const text = [...element.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
    );
    if (text && glyph(text.textContent.trim().split(/\s+/)[0])) {
      text.textContent = text.textContent.replace(/^\s*[^\p{L}\p{N}\s]{1,3}\s*/u, '');
      element.prepend(icon(name));
    }
    const span = element.firstElementChild;
    if (span?.tagName === 'SPAN' && glyph(span.textContent)) span.replaceWith(icon(name));
  }
  leadingGlyphToIcon(document.getElementById('play-all'), 'play');
  leadingGlyphToIcon(document.getElementById('shuffle-all'), 'shuffle');
  const clearFilter = document.getElementById('clear-filter');
  if (clearFilter && clearFilter.textContent.startsWith('←')) {
    clearFilter.textContent = clearFilter.textContent.replace(/^←\s*/, '');
    clearFilter.prepend(icon('arrowLeft'));
  }
  const themeSwitch = document.querySelector('.theme-switch, #theme-switch');
  function decorateTheme() {
    if (!themeSwitch || themeSwitch.querySelector('svg')) return;
    const label = themeSwitch.textContent.replace(/^\s*◐\s*/, '');
    themeSwitch.replaceChildren(icon('contrast'), document.createTextNode(label));
  }
  decorateTheme();
  if (themeSwitch)
    new MutationObserver(decorateTheme).observe(themeSwitch, {
      childList: true,
      characterData: true,
      subtree: true,
    });

  // Символы на карточках главной: ≋ ✦ ♡.
  const pickIcons = { '≋': 'waves', '✦': 'sparkle', '♡': 'heart', '♥': 'heart' };
  function decoratePicks(root = document) {
    for (const e of root.querySelectorAll?.('.pick-symbol') || []) {
      const name = pickIcons[e.textContent.trim()];
      if (name) e.replaceChildren(icon(name));
    }
  }
  decoratePicks();
  const main = document.querySelector('main');
  if (main)
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) if (n.nodeType === 1) decoratePicks(n.parentElement || n);
    }).observe(main, { childList: true, subtree: true });

  // Заглушка обложки в плеере: нота-иконка вместо символа ♪.
  const miniCover = document.getElementById('mini-cover');
  function decorateCover() {
    if (
      miniCover &&
      typeof current !== 'undefined' &&
      current &&
      !current.cover &&
      !current.customCover &&
      !miniCover.querySelector('.generated-art')
    ) {
      miniCover.replaceChildren(generatedCover(current, 'mini-generated'));
      miniCover.classList.remove('cover-placeholder');
      return;
    }
    const only = miniCover?.firstElementChild;
    if (miniCover && !miniCover.querySelector('img,svg') && glyph(miniCover.textContent)) {
      miniCover.replaceChildren(icon('note'));
      miniCover.classList.add('cover-placeholder');
    } else if (only?.tagName === 'SPAN' && glyph(only.textContent)) {
      only.replaceChildren(icon('note'));
      miniCover.classList.add('cover-placeholder');
    } else if (miniCover?.querySelector('img')) miniCover.classList.remove('cover-placeholder');
  }
  decorateCover();
  if (miniCover)
    new MutationObserver(() => {
      decorateCover();
      // Короткая анимация при смене трека.
      miniCover.classList.remove('cover-swap');
      void miniCover.offsetWidth;
      miniCover.classList.add('cover-swap');
    }).observe(miniCover, { childList: true });

  // Блок трека в правой панели: помечаем, когда он прокручивается, чтобы показать затухание.
  const summary = document.querySelector('.now-panel > .now-summary');
  if (summary) {
    const markScroll = () => {
      const scrollable = summary.scrollHeight > summary.clientHeight + 2;
      summary.classList.toggle('scrollable', scrollable);
      summary.classList.toggle(
        'at-end',
        summary.scrollTop + summary.clientHeight >= summary.scrollHeight - 2
      );
    };
    summary.addEventListener('scroll', markScroll, { passive: true });
    new ResizeObserver(markScroll).observe(summary);
    new MutationObserver(markScroll).observe(summary, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    markScroll();
  }

  // ——— Обложки для треков без обложки ———
  // Своя градиентная обложка на альбом (или трек): одинаковая при каждом показе, с первой буквой.
  const COVER_PALETTES = [
    ['#ffd629', '#ff7a18'],
    ['#ff4d8d', '#7a2cff'],
    ['#33d1ff', '#2b59ff'],
    ['#38e8a5', '#0f8f7a'],
    ['#ff6b5a', '#c01a5b'],
    ['#b18cff', '#4b2bd1'],
    ['#ffb547', '#d6338a'],
    ['#7cf0ff', '#6a4dff'],
  ];
  const coverHash = (text) => {
    let h = 2166136261;
    for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
  };
  const meaningfulAlbum = (t) =>
    t.album && !/^(Без альбома|SoundCloud Single|Unknown Album)$/i.test(t.album);
  function generatedCover(t, cls) {
    const name = meaningfulAlbum(t) ? t.album : t.title || '♪',
      seed = coverHash((meaningfulAlbum(t) ? t.album + '\0' : t.title + '\0') + (t.artist || '')),
      [a, b] = COVER_PALETTES[seed % COVER_PALETTES.length],
      letter = ([...String(name).replace(/[^\p{L}\p{N}]/gu, '')][0] || '♪').toLocaleUpperCase('ru');
    const e = node('div', (cls ? cls + ' ' : '') + 'generated-art', letter);
    e.style.setProperty('--g1', a);
    e.style.setProperty('--g2', b);
    e.style.setProperty('--angle', (seed % 360) + 'deg');
    e.setAttribute('aria-hidden', 'true');
    return e;
  }
  const GENERATED_FOR = /(^|\s)(track-cover|album-art|home-art)(\s|$)/;
  const artBeforeRefresh = art;
  art = function (t, cls) {
    if (!t?.cover && !t?.customCover && GENERATED_FOR.test(cls || ''))
      return generatedCover(t, cls);
    return artBeforeRefresh(t, cls);
  };
  window.generatedCover = generatedCover;

  // ——— Перемотка ———
  const seek = document.getElementById('seek'),
    timeline = seek?.closest('.timeline'),
    durationLabel = document.getElementById('duration'),
    elapsedLabel = document.getElementById('elapsed');
  const clock = (s) => {
    s = Math.max(0, Number.isFinite(s) ? s : 0);
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = String(Math.floor(s % 60)).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  // Для SoundCloud после перемотки поток начинается с отметки ?start=, поэтому позиция в песне —
  // это currentTime плюс смещение, а длительность берётся из метаданных трека.
  function timing() {
    const remote = typeof current !== 'undefined' && current?.remote,
      offset = remote ? window.remoteSeekOffset || 0 : 0,
      d = remote ? current.duration || audio.duration : audio.duration;
    return { t: audio.currentTime + offset, d, offset, remote };
  }
  const busySeeking = () => typeof remoteSeeking !== 'undefined' && remoteSeeking;
  let dragging = false,
    showRemaining = (() => {
      try {
        return localStorage.getItem('timeline-remaining') === '1';
      } catch {
        return false;
      }
    })();
  if (seek && timeline) {
    timeline.classList.add('timeline-refresh');
    const bubble = document.createElement('div');
    bubble.className = 'seek-bubble';
    bubble.setAttribute('aria-hidden', 'true');
    const wrap = document.createElement('div');
    wrap.className = 'seek-wrap';
    seek.replaceWith(wrap);
    wrap.append(seek, bubble);
    const point = (event) => {
      const r = seek.getBoundingClientRect();
      return Math.max(0, Math.min(1, (event.clientX - r.left) / r.width));
    };
    wrap.addEventListener('pointermove', (event) => {
      const { d } = timing();
      if (!Number.isFinite(d) || !d) return;
      const p = point(event);
      bubble.textContent = clock(p * d);
      bubble.style.left = p * 100 + '%';
      wrap.classList.add('hovering');
    });
    wrap.addEventListener('pointerleave', () => wrap.classList.remove('hovering'));
    seek.addEventListener('pointerdown', () => {
      dragging = true;
      wrap.classList.add('dragging');
    });
    addEventListener('pointerup', () => {
      dragging = false;
      wrap.classList.remove('dragging');
    });
    seek.addEventListener('input', () => {
      seek.style.setProperty('--fill', seek.value / 10 + '%');
      const { d } = timing();
      if (Number.isFinite(d) && d) {
        const at = (seek.value / 1000) * d;
        elapsedLabel.textContent = clock(at);
        if (showRemaining) durationLabel.textContent = '−' + clock(d - at);
      }
    });
    durationLabel.title = 'Показать оставшееся время';
    durationLabel.classList.add('duration-toggle');
    durationLabel.addEventListener('click', () => {
      showRemaining = !showRemaining;
      try {
        localStorage.setItem('timeline-remaining', showRemaining ? '1' : '0');
      } catch {}
      paintTimeline(true);
    });
  }
  let lastPaint = -1;
  // Плавная полоса: обновляем в каждом кадре, а не 4 раза в секунду по timeupdate.
  function paintTimeline(force = false) {
    if (!seek) return;
    const { t, d, offset } = timing();
    if (!force && t === lastPaint) return;
    lastPaint = t;
    const ok = Number.isFinite(d) && d > 0;
    if (!dragging && !busySeeking()) {
      seek.style.setProperty('--fill', ok ? (t / d) * 100 + '%' : '0%');
      seek.value = ok ? String(Math.min(1000, (t / d) * 1000)) : '0';
      elapsedLabel.textContent = clock(t);
    }
    let buffered = 0;
    try {
      for (let i = 0; i < audio.buffered.length; i++)
        if (audio.buffered.start(i) + offset <= t + 0.5)
          buffered = Math.max(buffered, audio.buffered.end(i) + offset);
    } catch {}
    seek.style.setProperty('--buffer', ok ? Math.min(100, (buffered / d) * 100) + '%' : '0%');
    if (ok) durationLabel.textContent = showRemaining ? '−' + clock(d - t) : clock(d);
  }
  function frame() {
    if (!document.hidden) paintTimeline();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  for (const e of ['loadedmetadata', 'durationchange', 'progress', 'seeked', 'emptied'])
    audio.addEventListener(e, () => paintTimeline(true));

  // ——— Громкость ———
  const volume = document.getElementById('volume'),
    volumeBox = volume?.closest('.volume-control');
  let beforeMute = 0.7;
  if (volume && volumeBox) {
    volumeBox.classList.add('volume-refresh');
    const glyphSpan = [...volumeBox.children].find(
      (e) => e.tagName === 'SPAN' && e.id !== 'volume-value'
    );
    const mute = document.createElement('button');
    mute.type = 'button';
    mute.className = 'volume-mute';
    if (glyphSpan) glyphSpan.replaceWith(mute);
    else volumeBox.prepend(mute);
    const paintVolume = () => {
      const v = audio.muted ? 0 : audio.volume;
      volume.style.setProperty('--fill', v * 100 + '%');
      mute.replaceChildren(icon(v === 0 ? 'volumeMute' : v < 0.5 ? 'volumeLow' : 'volumeHigh'));
      mute.title = v === 0 ? 'Включить звук' : 'Выключить звук';
      mute.setAttribute('aria-label', mute.title);
      volumeBox.classList.toggle('muted', v === 0);
    };
    mute.onclick = () => {
      if (audio.volume > 0 && !audio.muted) {
        beforeMute = audio.volume;
        volume.value = '0';
      } else volume.value = String(beforeMute || 0.7);
      volume.dispatchEvent(new Event('input', { bubbles: true }));
    };
    volume.addEventListener('input', paintVolume);
    audio.addEventListener('volumechange', paintVolume);
    // Колесо мыши над громкостью: ±5%.
    volumeBox.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const next = Math.max(
          0,
          Math.min(1, Number(volume.value) - Math.sign(event.deltaY) * 0.05)
        );
        volume.value = next.toFixed(2);
        volume.dispatchEvent(new Event('input', { bubbles: true }));
      },
      { passive: false }
    );
    paintVolume();
  }

  // ——— Сдвиг текста: видимая регулировка вместо одних горячих клавиш ———
  const panelTabs = document.querySelector('.now-panel .panel-tabs'),
    lyricsBox = document.getElementById('lyrics');
  if (panelTabs && lyricsBox && typeof setLyricsOffset === 'function') {
    const bar = node('div', 'lyrics-offset hidden'),
      label = node('span', 'lyrics-offset-label'),
      minus = node('button', 'lyrics-offset-step', '−'),
      value = node('button', 'lyrics-offset-value'),
      plus = node('button', 'lyrics-offset-step', '+');
    label.textContent = 'Синхронность';
    minus.title = 'Текст позже на 50 мс (Alt+[)';
    plus.title = 'Текст раньше на 50 мс (Alt+])';
    value.title = 'Сбросить сдвиг (Alt+\\)';
    for (const b of [minus, value, plus]) b.type = 'button';
    bar.append(label, minus, value, plus);
    panelTabs.append(bar);
    const paintOffset = () => {
      const ms = Math.round((typeof lyricsOffset === 'number' ? lyricsOffset : 0) * 1000);
      value.textContent = ms ? (ms > 0 ? '+' : '−') + Math.abs(ms) + ' мс' : '0 мс';
      value.classList.toggle('shifted', ms !== 0);
    };
    const offsetBeforeRefresh = setLyricsOffset;
    setLyricsOffset = function (seconds) {
      offsetBeforeRefresh(seconds);
      paintOffset();
    };
    minus.onclick = () => setLyricsOffset(lyricsOffset - 0.05);
    plus.onclick = () => setLyricsOffset(lyricsOffset + 0.05);
    value.onclick = () => setLyricsOffset(0);
    const syncVisibility = () =>
      bar.classList.toggle(
        'hidden',
        !lyricsBox.classList.contains('synced') ||
          lyricsBox.classList.contains('hidden') ||
          !panelTabs.contains(document.getElementById('lyrics-tab')) ||
          !lyricsBox.closest('.now-panel')
      );
    new MutationObserver(syncVisibility).observe(lyricsBox, {
      attributes: true,
      attributeFilter: ['class'],
    });
    new MutationObserver(syncVisibility).observe(document.querySelector('.now-panel'), {
      childList: true,
    });
    paintOffset();
    syncVisibility();
  }

  // ——— Очередь: перетаскивание и удаление своих треков ———
  if (typeof renderQueue === 'function' && typeof upNext !== 'undefined') {
    const queueBox = document.getElementById('queue');
    let dragFrom = -1;
    const renderQueueBeforeRefresh = renderQueue;
    renderQueue = function () {
      renderQueueBeforeRefresh();
      const entries = [...queueBox.querySelectorAll('.queue-entry')].slice(0, upNext.length);
      entries.forEach((entry, i) => {
        entry.draggable = true;
        entry.classList.add('queue-draggable');
        entry.title = 'Перетащи, чтобы изменить порядок';
        const remove = node('span', 'queue-remove');
        remove.replaceChildren(icon('close'));
        remove.setAttribute('role', 'button');
        remove.setAttribute('aria-label', 'Убрать из очереди');
        remove.title = 'Убрать из очереди';
        remove.onclick = (event) => {
          event.stopPropagation();
          upNext.splice(i, 1);
          renderQueue();
        };
        entry.append(remove);
        entry.addEventListener('dragstart', (event) => {
          dragFrom = i;
          entry.classList.add('dragging');
          event.dataTransfer.effectAllowed = 'move';
        });
        entry.addEventListener('dragend', () => {
          entry.classList.remove('dragging');
          queueBox
            .querySelectorAll('.drop-before,.drop-after')
            .forEach((e) => e.classList.remove('drop-before', 'drop-after'));
        });
        entry.addEventListener('dragover', (event) => {
          if (dragFrom < 0) return;
          event.preventDefault();
          const r = entry.getBoundingClientRect(),
            after = event.clientY > r.top + r.height / 2;
          entry.classList.toggle('drop-after', after);
          entry.classList.toggle('drop-before', !after);
        });
        entry.addEventListener('dragleave', () =>
          entry.classList.remove('drop-before', 'drop-after')
        );
        entry.addEventListener('drop', (event) => {
          event.preventDefault();
          if (dragFrom < 0) return;
          const after = entry.classList.contains('drop-after');
          const [moved] = upNext.splice(dragFrom, 1);
          let to = i + (after ? 1 : 0);
          if (dragFrom < to) to--;
          upNext.splice(to, 0, moved);
          dragFrom = -1;
          renderQueue();
        });
      });
    };
  }

  // ——— Уведомления: иконка по смыслу и плавное появление ———
  const toastBox = document.getElementById('toast');
  if (toastBox && typeof toast === 'function') {
    const toastBeforeRefresh = toast;
    toast = function (text) {
      toastBeforeRefresh(text);
      const problem =
          /не удалось|ошибк|недоступ|не поддерж|не установил|не найден|нельзя|сначала|failed|error/i.test(
            String(text)
          ),
        message = node('span', 'toast-text', String(text));
      toastBox.replaceChildren(icon(problem ? 'alert' : 'check'), message);
      toastBox.classList.toggle('toast-problem', problem);
      toastBox.classList.remove('toast-in');
      void toastBox.offsetWidth;
      toastBox.classList.add('toast-in');
    };
  }

  // ——— Горячие клавиши: новые и шпаргалка ———
  const shortcuts = [
    [['Пробел'], 'Пауза / воспроизведение'],
    [['←', '→'], 'Перемотка на 5 секунд'],
    [['↑', '↓'], 'Громкость ±5%'],
    [['M'], 'Выключить / включить звук'],
    [['Ctrl', 'K'], 'Поиск'],
    [['Alt', '←'], 'Назад'],
    [['Alt', '[', ']'], 'Текст позже / раньше на 50 мс (с Shift — 250 мс)'],
    [['Alt', '\\'], 'Сбросить сдвиг текста'],
    [['Esc'], 'Выйти из полноэкранного режима'],
    [['?'], 'Эта шпаргалка'],
  ];
  const keysDialog = node('dialog', 'keys-dialog');
  keysDialog.setAttribute('aria-labelledby', 'keys-title');
  const keysTitle = node('h2', '', 'Горячие клавиши');
  keysTitle.id = 'keys-title';
  const keysClose = node('button', 'keys-close');
  keysClose.replaceChildren(icon('close'));
  keysClose.setAttribute('aria-label', 'Закрыть');
  keysClose.onclick = () => keysDialog.close();
  const keysList = node('div', 'keys-list');
  for (const [keys, label] of shortcuts) {
    const row = node('div', 'keys-row'),
      combo = node('span', 'keys-combo');
    for (const k of keys) combo.append(node('kbd', '', k));
    row.append(combo, node('span', 'keys-label', label));
    keysList.append(row);
  }
  const keysHead = node('div', 'keys-head');
  keysHead.append(keysTitle, keysClose);
  keysDialog.append(keysHead, keysList);
  document.body.append(keysDialog);
  const keysButton = node('button', 'quiet keys-open');
  keysButton.type = 'button';
  keysButton.replaceChildren(icon('keyboard'));
  keysButton.title = 'Горячие клавиши (?)';
  keysButton.setAttribute('aria-label', 'Горячие клавиши');
  keysButton.onclick = () => keysDialog.showModal();
  (document.getElementById('feedback-open') || document.querySelector('.window-actions'))?.before(
    keysButton
  );
  addEventListener('keydown', (event) => {
    if (
      event.target.matches?.('input,textarea,select,[contenteditable]') ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    if (event.key === '?') {
      event.preventDefault();
      keysDialog.open ? keysDialog.close() : keysDialog.showModal();
      return;
    }
    if (document.querySelector('dialog[open]')) return;
    const volumeInput = document.getElementById('volume');
    if (event.code === 'KeyM') {
      event.preventDefault();
      document.querySelector('.volume-mute')?.click();
    } else if (
      (event.code === 'ArrowUp' || event.code === 'ArrowDown') &&
      (event.target === document.body || event.target === document.documentElement) &&
      volumeInput &&
      !event.target.matches?.('button,[role=button]')
    ) {
      event.preventDefault();
      const next = Math.max(
        0,
        Math.min(1, Number(volumeInput.value) + (event.code === 'ArrowUp' ? 0.05 : -0.05))
      );
      volumeInput.value = next.toFixed(2);
      volumeInput.dispatchEvent(new Event('input', { bubbles: true }));
      toast('Громкость ' + Math.round(next * 100) + '%');
    }
  });

  // ——— Анимации ———
  // Сердечко «пульсирует» при нажатии.
  document.addEventListener('click', (event) => {
    const heart = event.target.closest?.('.track-heart, #now-favorite, .player-like');
    if (!heart) return;
    heart.classList.remove('pop');
    void heart.offsetWidth;
    heart.classList.add('pop');
  });
  // Список плавно появляется при смене раздела, артиста или альбома.
  const content = document.querySelector('.collection');
  let lastView = '';
  const viewKey = () =>
    [
      typeof view !== 'undefined' ? view : '',
      typeof selectedArtist !== 'undefined' ? selectedArtist : '',
      typeof albumFilter !== 'undefined' ? albumFilter : '',
    ].join('\0');
  const renderBeforeRefresh = render;
  render = function () {
    renderBeforeRefresh();
    const key = viewKey();
    if (key === lastView || !content) return;
    lastView = key;
    content.classList.remove('view-enter');
    void content.offsetWidth;
    content.classList.add('view-enter');
  };
  lastView = viewKey();
})();
