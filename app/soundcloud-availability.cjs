const protectedProtocol = (p) => /^(?:ctr-|cbc-)/i.test(p || '');
function availability(track) {
  if (track.policy === 'BLOCK')
    return {
      playbackUnavailable: true,
      playbackCode: 'SC_BLOCKED',
      playbackError:
        'SoundCloud ограничил доступ к этой записи. Попробуй открыть её на сайте SoundCloud.',
    };
  if (track.policy === 'SNIP')
    return {
      playbackUnavailable: true,
      playbackCode: 'SC_PREVIEW',
      playbackError: 'В публичном режиме доступен только фрагмент этой записи.',
    };
  const formats = track.media?.transcodings;
  if (formats?.length && formats.every((f) => f.snipped || protectedProtocol(f.format?.protocol)))
    return {
      playbackUnavailable: true,
      playbackCode: 'SC_PROTECTED',
      playbackError:
        'У этой записи только защищённый поток SoundCloud. Наш публичный режим его не поддерживает. Можно выбрать другую доступную запись.',
    };
  return { playbackUnavailable: false };
}
function unavailableError(track) {
  const info = track.playbackUnavailable ? track : availability(track);
  if (!info.playbackUnavailable) return null;
  const error = Error(info.playbackError);
  error.code = info.playbackCode;
  return error;
}
module.exports = { availability, unavailableError };
