/* Soft language preference: Latin titles are neutral, country is not language. */
const { artistKey, identity } = require('./wave-selection.cjs');
const crypto = require('node:crypto');
const cyrillic = /[а-яё]/i,
  foreignScript =
    /[\p{Script=Arabic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}đăơư\u1ea0-\u1ef9]/u;
const russianTerms =
  /(?:\brussian\b|\brusskiy\b|русск(?:ий|ая|ое|ие|оязыч)|на русском|русский рэп)/i;
const foreignTerms =
  /(?:\b(?:vietnamese|vpop|v-pop|mandopop|cantopop|chinese vocals|arabic vocals|k-pop|korean vocals|j-pop|japanese vocals|english vocals|english song|ukrainian)\b|tiếng việt|українськ)/i;
const clean = (value) => (Array.isArray(value) ? value.join(' ') : String(value || ''));
function evidence(track, knownArtists = new Set()) {
  const meta = [track.genre, track.tags, track.description].map(clean).join(' ').slice(0, 6000);
  const title = clean(track.originalTitle || track.title),
    artist = clean(track.publisherArtist || track.artist);
  const language = clean(track.language || track.spokenLanguage)
    .trim()
    .toLowerCase();
  let score = 0;
  if (/^(ru|rus|russian|русский)(?:[-_]|$)/i.test(language)) score += 12;
  else if (/^(en|eng|ar|ara|zh|zho|chi|ja|jpn|ko|kor|vi|vie|uk|ukr)(?:[-_]|$)/i.test(language))
    score -= 10;
  if (russianTerms.test(meta)) score += 7;
  if (foreignTerms.test(meta)) score -= 9;
  if (cyrillic.test(title)) score += 3;
  if (cyrillic.test(artist)) score += 2;
  const lyrics = clean(track.lyrics)
      .replace(/\[[^\]]*\]|<[^>]*>/g, '')
      .slice(0, 3000),
    letters = lyrics.match(/\p{L}/gu) || [],
    russian = lyrics.match(/[а-яё]/gi) || [];
  if (letters.length > 30 && russian.length / letters.length > 0.65) score += 8;
  if (knownArtists.has(artistKey(artist))) score += 7;
  if (foreignScript.test(title + ' ' + artist)) score -= 8;
  return score;
}
function profile(library, favorites = [], history = [], favoriteIds = []) {
  const liked = new Set(favoriteIds),
    knownArtists = new Set(),
    seeds = new Map();
  for (const track of [...favorites, ...history, ...library]) {
    const key = artistKey(track.publisherArtist || track.artist);
    if (
      !key ||
      ['soundcloud', 'unknown', 'неизвестныйисполнитель'].includes(key) ||
      evidence(track) < 3
    )
      continue;
    knownArtists.add(key);
    const weight =
      (favorites.includes(track) || liked.has(track.id) ? 4 : 0) +
      (history.includes(track) ? 1 : 0);
    const old = seeds.get(key);
    if (!old || weight > old.weight || (!old.track.scId && track.scId))
      seeds.set(key, { track, weight });
  }
  return { knownArtists, seeds: [...seeds.values()] };
}
function ranked(
  items,
  taste,
  { relatedIds = new Set(), random = () => crypto.randomInt(1000000) / 1000000 } = {}
) {
  return items
    .map((t) => ({ t, score: evidence(t, taste.knownArtists), order: random() }))
    .sort(
      (a, b) =>
        b.score * 3 +
        (relatedIds.has(b.t.id) ? 2 : 0) +
        b.order * 5 -
        (a.score * 3 + (relatedIds.has(a.t.id) ? 2 : 0) + a.order * 5)
    );
}
function select(
  items,
  taste,
  { limit = 6, exclude = new Set(), relatedIds = new Set(), random } = {}
) {
  const unique = new Map();
  for (const t of items)
    if (t && !t.playbackUnavailable && !exclude.has(t.id) && !unique.has(identity(t)))
      unique.set(identity(t), t);
  const ordered = ranked([...unique.values()], taste, { relatedIds, random }),
    chosen = [],
    seen = new Set(),
    artists = new Map();
  function add(entry) {
    const key = artistKey(entry.t.artist);
    if (seen.has(entry.t.id) || (artists.get(key) || 0) >= 2) return false;
    chosen.push(entry.t);
    seen.add(entry.t.id);
    artists.set(key, (artists.get(key) || 0) + 1);
    return true;
  }
  // Leave a place for discovery instead of filling the whole list with familiar artists.
  for (const entry of ordered.filter((e) => e.score >= 3)) {
    if (chosen.length >= limit - 1) break;
    add(entry);
  }
  const unfamiliar = ordered.filter(
    (e) => e.score >= 0 && !taste.knownArtists.has(artistKey(e.t.artist)) && !seen.has(e.t.id)
  );
  if (chosen.length && unfamiliar.length) add(unfamiliar[0]);
  for (const entry of ordered.filter((e) => e.score >= 0)) {
    if (chosen.length >= limit) break;
    add(entry);
  }
  // In a sparse pool allow at most one likely other-language recording, never six.
  if (chosen.length < limit) {
    const entry = ordered.find((e) => e.score < 0 && !seen.has(e.t.id));
    if (entry) add(entry);
  }
  return chosen.slice(0, limit);
}
function createDiscovery({
  getLibrary,
  getFavorites,
  getHistory,
  getFavoriteIds = async () => [],
  search,
  related,
  discover,
  isExcluded = () => false,
}) {
  const recentSeeds = [];
  let iteration = 0;
  async function taste() {
    return profile(getLibrary().tracks || [], getFavorites(), getHistory(), await getFavoriteIds());
  }
  async function random(excluded = []) {
    const pref = await taste(),
      skip = new Set(excluded),
      relationIds = new Set();
    const seeds = pref.seeds
      .map((s) => ({
        ...s,
        rank:
          s.weight +
          crypto.randomInt(10) -
          (recentSeeds.includes(artistKey(s.track.artist)) ? 12 : 0),
      }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 2);
    const linked = Promise.allSettled(
      seeds.map(async ({ track }) => {
        let anchor = track;
        if (track.soundcloudId && !track.scId)
          anchor = { ...track, id: 'sc-' + track.soundcloudId, scId: String(track.soundcloudId) };
        if (!anchor.scId) {
          const matches = await search({ mode: 'artist', query: track.artist });
          anchor = matches.find(
            (t) => artistKey(t.publisherArtist || t.artist) === artistKey(track.artist)
          );
        }
        if (!anchor) return [];
        recentSeeds.push(artistKey(track.artist));
        while (recentSeeds.length > 12) recentSeeds.shift();
        const list = await related(anchor);
        for (const t of list) relationIds.add(t.id);
        return list;
      })
    );
    const genres = ['rap', 'rock', 'pop', 'electronic', 'phonk', 'alternative rock'];
    const russianQueries = [
      'русский рэп',
      'russian rock',
      'русская музыка',
      'russian pop',
      'русский инди',
    ];
    const number = iteration++;
    const sources = await Promise.allSettled([
      linked,
      search({ mode: 'artist', query: russianQueries[number % russianQueries.length] }),
      discover(
        { mode: 'genre', query: genres[crypto.randomInt(genres.length)] },
        crypto.randomInt(4) * 50
      ),
    ]);
    let pool = sources
      .flatMap((r, i) =>
        r.status === 'fulfilled'
          ? i === 0
            ? r.value.flatMap((x) => (x.status === 'fulfilled' ? x.value : []))
            : r.value
          : []
      )
      .filter((t) => !isExcluded(t));
    let chosen = select(pool, pref, { exclude: skip, relatedIds: relationIds });
    if (chosen.length < 4) {
      const extra = await search({
        mode: 'artist',
        query: russianQueries[(number + 1) % russianQueries.length],
      }).catch(() => []);
      pool.push(...extra.filter((t) => !isExcluded(t)));
      chosen = select(pool, pref, { exclude: skip, relatedIds: relationIds });
    }
    if (!chosen.length) {
      const failure = sources.find((r) => r.status === 'rejected');
      throw (
        failure?.reason || Error('Не удалось подобрать новые треки. Попробуй обновить подборку.')
      );
    }
    return chosen;
  }
  return { random, taste, order: async (items) => ranked(items, await taste()).map((e) => e.t) };
}
module.exports = { evidence, profile, select, createDiscovery };
