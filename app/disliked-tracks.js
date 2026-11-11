let excludedOnlineTracks = [];
try {
  excludedOnlineTracks = JSON.parse(localStorage.getItem('excluded-online-tracks') || '[]');
} catch {}
const exclusionNorm = (s) =>
  String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
const exclusionIdentity = (t) =>
  exclusionNorm(String(t.artist || '').split(/\s+(?:feat\.?|ft\.?|при уч\.)\s+|[,;&]/i)[0]) +
  '\0' +
  exclusionNorm(
    String(t.title || '').replace(
      /[([][^\])]*(?:prod\.?|slowed|sped|lyrics|official audio|bass boosted)[^\])]*[\])]/gi,
      ''
    )
  );
const excludedOnline = (t) =>
  !!t?.remote &&
  excludedOnlineTracks.some((x) => x.id === t.id || exclusionIdentity(x) === exclusionIdentity(t));
function cacheExclusions() {
  localStorage.setItem('excluded-online-tracks', JSON.stringify(excludedOnlineTracks));
}
const filteredBeforeExclusions = filtered;
filtered = () => filteredBeforeExclusions().filter((t) => !excludedOnline(t));
svgPaths.dislike = 'M10 15v5l1 1 2-1 3-7V3H5L3 12l1 3h6M16 3h5v10h-5';
const dislikeCurrent = node('button', 'dislike-current hidden');
dislikeCurrent.append(icon('dislike'));
dislikeCurrent.title = 'Не нравится — больше не показывать';
dislikeCurrent.setAttribute('aria-label', dislikeCurrent.title);
document.querySelector('.now-details').append(dislikeCurrent);
dislikeCurrent.onclick = () => current?.remote && dislikeOnlineTrack(current);
const dislikeImmersive = node('button', 'outline dislike-immersive hidden');
dislikeImmersive.append(icon('dislike'), node('span', '', 'Не нравится'));
immersiveInfo.append(dislikeImmersive);
dislikeImmersive.onclick = dislikeCurrent.onclick;
const syncBeforeDislike = syncOnlineControls;
syncOnlineControls = function () {
  syncBeforeDislike();
  dislikeCurrent.classList.toggle('hidden', !current?.remote);
  dislikeImmersive.classList.toggle('hidden', !current?.remote);
};
const openMenuBeforeDislike = openTrackMenu;
openTrackMenu = function (t, anchor) {
  openMenuBeforeDislike(t, anchor);
  if (t.remote) {
    const b = node('button', '', 'Не нравится — больше не показывать');
    b.onclick = () => {
      closeTrackMenu();
      dislikeOnlineTrack(t);
    };
    trackMenu.append(b);
    const height = trackMenu.offsetHeight,
      top = parseFloat(trackMenu.style.top) || 12;
    if (top + height > innerHeight - 12)
      trackMenu.style.top = Math.max(12, innerHeight - height - 12) + 'px';
  }
};
async function dislikeOnlineTrack(t) {
  dislikeCurrent.disabled = dislikeImmersive.disabled = true;
  try {
    await remoteFavoritesWrite.catch(() => {});
    excludedOnlineTracks = await window.lumen.scExcludedSet(t.id, true);
    cacheExclusions();
    for (const [id, track] of remoteFavoriteTracks)
      if (excludedOnline(track)) {
        remoteFavoriteTracks.delete(id);
        favorites.delete(id);
        changedRemoteFavorites.add(id);
      }
    favorites.delete(t.id);
    changedRemoteFavorites.add(t.id);
    cacheRemoteFavorites();
    persistFavoriteIds();
    const before = queue.slice(0, qi + 1).filter((x) => !excludedOnline(x)).length;
    queue = queue.filter((x) => !excludedOnline(x));
    qi = before - 1;
    upNext = upNext.filter((x) => !excludedOnline(x));
    manualReturn = manualReturn.filter((x) => !excludedOnline(x));
    scTracks = scTracks.filter((x) => !excludedOnline(x));
    if (current?.id === t.id) {
      if (queue.length || upNext.length || waveMode) await advance(1);
      else {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        current = null;
        $('mini-title').textContent = $('now-title').textContent = 'Выбери другую музыку';
        $('mini-artist').textContent = $('now-artist').textContent = '';
        $('mini-cover').replaceChildren();
        $('now-cover').replaceChildren();
        setLyrics({ lyrics: '' });
      }
    }
    render();
    renderOnline();
    renderQueue();
    updateFavorite();
    syncOnlineControls();
    toast('Больше не будем показывать этот трек. Отменить можно в настройках SoundCloud.');
  } catch (e) {
    toast(cleanError(e));
  } finally {
    dislikeCurrent.disabled = dislikeImmersive.disabled = false;
  }
}
const excludedDialog = node('dialog', 'sc-settings excluded-dialog'),
  excludedList = node('div', 'excluded-list'),
  excludedClose = node('button', 'outline', 'Закрыть'),
  excludedManage = node('button', 'quiet', 'Треки, которые не нравятся');
excludedDialog.append(
  node('h2', '', 'Не нравится'),
  node(
    'p',
    'sc-hint',
    'Эти записи скрыты из поиска, избранного и Моей волны. Здесь можно вернуть их.'
  ),
  excludedList,
  excludedClose
);
document.body.append(excludedDialog);
excludedDialog.setAttribute('aria-label', 'Исключённые треки');
excludedDialog.addEventListener('keydown', (e) => e.stopPropagation());
excludedClose.onclick = () => excludedDialog.close();
scSettings.insertBefore(excludedManage, settingsActions);
function renderExclusions() {
  excludedList.replaceChildren();
  if (!excludedOnlineTracks.length)
    excludedList.append(node('p', 'sc-hint', 'Исключённых треков пока нет.'));
  for (const t of excludedOnlineTracks) {
    const row = node('div', 'excluded-entry'),
      label = node('div'),
      restore = node('button', 'outline', 'Вернуть');
    label.append(node('strong', '', t.title), node('small', '', t.artist));
    restore.onclick = async () => {
      restore.disabled = true;
      try {
        excludedOnlineTracks = await window.lumen.scExcludedSet(t.id, false);
        cacheExclusions();
        renderExclusions();
        render();
        toast('Трек снова разрешён для поиска и волны');
      } catch (e) {
        restore.disabled = false;
        toast(cleanError(e));
      }
    };
    row.append(label, restore);
    excludedList.append(row);
  }
}
excludedManage.onclick = async () => {
  try {
    excludedOnlineTracks = await window.lumen.scExcludedList();
    cacheExclusions();
    renderExclusions();
    scSettings.close();
    excludedDialog.showModal();
  } catch (e) {
    toast(cleanError(e));
  }
};
window.lumen
  .scExcludedList()
  .then((list) => {
    excludedOnlineTracks = list;
    cacheExclusions();
    scTracks = scTracks.filter((t) => !excludedOnline(t));
    render();
    renderOnline();
  })
  .catch(() => {});
syncOnlineControls();
