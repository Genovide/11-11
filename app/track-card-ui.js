(() => {
  const dialog = node('dialog', 'track-card-dialog');
  dialog.id = 'track-card-dialog';
  dialog.setAttribute('aria-labelledby', 'track-card-heading');
  const head = node('div', 'track-card-head'),
    title = node('h2', '', 'Карточка трека'),
    close = node('button', 'card-close', '×');
  title.id = 'track-card-heading';
  close.type = 'button';
  close.setAttribute('aria-label', 'Закрыть карточку');
  head.append(title, close);
  const subtitle = node('p', 'card-subtitle', 'Твоя версия названия, альбома и обложки.'),
    body = node('div', 'track-card-body'),
    artColumn = node('div', 'card-art-column'),
    preview = node('div', 'card-art-preview'),
    choose = node('button', 'outline', 'Выбрать обложку'),
    coverNote = node('small', '', 'PNG, JPG или WebP · до 16 МБ');
  choose.type = 'button';
  artColumn.append(preview, choose, coverNote);
  const form = node('form', 'card-fields'),
    fields = {};
  for (const [key, label] of [
    ['title', 'Название'],
    ['artist', 'Исполнитель'],
    ['album', 'Альбом'],
    ['albumartist', 'Исполнитель альбома'],
    ['year', 'Год выпуска'],
  ]) {
    const wrap = node('label', 'card-field', label),
      input = node('input', 'editor-input');
    input.name = key;
    input.id = 'card-' + key;
    input.maxLength = 500;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', label);
    if (key === 'title' || key === 'artist') input.required = true;
    if (key === 'year') {
      input.inputMode = 'numeric';
      input.maxLength = 4;
      input.pattern = '[0-9]{4}';
    }
    fields[key] = input;
    wrap.append(input);
    form.append(wrap);
  }
  body.append(artColumn, form);
  const lookup = node('button', 'outline card-lookup', 'Найти данные в LRCLIB'),
    candidates = node('div', 'card-candidates');
  lookup.type = 'button';
  const note = node(
      'p',
      'card-note',
      'Правки сохраняются в SoundSync. Аудиофайл останется без изменений.'
    ),
    status = node('p', 'card-status');
  status.setAttribute('role', 'status');
  const actions = node('div', 'card-actions'),
    reset = node('button', 'quiet', 'Вернуть исходную карточку'),
    cancel = node('button', 'outline', 'Отмена'),
    save = node('button', 'primary', 'Сохранить');
  for (const b of [reset, cancel, save]) b.type = 'button';
  actions.append(reset, cancel, save);
  dialog.append(head, subtitle, body, lookup, candidates, note, status, actions);
  document.body.append(dialog);
  let target = null,
    coverToken = null,
    saving = false,
    request = 0,
    edited = false;
  function drawCover(track) {
    preview.replaceChildren(art(track, 'card-cover-image'));
  }
  function busy(value) {
    saving = value;
    for (const b of [save, reset, choose, cancel, close, lookup]) b.disabled = value;
    reset.disabled = value || !edited;
  }
  async function open(t) {
    const ticket = ++request;
    target = t;
    coverToken = null;
    candidates.replaceChildren();
    status.textContent = '';
    edited = !!t.trackCardEdited;
    for (const key of Object.keys(fields)) fields[key].value = t[key] ?? '';
    drawCover(t);
    subtitle.textContent = t.remote
      ? 'Трек SoundCloud · твои правки сохраняются по ID записи.'
      : 'Трек из библиотеки · правки сохранятся после пересканирования.';
    busy(false);
    dialog.showModal();
    fields.title.focus();
    try {
      const result = await window.lumen.trackCardGet(t.id);
      if (ticket !== request || !dialog.open) return;
      target = result.track;
      edited = result.edited;
      for (const key of Object.keys(fields)) fields[key].value = target[key] ?? '';
      drawCover(target);
      busy(false);
    } catch (e) {
      if (ticket === request) status.textContent = cleanError(e);
    }
  }
  function apply(updated) {
    const t = updated.track;
    const lists = [
      library.tracks,
      queue,
      upNext,
      manualReturn,
      scTracks,
      [...remoteFavoriteTracks.values()],
    ];
    for (const list of lists)
      for (const item of list) if (item?.id === t.id) Object.assign(item, t);
    if (current?.id === t.id) {
      Object.assign(current, t);
      $('now-title').textContent = $('mini-title').textContent = t.title;
      $('now-artist').textContent = $('mini-artist').textContent = t.artist;
      $('now-cover').replaceChildren(art(current, ''));
      $('mini-cover').replaceChildren(art(current, ''));
      setPalette(current);
      updateImmersive();
      if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
        navigator.mediaSession.metadata.title = t.title;
        navigator.mediaSession.metadata.artist = t.artist;
        navigator.mediaSession.metadata.album = t.album;
      }
    }
    lyricsCandidates.delete(t.id);
    autoLyricsAttempted.delete(t.id);
    metadataAttempted.delete(t.id);
    cacheRemoteFavorites();
    window.dispatchEvent(new CustomEvent('track-card-changed', { detail: t }));
    render();
    renderOnline();
    renderQueue();
  }
  async function persist(resetCard = false) {
    if (saving || !target) return;
    if (!resetCard && !form.reportValidity()) return;
    busy(true);
    status.textContent = 'Сохраняем карточку…';
    try {
      const patch = resetCard
        ? { reset: true }
        : {
            ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.value])),
            ...(coverToken ? { coverToken } : {}),
          };
      const updated = await window.lumen.trackCardSave(target.id, patch);
      apply(updated);
      dialog.close();
      toast(resetCard ? 'Исходная карточка восстановлена' : 'Карточка трека сохранена');
    } catch (e) {
      status.textContent = cleanError(e);
    } finally {
      busy(false);
    }
  }
  choose.onclick = async () => {
    if (saving) return;
    choose.disabled = true;
    const ticket = request;
    try {
      const value = await window.lumen.trackCardCover();
      if (!value || ticket !== request || !dialog.open) return;
      coverToken = value.token;
      const image = node('img', 'card-cover-image');
      image.src = value.preview;
      image.alt = 'Новая обложка';
      preview.replaceChildren(image);
      status.textContent = 'Новая обложка применится после сохранения.';
    } catch (e) {
      status.textContent = cleanError(e);
    } finally {
      choose.disabled = false;
    }
  };
  lookup.onclick = async () => {
    if (!target || saving) return;
    if (!fields.title.value.trim() || !fields.artist.value.trim()) {
      status.textContent = 'Укажи название и исполнителя для поиска.';
      return;
    }
    const ticket = request;
    lookup.disabled = true;
    status.textContent = 'Ищем варианты в LRCLIB…';
    candidates.replaceChildren();
    try {
      const found = await window.lumen.lyricsSearch(
        {
          ...target,
          title: fields.title.value.trim(),
          artist: fields.artist.value.trim(),
          album: '',
          metadataManual: true,
        },
        ''
      );
      if (ticket !== request || !dialog.open) return;
      for (const item of found.slice(0, 8)) {
        const pick = node('button', 'card-candidate');
        pick.type = 'button';
        pick.append(
          node('strong', '', item.artist + ' — ' + item.title),
          node('small', '', (item.album || 'Без альбома') + ' · ' + fmt(item.duration))
        );
        pick.onclick = () => {
          fields.title.value = item.title || '';
          fields.artist.value = item.artist || '';
          fields.album.value = item.album || '';
          fields.albumartist.value = item.artist || '';
          candidates.replaceChildren();
          status.textContent = 'Вариант подставлен. Проверь данные и нажми «Сохранить».';
        };
        candidates.append(pick);
      }
      status.textContent = found.length
        ? 'Выбери подходящее издание — данные пока не сохранены.'
        : 'Совпадений нет. Можно исправить поля вручную.';
    } catch (e) {
      if (ticket === request) status.textContent = cleanError(e);
    } finally {
      lookup.disabled = false;
    }
  };
  const dismiss = () => {
    if (!saving) dialog.close();
  };
  close.onclick = cancel.onclick = dismiss;
  reset.onclick = () => persist(true);
  save.onclick = () => persist();
  form.onsubmit = (e) => {
    e.preventDefault();
    persist();
  };
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('cancel', (e) => {
    if (saving) e.preventDefault();
  });
  dialog.addEventListener('close', () => {
    request++;
    coverToken = null;
  });
  const previous = openTrackMenu;
  openTrackMenu = function (t, anchor) {
    previous(t, anchor);
    const edit = node('button', '', 'Редактировать карточку');
    edit.setAttribute('role', 'menuitem');
    edit.onclick = () => {
      closeTrackMenu();
      open(t);
    };
    trackMenu.prepend(edit);
    const top = parseFloat(trackMenu.style.top) || 12;
    if (top + trackMenu.offsetHeight > innerHeight - 12)
      trackMenu.style.top = Math.max(12, innerHeight - trackMenu.offsetHeight - 12) + 'px';
  };
  const currentEdit = node('button', 'card-edit-current', 'Редактировать карточку');
  currentEdit.id = 'edit-current-card';
  currentEdit.title = 'Редактировать карточку текущего трека';
  currentEdit.onclick = () => current && open(current);
  document.querySelector('.now-details').append(currentEdit);
  const sync = () => {
    currentEdit.disabled = !current;
  };
  audio.addEventListener('loadedmetadata', sync);
  audio.addEventListener('play', sync);
  sync();
})();
