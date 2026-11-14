const assert = require('node:assert/strict');
const { fromPixels, fallback } = require('../app/cover-palette.js');
const pixels = (color, count) => Array.from({ length: count }, () => [...color, 255]).flat();
assert.deepEqual(fromPixels([]), fallback);
assert.deepEqual(fromPixels([255, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255]), fallback);
const blue = fromPixels([
  ...pixels([30, 90, 170], 100),
  ...pixels([190, 40, 55], 15),
  ...pixels([255, 255, 255], 200),
]);
assert.deepEqual(
  blue[0],
  [30, 90, 170],
  'Predominant cover colour beats white margins and smaller accents'
);
assert.ok(
  blue.some((c) => c[0] > 150 && c[1] < 60),
  'Keep a distinct secondary accent'
);
const gray = fromPixels(pixels([115, 115, 115], 50));
assert.ok(
  gray.every((c) => c[0] === c[1] && c[1] === c[2]),
  'A grayscale cover stays neutral'
);
const copy = fromPixels([]);
copy[0][0] = 0;
assert.notDeepEqual(copy, fallback, 'Do not mutate the shared fallback');
console.log('Cover colour extraction, transparency, neutral fallback and grayscale covers passed');
