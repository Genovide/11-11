function profileUrl(value) {
  let u;
  try {
    u = new URL(String(value || '').trim());
  } catch {
    throw Error('Вставь ссылку на профиль SoundCloud или его лайки.');
  }
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(u.hostname)
  )
    throw Error('Нужна HTTPS-ссылка на профиль SoundCloud.');
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] === 'you')
    throw Error(
      'Ссылка /you/likes не содержит имя профиля. Открой свой профиль SoundCloud и скопируй его ссылку.'
    );
  if (
    parts.length < 1 ||
    parts.length > 2 ||
    (parts.length === 2 && parts[1] !== 'likes') ||
    ['discover', 'search', 'stream', 'charts', 'settings', 'upload', 'terms', 'pages'].includes(
      parts[0]
    )
  )
    throw Error('Нужна ссылка на профиль или страницу его лайков, а не на песню.');
  return 'https://soundcloud.com/' + encodeURIComponent(decodeURIComponent(parts[0]));
}
async function readLikes(
  value,
  { api, mapTrack, onProgress = () => {}, cancelled = () => false, maxPages = 200 }
) {
  const url = profileUrl(value),
    user = await api('resolve', { url });
  if (user.kind !== 'user' || !/^\d{1,20}$/.test(String(user.id)))
    throw Error('SoundCloud не нашёл профиль по этой ссылке.');
  const profile = {
    id: String(user.id),
    name: String(user.username || 'SoundCloud').slice(0, 200),
    url: profileUrl(user.permalink_url || url),
    avatar:
      typeof user.avatar_url === 'string' && /^https:\/\/[^/]*\.sndcdn\.com\//.test(user.avatar_url)
        ? user.avatar_url
        : '',
    likes: Number(user.likes_count || user.public_favorites_count) || 0,
  };
  const path = '/users/' + profile.id + '/likes',
    tracks = new Map(),
    seen = new Set();
  let next = path,
    pages = 0,
    scanned = 0,
    playlists = 0,
    unavailable = 0,
    invalid = 0;
  while (next) {
    if (cancelled()) throw Error('Импорт отменён.');
    if (++pages > maxPages)
      throw Error('Список слишком большой для одного импорта. Ни один трек не добавлен.');
    const address = new URL(next, 'https://api-v2.soundcloud.com');
    if (address.origin !== 'https://api-v2.soundcloud.com' || address.pathname !== path)
      throw Error('SoundCloud вернул неожиданный адрес следующей страницы.');
    address.searchParams.delete('client_id');
    const key = address.href;
    if (seen.has(key)) throw Error('SoundCloud повторил страницу лайков. Попробуй импорт ещё раз.');
    seen.add(key);
    const data = await api(address.href, { limit: 200, linked_partitioning: 1 });
    if (!Array.isArray(data.collection))
      throw Error('Не удалось прочитать список лайков SoundCloud.');
    for (const entry of data.collection) {
      scanned++;
      const raw = entry.track || entry;
      if (entry.playlist || raw.kind === 'playlist') {
        playlists++;
        continue;
      }
      if (raw.kind !== 'track' || !raw.id || !raw.permalink_url) {
        invalid++;
        continue;
      }
      try {
        const t = mapTrack(raw);
        if (t.playbackUnavailable || t.access === 'blocked' || t.access === 'preview') {
          unavailable++;
          continue;
        }
        tracks.set(t.id, t);
      } catch {
        invalid++;
      }
    }
    onProgress({ profile, scanned, tracks: tracks.size, playlists, unavailable, invalid });
    next = data.next_href || null;
  }
  return {
    profile,
    tracks: [...tracks.values()],
    stats: { scanned, playlists, unavailable, invalid, pages },
  };
}
module.exports = { profileUrl, readLikes };
