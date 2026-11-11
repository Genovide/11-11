const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { repairTrackMetadata } = require('./text-repair.js');
const norm = (s) =>
  String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]/gu, '');
const generic = (s) =>
  !s ||
  /^\d+$/.test(String(s).trim()) ||
  /^(soundcloud|unknown|неизвестныйисполнитель)$/i.test(norm(s));
const genericAlbum = (s) => !s || /^(soundcloudsingle|безальбома|unknownalbum)$/i.test(norm(s));
function imageHash(buffer) {
  try {
    const { nativeImage } = require('electron');
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) return null;
    const bytes = image.resize({ width: 9, height: 8, quality: 'best' }).toBitmap();
    let bits = '';
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const at = (y * 9 + x) * 4,
          next = at + 4;
        bits +=
          bytes[at] + bytes[at + 1] + bytes[at + 2] >
          bytes[next] + bytes[next + 1] + bytes[next + 2]
            ? '1'
            : '0';
      }
    const ones = [...bits].filter((c) => c === '1').length;
    return ones >= 5 && ones <= 59 ? bits : null;
  } catch {
    return null;
  }
}
function distance(a, b) {
  return a && b && a.length === 64 && b.length === 64
    ? [...a].filter((c, i) => c !== b[i]).length
    : Infinity;
}
function chooseMetadata(track, candidates) {
  const usable = candidates.filter(
    (c) =>
      c.artist &&
      c.album &&
      norm(c.title) === norm(track.title) &&
      track.duration > 0 &&
      c.duration > 0 &&
      Math.abs(track.duration - c.duration) <= 3
  );
  const covered = usable
    .filter((c) => c.coverDistance <= 8)
    .sort((a, b) => a.coverDistance - b.coverDistance);
  if (covered.length) {
    const best = covered[0],
      conflict = covered.find(
        (c) => norm(c.artist) !== norm(best.artist) || norm(c.album) !== norm(best.album)
      );
    if (!conflict || conflict.coverDistance >= best.coverDistance + 4) return best;
  }
  const artistMatches = usable.filter(
    (c) => !generic(track.artist) && norm(c.artist) === norm(track.artist)
  );
  const releases = new Set(artistMatches.map((c) => norm(c.album)));
  return releases.size === 1 ? artistMatches[0] : null;
}
module.exports = function ({ dir, fetchImpl = fetch, hashImage = imageHash }) {
  const pending = new Map(),
    hashes = new Map();
  let tail = Promise.resolve(),
    lastRequest = 0;
  async function request(url) {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(6500),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SoundSync/1.0 (personal music player)',
      },
    });
    if (!response.ok) throw Error('Metadata HTTP ' + response.status);
    return response.json();
  }
  async function hash(url) {
    if (!url) return null;
    if (hashes.has(url)) return hashes.get(url);
    const job = (async () => {
      try {
        const u = new URL(url);
        if (
          u.protocol !== 'https:' ||
          !['sndcdn.com', 'mzstatic.com', 'coverartarchive.org', 'archive.org'].some(
            (h) => u.hostname === h || u.hostname.endsWith('.' + h)
          )
        )
          return null;
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return null;
        const bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length > 5000000) return null;
        return hashImage(bytes);
      } catch {
        return null;
      }
    })();
    hashes.set(url, job);
    if (hashes.size > 100) hashes.delete(hashes.keys().next().value);
    return job;
  }
  async function itunes(track, titleOnly = false) {
    const term = [track.title, titleOnly || generic(track.artist) ? '' : track.artist]
      .filter(Boolean)
      .join(' ');
    const d = await request(
      'https://itunes.apple.com/search?' +
        new URLSearchParams({ term, entity: 'song', limit: '20', country: 'us' })
    );
    return (d.results || []).map((t) => ({
      title: t.trackName,
      artist: t.artistName,
      album: t.collectionName,
      duration: t.trackTimeMillis / 1000,
      cover: t.artworkUrl100?.replace(/^http:/, 'https:'),
      source: 'iTunes',
      url: t.trackViewUrl,
    }));
  }
  async function musicbrainz(track, titleOnly = false) {
    const quote = (s) => '"' + s.replace(/["\\]/g, ' ') + '"';
    const query =
      'recording:' +
      quote(track.title) +
      (titleOnly || generic(track.artist) ? '' : ' AND artist:' + quote(track.artist));
    const d = await request(
      'https://musicbrainz.org/ws/2/recording?' +
        new URLSearchParams({ query, fmt: 'json', limit: '10' })
    );
    return (d.recordings || []).flatMap((t) =>
      (t.releases || []).slice(0, 3).map((r) => ({
        title: t.title,
        artist: (t['artist-credit'] || [])
          .map((a) => (a.name || a.artist?.name || '') + (a.joinphrase || ''))
          .join(''),
        album: r.title,
        duration: t.length / 1000,
        cover: 'https://coverartarchive.org/release/' + r.id + '/front-250',
        source: 'MusicBrainz',
        url: 'https://musicbrainz.org/release/' + r.id,
      }))
    );
  }
  async function enrich(track, force) {
    const fixed = repairTrackMetadata({ ...track }),
      identity = require('./track-identity.js').derive(fixed),
      lookup = { ...fixed, title: identity.title, artist: identity.artist, album: identity.album };
    if (fixed.metadataManual || identity.derivative) return fixed;
    if (!force && !genericAlbum(fixed.album) && !generic(fixed.artist)) return fixed;
    const key = crypto
        .createHash('sha256')
        .update(JSON.stringify([fixed.title, fixed.artist, fixed.duration, fixed.cover]))
        .digest('hex'),
      file = path.join(dir, key + '.json');
    try {
      const cached = JSON.parse(await fs.readFile(file, 'utf8'));
      if (
        (cached.patch || !force) &&
        Date.now() - cached.time < (cached.patch ? 7 * 86400000 : 86400000)
      )
        return { ...fixed, ...cached.patch };
    } catch {}
    let candidates = [];
    try {
      candidates = await itunes(lookup);
    } catch {}
    const accurate = () =>
      candidates.filter(
        (c) =>
          c.artist &&
          c.album &&
          norm(c.title) === norm(lookup.title) &&
          Math.abs(c.duration - fixed.duration) <= 3
      );
    if (!accurate().length && fixed.cover && !generic(fixed.artist))
      try {
        candidates.push(...(await itunes(lookup, true)));
      } catch {}
    if (!accurate().length)
      try {
        candidates.push(...(await musicbrainz(lookup, !!fixed.cover)));
      } catch {}
    const shortlist = accurate().slice(0, 5);
    const originalHash = await hash(fixed.cover);
    if (originalHash)
      await Promise.allSettled(
        shortlist.map(async (c) => {
          c.coverDistance = distance(originalHash, await hash(c.cover));
        })
      );
    const selected = chooseMetadata(lookup, accurate());
    let patch = null;
    if (selected) {
      patch = {
        title: selected.title,
        artist: selected.artist,
        albumartist: selected.artist,
        album: selected.album,
        metadataSource: selected.source,
        metadataSourceUrl: selected.url,
        metadataCoverMatched: selected.coverDistance <= 8,
      };
    }
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify({ time: Date.now(), patch }));
    return { ...fixed, ...patch };
  }
  function resolve(track, { force = false } = {}) {
    const key = JSON.stringify([
      force,
      track.scId,
      track.title,
      track.artist,
      track.duration,
      track.cover,
    ]);
    if (pending.has(key)) return pending.get(key);
    const job = tail
      .catch(() => {})
      .then(async () => {
        const wait = lastRequest + 1100 - Date.now();
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastRequest = Date.now();
        return enrich(track, force);
      })
      .finally(() => pending.delete(key));
    tail = job;
    pending.set(key, job);
    return job;
  }
  return { resolve };
};
module.exports.chooseMetadata = chooseMetadata;
module.exports.distance = distance;
module.exports.imageHash = imageHash;
