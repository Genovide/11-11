// Decode unsupported local codecs only when Chromium cannot play the original.
(() => {
  const previousError = audio.onerror;
  window.localPlaybackRecovering = new Set();
  audio.onerror = async () => {
    const track = current,
      source = audio.currentSrc || audio.src;
    if (
      !track ||
      track.remote ||
      source.includes('-decoded') ||
      ![3, 4].includes(audio.error?.code)
    ) {
      previousError?.();
      return;
    }
    if (window.localPlaybackRecovering.has(track.id)) return;
    window.localPlaybackRecovering.add(track.id);
    const position = audio.currentTime || 0;
    toast('Подготавливаем совместимое аудио. Оригинал остаётся без изменений.');
    try {
      const prepared = await window.lumen.localPlaybackPrepare(track.id);
      if (current?.id !== track.id || (audio.currentSrc || audio.src) !== source) return;
      audio.addEventListener(
        'loadedmetadata',
        () => {
          if (current?.id !== track.id || !audio.src.includes(track.id + '-decoded')) return;
          if (position > 0)
            audio.currentTime = Math.min(position, Math.max(0, audio.duration - 0.01));
          start();
        },
        { once: true }
      );
      audio.src = prepared.url;
      audio.load();
    } catch (error) {
      if (current?.id === track.id) toast('Не удалось подготовить аудио: ' + cleanError(error));
    } finally {
      window.localPlaybackRecovering.delete(track.id);
    }
  };
})();
