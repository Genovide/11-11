let selectedArtist = null;
const artistKey = (name) =>
  (name || 'Неизвестный исполнитель')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ru');
const trackArtist = (t) => t.artist || t.albumartist || 'Неизвестный исполнитель';
const originalFiltered = filtered;
filtered = () =>
  originalFiltered().filter(
    (t) => !selectedArtist || artistKey(trackArtist(t)) === artistKey(selectedArtist)
  );
const artistNav = node('button', 'nav');
artistNav.dataset.view = 'artists';
artistNav.append(node('span', '', '♧'), node('span', '', 'Артисты'));
document
  .querySelector('nav')
  .insertBefore(artistNav, document.querySelector('[data-view="albums"]'));
function markNavigation() {
  document
    .querySelectorAll('[data-view]')
    .forEach((b) =>
      b.classList.toggle('active', selectedArtist ? b === artistNav : b.dataset.view === view)
    );
}
function openArtist(name) {
  if (!name) return;
  selectedArtist = name;
  view = 'albums';
  albumFilter = null;
  shown = 100;
  $('search').value = '';
  document.body.classList.remove('lyrics-focus');
  if (typeof exitImmersive === 'function') exitImmersive();
  markNavigation();
  render();
  document.querySelector('main').scrollTo({ top: 0, behavior: 'smooth' });
}
artistNav.onclick = () => {
  selectedArtist = null;
  view = 'artists';
  albumFilter = null;
  shown = 100;
  $('search').value = '';
  markNavigation();
  render();
};
document.querySelectorAll('[data-view]').forEach((b) => {
  if (b !== artistNav)
    b.addEventListener(
      'click',
      () => {
        selectedArtist = null;
      },
      true
    );
});
const originalRender = render;
render = function () {
  originalRender();
  markNavigation();
  if (view === 'artists' && !selectedArtist) {
    const query = $('search').value.trim().toLocaleLowerCase('ru'),
      groups = new Map();
    for (const t of library.tracks) {
      const name = trackArtist(t),
        key = artistKey(name);
      if (query && !key.includes(query)) continue;
      if (!groups.has(key)) groups.set(key, { name, t, count: 0, albums: new Set() });
      const group = groups.get(key);
      group.count++;
      group.albums.add(t.album + '\0' + t.albumartist);
      if (!group.t.cover && t.cover) group.t = t;
    }
    const artists = [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru', { sensitivity: 'base', numeric: true })
    );
    $('view-label').textContent = 'Артисты';
    $('collection-title').firstChild.textContent = 'Артисты ';
    $('track-count').textContent = artists.length;
    $('track-area').classList.add('hidden');
    $('albums').classList.toggle('hidden', !artists.length);
    $('albums').classList.add('artists-grid');
    $('empty').classList.toggle('hidden', !!artists.length);
    $('clear-filter').classList.add('hidden');
    $('albums').replaceChildren(
      ...artists.slice(0, shown).map((a) => {
        const card = node('button', 'album-card artist-card');
        card.append(
          art(a.t, 'album-art artist-art'),
          node('strong', '', a.name),
          node('small', '', `${a.albums.size} альбомов · ${a.count} треков`)
        );
        card.onclick = () => openArtist(a.name);
        return card;
      })
    );
    $('more').classList.toggle('hidden', artists.length <= shown);
    return;
  }
  $('albums').classList.remove('artists-grid');
  if (selectedArtist) {
    $('view-label').textContent =
      selectedArtist + (albumFilter ? ' / ' + (filtered()[0]?.album || 'Альбом') : '');
    if (!albumFilter) $('collection-title').firstChild.textContent = selectedArtist + ' ';
    $('clear-filter').classList.remove('hidden');
    $('clear-filter').textContent = albumFilter ? '← Альбомы артиста' : '← Все артисты';
  } else $('clear-filter').textContent = '← Все альбомы';
};
$('clear-filter').onclick = () => {
  if (albumFilter) albumFilter = null;
  else if (selectedArtist) {
    selectedArtist = null;
    view = 'artists';
  }
  shown = 100;
  render();
};
function makeArtistLink(element, getName) {
  element.classList.add('artist-link');
  element.tabIndex = 0;
  element.setAttribute('role', 'link');
  element.title = 'Перейти к артисту';
  element.onclick = (e) => {
    e.stopPropagation();
    openArtist(getName());
  };
  element.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openArtist(getName());
    }
  };
}
makeArtistLink($('now-artist'), () => current?.artist);
makeArtistLink($('mini-artist'), () => current?.artist);
makeArtistLink(immersiveArtist, () => current?.artist);
$('track-list').addEventListener(
  'click',
  (event) => {
    const target = event.target.closest('.track-artist');
    if (target) {
      event.stopPropagation();
      openArtist(target.textContent);
    }
  },
  true
);
window.runArtistsTest = () => {
  const t = library.tracks.find((t) => t.artist === 'Cupsize') || library.tracks[0];
  artistNav.click();
  const names = [...$('albums').querySelectorAll('strong')].map((n) => n.textContent);
  const checks = {
    directory: names.length > 0,
    alphabetical: names.every(
      (n, i) =>
        !i || names[i - 1].localeCompare(n, 'ru', { sensitivity: 'base', numeric: true }) <= 0
    ),
  };
  openArtist(t.artist);
  checks.artistFilter =
    filtered().length > 0 &&
    filtered().every((x) => artistKey(trackArtist(x)) === artistKey(t.artist));
  checks.albumsVisible =
    !$('albums').classList.contains('hidden') && $('track-area').classList.contains('hidden');
  const card = $('albums').querySelector('button');
  card?.click();
  checks.albumTracks =
    !!albumFilter && filtered().every((x) => artistKey(trackArtist(x)) === artistKey(t.artist));
  $('clear-filter').click();
  checks.backToAlbums = !albumFilter && selectedArtist === t.artist;
  $('clear-filter').click();
  checks.backToArtists = view === 'artists' && !selectedArtist;
  selectedArtist = null;
  view = 'tracks';
  render();
  return { ok: Object.values(checks).every(Boolean), checks };
};
render();
