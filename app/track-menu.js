// The explicit queue is separate from the album/playlist playback context.
let upNext = [],
  manualReturn = [];
const trackMenu = node('div', 'track-menu hidden');
trackMenu.setAttribute('role', 'menu');
document.body.append(trackMenu);
let trackMenuAnchor = null;
function closeTrackMenu() {
  trackMenu.classList.add('hidden');
  trackMenuAnchor?.setAttribute('aria-expanded', 'false');
}
function goToAlbum(t) {
  if (t.remote) {
    openOnline();
    scSearchMode.value = 'artist';
    updateSearchExample(scSearchMode, scInput);
    scInput.value = t.artist + ' ' + (t.album === 'SoundCloud Single' ? t.title : t.album);
    scForm.requestSubmit();
    return;
  }
  selectedArtist = null;
  view = 'albums';
  albumFilter = t.album + '\0' + t.albumartist;
  shown = 100;
  $('search').value = '';
  document.body.classList.remove('lyrics-focus');
  exitImmersive();
  render();
  mainScroll.scrollTo({ top: 0, behavior: 'smooth' });
}
function queueTrack(t, next = false) {
  next ? upNext.unshift(t) : upNext.push(t);
  renderQueue();
  toast(next ? 'Трек будет играть следующим' : 'Трек добавлен в конец очереди');
}
function openTrackMenu(t, anchor) {
  closeTrackMenu();
  trackMenuAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  const actions = [
    [
      'Перейти к артисту',
      () => {
        if (t.remote) {
          openOnline();
          scSearchMode.value = 'artist';
          updateSearchExample(scSearchMode, scInput);
          scInput.value = t.artist;
          scForm.requestSubmit();
        } else openArtist(t.artist);
      },
    ],
    ['Перейти к альбому', () => goToAlbum(t)],
    ['Играть следующим', () => queueTrack(t, true)],
    ['Добавить в конец очереди', () => queueTrack(t, false)],
  ];
  if (!t.remote) actions.push(['Удалить', () => deleteLocal(t)]);
  trackMenu.replaceChildren(
    ...actions.map(([label, action]) => {
      const button = node('button', label === 'Удалить' ? 'danger' : '', label);
      button.setAttribute('role', 'menuitem');
      button.onclick = () => {
        closeTrackMenu();
        action();
      };
      return button;
    })
  );
  trackMenu.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect(),
    width = trackMenu.offsetWidth,
    height = trackMenu.offsetHeight;
  trackMenu.style.left = Math.max(12, Math.min(innerWidth - width - 12, rect.right - width)) + 'px';
  trackMenu.style.top =
    Math.max(12, rect.bottom + height + 8 < innerHeight ? rect.bottom + 6 : rect.top - height - 6) +
    'px';
  trackMenu.firstChild.focus();
}
function makeTrackMenuButton(t) {
  const b = node('button', 'track-options', '⋯');
  b.title = 'Действия с треком';
  b.setAttribute('aria-label', 'Действия: ' + t.title);
  b.setAttribute('aria-haspopup', 'menu');
  b.onclick = (e) => {
    e.stopPropagation();
    openTrackMenu(t, b);
  };
  return b;
}
function addTrackMenuButtons() {
  const tracks = filtered();
  for (const [i, row] of [...$('track-list').children].entries()) {
    row.querySelector('.row-delete')?.remove();
    if (tracks[i] && !row.querySelector('.track-options'))
      row.append(makeTrackMenuButton(tracks[i]));
  }
}
document.addEventListener('pointerdown', (e) => {
  if (!trackMenu.contains(e.target) && !trackMenuAnchor?.contains(e.target)) closeTrackMenu();
});
addEventListener('resize', closeTrackMenu);
mainScroll.addEventListener('scroll', closeTrackMenu, { passive: true });
trackMenu.addEventListener('keydown', (e) => {
  e.stopPropagation();
  const items = [...trackMenu.children],
    index = items.indexOf(document.activeElement);
  if (e.key === 'Escape') {
    closeTrackMenu();
    trackMenuAnchor?.focus();
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    items[(index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }
});
function playQueued(index = 0) {
  const selected = upNext[index];
  if (!selected) return;
  upNext.splice(0, index + 1);
  if (current) manualReturn.push(current);
  load(selected);
  renderQueue();
}
renderQueue = function () {
  const recommended = waveMode ? queue.slice(Math.max(0, qi + 1), Math.max(0, qi + 1) + 40) : [];
  $('queue-count').textContent = upNext.length + recommended.length;
  $('queue').replaceChildren();
  if (upNext.length) {
    const heading = node('div', 'queue-section-heading');
    heading.append(node('span', '', 'Добавлено тобой'));
    const clear = node('button', 'quiet', 'Очистить');
    clear.onclick = () => {
      upNext = [];
      renderQueue();
    };
    heading.append(clear);
    $('queue').append(heading);
    for (const [i, t] of upNext.entries()) {
      const b = node('button', 'queue-entry', t.title);
      b.append(node('small', '', t.artist));
      b.onclick = () => playQueued(i);
      $('queue').append(b);
    }
  }
  if (recommended.length) {
    $('queue').append(node('div', 'queue-section-heading', 'Дальше в Моей волне'));
    for (const t of recommended) {
      const b = node('button', 'queue-entry', t.title);
      b.append(node('small', '', t.artist));
      b.onclick = () => {
        qi = queue.indexOf(t);
        load(t);
        renderQueue();
      };
      $('queue').append(b);
    }
  }
  if (!upNext.length && !recommended.length)
    $('queue').append(
      node(
        'p',
        'queue-empty',
        'Очередь пуста. Добавь треки через меню ⋯ — «Играть следующим» или «Добавить в конец очереди».'
      )
    );
};
const advanceBeforeExplicitQueue = advance;
advance = async function (delta = 1, automatic = false) {
  closeTrackMenu();
  if (delta > 0 && upNext.length) {
    playQueued(0);
    return;
  }
  if (delta < 0 && manualReturn.length) {
    load(manualReturn.pop());
    renderQueue();
    return;
  }
  manualReturn = [];
  return advanceBeforeExplicitQueue(delta, automatic);
};
const startBeforeExplicitQueue = start;
start = async function () {
  if ((!current || audio.ended) && upNext.length) {
    playQueued(0);
    return;
  }
  return startBeforeExplicitQueue();
};
const playListBeforeExplicitQueue = playList;
playList = function (list, index) {
  manualReturn = [];
  return playListBeforeExplicitQueue(list, index);
};
const deleteBeforeExplicitQueue = deleteLocal;
deleteLocal = async function (t) {
  await deleteBeforeExplicitQueue(t);
  if (!library.tracks.some((x) => x.id === t.id)) {
    upNext = upNext.filter((x) => x.id !== t.id);
    manualReturn = manualReturn.filter((x) => x.id !== t.id);
    renderQueue();
  }
};
immersiveDelete.remove();
const currentTrackMenu = node('button', 'track-options current-track-menu hidden', '⋯');
currentTrackMenu.title = 'Действия с треком';
currentTrackMenu.setAttribute('aria-label', 'Действия с текущим треком');
currentTrackMenu.setAttribute('aria-haspopup', 'menu');
currentTrackMenu.onclick = () => current && openTrackMenu(current, currentTrackMenu);
immersiveInfo.append(currentTrackMenu);
const syncBeforeTrackMenu = syncOnlineControls;
syncOnlineControls = function () {
  syncBeforeTrackMenu();
  currentTrackMenu.classList.toggle('hidden', !current);
};
const renderOnlineBeforeMenus = renderOnline;
renderOnline = function () {
  renderOnlineBeforeMenus();
  for (const [i, card] of [...scResults.children].entries())
    if (scTracks[i]) card.append(makeTrackMenuButton(scTracks[i]));
};
window.runTrackMenuTest = () => {
  const previous = [...upNext],
    t = library.tracks[0],
    other = library.tracks[1] || t;
  upNext = [];
  renderQueue();
  const checks = {
    emptyInitially: $('queue-count').textContent === '0' && !$('queue').querySelector('button'),
  };
  queueTrack(t, false);
  queueTrack(other, true);
  checks.priority = upNext[0] === other && upNext[1] === t;
  const button = makeTrackMenuButton(t);
  document.body.append(button);
  openTrackMenu(t, button);
  checks.actions =
    trackMenu.children.length === 5 && trackMenu.textContent.includes('Перейти к альбому');
  checks.noTrashRows = !document.querySelector('.row-delete');
  closeTrackMenu();
  button.remove();
  upNext = previous;
  renderQueue();
  return { ok: Object.values(checks).every(Boolean), checks };
};
render();
renderQueue();
