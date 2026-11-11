import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { rcedit } from 'rcedit';
import { stageWindowsRepair } from './stage-windows-repair.mjs';
if (process.platform !== 'win32') throw Error('Build Windows packages on Windows');
const root = process.cwd(),
  base = process.env.SOUNDSYNC_WINDOWS_BASE;
if (!base || !fs.existsSync(path.join(base, 'SoundSync.exe')))
  throw Error('Set SOUNDSYNC_WINDOWS_BASE to a complete local SoundSync portable runtime');
const stage = path.join(root, '.build', 'windows', 'SoundSync');
fs.mkdirSync(stage, { recursive: true });
for (const e of fs.readdirSync(base, { withFileTypes: true })) {
  if (
    e.name === 'Data' ||
    e.name === 'alignment' ||
    e.name === 'resources' ||
    e.name.startsWith('Create-') ||
    e.name.endsWith('.lnk')
  )
    continue;
  fs.cpSync(path.join(base, e.name), path.join(stage, e.name), { recursive: true });
}
fs.cpSync(path.join(base, 'resources'), path.join(stage, 'resources'), { recursive: true });
fs.cpSync(path.join(base, 'alignment'), path.join(stage, 'alignment'), {
  recursive: true,
  filter: (file) => !file.includes('__pycache__'),
});
fs.cpSync(path.join(root, 'app'), path.join(stage, 'resources', 'app'), {
  recursive: true,
  filter: (file) => !file.includes('node_modules'),
});
fs.cpSync(path.join(root, 'alignment'), path.join(stage, 'alignment'), { recursive: true });
const repair = stageWindowsRepair(
  path.join(stage, 'alignment/runtime/Lib/site-packages'),
  path.join(base, 'alignment/runtime/python.exe')
);
if (
  crypto
    .createHash('sha256')
    .update(
      fs.readFileSync(path.join(stage, 'alignment/runtime/Lib/site-packages/torch/__init__.py'))
    )
    .digest('hex') !== repair.torchInitSha256
)
  throw Error('Windows repair requires the matching PyTorch base');
execFileSync(
  path.join(stage, 'alignment/runtime/python.exe'),
  [
    '-I',
    '-B',
    '-c',
    'import torch,torchaudio,stable_whisper; from torch.utils.data import DataLoader; assert torch.ones(1).sum().item()==1',
  ],
  { stdio: 'inherit' }
);
await rcedit(path.join(stage, 'SoundSync.exe'), {
  icon: path.join(root, 'app/icon.ico'),
  'version-string': {
    ProductName: 'SoundSync',
    FileDescription: 'SoundSync Music Player',
    OriginalFilename: 'SoundSync.exe',
    InternalName: 'SoundSync',
    CompanyName: 'SoundSync',
  },
  'file-version': '1.2.0',
  'product-version': '1.2.0',
});
fs.writeFileSync(
  path.join(stage, 'ПРОЧИТАЙ МЕНЯ.txt'),
  'SoundSync 1.2.0 — Windows x64\r\nРаспакуй архив целиком и запусти SoundSync.exe. Python, FFmpeg и модель синхронизации включены.\r\nПользовательские данные хранятся в Data рядом с программой. При обновлении сохрани Data.\r\nРелизы: https://github.com/Genovide/SoundSync/releases\r\n'
);
fs.copyFileSync(
  'scripts/Create-SoundSync-Shortcuts.bat',
  path.join(stage, 'Create-SoundSync-Shortcuts.bat')
);
const update = path.join(root, '.build', 'windows-update');
fs.mkdirSync(path.join(update, 'payload/resources'), { recursive: true });
fs.copyFileSync(path.join(stage, 'SoundSync.exe'), path.join(update, 'payload/SoundSync.exe'));
fs.cpSync(path.join(stage, 'resources/app'), path.join(update, 'payload/resources/app'), {
  recursive: true,
});
const manifest = [];
function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) collect(file);
    else
      manifest.push({
        path: path.relative(path.join(update, 'payload'), file),
        sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      });
  }
}
collect(path.join(update, 'payload'));
fs.writeFileSync(path.join(update, 'payload/manifest.json'), JSON.stringify(manifest));
fs.copyFileSync('scripts/Update-SoundSync.ps1', path.join(update, 'Update-SoundSync.ps1'));
fs.writeFileSync(
  path.join(update, 'Update-SoundSync.bat'),
  '@echo off\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-SoundSync.ps1"\r\npause\r\n'
);
fs.writeFileSync(
  path.join(update, 'ОБНОВЛЕНИЕ.txt'),
  'SoundSync 1.2.0\r\nЗакрой плеер. Распакуй этот архив в отдельную папку и запусти Update-SoundSync.bat. Выбери папку установленного плеера.\r\nОбновляются EXE и приложение. Музыка, настройки и тексты в Data сохраняются. Создаётся резервная копия.\r\nОбновление рассчитано на уже установленную полную Windows x64 версию с Python и моделями.\r\n'
);
fs.mkdirSync('dist', { recursive: true });
const python = path.join(base, 'alignment/runtime/python.exe');
const zipCode =
  "import pathlib,sys,zipfile;src=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);prefix=sys.argv[3];z=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6);[(z.write(p,str(pathlib.PurePosixPath(prefix)/p.relative_to(src).as_posix()))) for p in src.rglob('*') if p.is_file()];z.close()";
execFileSync(python, ['-c', zipCode, stage, 'dist/SoundSync-1.2.0-Windows-x64.zip', 'SoundSync'], {
  stdio: 'inherit',
});
execFileSync(python, ['-c', zipCode, update, 'dist/SoundSync-1.2.0-Update-Windows-x64.zip', ''], {
  stdio: 'inherit',
});
const sums = [];
for (const name of ['SoundSync-1.2.0-Windows-x64.zip', 'SoundSync-1.2.0-Update-Windows-x64.zip']) {
  const hash = crypto.createHash('sha256');
  for await (const data of fs.createReadStream('dist/' + name)) hash.update(data);
  sums.push(hash.digest('hex') + '  ' + name);
}
fs.writeFileSync('dist/SHA256SUMS-Windows.txt', sums.join('\n') + '\n');
console.log('Windows full and update packages created');
