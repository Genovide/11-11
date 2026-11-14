(() => {
  'use strict';
  const button = document.getElementById('rzt-reviews');
  const dialog = document.createElement('dialog');
  dialog.className = 'rzt-dialog';
  dialog.setAttribute('aria-labelledby', 'rzt-window-title');
  dialog.innerHTML = `<div class="rzt-shell">
    <header class="rzt-header"><div class="rzt-brand" aria-hidden="true">РЗТ</div><div class="rzt-heading"><div class="rzt-eyebrow">SoundSync · МУЗЫКА В ДЕТАЛЯХ</div><h2 id="rzt-window-title">Рецензии</h2></div><button class="rzt-icon" id="rzt-close" aria-label="Закрыть рецензии">×</button></header>
    <div class="rzt-intro"><h3>Услышать больше.</h3><p>Читай, как музыку слышат другие. Релизы, оценки и мнения сообщества РЗТ.</p></div>
    <div class="rzt-toolbar"><form class="rzt-search-form" role="search"><label class="rzt-search-box"><span aria-hidden="true">⌕</span><input id="rzt-query" aria-label="Поиск релиза или исполнителя" placeholder="Исполнитель, трек или альбом" autocomplete="off" maxlength="180"></label><button type="submit" class="rzt-action rzt-primary">Найти</button></form><button class="rzt-action" id="rzt-current">♫ Сейчас играет</button><button class="rzt-action" id="rzt-refresh" title="Обновить данные РЗТ" aria-label="Обновить рецензии">↻</button></div>
    <div class="rzt-tabs"><button class="rzt-chip" data-rzt-filter="all" aria-pressed="true">Все релизы</button><button class="rzt-chip" data-rzt-filter="album" aria-pressed="false">Альбомы</button><button class="rzt-chip" data-rzt-filter="track" aria-pressed="false">Треки</button><span class="rzt-source">РИСА ЗА ТВОРЧЕСТВО</span></div>
    <div class="rzt-content" id="rzt-content" aria-live="polite"></div>
    <footer class="rzt-footer"><span>Оценки и рецензии — risazatvorchestvo.com</span><button id="rzt-verify-footer">Проверка доступа к РЗТ ↗</button></footer>
  </div>`;
  document.body.append(dialog);
  const $r = (id) => dialog.querySelector('#' + id),
    content = $r('rzt-content'),
    query = $r('rzt-query');
  const make = (tag, cls, value) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (value !== undefined) e.textContent = value;
    return e;
  };
  let generation = 0,
    route = '/releases',
    page = 1,
    term = '',
    filter = 'all',
    selected = null,
    response = null,
    data = null,
    listState = null,
    sort = 'original';
  const busy = (value) => {
    content.setAttribute('aria-busy', String(value));
    $r('rzt-refresh').disabled = value;
  };
  function formatScore(value) {
    return value === null || value === undefined
      ? '—'
      : Number(value).toLocaleString('ru', { maximumFractionDigits: 1 });
  }
  function art(item) {
    const fallback = make('div', 'rzt-art', item.title?.slice(0, 1)?.toUpperCase() || '♫');
    if (!item.cover) return fallback;
    const img = make('img', 'rzt-art');
    img.src = item.cover;
    img.alt = 'Обложка «' + item.title + '»';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.replaceWith(fallback);
    return img;
  }
  function stateLine(value) {
    const line = make('div', 'rzt-status');
    line.append(make('i', 'rzt-dot'), make('span', '', value));
    return line;
  }
  function clear() {
    content.replaceChildren();
    content.scrollTop = 0;
  }
  function empty(title, message, symbol = '✎') {
    const e = make('div', 'rzt-empty');
    e.append(
      make('div', 'rzt-empty-symbol', symbol),
      make('h3', '', title),
      make('p', '', message)
    );
    content.append(e);
    return e;
  }
  function action(label, fn, primary = false) {
    const b = make('button', 'rzt-action' + (primary ? ' rzt-primary' : ''), label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  }
  function skeleton() {
    clear();
    content.append(stateLine('Загружаем с РЗТ…'));
    const grid = make('div', 'rzt-grid');
    for (let i = 0; i < 8; i++) {
      const c = make('div', 'rzt-card rzt-skeleton');
      c.setAttribute('aria-hidden', 'true');
      c.append(
        make('div', 'rzt-art'),
        make('div', 'rzt-skeleton-line'),
        make('div', 'rzt-skeleton-line')
      );
      grid.append(c);
    }
    content.append(grid);
  }
  function listRoute() {
    const params = new URLSearchParams();
    if (term) {
      params.set('query', term);
      params.set('type', 'releases');
    }
    if (page > 1) params.set('page', page);
    return (term ? '/search' : '/releases') + (params.size ? '?' + params : '');
  }
  async function verify() {
    try {
      await window.lumen.rztReviewsOpen();
    } catch {
      const e = empty(
        'Не удалось открыть проверку',
        'Попробуй ещё раз или перезапусти приложение.'
      );
      e.append(action('Повторить', verify));
    }
  }
  async function load(path, force = false) {
    route = path;
    data = null;
    response = null;
    const request = ++generation;
    skeleton();
    busy(true);
    try {
      const result = await window.lumen.rztPage({ path, force });
      if (request !== generation || !dialog.open) return;
      clear();
      if (result.error) {
        const e = empty(
          result.code === 'VERIFY' ? 'Нужна проверка сайта' : 'РЗТ пока не отвечает',
          result.error,
          result.code === 'VERIFY' ? '◈' : '↻'
        );
        if (result.code === 'VERIFY') e.append(action('Пройти проверку РЗТ', verify, true));
        e.append(action('Попробовать снова', () => load(route, true)));
        if (selected) e.prepend(action('← К релизам', back));
        return;
      }
      response = result;
      data = RztData.parse(result.html, path);
      if (selected) renderDetail();
      else renderList();
    } catch {
      if (request === generation && dialog.open) {
        clear();
        const e = empty('Не удалось загрузить рецензии', 'Проверь интернет и попробуй снова.');
        e.append(action('Повторить', () => load(route, true)));
      }
    } finally {
      if (request === generation) busy(false);
    }
  }
  function typeMatches(item) {
    if (filter === 'all') return true;
    const type = (item.type + ' ' + item.path).toLowerCase();
    return filter === 'track' ? /track|single|сингл/.test(type) : /album|\bep\b|альбом/.test(type);
  }
  function pagination(onChange) {
    const row = make('div', 'rzt-pagination'),
      prev = action('← Назад', () => onChange(page - 1)),
      next = action('Дальше →', () => onChange(page + 1));
    prev.disabled = page === 1;
    row.append(prev, make('span', 'rzt-status', 'Страница ' + page), next);
    return row;
  }
  function renderList() {
    clear();
    const items = data.releases.filter((item) => item.path && typeMatches(item));
    content.append(
      stateLine(
        (term ? 'Поиск: «' + term + '»' : 'Последние релизы') +
          ' · ' +
          (response.cached ? 'из кэша' : 'с сайта РЗТ')
      )
    );
    if (!items.length) {
      if (data.releases.length || data.structured) {
        empty(
          'Ничего не найдено',
          filter !== 'all'
            ? 'В этой выборке нет подходящих релизов. Выбери другой тип или измени поиск.'
            : 'Попробуй другое название или имя исполнителя.'
        );
      } else {
        const e = empty(
          'Не удалось прочитать релизы',
          'Страница загрузилась, но её формат не распознан. Можно обновить данные или проверить доступ к сайту.'
        );
        e.append(
          action('Обновить', () => load(route, true)),
          action('Проверить доступ', verify)
        );
      }
    } else {
      const grid = make('div', 'rzt-grid');
      for (const item of items) {
        const card = make('button', 'rzt-card');
        card.type = 'button';
        card.setAttribute(
          'aria-label',
          item.title + (item.artist ? ' — ' + item.artist : '') + '. Читать рецензии'
        );
        card.title = item.title + (item.artist ? ' — ' + item.artist : '');
        card.append(
          art(item),
          make('h4', '', item.title),
          make('p', 'rzt-artist', item.artist || 'Релиз на РЗТ')
        );
        const bottom = make('div', 'rzt-card-bottom');
        bottom.append(
          make('span', 'rzt-score', formatScore(item.scores.reviews)),
          make('span', 'rzt-score-label', 'Оценка\nрецензентов'),
          make('span', 'rzt-card-arrow', '↗')
        );
        card.append(bottom);
        card.onclick = () => openRelease(item);
        grid.append(card);
      }
      content.append(grid);
    }
    if (items.length || page > 1)
      content.append(
        pagination((next) => {
          page = next;
          load(listRoute());
        })
      );
  }
  function openRelease(item) {
    listState = { route, page, term, filter, data, response, scroll: content.scrollTop };
    selected = item;
    page = 1;
    sort = 'original';
    load(item.path);
  }
  function back() {
    generation++;
    busy(false);
    selected = null;
    const previous = listState;
    if (previous) {
      ({ route, page, term, filter, data, response } = previous);
      query.value = term;
      syncFilters();
      renderList();
      content.scrollTop = previous.scroll;
      listState = null;
    } else {
      page = 1;
      load(listRoute());
    }
  }
  function bodyText(value) {
    if (!/<\/?[a-z][\s\S]*>/i.test(value)) return value;
    const doc = new DOMParser().parseFromString(
      value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n\n'),
      'text/html'
    );
    doc.querySelectorAll('script,style').forEach((e) => e.remove());
    return doc.body.textContent.trim();
  }
  function renderDetail() {
    clear();
    content.append(action('← К релизам', back));
    const actual =
      data.releases.find((r) => r.path?.split('?')[0] === selected.path.split('?')[0]) ||
      data.releases.find((r) => r.title === selected.title);
    if (actual) {
      const scores = {};
      for (const key of ['flom', 'reviews', 'users'])
        scores[key] = actual.scores?.[key] ?? selected.scores?.[key] ?? null;
      selected = {
        ...selected,
        ...actual,
        scores,
        cover: actual.cover || selected.cover,
        artist: actual.artist || selected.artist,
      };
    }
    const head = make('div', 'rzt-detail-top'),
      copy = make('div', 'rzt-detail-copy'),
      scores = make('div', 'rzt-detail-scores');
    copy.append(
      make('div', 'rzt-eyebrow', selected.path.startsWith('/track/') ? 'ТРЕК' : 'АЛЬБОМ'),
      make('h3', '', selected.title),
      make('p', '', selected.artist)
    );
    for (const [key, label] of [
      ['flom', 'Фломастер'],
      ['reviews', 'С рецензиями'],
      ['users', 'Без рецензий'],
    ]) {
      const s = make('div', 'rzt-detail-score');
      s.title =
        selected.scores[key] === null
          ? 'Оценку не удалось получить с РЗТ'
          : label + ': ' + formatScore(selected.scores[key]);
      s.append(
        make('span', 'rzt-score', formatScore(selected.scores[key])),
        make('span', 'rzt-score-label', label)
      );
      scores.append(s);
    }
    copy.append(scores);
    head.append(art(selected), copy);
    content.append(head);
    if (['flom', 'reviews', 'users'].every((key) => selected.scores[key] === null))
      content.append(
        stateLine('Оценки не удалось получить с РЗТ. Прочерк не означает нулевую оценку.')
      );
    const heading = make('div', 'rzt-review-heading'),
      select = make('select');
    select.setAttribute('aria-label', 'Порядок рецензий');
    for (const [value, label] of [
      ['original', 'Порядок РЗТ'],
      ['high', 'Высокая оценка'],
      ['low', 'Низкая оценка'],
    ]) {
      const o = make('option', '', label);
      o.value = value;
      select.append(o);
    }
    select.value = sort;
    select.onchange = () => {
      sort = select.value;
      renderDetail();
    };
    heading.append(
      make('h3', '', 'Рецензии' + (data.reviews.length ? ' · ' + data.reviews.length : '')),
      select
    );
    content.append(heading);
    const reviews = [...data.reviews];
    if (sort !== 'original')
      reviews.sort((a, b) =>
        a.score === null
          ? 1
          : b.score === null
            ? -1
            : sort === 'high'
              ? b.score - a.score
              : a.score - b.score
      );
    if (!reviews.length) {
      const message = data.explicitEmpty
        ? 'У этого релиза пока нет рецензий на РЗТ.'
        : page > 1
          ? 'На этой странице не удалось найти рецензии. Вернись на предыдущую.'
          : 'Тексты рецензий не удалось получить из страницы РЗТ. Они могут загружаться отдельно. Оценки показаны выше, если сайт их предоставил.';
      const e = empty(data.explicitEmpty ? 'Рецензий пока нет' : 'Тексты недоступны', message);
      e.append(action('Обновить', () => load(route, true)));
    }
    for (const review of reviews) {
      const article = make('article', 'rzt-review'),
        header = make('div', 'rzt-review-header'),
        author = make('div', 'rzt-review-author', review.author);
      const date = new Date(review.date);
      if (review.date && !Number.isNaN(date.getTime()))
        author.append(
          make(
            'span',
            'rzt-review-date',
            date.toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })
          )
        );
      header.append(
        make('div', 'rzt-avatar', review.author.slice(0, 1).toUpperCase()),
        author,
        make('span', 'rzt-score', formatScore(review.score))
      );
      article.append(header);
      if (review.title) article.append(make('h4', '', review.title));
      const body = make('p', 'rzt-review-body', bodyText(review.body));
      article.append(body);
      if (body.textContent.length > 700) {
        body.classList.add('rzt-collapsed');
        const more = make('button', 'rzt-read-more', 'Читать полностью ↓');
        more.setAttribute('aria-expanded', 'false');
        more.onclick = () => {
          const collapsed = body.classList.toggle('rzt-collapsed');
          more.textContent = collapsed ? 'Читать полностью ↓' : 'Свернуть ↑';
          more.setAttribute('aria-expanded', String(!collapsed));
        };
        article.append(more);
      }
      content.append(article);
    }
    if (reviews.length || page > 1)
      content.append(
        pagination((next) => {
          page = next;
          const u = new URL(selected.path, 'https://risazatvorchestvo.com');
          u.searchParams.set('page', page);
          load(u.pathname + u.search);
        })
      );
  }
  function syncFilters() {
    dialog
      .querySelectorAll('[data-rzt-filter]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rztFilter === filter)));
  }
  dialog.querySelector('.rzt-search-form').onsubmit = (e) => {
    e.preventDefault();
    term = query.value.trim();
    page = 1;
    selected = null;
    listState = null;
    load(listRoute());
  };
  dialog.querySelectorAll('[data-rzt-filter]').forEach(
    (b) =>
      (b.onclick = () => {
        const nextFilter = b.dataset.rztFilter;
        if (selected) back();
        filter = nextFilter;
        syncFilters();
        if (data) renderList();
      })
  );
  $r('rzt-close').onclick = () => dialog.close();
  $r('rzt-refresh').onclick = () => load(route, true);
  $r('rzt-verify-footer').onclick = verify;
  $r('rzt-current').onclick = () => {
    const track = typeof current !== 'undefined' ? current : null;
    if (!track?.title) return;
    const lookup = TrackIdentity.derive(track);
    query.value = lookup.album || lookup.title;
    term = query.value;
    page = 1;
    selected = null;
    listState = null;
    load(listRoute());
  };
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => {
    generation++;
    busy(false);
  });
  button.onclick = () => {
    const track = typeof current !== 'undefined' ? current : null;
    $r('rzt-current').disabled = !track?.title;
    $r('rzt-current').title = track?.title
      ? 'Найти рецензии: ' + track.artist + ' — ' + track.title
      : 'Сначала выбери трек в плеере';
    dialog.showModal();
    if (!data || !response) load(route);
    else if (selected) renderDetail();
    else renderList();
    query.focus();
  };
})();
