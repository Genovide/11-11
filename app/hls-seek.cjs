// Trim ordinary VOD playlists at a segment boundary. Unsupported layouts fall back.
function trimHlsPlaylist(text, base, start, validate) {
  if (
    !text.startsWith('#EXTM3U') ||
    !text.includes('#EXT-X-ENDLIST') ||
    /#EXT-X-(?:STREAM-INF|BYTERANGE|DISCONTINUITY|KEY):?/.test(text)
  )
    return null;
  const lines = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    header = [],
    segments = [];
  let block = [],
    duration = null;
  for (const line of lines) {
    if (line === '#EXT-X-ENDLIST') continue;
    if (line.startsWith('#EXTINF:')) {
      duration = Number(line.slice(8).split(',')[0]);
      if (!(duration > 0)) return null;
      block.push(line);
    } else if (!line.startsWith('#')) {
      if (duration === null) return null;
      let url;
      try {
        url = validate(new URL(line, base).href);
      } catch {
        return null;
      }
      block.push(url);
      segments.push({ duration, block });
      block = [];
      duration = null;
    } else if (duration !== null) block.push(line);
    else if (!segments.length) {
      if (line.startsWith('#EXT-X-MAP:')) {
        const match = /URI="([^"]+)"/.exec(line);
        if (!match || line.includes('BYTERANGE=')) return null;
        let url;
        try {
          url = validate(new URL(match[1], base).href);
        } catch {
          return null;
        }
        header.push(line.replace(match[1], url));
      } else header.push(line);
    } else if (line.startsWith('#EXT-X-')) return null;
  }
  if (!segments.length) return null;
  let index = 0,
    skipped = 0;
  while (index < segments.length - 1 && skipped + segments[index].duration <= start) {
    skipped += segments[index++].duration;
  }
  const sequence =
    Number(header.find((s) => s.startsWith('#EXT-X-MEDIA-SEQUENCE:'))?.split(':')[1]) || 0;
  const clean = header.filter(
    (s) => !s.startsWith('#EXT-X-MEDIA-SEQUENCE:') && !s.startsWith('#EXT-X-START:')
  );
  clean.push('#EXT-X-MEDIA-SEQUENCE:' + (sequence + index));
  return {
    playlist: [
      ...clean,
      ...segments.slice(index).flatMap((s) => s.block),
      '#EXT-X-ENDLIST',
      '',
    ].join('\n'),
    offset: Math.max(0, start - skipped),
    skipped,
    index,
  };
}
module.exports = { trimHlsPlaylist };
