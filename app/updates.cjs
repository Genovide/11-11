const fs = require('node:fs'),
  fsp = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { spawn } = require('node:child_process');
const REPO = 'Genovide/SoundSync';
function newer(a, b) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  if (!/^v?\d+\.\d+\.\d+$/.test(a)) return false;
  const x = parse(a),
    y = parse(b);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}
// Имя архива апдейта для этой системы, как его собирает scripts/build-upgrades.mjs.
function assetName(version, platform = process.platform, arch = process.arch) {
  const v = String(version).replace(/^v/, '');
  if (platform === 'win32' && arch === 'x64') return `SoundSync-${v}-Update-Windows-x64.zip`;
  if (platform === 'darwin' && arch === 'arm64') return `SoundSync-${v}-Update-macOS-arm64.zip`;
  return '';
}
function checksumFor(sums, name) {
  for (const line of String(sums).split(/\r?\n/)) {
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (m && m[2] === name) return m[1].toLowerCase();
  }
  return '';
}
// Скачиваем только с GitHub. Для проверки на CI фид можно направить на локальный сервер
// (SOUNDSYNC_UPDATE_FEED=http://127.0.0.1:…), тогда разрешён и он.
const trustedDownload = (url) => {
  const u = new URL(url),
    local = /^http:\/\/127\.0\.0\.1:\d+\//.test(process.env.SOUNDSYNC_UPDATE_FEED || '');
  if (local && u.protocol === 'http:' && u.hostname === '127.0.0.1') return true;
  return (
    u.protocol === 'https:' &&
    (u.hostname === 'github.com' || u.hostname.endsWith('.githubusercontent.com'))
  );
};

module.exports = function ({ app, ipcMain, shell, version, getWindow, fetchImpl = fetch }) {
  // Версия берётся из app/package.json, чтобы не забыть поправить её при релизе.
  const VERSION = version;
  const feed =
    process.env.SOUNDSYNC_UPDATE_FEED || `https://api.github.com/repos/${REPO}/releases/latest`;
  const stateDir = () => path.join(app.getPath('userData'), 'updates');
  let release = null,
    downloaded = null,
    downloading = null;
  const fromRenderer = (event) => event.sender === getWindow()?.webContents;
  // Самообновление возможно только у собранного приложения на поддерживаемой системе.
  const canInstall = () =>
    (app.isPackaged || process.env.SOUNDSYNC_SELF_UPDATE_TEST === '1') && !!assetName('0.0.0');

  ipcMain.handle('updates-check', async () => {
    const response = await fetchImpl(feed, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'SoundSync-player' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) return { version: VERSION, available: false, unpublished: true };
    if (!response.ok) throw Error('Не удалось проверить обновления (HTTP ' + response.status + ')');
    const r = await response.json();
    release = r;
    const available = newer(r.tag_name, VERSION),
      name = assetName(r.tag_name),
      hasAsset = !!(r.assets || []).find((a) => a.name === name);
    return {
      version: VERSION,
      latest: r.tag_name,
      available,
      unpublished: false,
      canInstall: available && canInstall() && hasAsset,
      ready: !!downloaded && downloaded.version === r.tag_name,
    };
  });
  ipcMain.handle('updates-open', () =>
    shell.openExternal(`https://github.com/${REPO}/releases/latest`)
  );

  async function download() {
    if (!release) throw Error('Сначала проверь обновления');
    const tag = release.tag_name,
      name = assetName(tag),
      asset = (release.assets || []).find((a) => a.name === name),
      sums = (release.assets || []).find((a) => a.name === 'SHA256SUMS.txt');
    if (!asset || !sums) throw Error('В релизе нет архива для этой системы');
    if (!trustedDownload(asset.browser_download_url) || !trustedDownload(sums.browser_download_url))
      throw Error('Недоверенный адрес загрузки');
    const sumsText = await (
      await fetchImpl(sums.browser_download_url, { signal: AbortSignal.timeout(30000) })
    ).text();
    const expected = checksumFor(sumsText, name);
    if (!expected) throw Error('Нет контрольной суммы для архива');
    const dir = path.join(stateDir(), tag.replace(/[^\w.-]/g, ''));
    await fsp.mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    const response = await fetchImpl(asset.browser_download_url, {
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!response.ok || !response.body)
      throw Error('Загрузка не удалась (HTTP ' + response.status + ')');
    const total = Number(response.headers.get('content-length')) || asset.size || 0,
      hash = crypto.createHash('sha256'),
      tmp = file + '.part',
      out = fs.createWriteStream(tmp);
    let received = 0,
      lastSent = 0;
    try {
      for await (const chunk of response.body) {
        hash.update(chunk);
        received += chunk.length;
        if (!out.write(chunk)) await new Promise((r) => out.once('drain', r));
        const now = Date.now();
        if (now - lastSent > 120) {
          lastSent = now;
          getWindow()?.webContents.send('updates-progress', { received, total });
        }
      }
      await new Promise((resolve, reject) => out.end((e) => (e ? reject(e) : resolve())));
    } catch (e) {
      out.destroy();
      await fsp.rm(tmp, { force: true });
      throw e;
    }
    if (hash.digest('hex') !== expected) {
      await fsp.rm(tmp, { force: true });
      throw Error('Архив повреждён: контрольная сумма не совпала');
    }
    await fsp.rename(tmp, file);
    getWindow()?.webContents.send('updates-progress', { received: total || received, total });
    downloaded = { version: tag, file };
    return { ready: true, version: tag };
  }
  ipcMain.handle('updates-download', (event) => {
    if (!fromRenderer(event)) throw Error('Unknown window');
    if (!canInstall()) throw Error('Самообновление недоступно в этой сборке');
    downloading ||= download().finally(() => (downloading = null));
    return downloading;
  });

  // Передатчик копируется в папку обновлений: установщик заменит папку приложения целиком.
  async function launchInstaller() {
    const dir = stateDir(),
      state = path.join(dir, 'state');
    await fsp.mkdir(state, { recursive: true });
    await fsp.rm(path.join(state, 'result.json'), { force: true });
    if (process.platform === 'darwin') {
      const script = path.join(dir, 'install-mac.sh');
      await fsp.copyFile(path.join(__dirname, 'self-update', 'install-mac.sh'), script);
      const appBundle = path.resolve(process.execPath, '..', '..', '..');
      const child = spawn(
        '/bin/bash',
        [script, String(process.pid), downloaded.file, appBundle, state, downloaded.version],
        { detached: true, stdio: 'ignore' }
      );
      child.unref();
    } else {
      const script = path.join(dir, 'install-windows.ps1');
      await fsp.copyFile(path.join(__dirname, 'self-update', 'install-windows.ps1'), script);
      const root = path.dirname(process.execPath);
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-WindowStyle',
          'Hidden',
          '-File',
          script,
          '-ProcessId',
          String(process.pid),
          '-Zip',
          downloaded.file,
          '-Root',
          root,
          '-State',
          state,
          '-Version',
          downloaded.version,
        ],
        { detached: true, stdio: 'ignore', windowsHide: true }
      );
      child.unref();
    }
  }
  ipcMain.handle('updates-install', async (event) => {
    if (!fromRenderer(event)) throw Error('Unknown window');
    if (!downloaded) throw Error('Сначала скачай обновление');
    const { dialog } = require('electron');
    // В сквозном тесте (SOUNDSYNC_SELF_UPDATE_TEST=1) окно подтверждения пропускается.
    const choice =
      process.env.SOUNDSYNC_SELF_UPDATE_TEST === '1'
        ? { response: 1 }
        : await dialog.showMessageBox(getWindow(), {
            type: 'info',
            buttons: ['Отмена', 'Установить и перезапустить'],
            defaultId: 1,
            cancelId: 0,
            title: 'Обновление SoundSync',
            message: `Установить SoundSync ${downloaded.version.replace(/^v/, '')}?`,
            detail:
              'SoundSync закроется, установит обновление и откроется снова — обычно это занимает меньше минуты. Музыка, медиатека и настройки сохранятся.',
          });
    if (choice.response !== 1) return { started: false };
    await launchInstaller();
    setTimeout(() => app.quit(), 150);
    return { started: true };
  });

  // Итог прошлой установки: передатчик пишет его, плеер показывает при следующем запуске.
  ipcMain.handle('updates-last-result', async (event) => {
    if (!fromRenderer(event)) return null;
    const file = path.join(stateDir(), 'state', 'result.json');
    try {
      const result = JSON.parse(await fsp.readFile(file, 'utf8'));
      await fsp.rm(file, { force: true });
      // Удаляем скачанные архивы версий, которые уже не новее установленной.
      for (const entry of await fsp.readdir(stateDir(), { withFileTypes: true }))
        if (
          entry.isDirectory() &&
          /^v?\d+\.\d+\.\d+$/.test(entry.name) &&
          !newer(entry.name, VERSION)
        )
          await fsp.rm(path.join(stateDir(), entry.name), { recursive: true, force: true });
      return {
        ok: result.ok === true,
        version: String(result.version || ''),
        current: VERSION,
        log: String(result.log || ''),
      };
    } catch {
      return null;
    }
  });
  ipcMain.handle('updates-show-log', (event, file) => {
    if (!fromRenderer(event) || typeof file !== 'string') return;
    const resolved = path.resolve(file);
    if (resolved.startsWith(path.resolve(stateDir()) + path.sep)) shell.showItemInFolder(resolved);
  });
};
module.exports.newer = newer;
module.exports.assetName = assetName;
module.exports.checksumFor = checksumFor;
