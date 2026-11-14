/* Модель вкуса для апгрейдера: насколько трек скорее всего зайдёт человеку (0..1) и почему.
   Сигналы: любимое, прослушанное, своя медиатека, дизлайки; артисты, жанры и теги. */
(function (root) {
  const norm = (s) =>
    String(s || '')
      .normalize('NFKC')
      .toLocaleLowerCase('ru')
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  // Главный артист без фитов: «A feat. B» и «A, B» считаем за A.
  const artistKey = (t) =>
    norm(
      String(t?.artist || t?.albumartist || '').split(
        /\s+(?:feat\.?|ft\.?|x|при уч\.)\s+|[,;&]/i
      )[0]
    );
  const STOP = new Set([
    '',
    'music',
    'audio',
    'official',
    'soundcloud',
    'other',
    'none',
    'unknown',
  ]);
  function tags(t) {
    const raw = [t?.genre || '', ...(String(t?.tags || '').match(/"[^"]+"|\S+/g) || [])];
    return [
      ...new Set(
        raw.map((x) => norm(x.replace(/"/g, ''))).filter((x) => !STOP.has(x) && x.length > 1)
      ),
    ];
  }
  const WEIGHTS = { liked: 3, played: 1, owned: 0.5, disliked: -5 };
  const TAG_WEIGHTS = { liked: 2, played: 0.5, owned: 0.25, disliked: -3 };

  function buildProfile({ liked = [], played = [], owned = [], disliked = [] } = {}) {
    const artists = new Map(),
      genres = new Map(),
      likedIds = new Set(),
      dislikedIds = new Set(),
      names = new Map();
    const add = (list, kind) => {
      for (const t of list) {
        if (!t) continue;
        const key = artistKey(t);
        if (key) {
          artists.set(key, (artists.get(key) || 0) + WEIGHTS[kind]);
          if (!names.has(key)) names.set(key, t.artist || t.albumartist);
        }
        for (const tag of tags(t)) genres.set(tag, (genres.get(tag) || 0) + TAG_WEIGHTS[kind]);
        if (kind === 'liked') likedIds.add(t.id);
        if (kind === 'disliked') dislikedIds.add(t.id);
      }
    };
    add(owned, 'owned');
    add(played, 'played');
    add(liked, 'liked');
    add(disliked, 'disliked');
    const top = (map, n) =>
      [...map.entries()]
        .filter(([, w]) => w > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
    return {
      artists,
      genres,
      likedIds,
      dislikedIds,
      topArtists: top(artists, 8).map(([key, weight]) => ({ key, name: names.get(key), weight })),
      topGenres: top(genres, 8).map(([tag, weight]) => ({ tag, weight })),
      signals: liked.length + played.length + disliked.length,
    };
  }

  // Небольшой стабильный разброс по ID, чтобы у похожих треков были разные оценки.
  function jitter(id) {
    let h = 2166136261;
    for (const c of String(id)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return ((h >>> 0) / 4294967295 - 0.5) * 0.06;
  }
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  function scoreTrack(t, profile) {
    const reasons = [];
    if (profile.likedIds.has(t.id)) return { score: 0.97, reasons: ['Уже в любимом'] };
    if (profile.dislikedIds.has(t.id))
      return { score: 0.03, reasons: ['Ты отметил «Не нравится»'] };
    const key = artistKey(t),
      artistWeight = profile.artists.get(key) || 0;
    let tagWeight = 0;
    const matched = [];
    for (const tag of tags(t)) {
      const w = profile.genres.get(tag) || 0;
      if (w) {
        tagWeight += w;
        if (w > 0) matched.push(tag);
      }
    }
    if (artistWeight >= 3) reasons.push(`Ты любишь ${t.artist}`);
    else if (artistWeight > 0) reasons.push(`Ты слушал ${t.artist}`);
    else if (artistWeight < 0) reasons.push(`${t.artist} тебе не заходил`);
    else reasons.push('Новый для тебя артист');
    if (matched.length) reasons.push('Твой жанр: ' + matched.slice(0, 2).join(', '));
    else if (tagWeight < 0) reasons.push('Жанр не в твоём вкусе');
    else if (!tags(t).length) reasons.push('Жанр неизвестен');
    else reasons.push('Жанр мимо твоих привычек');
    const score = clamp(
      0.16 + 0.55 * Math.tanh(artistWeight / 4) + 0.3 * Math.tanh(tagWeight / 3) + jitter(t.id),
      0.02,
      0.95
    );
    return { score, reasons };
  }

  const TIERS = [
    { id: 'miss', name: 'Мимо', min: 0, color: '#8b909a' },
    { id: 'once', name: 'На разок', min: 0.3, color: '#4f9dff' },
    { id: 'fits', name: 'Зайдёт', min: 0.5, color: '#a46bff' },
    { id: 'playlist', name: 'В плейлист', min: 0.7, color: '#ff4d8d' },
    { id: 'yours', name: 'Твой трек', min: 0.85, color: '#ffd629' },
  ];
  const tierOf = (score) => [...TIERS].reverse().find((t) => score >= t.min);

  // «Ценность» растёт экспоненциально: прыжок через несколько уровней — малый шанс.
  const value = (score) => Math.pow(2, score * 4);
  function upgradeChance(stake, target) {
    return clamp((0.92 * value(stake)) / value(target), 0.01, 0.9);
  }
  const multiplier = (stake, target) => value(target) / value(stake);

  // Где остановится стрелка: доля оборота = бросок; выигрыш, если бросок меньше шанса.
  function roll(chance, random = Math.random) {
    const r = random();
    return { roll: r, win: r < chance, angle: r * 360 };
  }

  root.TasteModel = {
    buildProfile,
    scoreTrack,
    tierOf,
    TIERS,
    upgradeChance,
    multiplier,
    roll,
    artistKey,
    tags,
  };
})(typeof module === 'object' ? module.exports : globalThis);
