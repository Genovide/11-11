const assert = require('node:assert/strict');
const { TasteModel: M } = require('../app/taste-model.js');

const fav = {
  id: 'sc-1',
  artist: 'MAYOT',
  title: 'A',
  genre: 'Russian Rap',
  tags: 'trap "hip hop"',
};
const played = [
  { id: 'sc-2', artist: 'MAYOT feat. SEEMEE', title: 'B', genre: 'rap' },
  { id: 'local-3', artist: 'Платина', title: 'C', genre: '' },
];
const hated = { id: 'sc-9', artist: 'Polka Band', title: 'D', genre: 'polka' };
const profile = M.buildProfile({ liked: [fav], played, owned: [], disliked: [hated] });

assert.equal(profile.topArtists[0].key, 'mayot');
assert.ok(profile.topGenres.some((g) => g.tag === 'russian rap'));

const sameArtist = M.scoreTrack(
  { id: 'sc-10', artist: 'MAYOT', title: 'New', genre: 'trap' },
  profile
);
const stranger = M.scoreTrack(
  { id: 'sc-11', artist: 'Nobody', title: 'X', genre: 'country' },
  profile
);
const sameGenre = M.scoreTrack(
  { id: 'sc-12', artist: 'Nobody 2', title: 'Y', genre: 'Russian Rap' },
  profile
);
const disliked = M.scoreTrack(
  { id: 'sc-13', artist: 'Polka Band', title: 'Z', genre: 'polka' },
  profile
);

assert.ok(sameArtist.score > 0.6, 'liked artist scores high: ' + sameArtist.score);
assert.ok(stranger.score < 0.3, 'stranger scores low: ' + stranger.score);
assert.ok(sameGenre.score > stranger.score + 0.1, 'shared genre helps');
assert.ok(disliked.score < stranger.score, 'disliked artist below stranger');
assert.equal(M.scoreTrack(fav, profile).score, 0.97);
assert.match(sameArtist.reasons[0], /любишь MAYOT/);

assert.equal(M.tierOf(0.1).id, 'miss');
assert.equal(M.tierOf(0.55).id, 'fits');
assert.equal(M.tierOf(0.9).id, 'yours');

// Чем больше прыжок, тем меньше шанс; шанс в разумных пределах.
const small = M.upgradeChance(0.2, 0.35),
  big = M.upgradeChance(0.2, 0.9);
assert.ok(small > big);
assert.ok(small <= 0.9 && big >= 0.01);
assert.ok(Math.abs(M.upgradeChance(0.2, 0.9) - 0.92 / Math.pow(2, 0.7 * 4)) < 1e-9);

// Бросок: стрелка останавливается на доле оборота, равной броску.
assert.deepEqual(
  M.roll(0.25, () => 0.1),
  { roll: 0.1, win: true, angle: 36 }
);
assert.equal(M.roll(0.25, () => 0.25).win, false);

// Честность: при шансе 30% доля выигрышей около 30%.
let wins = 0;
for (let i = 0; i < 20000; i++) wins += M.roll(0.3).win;
assert.ok(Math.abs(wins / 20000 - 0.3) < 0.02);

console.log('Taste model: profile, scoring, tiers, upgrade chances and fair rolls passed');
