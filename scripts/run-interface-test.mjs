import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';

const app = process.env.SOUNDSYNC_TEST_APP;
if (!app || !fs.existsSync(app))
  throw Error('Set SOUNDSYNC_TEST_APP to the packaged Electron executable');
fs.mkdirSync('work', { recursive: true });
const profile = fs.mkdtempSync(path.resolve('work/interface-profile-'));
// Synthetic media keeps UI tests independent from any personal library or network service.
function png(color) {
  const crc = (data) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]),
      out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(64);
  header.writeUInt32BE(64, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(64 * (64 * 3 + 1));
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++)
      for (let c = 0; c < 3; c++)
        pixels[y * 193 + 1 + x * 3 + c] = Math.max(0, color[c] - (x < 12 || y < 12 ? 25 : 0));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const rate = 22050,
  samples = rate * 90,
  wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF');
wav.writeUInt32LE(wav.length - 8, 4);
wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(rate, 24);
wav.writeUInt32LE(rate * 2, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++)
  wav.writeInt16LE(Math.round(Math.sin((i / rate) * 220 * Math.PI * 2) * 6000), 44 + i * 2);
const audio = path.join(profile, 'tone.wav');
fs.writeFileSync(audio, wav);
const tracks = [];
for (let i = 0; i < 12; i++) {
  const cover = path.join(profile, 'cover-' + i + '.png');
  fs.writeFileSync(cover, png(i % 2 ? [170, 55, 65] : [35, 100, 170]));
  tracks.push({
    id: 'interface-' + i,
    path: audio,
    title: i ? 'Другой ритм ' + i : 'Ночная сторона',
    artist: 'SoundSync',
    album: 'Цвет музыки',
    albumartist: 'SoundSync',
    duration: 90,
    cover,
    lyrics:
      '[00:00.00]Музыка остаётся с нами\n[00:10.00]Сквозь города и голоса\n[00:20.00]В каждом новом ритме\n[00:30.00]Снова начинается весна',
  });
}
fs.writeFileSync(path.join(profile, 'library.json'), JSON.stringify({ folder: profile, tracks }));
const port = process.env.SOUNDSYNC_TEST_PORT || '9231';
const log = fs.openSync(path.join(profile, 'electron.log'), 'w');
const child = spawn(
  path.resolve(app),
  ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1', '--mute-audio'],
  {
    windowsHide: true,
    env: { ...process.env, SOUNDSYNC_SMOKE_DIR: '', SOUNDSYNC_UI_TEST_DIR: profile },
    stdio: ['ignore', log, log],
  }
);
child.on('error', (error) => console.error(error));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      // Адрес может нести параметры (?nosplash=1 в тестовом режиме), поэтому сравниваем только путь.
      if (pages.some((p) => p.type === 'page' && new URL(p.url).pathname.endsWith('/index.html'))) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw Error('UI fixture did not start; see ' + profile + '/electron.log');
  await new Promise((r) => setTimeout(r, 1000));
  const test = spawn(process.execPath, ['scripts/test-interface.mjs'], {
    env: { ...process.env, SOUNDSYNC_TEST_PORT: port },
    stdio: 'inherit',
    windowsHide: true,
  });
  const timeout = setTimeout(() => test.kill(), 120000);
  const result = await new Promise((resolve, reject) => {
    test.on('error', reject);
    test.on('close', resolve);
  });
  clearTimeout(timeout);
  if (result !== 0) throw Error('UI integration tests failed');
  const diagnostics = path.join(profile, 'startup.log');
  if (
    fs.existsSync(diagnostics) &&
    /Renderer:|Preload:|Console:/.test(fs.readFileSync(diagnostics, 'utf8'))
  )
    throw Error('Renderer startup diagnostics contain errors');
} finally {
  // A macOS window may hide instead of exiting on SIGTERM. Keep fixture cleanup
  // bounded so a successful test cannot leave the CI job running indefinitely.
  if (child.exitCode === null && child.signalCode === null) {
    const closed = new Promise((resolve) => child.once('close', resolve));
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 1500);
    let timeout;
    await Promise.race([
      closed,
      new Promise((resolve) => {
        timeout = setTimeout(resolve, 5000);
      }),
    ]);
    clearTimeout(force);
    clearTimeout(timeout);
    child.unref();
  }
  fs.closeSync(log);
}
