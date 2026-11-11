'use strict';
const fs = require('node:fs/promises'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  { spawn } = require('node:child_process');
module.exports = ({ app, ipcMain, getWindow, getLibrary, register }) => {
  const directory = path.join(app.getPath('userData'), 'playback-cache'),
    jobs = new Map(),
    children = new Set();
  let ffmpegJob;
  function run(exe, args) {
    return new Promise((resolve, reject) => {
      const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      children.add(child);
      let output = '',
        error = '';
      child.stdout.on('data', (x) => (output += x));
      child.stderr.on('data', (x) => (error = (error + x).slice(-3000)));
      child.on('error', reject);
      child.on('close', (code) => {
        children.delete(child);
        code === 0
          ? resolve(output.trim())
          : reject(Error(error || 'Не удалось декодировать аудио'));
      });
    });
  }
  function ffmpeg() {
    if (!ffmpegJob)
      ffmpegJob = run(require('./runtime-paths.cjs').python, [
        '-I',
        '-B',
        '-c',
        'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())',
      ]).catch((error) => {
        ffmpegJob = null;
        throw error;
      });
    return ffmpegJob;
  }
  async function prepare(id) {
    const track = getLibrary().tracks.find((t) => t.id === id && !t.remote);
    if (!track) throw Error('Локальный трек не найден');
    const stat = await fs.stat(track.path),
      key = crypto
        .createHash('sha256')
        .update(JSON.stringify([track.path, stat.size, stat.mtimeMs]))
        .digest('hex');
    const file = path.join(directory, key + '.flac');
    if (!jobs.has(key)) {
      const task = (async () => {
        await fs.mkdir(directory, { recursive: true });
        try {
          if ((await fs.stat(file)).size > 0) return file;
        } catch {}
        const temp = path.join(
          directory,
          key + '-' + crypto.randomBytes(6).toString('hex') + '.tmp.flac'
        );
        try {
          await run(await ffmpeg(), [
            '-v',
            'error',
            '-nostdin',
            '-y',
            '-i',
            track.path,
            '-map',
            '0:a:0',
            '-vn',
            '-c:a',
            'flac',
            '-compression_level',
            '0',
            '-f',
            'flac',
            temp,
          ]);
          await fs.rename(temp, file);
          return file;
        } catch (error) {
          await fs.unlink(temp).catch(() => {});
          throw error;
        }
      })();
      jobs.set(key, task);
      task.finally(() => jobs.delete(key)).catch(() => {});
    }
    const prepared = await jobs.get(key);
    register(id + '-decoded', prepared);
    return { url: 'lumen://media/' + id + '-decoded' };
  }
  ipcMain.handle('local-playback-prepare', (event, id) => {
    if (event.sender !== getWindow()?.webContents || typeof id !== 'string')
      throw Error('Invalid playback request');
    return prepare(id);
  });
  app.on('before-quit', () => {
    for (const child of children) child.kill();
  });
};
