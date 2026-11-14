function playlistUrl(value) {
  let u;
  try {
    u = new URL(String(value || '').trim());
  } catch {
    throw Error('Вставь ссылку на плейлист SoundCloud.');
  }
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(u.hostname) ||
    !/^\/[^/]+\/sets\/[^/]+\/?$/.test(u.pathname)
  )
    throw Error('Нужна публичная ссылка soundcloud.com/исполнитель/sets/плейлист.');
  u.hostname = 'soundcloud.com';
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/\/$/, '');
  return u.href;
}
async function readPlaylist(value, { api, mapTrack }) {
  const url = playlistUrl(value),
    data = await api('resolve', { url });
  if (data.kind !== 'playlist' || !Array.isArray(data.tracks))
    throw Error('SoundCloud не вернул плейлист по этой ссылке.');
  if (data.tracks.length > 10000) throw Error('В одном плейлисте поддерживается до 10 000 треков.');
  if (Number(data.track_count) > data.tracks.length)
    throw Error(
      'SoundCloud не предоставил полный список. Импорт не сохранён; попробуй другую публичную ссылку.'
    );
  const raw = new Map(
    data.tracks.filter((t) => t?.kind === 'track' && t.permalink_url).map((t) => [String(t.id), t])
  );
  const missing = data.tracks
    .filter((t) => t?.id && !raw.has(String(t.id)))
    .map((t) => String(t.id));
  for (let i = 0; i < missing.length; i += 50) {
    const list = await api('tracks', { ids: missing.slice(i, i + 50).join(',') });
    for (const t of Array.isArray(list) ? list : list.collection || [])
      if (t?.kind === 'track' && t.permalink_url) raw.set(String(t.id), t);
  }
  const tracks = [],
    seen = new Set();
  let unavailable = 0,
    duplicates = 0;
  for (const entry of data.tracks) {
    const t = raw.get(String(entry.id));
    if (!t) {
      unavailable++;
      continue;
    }
    const track = mapTrack(t);
    if (track.playbackUnavailable || track.access === 'blocked' || track.access === 'preview') {
      unavailable++;
      continue;
    }
    if (seen.has(track.id)) {
      duplicates++;
      continue;
    }
    seen.add(track.id);
    tracks.push(track);
  }
  return {
    name: String(data.title || 'Плейлист SoundCloud').slice(0, 100),
    sourceUrl: url,
    tracks,
    total: data.tracks.length,
    unavailable,
    duplicates,
  };
}
module.exports = { playlistUrl, readPlaylist };
