(function (root) {
  const normalized = (text) =>
    text
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}]/gu, '');
  function restoreAlignmentLines(alignment, raw) {
    const original = alignment?.lines || [];
    if (alignment?.manual || !original.length || !raw?.trim()) return original;
    const source = root.parseLumenLyrics(raw).filter((l) => l.text.trim());
    const words = original.flatMap((l) => l.words || []);
    if (!words.length || !source.length) return original;
    if (
      source.map((l) => normalized(l.text)).join('') !==
      words.map((w) => normalized(w.text)).join('')
    )
      return original;
    let cursor = 0,
      index = 0;
    const groups = source.map((l) => {
      cursor += normalized(l.text).length;
      return { ...l, words: [], boundary: cursor };
    });
    cursor = 0;
    for (const word of words) {
      while (index < groups.length - 1 && cursor >= groups[index].boundary) index++;
      groups[index].words.push({ ...word });
      cursor += normalized(word.text).length;
    }
    return groups
      .filter((l) => l.words.length)
      .map(({ boundary, ...l }) => ({ ...l, time: l.words[0].time, end: l.words.at(-1).end }));
  }
  root.restoreAlignmentLines = restoreAlignmentLines;
})(
  typeof module === 'object'
    ? Object.assign(module.exports, require('./lyrics-timing.js'))
    : globalThis
);
