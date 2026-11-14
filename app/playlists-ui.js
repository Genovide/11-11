(() => {
  const nav = node('button', 'nav playlists-nav');
  nav.type = 'button';
  nav.dataset.view = 'playlists';
  nav.append(node('span', '', '☷'), node('span', '', 'Плейлисты'));
  document.querySelector('nav [data-view="favorites"]').after(nav);
  const section = node('section', 'playlists-section hidden');
  section.id = 'playlists-section';
  document.querySelector('.collection').before(section);
  let lists = [],
    opened = null,
    loading = false,
    error = '',
    request = 0;
  const control = (label, cls, action) => {
    const b = node('button', cls, label);
    b.type = 'button';
    b.onclick = action;
    return b;
  };
  async function refresh(id = opened?.id) {
    const token = ++request;
    loading = true;
    error = '';
    draw();
    try {
      const all = await window.lumen.playlistsList(),
        list = id ? await window.lumen.playlistGet(id) : null;
      if (token !== request) return;
      lists = all;
      opened = list;
    } catch (e) {
      if (token === request) error = cleanError(e);
    } finally {
      if (token === request) {
        loading = false;
        draw();
      }
    }
  }
  function openList(id) {
    opened = { id, name: 'Загружаем…', tracks: [] };
    refresh(id);
  }
  nav.onclick = () => {
    view = 'playlists';
    selectedArtist = null;
    albumFilter = null;
    shown = 100;
    $('search').value = '';
    exitImmersive();
    opened = null;
    render();
    refresh(null);
    document.querySelector('main').scrollTop = 0;
  };
  function playable(list) {
    return list.filter((t) => !t.missing && !t.playbackUnavailable);
  }
  function draw() {
    if (view !== 'playlists') return;
    const main = document.querySelector('main'),
      top = main.scrollTop;
    section.replaceChildren();
    const heading = node('div', 'playlist-heading'),
      title = node('div');
    title.append(
      node('span', 'playlist-eyebrow', opened ? 'ТВОЯ МУЗЫКА В ОДНОМ МЕСТЕ' : 'СОБРАНО ТОБОЙ'),
      node('h1', '', opened?.name || 'Плейлисты')
    );
    heading.append(title);
    const actions = node('div', 'playlist-actions');
    if (opened) {
      actions.append(
        control('Все плейлисты', 'outline', () => {
          opened = null;
          refresh(null);
        })
      );
      if (!opened.builtin && opened.id !== 'builtin:frequent') {
        actions.append(
          control('Переименовать', 'outline', () =>
            nameDialog('Переименовать плейлист', opened.name, async (value) => {
              await window.lumen.playlistRename(opened.id, value);
              await refresh();
            })
          )
        );
        actions.append(
          control('Удалить плейлист', 'quiet', async () => {
            if (
              !confirm('Удалить плейлист «' + opened.name + '»? Сами треки и любимое сохранятся.')
            )
              return;
            try {
              await window.lumen.playlistDelete(opened.id);
              opened = null;
              await refresh(null);
            } catch (e) {
              toast(cleanError(e));
            }
          })
        );
      }
    } else
      actions.append(
        control('Импорт из SoundCloud', 'outline', openImport),
        control('+ Создать плейлист', 'primary', () =>
          nameDialog('Новый плейлист', '', async (value) => {
            const p = await window.lumen.playlistCreate(value);
            await refresh(p.id);
          })
        )
      );
    heading.append(actions);
    section.append(heading);
    if (error) {
      section.append(
        node('p', 'feedback-error', error),
        control('Повторить', 'outline', () => refresh())
      );
      return;
    }
    if (loading) {
      section.append(node('p', 'playlist-note', 'Загружаем плейлисты…'));
      return;
    }
    if (!opened) {
      section.append(
        node(
          'p',
          'playlist-note',
          'Собирай свою музыку, переноси готовые подборки SoundCloud и возвращайся к любимым трекам.'
        )
      );
      const grid = node('div', 'playlist-grid');
      for (const p of lists) {
        const card = control('', 'playlist-card', () => openList(p.id)),
          cover = node('div', 'playlist-mosaic');
        if (p.curated && p.cover) {
          cover.classList.add('playlist-curated');
          const img = node('img');
          img.src = p.cover;
          img.alt = p.name;
          cover.append(img);
        } else if (p.builtin) {
          cover.classList.add('playlist-frequent');
          cover.textContent = '↻';
        } else if (p.preview?.length) {
          for (let i = 0; i < 4; i++)
            cover.append(
              p.preview[i % p.preview.length]
                ? art(p.preview[i % p.preview.length], '')
                : node('span', '', '♪')
            );
        } else {
          cover.classList.add('playlist-blank');
          cover.textContent = '♪';
        }
        card.append(
          cover,
          node('strong', '', p.name),
          node(
            'small',
            '',
            p.curated
              ? `${p.count} треков · Подборка автора`
              : p.builtin
                ? 'На основе прослушиваний'
                : `${p.count.toLocaleString('ru')} треков${p.sourceUrl ? ' · SoundCloud' : ''}`
          )
        );
        grid.append(card);
      }
      section.append(grid);
      main.scrollTop = top;
      return;
    }
    const query = $('search').value.trim().toLocaleLowerCase(),
      all = opened.tracks || [],
      visible = all.filter(
        (t) => !query || (t.title + ' ' + t.artist).toLocaleLowerCase().includes(query)
      ),
      available = playable(visible),
      tools = node('div', 'playlist-detail-tools');
    const play = control('▶ Слушать', 'primary', () =>
      available.length ? playList(available, 0) : toast('В плейлисте пока нет доступных треков.')
    );
    play.disabled = !available.length;
    tools.append(
      play,
      control('Перемешать', 'outline', () => {
        const list = [...available];
        for (let i = list.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [list[i], list[j]] = [list[j], list[i]];
        }
        if (list.length) playList(list, 0);
      }),
      node('span', 'playlist-note', `${all.length.toLocaleString('ru')} треков`)
    );
    section.append(tools);
    if (opened.curated) {
      const banner = node('div', 'playlist-curated-heading'),
        img = node('img');
      img.src = opened.cover;
      img.alt = opened.name;
      banner.append(
        img,
        node('p', 'playlist-note', opened.description + ' Доступна всем пользователям SoundSync.')
      );
      section.insertBefore(banner, tools);
    }
    if (opened.builtin && !opened.curated)
      section.append(
        node(
          'p',
          'playlist-note',
          'Здесь появятся треки, которые ты слушаешь чаще. Считаем прослушивания после 30 секунд или половины короткого трека, без учёта перемотки.'
        )
      );
    if (!all.length)
      section.append(
        node(
          'div',
          'playlist-empty',
          opened.builtin
            ? 'Статистика начнёт накапливаться во время прослушивания.'
            : 'Пока пусто. В библиотеке, любимом или SoundCloud нажми ⋯ у трека → «Добавить в плейлист».'
        )
      );
    const rows = node('div', 'playlist-tracks');
    for (const [i, t] of visible.entries()) {
      const row = node('div', 'track-row playlist-row' + (current?.id === t.id ? ' playing' : '')),
        info = node('button', 'playlist-track-play'),
        text = node('div');
      text.append(
        node('strong', '', t.title),
        node('small', '', t.artist + (t.playCount ? ' · ' + t.playCount + ' прослушиваний' : ''))
      );
      info.append(
        node('span', 'playlist-track-number', String(i + 1).padStart(2, '0')),
        art(t, 'track-cover'),
        text
      );
      info.onclick = () => {
        if (t.missing || t.playbackUnavailable) {
          toast(t.playbackError || 'Трек сейчас недоступен');
          return;
        }
        playList(available, available.indexOf(t));
      };
      if (t.missing || t.playbackUnavailable) {
        row.classList.add('playlist-missing');
        info.title = t.playbackError || 'Трек не найден';
      }
      row.append(
        info,
        node('span', 'track-time', t.duration ? fmt(t.duration) : '—'),
        makeTrackMenuButton(t)
      );
      rows.append(row);
    }
    section.append(rows);
    main.scrollTop = top;
  }
  const priorRender = render;
  render = function () {
    priorRender();
    const visible = view === 'playlists';
    section.classList.toggle('hidden', !visible);
    nav.classList.toggle('active', visible);
    if (visible) {
      document.querySelector('.collection').classList.add('hidden');
      $('view-label').textContent = opened?.name || 'Плейлисты';
      $('search').disabled = false;
      draw();
    }
  };
  const names = node('dialog', 'feedback-dialog playlist-name-dialog');
  names.innerHTML =
    '<form><div class="feedback-heading"><h2 id="playlist-name-title">Новый плейлист</h2><button class="feedback-close" type="button" aria-label="Закрыть">×</button></div><label for="playlist-name">Название</label><input id="playlist-name" required maxlength="100" autocomplete="off" placeholder="Например, В дорогу"><p class="feedback-error" hidden></p><div class="feedback-actions"><button class="primary" type="submit">Сохранить</button></div></form>';
  document.body.append(names);
  let nameAction = null;
  function nameDialog(title, value, action) {
    names.querySelector('h2').textContent = title;
    names.querySelector('input').value = value;
    names.querySelector('p').hidden = true;
    nameAction = action;
    names.showModal();
    names.querySelector('input').focus();
  }
  names.querySelector('.feedback-close').onclick = () => names.close();
  names.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const b = names.querySelector('.primary');
    b.disabled = true;
    try {
      await nameAction(names.querySelector('input').value);
      names.close();
    } catch (e) {
      const p = names.querySelector('p');
      p.textContent = cleanError(e);
      p.hidden = false;
    } finally {
      b.disabled = false;
    }
  };
  const picker = node('dialog', 'feedback-dialog playlist-picker');
  picker.innerHTML =
    '<div class="feedback-heading"><h2>Добавить в плейлист</h2><button class="feedback-close" type="button" aria-label="Закрыть">×</button></div><p class="playlist-note" id="playlist-picker-track"></p><div class="playlist-picker-list"></div><div class="feedback-actions"><button type="button" class="primary">+ Создать и добавить</button></div>';
  document.body.append(picker);
  let picked = null;
  async function pick(t) {
    picked = t;
    picker.querySelector('#playlist-picker-track').textContent = t.title + ' — ' + t.artist;
    const box = picker.querySelector('.playlist-picker-list');
    box.replaceChildren(node('p', 'playlist-note', 'Загружаем…'));
    picker.showModal();
    try {
      lists = await window.lumen.playlistsList();
      box.replaceChildren();
      for (const p of lists.filter((p) => !p.builtin)) {
        const b = control(p.name, 'playlist-picker-item', async () => {
          b.disabled = true;
          try {
            const result = await window.lumen.playlistAdd(p.id, t.id);
            picker.close();
            toast(
              result.added ? 'Трек добавлен в «' + p.name + '»' : 'Трек уже есть в этом плейлисте'
            );
            await refresh();
          } catch (e) {
            toast(cleanError(e));
            b.disabled = false;
          }
        });
        b.append(node('small', '', p.count + ' треков'));
        box.append(b);
      }
      if (!box.children.length)
        box.append(node('p', 'playlist-note', 'Пока нет своих плейлистов. Создай первый.'));
    } catch (e) {
      box.replaceChildren(node('p', 'feedback-error', cleanError(e)));
    }
  }
  picker.querySelector('.feedback-close').onclick = () => picker.close();
  picker.querySelector('.primary').onclick = () => {
    const t = picked;
    picker.close();
    nameDialog('Новый плейлист', '', async (name) => {
      const p = await window.lumen.playlistCreate(name);
      await window.lumen.playlistAdd(p.id, t.id);
      await refresh();
      toast('Плейлист создан, трек добавлен');
    });
  };
  const previousMenu = openTrackMenu;
  openTrackMenu = function (t, anchor) {
    previousMenu(t, anchor);
    const add = control('Добавить в плейлист', '', () => {
      closeTrackMenu();
      pick(t);
    });
    add.setAttribute('role', 'menuitem');
    trackMenu.append(add);
    if (
      view === 'playlists' &&
      opened &&
      !opened.builtin &&
      opened.tracks?.some((x) => x.id === t.id)
    ) {
      const id = opened.id,
        remove = control('Убрать из этого плейлиста', '', async () => {
          closeTrackMenu();
          try {
            await window.lumen.playlistRemove(id, t.id);
            await refresh(id);
          } catch (e) {
            toast(cleanError(e));
          }
        });
      remove.setAttribute('role', 'menuitem');
      trackMenu.append(remove);
      const i = opened.tracks.findIndex((x) => x.id === t.id);
      for (const [label, delta] of [
        ['Поднять выше', -1],
        ['Опустить ниже', 1],
      ])
        if (i + delta >= 0 && i + delta < opened.tracks.length) {
          const b = control(label, '', async () => {
            closeTrackMenu();
            const ids = opened.tracks.map((t) => t.id);
            [ids[i], ids[i + delta]] = [ids[i + delta], ids[i]];
            try {
              await window.lumen.playlistOrder(id, ids);
              await refresh(id);
            } catch (e) {
              toast(cleanError(e));
            }
          });
          b.setAttribute('role', 'menuitem');
          trackMenu.append(b);
        }
    }
    const r = anchor.getBoundingClientRect();
    trackMenu.style.top =
      Math.max(12, Math.min(innerHeight - trackMenu.offsetHeight - 12, r.bottom + 6)) + 'px';
  };
  const importer = node('dialog', 'feedback-dialog playlist-import-dialog');
  importer.innerHTML =
    '<form><div class="feedback-heading"><h2>Импорт плейлиста</h2><button type="button" class="feedback-close" aria-label="Закрыть">×</button></div><p class="playlist-note">Сохраним подборку в SoundSync. Треки не скачиваются и не добавляются в любимое автоматически.</p><label for="playlist-import-url">Публичная ссылка SoundCloud</label><input id="playlist-import-url" type="url" required placeholder="https://soundcloud.com/artist/sets/playlist"><p class="feedback-error" hidden></p><div class="playlist-import-preview"></div><div class="feedback-actions"><button type="submit" class="outline">Загрузить список</button><button type="button" class="primary" hidden>Создать плейлист</button></div></form>';
  document.body.append(importer);
  let imported = null,
    importGeneration = 0;
  function openImport() {
    imported = null;
    importer.querySelector('.primary').hidden = true;
    importer.querySelector('.playlist-import-preview').replaceChildren();
    importer.querySelector('.feedback-error').hidden = true;
    importer.showModal();
    importer.querySelector('input').focus();
  }
  importer.querySelector('.feedback-close').onclick = () => {
    importGeneration++;
    importer.close();
  };
  importer.addEventListener('cancel', () => importGeneration++);
  importer.querySelector('input').oninput = () => {
    importGeneration++;
    imported = null;
    importer.querySelector('.primary').hidden = true;
  };
  importer.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const token = ++importGeneration,
      b = importer.querySelector('[type=submit]'),
      box = importer.querySelector('.playlist-import-preview');
    b.disabled = true;
    imported = null;
    importer.querySelector('.primary').hidden = true;
    importer.querySelector('.feedback-error').hidden = true;
    box.replaceChildren(node('p', 'playlist-note', 'Загружаем плейлист…'));
    try {
      const p = await window.lumen.playlistImportPreview(importer.querySelector('input').value);
      if (token !== importGeneration) return;
      imported = p;
      box.replaceChildren(
        node('h3', '', p.name),
        node(
          'p',
          'playlist-note',
          `${p.count} треков · недоступных пропущено: ${p.unavailable} · дублей: ${p.duplicates}`
        )
      );
      const ul = node('ul', 'sc-import-sample');
      for (const t of p.sample) ul.append(node('li', '', t.title + ' — ' + t.artist));
      box.append(ul);
      importer.querySelector('.primary').hidden = false;
    } catch (e) {
      if (token === importGeneration) {
        const p = importer.querySelector('.feedback-error');
        p.textContent = cleanError(e);
        p.hidden = false;
        box.replaceChildren();
      }
    } finally {
      b.disabled = false;
    }
  };
  importer.querySelector('.primary').onclick = async () => {
    if (!imported) return;
    const b = importer.querySelector('.primary');
    b.disabled = true;
    try {
      const p = await window.lumen.playlistImportCommit(imported.token);
      importer.close();
      await refresh(p.id);
      toast('Плейлист импортирован');
    } catch (e) {
      const p = importer.querySelector('.feedback-error');
      p.textContent = cleanError(e);
      p.hidden = false;
    } finally {
      b.disabled = false;
    }
  };
  // Count an actual listen once per load; pause/resume and seeking do not add plays.
  const session = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  let generation = 0,
    counted = false,
    listened = 0,
    lastTime = 0,
    lastClock = performance.now();
  const priorLoad = load;
  load = function (t) {
    generation++;
    counted = false;
    listened = 0;
    lastTime = 0;
    lastClock = performance.now();
    return priorLoad(t);
  };
  audio.addEventListener('timeupdate', () => {
    const now = performance.now(),
      time = audio.currentTime,
      delta = time - lastTime,
      wall = (now - lastClock) / 1000;
    lastTime = time;
    lastClock = now;
    if (!current || counted || audio.paused || audio.seeking) return;
    if (delta > 0 && delta < 10) listened += Math.min(delta, Math.max(0, wall));
    const duration = Number(current.duration) || audio.duration,
      threshold =
        Number.isFinite(duration) && duration > 0 ? Math.min(30, Math.max(1, duration / 2)) : 30;
    if (listened < threshold) return;
    counted = true;
    window.lumen
      .playlistRecord(current.id, session + '-' + generation)
      .then(() => {
        if (view === 'playlists' && opened?.builtin) refresh(opened.id);
      })
      .catch((e) => {
        counted = false;
        console.warn('Listening stats:', cleanError(e));
      });
  });
  render();
})();
