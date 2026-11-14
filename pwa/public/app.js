import { installFeedback } from './feedback.js';
import curated from './curated.js';
import { createPlayer } from './player.js';
import {
  soundcloudUrl,
  coverUrl,
  cleanTrack,
  mergeTrack,
  readState,
  importBackup,
  exportBackup,
} from './core.js';
const $ = (id) => document.getElementById(id),
  key = 'soundsync-pocket-v1';
let state;
try {
  state = readState(localStorage.getItem(key));
} catch {
  state = readState('');
}
let view = 'home',
  shown = 60,
  generation = 0,
  current = state.tracks.find((t) => t.url === state.currentUrl) || null,
  selectedUrl = '',
  toastTimer,
  station = null,
  waveBusy = false,
  queue = [],
  queueIndex = -1,
  searchResults = [],
  randomTracks = [],
  playedGeneration = -1;
const icon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    u = document.createElementNS(s.namespaceURI, 'use');
  u.setAttribute('href', '#i-' + name);
  s.append(u);
  return s;
};
const element = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
function toast(message, action) {
  clearTimeout(toastTimer);
  $('toast').replaceChildren(document.createTextNode(message));
  if (action) {
    const b = element('button', '', action.label);
    b.onclick = action.run;
    $('toast').append(b);
  }
  $('toast').hidden = false;
  toastTimer = setTimeout(() => ($('toast').hidden = true), action ? 15000 : 6000);
}
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    toast('Не удалось сохранить список: проверь свободное место и настройки браузера.');
    return false;
  }
}
function cover(img, url) {
  img.src = coverUrl(url) || './assets/icon.png';
  img.onerror = () => {
    img.onerror = null;
    img.src = './assets/icon.png';
  };
}
function toggleLike(t) {
  let saved = state.tracks.find((x) => x.url === t.url);
  if (!saved) saved = mergeTrack(state.tracks, t);
  saved.liked = !saved.liked;
  if (current?.url === saved.url) current = saved;
  save();
  render();
  paintPlayer();
  toast(saved.liked ? 'В любимом' : 'Убрано из любимого');
}
function navigate(next) {
  view = next;
  shown = 60;
  $('filter').value = '';
  render();
  $('main').scrollIntoView({ block: 'start' });
}
function visibleTracks() {
  const query = $('filter').value.trim().toLocaleLowerCase('ru');
  let list =
    view === 'favorites'
      ? state.tracks.filter((t) => t.liked)
      : view === 'history'
        ? state.tracks.filter((t) => t.lastPlayed)
        : state.tracks;
  list = [...list].sort((a, b) =>
    view === 'history' ? b.lastPlayed - a.lastPlayed : b.addedAt - a.addedAt
  );
  return list.filter((t) => (t.title + ' ' + t.artist).toLocaleLowerCase('ru').includes(query));
}
function row(t, list) {
  const e = element('div', 'track-row' + (current?.url === t.url ? ' current' : '')),
    play = element('button', 'track-play'),
    img = element('img', 'track-cover');
  img.loading = 'lazy';
  img.alt = '';
  cover(img, t.cover);
  const text = element('span', 'track-text');
  text.append(element('strong', '', t.title), element('small', '', t.artist));
  play.append(img, text, icon('play'));
  play.lastChild.classList.add('play-indicator');
  play.setAttribute('aria-label', 'Слушать ' + t.title + ' — ' + t.artist);
  play.onclick = () => {
    station = null;
    if ($('wave-banner')) $('wave-banner').hidden = true;
    queue = list;
    queueIndex = list.indexOf(t);
    playTrack(t);
  };
  const liked = state.tracks.some((x) => x.url === t.url && x.liked),
    heart = element('button', 'icon-button track-like heart' + (liked ? ' liked' : ''));
  heart.append(icon('heart'));
  heart.setAttribute('aria-label', liked ? 'Убрать из любимого' : 'Добавить в любимое');
  heart.setAttribute('aria-pressed', String(liked));
  heart.onclick = () => toggleLike(t);
  e.append(play, heart);
  return e;
}
function render() {
  const top = document.scrollingElement.scrollTop,
    isHome = view === 'home';
  document.body.classList.toggle('view-simple', !isHome);
  $('hero').hidden = $('quick-actions').hidden = !isHome;
  const likes = state.tracks.filter((t) => t.liked).length;
  $('favorite-summary').textContent = likes
    ? `${likes.toLocaleString('ru')} треков рядом`
    : 'Треки, к которым возвращаешься';
  const list = visibleTracks();
  $('collection-title').firstChild.textContent =
    view === 'favorites' ? 'Любимое ' : view === 'history' ? 'История ' : 'Мои треки ';
  $('count').textContent = list.length.toLocaleString('ru');
  $('collection-eyebrow').textContent =
    view === 'history'
      ? 'ТВОЙ НЕДАВНИЙ ЗВУК'
      : view === 'favorites'
        ? 'ТО, ЧТО ХОЧЕТСЯ ПОВТОРИТЬ'
        : 'СОБРАНО ТОБОЙ';
  $('tracks').replaceChildren(...list.slice(0, shown).map((t) => row(t, list)));
  $('more').hidden = list.length <= shown;
  $('empty').hidden = !!list.length;
  const filtering = !!$('filter').value.trim();
  $('empty-title').textContent = filtering
    ? 'Ничего не нашлось'
    : view === 'favorites'
      ? 'Оставь любимое рядом'
      : view === 'history'
        ? 'Здесь будет твой ритм'
        : 'Твой звук начинается здесь';
  $('empty-text').textContent = filtering
    ? 'Попробуй другое название или имя исполнителя.'
    : view === 'favorites'
      ? 'Нажми сердечко рядом с любым треком. Список сохранится после закрытия приложения.'
      : view === 'history'
        ? 'Треки появятся здесь, когда начнётся воспроизведение.'
        : 'Вставь ссылку SoundCloud или найди трек через поиск выше.';
  $('empty-add').hidden = filtering;
  $('example').hidden = !isHome || filtering;
  document.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
    if (b.dataset.view === view) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  document.scrollingElement.scrollTop = top;
}
function paintPlayer() {
  if (!current || !selectedUrl) return;
  $('player').hidden = false;
  document.body.classList.add('has-player');
  for (const id of ['mini-title', 'large-title']) $(id).textContent = current.title;
  for (const id of ['mini-artist', 'large-artist']) $(id).textContent = current.artist;
  cover($('mini-cover'), current.cover);
  cover($('large-cover'), current.cover);
  $('source-link').href = current.url;
  const liked = state.tracks.some((t) => t.url === current.url && t.liked);
  $('player-like').classList.toggle('liked', liked);
  $('player-like').setAttribute('aria-pressed', String(liked));
  $('player-like').setAttribute('aria-label', liked ? 'Убрать из любимого' : 'Добавить в любимое');
}
async function api(path, body) {
  if (!navigator.onLine) throw Error('Для SoundCloud нужен интернет');
  const response = await fetch('./api/' + path, {
    ...(body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(35000),
  });
  const data = await response.json().catch(() => ({ error: 'Сервис временно недоступен' }));
  if (!response.ok) throw Error(data.error || 'SoundCloud временно недоступен');
  return data;
}
async function metadata(url) {
  const data = await api('resolve', { url });
  return cleanTrack(data.track);
}
const player = createPlayer($('embed-wrap'), {
  playing: () => {
    if (!current) return;
    $('play-state').textContent = 'Играет';
    if (playedGeneration !== generation) {
      current.lastPlayed = Date.now();
      current.playCount = (current.playCount || 0) + 1;
      playedGeneration = generation;
      save();
      render();
    }
    if (station && queue.length - queueIndex < 4 && !waveBusy)
      refillWave().catch((e) => toast(e.message));
  },
  paused: () => {
    if (current) $('play-state').textContent = 'Пауза';
  },
  ended: () => advance().catch((e) => toast(e.message)),
  error: (message) => {
    $('play-state').textContent = 'Не удалось запустить';
    toast(message);
  },
});
function playTrack(t) {
  if (!navigator.onLine) {
    toast('Для воспроизведения SoundCloud нужен интернет. Любимое доступно офлайн.');
    return;
  }
  ++generation;
  current = mergeTrack(state.tracks, t);
  state.currentUrl = current.url;
  selectedUrl = current.url;
  save();
  paintPlayer();
  $('play-state').textContent = 'Загрузка…';
  player.play(selectedUrl);
  render();
}
async function advance() {
  if (station) {
    if (queueIndex + 1 >= queue.length) await refillWave();
    if (queueIndex + 1 < queue.length) {
      queueIndex++;
      await playTrack(queue[queueIndex], { keepStation: true });
    } else toast('Новых треков в волне пока нет');
  } else if (queueIndex + 1 < queue.length) {
    queueIndex++;
    await playTrack(queue[queueIndex]);
  }
}
async function refillWave() {
  if (!station || waveBusy) return;
  waveBusy = true;
  const active = station;
  try {
    const data = await api('wave', active);
    if (station !== active) return;
    station = data.station;
    queue.push(...data.tracks.map(cleanTrack));
    $('wave-status').textContent = `${queue.length} треков в потоке · ${station.original}`;
  } finally {
    waveBusy = false;
  }
}
async function startWave() {
  const query = $('wave-query').value.trim();
  if (!query) return;
  const b = $('wave-submit');
  b.disabled = true;
  $('wave-error').hidden = true;
  try {
    const data = await api('wave', { query, mode: $('wave-mode').value });
    station = data.station;
    queue = data.tracks.map(cleanTrack);
    queueIndex = 0;
    if (!queue.length) throw Error('Не удалось подобрать похожие треки');
    $('wave-dialog').close();
    $('wave-status').textContent = `${queue.length} треков в потоке · ${station.original}`;
    $('wave-banner').hidden = false;
    await playTrack(queue[0], { keepStation: true });
    toast('Моя волна запущена');
  } catch (e) {
    $('wave-error').textContent = e.message;
    $('wave-error').hidden = false;
  } finally {
    b.disabled = false;
  }
}
async function refreshRandom() {
  const b = $('random-refresh');
  b.disabled = true;
  $('random-status').textContent = 'Подбираем новый звук…';
  try {
    const data = await api('random', { exclude: randomTracks.map((t) => t.id) });
    randomTracks = data.tracks.map(cleanTrack);
    $('random-list').replaceChildren(...randomTracks.map((t) => row(t, randomTracks)));
    $('random-status').textContent = randomTracks.length
      ? ''
      : 'Подходящих треков пока нет — попробуй обновить.';
  } catch (e) {
    $('random-status').textContent = e.message;
  } finally {
    b.disabled = false;
  }
}
function openAdd() {
  if (!$('add-dialog').open) $('add-dialog').showModal();
  $('add-error').hidden = true;
  $('track-url').focus();
}
for (const id of ['hero-add', 'collection-add', 'empty-add']) $(id).onclick = openAdd;
$('add-form').onsubmit = async (e) => {
  e.preventDefault();
  $('add-submit').disabled = true;
  $('add-error').hidden = true;
  try {
    const url = soundcloudUrl($('track-url').value);
    station = null;
    $('wave-banner').hidden = true;
    const track = cleanTrack({ url });
    queue = [track];
    queueIndex = 0;
    $('add-dialog').close();
    $('track-url').value = '';
    playTrack(track);
    const token = generation;
    metadata(url)
      .then((info) => {
        if (token !== generation) return;
        current = mergeTrack(state.tracks, info);
        save();
        paintPlayer();
        render();
      })
      .catch(() => {});
    return;
  } catch (error) {
    $('add-error').textContent = error.message;
    $('add-error').hidden = false;
  } finally {
    $('add-submit').disabled = false;
  }
};
$('example').onclick = () => {
  const track = cleanTrack({
    url: 'https://soundcloud.com/forss/flickermood',
    title: 'Flickermood',
    artist: 'Forss',
  });
  station = null;
  queue = [track];
  queueIndex = 0;
  playTrack(track);
};
$('player-like').onclick = () => current && toggleLike(current);
$('quick-favorites').onclick = () => navigate('favorites');
$('settings').onclick = () => $('settings-dialog').showModal();
$('more').onclick = () => {
  shown += 60;
  render();
};
$('filter').oninput = () => {
  shown = 60;
  render();
};
document.querySelector('.brand').onclick = (e) => {
  e.preventDefault();
  navigate('home');
};
document
  .querySelectorAll('[data-view]')
  .forEach((b) => (b.onclick = () => navigate(b.dataset.view)));
document
  .querySelectorAll('[data-close]')
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
$('expand-player').onclick = () => $('player').classList.toggle('expanded');
$('collapse-player').onclick = () => $('player').classList.toggle('expanded');
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') $('player').classList.remove('expanded');
});
$('remove-track').onclick = () => {
  if (!current) return;
  const track = current;
  if (!confirm('Убрать «' + track.title + '» из списка, избранного и истории SoundSync?')) return;
  state.tracks = state.tracks.filter((t) => t.url !== track.url);
  state.currentUrl = '';
  generation++;
  player.stop();
  station = null;
  current = null;
  queue = [];
  queueIndex = -1;
  $('player').hidden = true;
  $('player').classList.remove('expanded');
  document.body.classList.remove('has-player');
  save();
  render();
};
$('export-favorites').onclick = () => {
  const blob = new Blob(
      [JSON.stringify({ version: 1, tracks: state.tracks.filter((t) => t.liked) }, null, 2)],
      { type: 'application/json' }
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = 'SoundSync-favorites.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};
$('import-favorites').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024) throw Error('Файл слишком большой');
    const raw = JSON.parse(await file.text());
    if (!Array.isArray(raw.tracks)) throw Error('Это не файл избранного SoundSync');
    const imported = readState(JSON.stringify(raw));
    if (!imported.tracks.length) throw Error('В файле нет подходящих треков SoundCloud');
    for (const t of imported.tracks) mergeTrack(state.tracks, { ...t, liked: true });
    save();
    render();
    paintPlayer();
    toast('Избранное восстановлено: ' + imported.tracks.length);
  } catch (e) {
    toast(e.message);
  } finally {
    e.target.value = '';
  }
};
function connectivity() {
  $('network').classList.toggle('offline', !navigator.onLine);
  $('network').lastChild.textContent = navigator.onLine ? 'Онлайн' : 'Офлайн';
}
addEventListener('online', connectivity);
addEventListener('offline', connectivity);
connectivity();
let waitingWorker = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .then(async (registration) => {
      await navigator.serviceWorker.ready;
      $('offline-state').textContent =
        'Оболочка готова к офлайн-открытию. Для музыки нужен интернет.';
      const offer = () => {
        waitingWorker = registration.waiting;
        if (waitingWorker)
          toast('Доступна новая версия SoundSync', {
            label: 'Обновить',
            run: () => {
              waitingWorker.postMessage('SKIP_WAITING');
            },
          });
      };
      offer();
      registration.addEventListener('updatefound', () =>
        registration.installing?.addEventListener('statechange', offer)
      );
    })
    .catch(() => {
      $('offline-state').textContent =
        'Не удалось подготовить офлайн-оболочку. Открой приложение по HTTPS.';
    });
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (waitingWorker && !reloading) {
      reloading = true;
      location.reload();
    }
  });
} else $('offline-state').textContent = 'Этот браузер не поддерживает офлайн-оболочку.';
// Discovery stays inside SoundSync; only metadata is requested from our backend.
const discovery = element('section', 'discovery');
discovery.id = 'discovery';
discovery.innerHTML =
  '<div class="section-heading"><div><span class="eyebrow">ВЕСЬ SOUNDCLOUD РЯДОМ</span><h2>Найди свой звук</h2></div></div><form id="sc-search-form" class="search-form"><label class="search"><svg><use href="#i-search"/></svg><input id="sc-query" type="search" placeholder="Трек или исполнитель в SoundCloud" aria-label="Поиск в SoundCloud" required maxlength="200"></label><button class="primary" id="sc-search-submit">Найти</button></form><p id="search-status" class="discovery-status" role="status"></p><div id="search-results" class="track-list"></div><div class="section-heading random-heading"><h2>Случайные треки</h2><button class="text-button" id="random-refresh">Обновить ↻</button></div><p id="random-status" class="discovery-status" role="status">Нажми «Обновить», чтобы открыть новый звук.</p><div id="random-list" class="track-list"></div>';
$('quick-actions').after(discovery);
const previousRender = render;
render = function () {
  previousRender();
  discovery.hidden = view !== 'home';
  if (searchResults.length)
    $('search-results').replaceChildren(...searchResults.map((t) => row(t, searchResults)));
  if (randomTracks.length)
    $('random-list').replaceChildren(...randomTracks.map((t) => row(t, randomTracks)));
};
$('sc-search-form').onsubmit = async (e) => {
  e.preventDefault();
  const query = $('sc-query').value.trim();
  if (!query) return;
  const b = $('sc-search-submit');
  b.disabled = true;
  $('search-status').textContent = 'Ищем в SoundCloud…';
  try {
    const data = await api('search', { query });
    searchResults = data.tracks.map(cleanTrack);
    $('search-results').replaceChildren(...searchResults.map((t) => row(t, searchResults)));
    $('search-status').textContent = searchResults.length
      ? `Найдено ${searchResults.length} треков`
      : 'Ничего не найдено. Попробуй другой запрос.';
  } catch (e) {
    $('search-status').textContent = e.message;
  } finally {
    b.disabled = false;
  }
};
$('random-refresh').onclick = refreshRandom;
const waveButton = $('quick-actions').lastElementChild,
  wave = element('button');
wave.innerHTML =
  '<span class="quick-icon orange"><svg><use href="#i-cloud"/></svg></span><span><strong>Моя волна</strong><small>По артисту, жанру или настроению</small></span><svg class="quick-arrow"><use href="#i-arrow"/></svg>';
waveButton.replaceWith(wave);
wave.onclick = () => $('wave-dialog').showModal();
const dialog = element('dialog', 'sheet');
dialog.id = 'wave-dialog';
dialog.innerHTML =
  '<form id="wave-form"><div class="sheet-heading"><div><span class="eyebrow">ТВОЙ СЛЕДУЮЩИЙ ВАЙБ</span><h2>Моя волна</h2></div><button type="button" class="icon-button" id="close-wave" aria-label="Закрыть"><svg><use href="#i-close"/></svg></button></div><label class="field-label" for="wave-mode">От чего оттолкнуться</label><select id="wave-mode"><option value="artist">Артист</option><option value="genre">Жанр</option><option value="mood">Настроение</option></select><label class="field-label" for="wave-query">Что хочется услышать?</label><input id="wave-query" required maxlength="200" placeholder="Например, phonk или спокойное"><p class="field-help">Подбираем связанные треки, чередуем артистов и исключаем повторы внутри потока.</p><p id="wave-error" class="form-error" hidden role="alert"></p><button id="wave-submit" class="primary full">Запустить волну</button></form>';
document.body.append(dialog);
$('close-wave').onclick = () => dialog.close();
$('wave-form').onsubmit = (e) => {
  e.preventDefault();
  startWave();
};
const banner = element('div', 'wave-banner');
banner.id = 'wave-banner';
banner.hidden = true;
banner.innerHTML =
  '<span id="wave-status"></span><button id="wave-next" class="text-button">Следующий →</button><button id="wave-stop" class="text-button">Остановить волну</button>';
$('collection-title').closest('section').before(banner);
$('wave-next').onclick = () => advance().catch((e) => toast(e.message));
$('wave-stop').onclick = () => {
  station = null;
  queue = [];
  queueIndex = -1;
  banner.hidden = true;
  toast('Волна остановлена. Текущий трек продолжает играть.');
};
$('hero-add').replaceChildren(icon('play'), document.createTextNode('Запустить волну'));
$('hero-add').onclick = () => dialog.showModal();
render();
if (navigator.onLine) refreshRandom();

// Portable collections and personal playlists share the existing local store.
let openPlaylist = null;
const listsSection = element('section', 'mobile-playlists');
listsSection.id = 'mobile-playlists';
listsSection.hidden = true;
$('collection-title').closest('section').before(listsSection);
const playlistNav = element('button');
playlistNav.dataset.view = 'playlists';
playlistNav.append(icon('clock'), element('span', '', 'Плейлисты'));
document.querySelector('.bottom-nav').append(playlistNav);
playlistNav.onclick = () => {
  openPlaylist = null;
  navigate('playlists');
};
function allPlaylists() {
  return [
    ...curated.map((p) => ({ ...p, builtin: true, tracks: p.tracks.map(cleanTrack) })),
    {
      id: 'builtin:frequent',
      name: 'Часто слушаю',
      builtin: true,
      tracks: state.tracks
        .filter((t) => t.playCount > 0)
        .sort((a, b) => b.playCount - a.playCount || b.lastPlayed - a.lastPlayed)
        .slice(0, 100),
    },
    ...state.playlists.map((p) => ({
      ...p,
      tracks: p.urls.map((u) => state.tracks.find((t) => t.url === u)).filter(Boolean),
    })),
  ];
}
function commit(next) {
  const old = state;
  state = next;
  if (!save()) {
    state = old;
    throw Error('Не удалось сохранить. Освободи место в браузере.');
  }
  if (current) current = state.tracks.find((t) => t.url === current.url) || current;
  render();
  paintPlayer();
}
function createList(name) {
  name = String(name || '').trim();
  if (!name || name.length > 100) throw Error('Название должно содержать от 1 до 100 символов.');
  if (state.playlists.length >= 200) throw Error('Поддерживается до 200 плейлистов.');
  const p = { id: crypto.randomUUID(), name, urls: [] };
  return p;
}
const modal = (title) => {
  const d = element('dialog', 'sheet collection-sheet'),
    head = element('div', 'sheet-heading'),
    h = element('h2', '', title),
    close = element('button', 'icon-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть');
  close.onclick = () => d.close();
  head.append(h, close);
  d.append(head);
  document.body.append(d);
  return d;
};
const nameSheet = modal('Новый плейлист'),
  nameForm = element('form'),
  nameInput = element('input'),
  nameError = element('p', 'form-error'),
  nameSubmit = element('button', 'primary full', 'Сохранить');
nameInput.required = true;
nameInput.maxLength = 100;
nameInput.placeholder = 'Название плейлиста';
nameInput.setAttribute('aria-label', 'Название плейлиста');
nameForm.append(nameInput, nameError, nameSubmit);
nameSheet.append(nameForm);
let nameDone;
function askName(title, value, done) {
  nameSheet.querySelector('h2').textContent = title;
  nameInput.value = value;
  nameError.textContent = '';
  nameDone = done;
  nameSheet.showModal();
  nameInput.focus();
}
nameForm.onsubmit = (e) => {
  e.preventDefault();
  try {
    nameDone(nameInput.value);
    nameSheet.close();
  } catch (e) {
    nameError.textContent = e.message;
  }
};
const picker = modal('Добавить в плейлист'),
  pickerBody = element('div', 'playlist-picker');
picker.append(pickerBody);
function addToList(t) {
  pickerBody.replaceChildren();
  const add = (id) => {
    const next = readState(JSON.stringify(state)),
      track = mergeTrack(next.tracks, t),
      p = next.playlists.find((p) => p.id === id);
    if (!p.urls.includes(track.url)) p.urls.push(track.url);
    commit(next);
    picker.close();
    toast('Трек добавлен в «' + p.name + '»');
  };
  for (const p of state.playlists) {
    const b = element('button', 'secondary full', p.name);
    b.onclick = () => {
      try {
        add(p.id);
      } catch (e) {
        toast(e.message);
      }
    };
    pickerBody.append(b);
  }
  const fresh = element('button', 'primary full', '+ Создать и добавить');
  fresh.onclick = () => {
    picker.close();
    askName('Новый плейлист', '', (name) => {
      const next = readState(JSON.stringify(state)),
        p = createList(name),
        track = mergeTrack(next.tracks, t);
      p.urls.push(track.url);
      next.playlists.push(p);
      commit(next);
      toast('Плейлист создан');
    });
  };
  pickerBody.append(fresh);
  picker.showModal();
}
const menuSheet = modal('Действия с треком'),
  menuBody = element('div', 'playlist-picker');
menuSheet.append(menuBody);
function trackOptions(t) {
  menuBody.replaceChildren();
  menuSheet.querySelector('h2').textContent = t.title;
  const add = element('button', 'secondary full', 'Добавить в плейлист');
  add.onclick = () => {
    menuSheet.close();
    addToList(t);
  };
  menuBody.append(add);
  const p = state.playlists.find((p) => p.id === openPlaylist);
  if (view === 'playlists' && p) {
    const remove = element('button', 'secondary full', 'Убрать из плейлиста');
    remove.onclick = () => {
      const next = readState(JSON.stringify(state));
      next.playlists.find((x) => x.id === p.id).urls = p.urls.filter((u) => u !== t.url);
      commit(next);
      menuSheet.close();
    };
    menuBody.append(remove);
  }
  menuSheet.showModal();
}
const collectionRow = row;
row = function (t, list) {
  const r = collectionRow(t, list),
    more = element('button', 'icon-button track-more', '⋯');
  more.setAttribute('aria-label', 'Действия с треком ' + t.title);
  more.onclick = () => trackOptions(t);
  r.append(more);
  return r;
};
function drawPlaylists() {
  listsSection.replaceChildren();
  const head = element('div', 'section-heading'),
    title = element('h2', '', 'Плейлисты'),
    create = element('button', 'text-button', '+ Создать');
  create.onclick = () =>
    askName('Новый плейлист', '', (name) => {
      const next = readState(JSON.stringify(state)),
        p = createList(name);
      next.playlists.push(p);
      openPlaylist = p.id;
      commit(next);
    });
  head.append(title, create);
  listsSection.append(head);
  const data = allPlaylists();
  if (!openPlaylist) {
    const grid = element('div', 'mobile-playlist-grid');
    for (const p of data) {
      const card = element('button', 'mobile-playlist-card');
      if (p.cover) {
        const img = element('img');
        img.src = p.cover;
        img.alt = p.name;
        card.append(img);
      } else {
        const art = element('div', 'mobile-playlist-art', p.id === 'builtin:frequent' ? '↻' : '♫');
        card.append(art);
      }
      card.append(element('strong', '', p.name), element('small', '', p.tracks.length + ' треков'));
      card.onclick = () => {
        openPlaylist = p.id;
        render();
      };
      grid.append(card);
    }
    listsSection.append(grid);
    const remote = element('button', 'secondary full', 'Импорт из SoundCloud');
    remote.onclick = () => openRemote('playlist');
    listsSection.append(remote);
    return;
  }
  const p = data.find((p) => p.id === openPlaylist);
  if (!p) {
    openPlaylist = null;
    drawPlaylists();
    return;
  }
  title.textContent = p.name;
  create.textContent = '← Все';
  create.onclick = () => {
    openPlaylist = null;
    render();
  };
  if (p.cover) {
    const img = element('img', 'author-playlist-cover');
    img.src = p.cover;
    img.alt = p.name;
    listsSection.append(img);
  }
  const tools = element('div', 'collection-tools'),
    play = element('button', 'primary', 'Слушать'),
    shuffle = element('button', 'secondary', 'Перемешать');
  const start = (list) => {
    if (!list.length) return;
    station = null;
    $('wave-banner').hidden = true;
    queue = list;
    queueIndex = 0;
    playTrack(list[0]);
  };
  play.disabled = shuffle.disabled = !p.tracks.length;
  play.onclick = () => start([...p.tracks]);
  shuffle.onclick = () => {
    const list = [...p.tracks];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    start(list);
  };
  tools.append(play, shuffle);
  if (!p.builtin) {
    const rename = element('button', 'text-button', 'Переименовать'),
      remove = element('button', 'text-button', 'Удалить');
    rename.onclick = () =>
      askName('Название плейлиста', p.name, (name) => {
        const next = readState(JSON.stringify(state));
        const value = String(name).trim();
        if (!value || value.length > 100)
          throw Error('Название должно содержать от 1 до 100 символов.');
        next.playlists.find((x) => x.id === p.id).name = value;
        commit(next);
      });
    remove.onclick = () => {
      if (!confirm('Удалить плейлист «' + p.name + '»? Треки и любимое сохранятся.')) return;
      const next = readState(JSON.stringify(state));
      next.playlists = next.playlists.filter((x) => x.id !== p.id);
      openPlaylist = null;
      commit(next);
    };
    const share = element('button', 'text-button', 'Экспорт');
    share.onclick = () =>
      downloadBackup(
        {
          type: 'soundsync-backup',
          version: 2,
          tracks: p.tracks,
          playlists: [{ id: p.id, name: p.name, urls: p.tracks.map((t) => t.url) }],
        },
        'SoundSync-playlist.json'
      );
    tools.append(rename, share, remove);
  }
  listsSection.append(tools);
  if (!p.tracks.length)
    listsSection.append(
      element(
        'p',
        'field-help',
        p.builtin
          ? 'Здесь появятся часто запускаемые треки.'
          : 'Добавь треки через ⋯ → «Добавить в плейлист».'
      )
    );
  const rows = element('div', 'track-list');
  rows.append(...p.tracks.map((t) => row(t, p.tracks)));
  listsSection.append(rows);
}
const baseCollectionRender = render;
render = function () {
  baseCollectionRender();
  const visible = view === 'playlists';
  listsSection.hidden = !visible;
  $('collection-title').closest('section').hidden = visible;
  if (visible) drawPlaylists();
};
const remoteSheet = modal('Импорт из SoundCloud'),
  remoteForm = element('form'),
  remoteKind = element('select'),
  remoteUrl = element('input'),
  remoteStatus = element('p', 'field-help'),
  remotePreview = element('div', 'import-preview'),
  remoteLoad = element('button', 'secondary full', 'Загрузить список'),
  remoteApply = element('button', 'primary full', 'Добавить');
for (const [k, label] of [
  ['likes', 'Лайки профиля → Любимое'],
  ['playlist', 'Готовый плейлист'],
]) {
  const o = element('option', '', label);
  o.value = k;
  remoteKind.append(o);
}
remoteKind.setAttribute('aria-label', 'Что импортировать');
remoteUrl.type = 'url';
remoteUrl.required = true;
remoteUrl.placeholder = 'https://soundcloud.com/…';
remoteUrl.setAttribute('aria-label', 'Публичная ссылка SoundCloud');
remoteApply.type = 'button';
remoteApply.hidden = true;
remoteForm.append(remoteKind, remoteUrl, remoteLoad, remoteStatus, remotePreview, remoteApply);
remoteSheet.append(remoteForm);
let remoteResult = null,
  remoteGeneration = 0;
function openRemote(kind = 'likes') {
  remoteKind.value = kind;
  remoteResult = null;
  remoteApply.hidden = true;
  remoteStatus.textContent =
    'Публичные лайки и плейлисты. Подойдут и короткие ссылки on.soundcloud.com. Музыка не скачивается.';
  remotePreview.replaceChildren();
  remoteSheet.showModal();
}
function resetRemote() {
  remoteGeneration++;
  remoteResult = null;
  remoteApply.hidden = true;
}
remoteUrl.oninput = remoteKind.onchange = resetRemote;
remoteSheet.addEventListener('close', resetRemote);
remoteForm.onsubmit = async (e) => {
  e.preventDefault();
  resetRemote();
  const generation = remoteGeneration;
  remoteLoad.disabled = true;
  remoteStatus.textContent = 'Загружаем список…';
  remotePreview.replaceChildren();
  try {
    const result = await api('import', { kind: remoteKind.value, url: remoteUrl.value });
    if (generation !== remoteGeneration) return;
    result.tracks = result.tracks.map(cleanTrack);
    remoteResult = result;
    const count = result.tracks.length,
      existing = result.tracks.filter((t) =>
        state.tracks.some((x) => x.url === t.url && x.liked)
      ).length;
    remoteStatus.textContent =
      result.kind === 'likes'
        ? `${result.name}: ${count} доступных, уже в любимом ${existing}. Недоступных пропущено: ${result.unavailable || 0}.`
        : `${result.name}: ${count} треков. Недоступных пропущено: ${result.unavailable || 0}.`;
    for (const t of result.tracks.slice(0, 5))
      remotePreview.append(element('p', '', t.title + ' — ' + t.artist));
    remoteApply.textContent = result.kind === 'likes' ? 'Добавить в любимое' : 'Создать плейлист';
    remoteApply.hidden = !count;
  } catch (e) {
    if (generation === remoteGeneration) remoteStatus.textContent = e.message;
  } finally {
    remoteLoad.disabled = false;
  }
};
remoteApply.onclick = () => {
  if (!remoteResult) return;
  try {
    const next = readState(JSON.stringify(state)),
      r = remoteResult,
      urls = [];
    for (const t of r.tracks) {
      const saved = mergeTrack(next.tracks, { ...t, liked: r.kind === 'likes' });
      urls.push(saved.url);
    }
    if (r.kind === 'playlist') {
      const p = createList(r.name);
      p.urls = [...new Set(urls)];
      next.playlists.push(p);
      openPlaylist = p.id;
    }
    commit(next);
    remoteSheet.close();
    if (r.kind === 'playlist') navigate('playlists');
    toast('Импорт завершён');
  } catch (e) {
    remoteStatus.textContent = e.message;
  }
};
const transferTools = element('div', 'collection-tools'),
  importButton = element('button', 'secondary', 'Импорт'),
  exportButton = element('button', 'secondary', 'Экспорт');
transferTools.append(importButton, exportButton);
$('collection-title').closest('.section-heading').after(transferTools);
importButton.onclick = () => openRemote('likes');
async function downloadBackup(
  payload = exportBackup(state),
  filename = 'SoundSync-collections.json'
) {
  try {
    const file = new File([JSON.stringify(payload, null, 2)], filename, {
      type: 'application/json',
    });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Коллекция SoundSync' });
      return;
    }
    const u = URL.createObjectURL(file),
      a = element('a');
    a.href = u;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message);
  }
}
exportButton.onclick = () => downloadBackup();
$('export-favorites').textContent = 'Экспорт любимого и плейлистов';
$('export-favorites').onclick = () => downloadBackup();
$('import-favorites').closest('label').firstChild.textContent = 'Импорт из файла';
$('import-favorites').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 10 * 1024 * 1024) throw Error('Файл слишком большой (максимум 10 МБ).');
    const next = importBackup(state, JSON.parse(await file.text()));
    if (
      !confirm(
        `Объединить коллекцию из файла? Будет ${next.tracks.filter((t) => t.liked).length} любимых треков и ${next.playlists.length} своих плейлистов. Текущие данные сохранятся.`
      )
    )
      return;
    commit(next);
    toast('Коллекция восстановлена');
  } catch (e) {
    toast(e.message);
  } finally {
    e.target.value = '';
  }
};
const fileImportButton = element('button', 'secondary full', 'Импорт из файла SoundSync');
fileImportButton.onclick = () => {
  remoteSheet.close();
  $('import-favorites').click();
};
remoteSheet.append(fileImportButton);
const remoteSettings = element('button', 'secondary full', 'Импорт из SoundCloud');
remoteSettings.onclick = () => {
  $('settings-dialog').close();
  openRemote('likes');
};
$('export-favorites').before(remoteSettings);
// Close sheets only when the gesture starts and ends outside their bounds.
let outsideDialog = null;
const isOutside = (e, d) => {
  const r = d.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};
document.addEventListener(
  'pointerdown',
  (e) => {
    outsideDialog =
      e.button === 0 && e.target instanceof HTMLDialogElement && isOutside(e, e.target)
        ? e.target
        : null;
  },
  true
);
document.addEventListener(
  'click',
  (e) => {
    const d = outsideDialog;
    outsideDialog = null;
    if (d && e.target === d && isOutside(e, d)) {
      e.preventDefault();
      if (d.dispatchEvent(new Event('cancel', { cancelable: true }))) d.close();
    }
  },
  true
);
render();

installFeedback(toast);
