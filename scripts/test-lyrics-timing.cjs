const assert = require('node:assert/strict');
const { parseLumenLyrics: parse } = require('../app/lyrics-timing.js');

let r = parse('[00:01.00]<00:01.00>Первое <00:02.00>слово\n[00:04.00]Следующая строка');
assert.equal(r.length, 2);
assert.deepEqual(
  r[0].words.map((w) => [w.time, w.text]),
  [
    [1, 'Первое '],
    [2, 'слово'],
  ]
);

// Положительный [offset:] показывает текст раньше, отрицательный — позже.
assert.equal(parse('[offset:+500]\n[00:10.00]Строка')[0].time, 9.5);
assert.equal(parse('[offset:-250]\n[00:10.00]Строка')[0].time, 10.25);

// Сотые через двоеточие.
assert.equal(parse('[01:02:50]Строка')[0].time, 62.5);

// Пустая метка в конце — конец последнего слова.
r = parse('[00:05.00]<00:05.00>Раз <00:06.00>два<00:07.20>\n[00:20.00]Дальше');
assert.equal(r[0].words.length, 2);
assert.equal(r[0].words[1].end, 7.2);
assert.equal(r[0].text, 'Раз два');

// Повтор строки с несколькими метками сдвигает и слова, и их концы.
r = parse('[00:01.00][00:11.00]<00:01.00>Припев<00:02.00>');
assert.equal(r[1].words[0].time, 11);
assert.equal(r[1].words[0].end, 12);

// Текст без времени остаётся как есть.
r = parse('просто текст\nбез времени');
assert.deepEqual(
  r.map((l) => l.time),
  [null, null]
);

console.log('LRC parsing: offset sign, mm:ss:cc stamps, word end marks and repeats passed');
