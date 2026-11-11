import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundcloudUrl, coverUrl, readState, mergeTrack } from '../public/core.js';
import { createSoundCloud } from '../worker/index.js';
assert.equal(
  soundcloudUrl('https://m.soundcloud.com/artist/song?si=tracking'),
  'https://soundcloud.com/artist/song'
);
for (const bad of [
  'https://example.com/a/b',
  'https://soundcloud.com.evil.test/a/b',
  'http://soundcloud.com/a/b',
  'https://user:pass@soundcloud.com/a/b',
  'https://soundcloud.com/artist',
])
  assert.throws(() => soundcloudUrl(bad));
const tracks = [];
for (let i = 0; i < 17; i++)
  mergeTrack(tracks, {
    url: `https://soundcloud.com/artist/song-${i}`,
    title: 'Song ' + i,
    liked: true,
  });
mergeTrack(tracks, { url: tracks[0].url, title: 'Updated' });
assert.equal(tracks.length, 17);
assert.equal(tracks[0].liked, true);
assert.equal(readState(JSON.stringify({ tracks })).tracks.filter((t) => t.liked).length, 17);
const raw = (i, artist = 'Related ' + (i % 9)) => ({
  id: i,
  kind: 'track',
  title: 'Song ' + i,
  streamable: true,
  permalink_url: `https://soundcloud.com/owner-${i}/song-${i}`,
  user: { username: artist },
  artwork_url: 'https://i1.sndcdn.com/artworks-test-large.jpg',
});
const sc = createSoundCloud(async (url) => {
  const u = new URL(url);
  if (u.hostname === 'soundcloud.com' && u.pathname === '/')
    return new Response('<script src="https://a-v2.sndcdn.com/assets/app.js"></script>');
  if (u.hostname === 'a-v2.sndcdn.com') return new Response('client_id:"' + 'a'.repeat(32) + '"');
  if (u.pathname === '/search/tracks') {
    const q = u.searchParams.get('q');
    return Response.json({
      collection: Array.from({ length: 50 }, (_, i) =>
        raw(i + 1, q === 'Seed' ? 'Seed' : undefined)
      ),
    });
  }
  if (/^\/tracks\/\d+\/related$/.test(u.pathname))
    return Response.json({
      collection: [raw(99, 'Seed'), ...Array.from({ length: 50 }, (_, i) => raw(i + 100))],
    });
  if (u.pathname === '/resolve') return Response.json(raw(42));
  throw Error('Unexpected mock URL ' + u.href);
});
const found = await sc.search('Seed');
assert.equal(found.length, 50);
const first = await sc.wave({ query: 'Seed', mode: 'artist' });
assert.ok(first.tracks.length > 0);
assert.ok(first.tracks.every((t) => t.artist !== 'Seed'));
const second = await sc.wave({ ...first.station, currentId: first.tracks[0].id });
assert.ok(second.tracks.every((t) => !first.tracks.some((old) => old.id === t.id)));
const random = await sc.random([]);
assert.equal(random.length, 6);
assert.equal(new Set(random.map((t) => t.id)).size, 6);
assert.ok(
  (await sc.random(random.map((t) => t.id))).every((t) => !random.some((old) => old.id === t.id))
);
const built = await import('../dist/server/index.js?test=' + Date.now());
for (const url of [
  'https://pwa.test/',
  'https://pwa.test/sw.js',
  'https://pwa.test/manifest.webmanifest',
  'https://pwa.test/assets/icon.png',
])
  assert.equal((await built.default.fetch(new Request(url))).status, 200);
assert.equal(
  (
    await built.default.fetch(
      new Request('https://pwa.test/api/search', {
        method: 'POST',
        headers: { Origin: 'https://evil.test' },
        body: '{}',
      })
    )
  ).status,
  403
);
assert.equal(
  (
    await built.default.fetch(
      new Request('https://pwa.test/api/search', { method: 'POST', body: '{bad' })
    )
  ).status,
  400
);
for (const name of [
  'index.html',
  'style.css',
  'core.js',
  'app.js',
  'manifest.webmanifest',
  'assets/brand.svg',
  'assets/icon.png',
  'assets/statue.png',
])
  assert.ok(fs.existsSync('public/' + name));
console.log(
  'PASS: URL validation, 17 favorites across restore, deduplication, search, random, wave diversity/no repeats, packaged routes and request validation'
);

assert.equal(
  coverUrl('https://i1.sndcdn.com/artworks-test-large.jpg'),
  'https://i1.sndcdn.com/artworks-test-t500x500.jpg'
);
assert.equal(coverUrl('https://evil.test/picture.jpg'), '');
const streaming = createSoundCloud(async (value) => {
  const u = new URL(value);
  if (u.hostname === 'soundcloud.com') return new Response('client_id:"' + 'a'.repeat(32) + '"');
  if (u.pathname === '/resolve')
    return Response.json({
      ...raw(42),
      track_authorization: 'authorized',
      media: {
        transcodings: [
          {
            url: 'https://api-v2.soundcloud.com/media/42',
            format: { protocol: 'hls', mime_type: 'audio/mpeg' },
          },
        ],
      },
    });
  if (u.pathname === '/media/42') {
    assert.equal(u.searchParams.get('track_authorization'), 'authorized');
    return Response.json({ url: 'https://playback.media-streaming.soundcloud.cloud/test.m3u8' });
  }
  throw Error('Unexpected URL');
});
assert.equal(
  await streaming.stream('https://soundcloud.com/forss/flickermood'),
  'https://playback.media-streaming.soundcloud.cloud/test.m3u8'
);
await assert.rejects(() => streaming.stream('https://evil.test/song'));
console.log('PASS: high-resolution artwork and authorized mobile HLS resolution');
