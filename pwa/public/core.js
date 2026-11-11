export function soundcloudUrl(value) {
  const found = String(value || '')
    .trim()
    .match(/https?:\/\/[^\s<>]+/i);
  if (!found) throw Error('Вставь ссылку на SoundCloud');
  const u = new URL(found[0].replace(/[),.!]+$/, ''));
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.port ||
    !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'].includes(
      u.hostname
    )
  )
    throw Error('Нужна HTTPS-ссылка на SoundCloud');
  const parts = u.pathname.split('/').filter(Boolean);
  if (u.hostname !== 'on.soundcloud.com' && parts.length < 2)
    throw Error('Нужна ссылка на трек или плейлист, а не на профиль');
  const secret = u.searchParams.get('secret_token');
  u.search = '';
  u.hash = '';
  if (secret) u.searchParams.set('secret_token', secret);
  if (u.hostname !== 'on.soundcloud.com') u.hostname = 'soundcloud.com';
  u.pathname = u.pathname.replace(/\/$/, '');
  return u.href;
}
export function coverUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' &&
      (u.hostname === 'sndcdn.com' || u.hostname.endsWith('.sndcdn.com'))
      ? u.href.replace(
          /-(?:large|small|badge|tiny|t(?:20|50|67|100|120|200|240|250|300)x(?:20|50|67|100|120|200|240|250|300))(\.[a-z]+)(?=\?|$)/i,
          '-t500x500$1'
        )
      : '';
  } catch {
    return '';
  }
}
export function cleanTrack(value) {
  const url = soundcloudUrl(value.url || value.pageUrl);
  return {
    url,
    id: String(value.id || value.scId || url),
    title: String(value.title || 'Трек SoundCloud').slice(0, 300),
    artist: String(value.artist || 'SoundCloud').slice(0, 200),
    cover: coverUrl(value.cover),
    liked: !!value.liked,
    addedAt: Number(value.addedAt) || Date.now(),
    lastPlayed: Number(value.lastPlayed) || 0,
  };
}
export function mergeTrack(tracks, input) {
  const track = cleanTrack(input),
    old = tracks.find((t) => t.url === track.url);
  if (old) {
    Object.assign(old, {
      ...track,
      liked: old.liked || track.liked,
      addedAt: Math.min(old.addedAt, track.addedAt),
      lastPlayed: Math.max(old.lastPlayed, track.lastPlayed),
    });
    return old;
  }
  tracks.push(track);
  return track;
}
export function readState(text) {
  try {
    const raw = JSON.parse(text),
      tracks = [];
    for (const t of Array.isArray(raw.tracks) ? raw.tracks : [])
      try {
        mergeTrack(tracks, t);
      } catch {}
    let currentUrl = '';
    try {
      currentUrl = raw.currentUrl ? soundcloudUrl(raw.currentUrl) : '';
    } catch {}
    return { version: 1, tracks, currentUrl };
  } catch {
    return { version: 1, tracks: [], currentUrl: '' };
  }
}
