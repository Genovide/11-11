(function (root) {
  // [мм:сс.сс] — обычный вид; [мм:сс:сс] — сотые через двоеточие, так пишут некоторые редакторы
  // LRC. Часы в LRC не используются, поэтому три части всегда означают минуты, секунды и доли.
  const stamp = (s) => {
    const a = s.split(':');
    if (a.length === 3) return Number(a[0]) * 60 + Number(a[1]) + Number('0.' + a[2]);
    return Number(a[0]) * 60 + Number(a[1]);
  };
  const TIME = String.raw`\d+:\d+(?:[.:]\d+)?`;
  function parseLumenLyrics(raw) {
    // По спецификации LRC положительный [offset:] показывает текст раньше, отрицательный — позже.
    const offset = -Number(/\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw)?.[1] || 0) / 1000,
      lines = [];
    for (const row of raw.split(/\r?\n/)) {
      const times = [...row.matchAll(new RegExp(String.raw`\[(${TIME})\]`, 'g'))].map((m) =>
        stamp(m[1])
      );
      const body = row.replace(/\[[^\]]*\]/g, '');
      const wordMarks = [...body.matchAll(new RegExp(String.raw`<(${TIME})>([^<]*)`, 'g'))];
      const text = body.replace(new RegExp(String.raw`<${TIME}>`, 'g'), '').trim();
      if (!times.length) {
        if (text) lines.push({ time: null, text, words: [] });
        continue;
      }
      for (const time of times) {
        const shift = time - times[0],
          words = [];
        for (const m of wordMarks) {
          const at = Math.max(0, stamp(m[1]) + shift + offset);
          // Метка без текста после последнего слова (Enhanced LRC) — это конец предыдущего слова.
          if (!m[2].trim()) {
            const last = words.at(-1);
            if (last && at > last.time && last.end === undefined) last.end = at;
            if (m[2].length && last) last.text += m[2];
            continue;
          }
          words.push({ time: at, text: m[2] });
        }
        lines.push({ time: Math.max(0, time + offset), text, words });
      }
    }
    return lines.some((l) => l.time !== null)
      ? lines.filter((l) => l.time !== null).sort((a, b) => a.time - b.time)
      : lines;
  }
  root.parseLumenLyrics = parseLumenLyrics;
})(typeof module === 'object' ? module.exports : globalThis);
