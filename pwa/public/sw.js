const CACHE = 'soundsync-pocket-shell-v3',
  FILES = [
    './',
    './index.html',
    './style.css',
    './core.js',
    './app.js',
    './player.js',
    './vendor/hls.light.min.js',
    './manifest.webmanifest',
    './assets/brand.svg',
    './assets/icon.png',
    './assets/statue.png',
  ];
self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting())
  )
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('soundsync-pocket-shell-') && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
);
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    u.origin !== self.location.origin ||
    u.pathname.includes('/api/')
  )
    return;
  const relative = u.pathname.slice(new URL('./', self.location).pathname.length);
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok) {
            const copy = r.clone();
            caches
              .open(CACHE)
              .then((c) => c.put(new URL('./index.html', self.location).href, copy));
          }
          return r;
        })
        .catch(() => caches.match(new URL('./index.html', self.location).href))
    );
    return;
  }
  if (!FILES.includes('./' + relative)) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
