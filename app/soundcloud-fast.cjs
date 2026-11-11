// Public metadata fast path. The existing extractor remains the fallback.
const fs = require('node:fs/promises'),
  path = require('node:path');
module.exports = function ({ dir, fetchImpl = fetch, mapTrack }) {
  const raw = new Map(),
    cache = new Map(),
    pending = new Map();
  let client = '',
    rejectedClient = '',
    clientJob;
  const remember = (t) => {
    if (t?.id) raw.set(String(t.id), t);
    while (raw.size > 1200) raw.delete(raw.keys().next().value);
    return mapTrack(t);
  };
  function memo(key, ttl, run) {
    const old = cache.get(key);
    if (old?.until > Date.now()) return Promise.resolve(old.value);
    if (pending.has(key)) return pending.get(key);
    const job = Promise.resolve()
      .then(run)
      .then((value) => {
        cache.set(key, { value, until: Date.now() + ttl });
        while (cache.size > 150) cache.delete(cache.keys().next().value);
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, job);
    return job;
  }
  async function response(url) {
    const r = await fetchImpl(url, {
      signal: AbortSignal.timeout(7000),
      headers: { Accept: 'application/json, text/html;q=0.9' },
    });
    if (!r.ok) {
      const e = Error('SoundCloud HTTP ' + r.status);
      e.status = r.status;
      throw e;
    }
    return r;
  }
  async function clientId() {
    if (client) return client;
    if (clientJob) return clientJob;
    clientJob = (async () => {
      for (const file of [
        path.join(dir, 'public-client.json'),
        path.join(dir, 'yt-dlp/soundcloud/client_id.json'),
      ]) {
        try {
          const d = JSON.parse(await fs.readFile(file, 'utf8')),
            id = d.data || d.id;
          if (id !== rejectedClient && /^[a-zA-Z0-9]{32}$/.test(id)) {
            client = id;
            return id;
          }
        } catch {}
      }
      const html = await (await response('https://soundcloud.com/')).text();
      let found = html.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/)?.[1];
      const assets = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((s) => {
          try {
            return new URL(s).hostname.endsWith('.sndcdn.com');
          } catch {
            return false;
          }
        })
        .reverse();
      for (let i = 0; !found && i < assets.length; i += 3) {
        const scripts = await Promise.allSettled(
          assets.slice(i, i + 3).map(async (url) => (await response(url)).text())
        );
        for (const s of scripts)
          if (s.status === 'fulfilled') {
            found = s.value.match(/client_id\s*:\s*"([a-zA-Z0-9]{32})"/)?.[1];
            if (found) break;
          }
      }
      if (!found) throw Error('Public SoundCloud client unavailable');
      client = found;
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'public-client.json'), JSON.stringify({ id: client }));
      return client;
    })();
    try {
      return await clientJob;
    } finally {
      clientJob = null;
    }
  }
  async function api(endpoint, params = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = new URL(endpoint, 'https://api-v2.soundcloud.com/');
      if (url.origin !== 'https://api-v2.soundcloud.com') throw Error('Unexpected metadata host');
      for (const [key, value] of Object.entries({ ...params, client_id: await clientId() }))
        url.searchParams.set(key, value);
      try {
        return await (await response(url.href)).json();
      } catch (e) {
        if (!attempt && [401, 403].includes(e.status)) {
          rejectedClient = client;
          client = '';
          continue;
        }
        throw e;
      }
    }
  }
  async function search(query, { offset = 0, limit = 25, genre = '' } = {}) {
    return memo(
      'search:' + genre + ':' + limit + ':' + offset + ':' + query.trim().toLowerCase(),
      120000,
      async () => {
        if (query.startsWith('https://')) return [remember(await api('resolve', { url: query }))];
        const data = await api('search/tracks', {
          q: genre ? '' : query,
          limit,
          offset,
          access: 'playable',
          ...(genre ? { 'filter.genre_or_tag': genre } : {}),
        });
        return (data.collection || [])
          .filter((t) => t.kind === 'track' && t.policy !== 'BLOCK' && t.policy !== 'SNIP')
          .map(remember);
      }
    );
  }
  async function details(t) {
    let info = raw.get(String(t.scId));
    if (!info?.media?.transcodings?.length)
      info = await api('tracks/' + encodeURIComponent(t.scId));
    remember(info);
    return info;
  }
  async function related(t) {
    return memo('related:' + t.scId, 120000, async () => {
      const d = await api('tracks/' + encodeURIComponent(t.scId) + '/related', {
        limit: 80,
        access: 'playable',
      });
      return (d.collection || [])
        .filter((t) => t.kind === 'track' && t.policy !== 'BLOCK' && t.policy !== 'SNIP')
        .map(remember);
    });
  }
  async function resolve(t) {
    return memo('stream:' + t.scId, 180000, async () => {
      const info = await details(t);
      const unavailable = require('./soundcloud-availability.cjs').unavailableError(info);
      if (unavailable) throw unavailable;
      if (info.policy === 'BLOCK' || info.policy === 'SNIP') throw Error('Track unavailable');
      const formats = (info.media?.transcodings || []).filter(
        (f) => !f.snipped && !/encrypted|ctr-|cbc-/i.test(f.format?.protocol || '')
      );
      formats.sort((a, b) => score(b) - score(a));
      let last;
      for (const f of formats) {
        try {
          const d = await api(
            f.url,
            info.track_authorization ? { track_authorization: info.track_authorization } : {}
          );
          if (d.url)
            return {
              url: d.url,
              mime: f.format?.mime_type || '',
              protocol: f.format?.protocol,
              mp3: /mpeg|mp3/i.test(f.format?.mime_type || f.preset || ''),
              track: mapTrack(info),
            };
        } catch (e) {
          last = e;
        }
      }
      throw last || Error('No public stream');
    });
  }
  function score(f) {
    return (
      (/mpeg|mp3/i.test(f.format?.mime_type || f.preset || '') ? 10 : 0) +
      (f.format?.protocol === 'progressive' ? 20 : 0)
    );
  }
  return {
    search,
    related,
    resolve,
    lookup: async (id) => remember(await api('tracks/' + encodeURIComponent(id))),
    raw: (id) => raw.get(String(id)),
    clear: () => {
      cache.clear();
    },
  };
};
