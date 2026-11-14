/* Обновления из самого плеера: проверка → скачивание с прогрессом → установка и перезапуск. */
(() => {
  const button = node('button', 'quiet update-button', 'Проверить обновления');
  button.style.marginTop = '12px';
  document.querySelector('.sidebar-bottom').append(button);
  let state = 'idle',
    info = null,
    failureLog = '';
  const label = (text) => {
    button.textContent = text;
  };
  function setState(next, extra = {}) {
    state = next;
    button.classList.toggle('update-available', ['available', 'ready'].includes(next));
    button.classList.toggle('update-downloading', next === 'downloading');
    button.disabled = next === 'checking' || next === 'downloading' || next === 'installing';
    const version = String(info?.latest || '').replace(/^v/, '');
    if (next === 'idle') label('Проверить обновления');
    if (next === 'checking') label('Проверяем…');
    if (next === 'available')
      label(info.canInstall ? 'Обновить до ' + version : 'Скачать ' + version);
    if (next === 'downloading') label('Скачиваем… ' + (extra.percent ?? 0) + '%');
    if (next === 'ready') label('Установить и перезапустить');
    if (next === 'installing') label('Устанавливаем…');
    if (next === 'log') label('Журнал обновления');
    button.style.setProperty('--progress', (extra.percent ?? 0) + '%');
  }
  async function check(silent = false) {
    setState('checking');
    try {
      info = await window.lumen.updatesCheck();
      if (!info.available) {
        setState('idle');
        if (!silent)
          toast(
            info.unpublished
              ? 'Релиз ещё не опубликован'
              : 'Установлена актуальная версия ' + info.version
          );
        return;
      }
      setState(info.ready ? 'ready' : 'available');
      toast(
        'Доступна версия ' +
          String(info.latest).replace(/^v/, '') +
          (info.canInstall ? ' — нажми «Обновить» внизу слева' : '')
      );
    } catch {
      setState('idle');
      if (!silent) toast('Не удалось проверить обновления. Проверь подключение к интернету.');
    }
  }
  async function download() {
    setState('downloading', { percent: 0 });
    try {
      await window.lumen.updatesDownload();
      setState('ready', { percent: 100 });
      toast('Обновление скачано и проверено. Нажми «Установить и перезапустить».');
    } catch (e) {
      setState('available');
      toast('Не удалось скачать обновление: ' + String(e.message || e).replace(/^.*Error: /, ''));
    }
  }
  async function install() {
    setState('installing');
    try {
      const result = await window.lumen.updatesInstall();
      if (!result.started) setState('ready', { percent: 100 });
    } catch (e) {
      setState('ready', { percent: 100 });
      toast('Не удалось начать установку: ' + String(e.message || e).replace(/^.*Error: /, ''));
    }
  }
  window.lumen.onUpdatesProgress?.(({ received, total }) => {
    if (state !== 'downloading' || !total) return;
    setState('downloading', { percent: Math.min(100, Math.round((received / total) * 100)) });
  });
  button.onclick = () => {
    if (state === 'idle') check(false);
    else if (state === 'available') info.canInstall ? download() : window.lumen.updatesOpen();
    else if (state === 'ready') install();
    else if (state === 'log') {
      window.lumen.updatesShowLog(failureLog);
      setState('idle');
    }
  };
  // Итог прошлой установки и тихая проверка после запуска.
  window.lumen
    .updatesLastResult?.()
    .then((result) => {
      if (!result) return;
      if (result.ok && result.current === String(result.version).replace(/^v/, ''))
        toast('SoundSync обновлён до версии ' + result.current);
      else {
        failureLog = result.log;
        setState('log');
        toast(
          'Обновление не установилось, прежняя версия на месте. Подробности — «Журнал обновления».'
        );
      }
    })
    .catch(() => {});
  setTimeout(() => {
    if (state === 'idle') check(true);
  }, 6000);
})();
