import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import packager from '@electron/packager';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw Error('Run this build on Apple Silicon macOS. Windows cannot validate or sign a Mac app.');
const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: 'inherit', cwd: root, ...options });
const build = path.join(root, '.build');
fs.mkdirSync(build, { recursive: true });
const pythonDir = path.join(build, 'python');
const env = { ...process.env, UV_PYTHON_INSTALL_DIR: pythonDir };
run('uv', ['python', 'install', '3.12'], { env });
const managed = execFileSync('uv', ['python', 'find', '--managed-python', '3.12'], {
  env,
  encoding: 'utf8',
}).trim();
const distribution = path.dirname(path.dirname(fs.realpathSync(managed)));
const alignment = path.join(build, 'alignment');
fs.cpSync('alignment', alignment, { recursive: true });
const runtime = path.join(alignment, 'runtime');
fs.cpSync(distribution, runtime, { recursive: true, dereference: false, verbatimSymlinks: true });
const python = path.join(runtime, 'bin', 'python3.12');
// This copy belongs exclusively to the app, not to uv's managed installation.
fs.rmSync(path.join(runtime, 'lib', 'python3.12', 'EXTERNALLY-MANAGED'), { force: true });
run(python, ['-m', 'ensurepip', '--upgrade']);
run(python, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '-r',
  'requirements-macos.txt',
]);
const models = path.join(alignment, 'models', 'whisper');
fs.mkdirSync(models, { recursive: true });
run(python, [
  '-c',
  "import whisper,sys;whisper._download(whisper._MODELS['small'],sys.argv[1],False)",
  models,
]);
run(python, [
  '-c',
  "import torch,torchaudio,stable_whisper,whisper,mutagen,imageio_ffmpeg,yt_dlp,curl_cffi,numpy,demucs;import subprocess;assert torch.ones(1).sum().item()==1;subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-version'],check=True);print('Native Apple Silicon runtime imports passed')",
]);
const icons = path.join(build, 'SoundSync.iconset');
fs.mkdirSync(icons, { recursive: true });
for (const size of [16, 32, 128, 256, 512])
  for (const scale of [1, 2])
    run('sips', [
      '-z',
      String(size * scale),
      String(size * scale),
      'build/icon.png',
      '--out',
      path.join(icons, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`),
    ]);
const icon = path.join(build, 'SoundSync.icns');
run('iconutil', ['-c', 'icns', icons, '-o', icon]);
const electronVersion = process.env.ELECTRON_VERSION || '42.11.18';
const outputs = await packager({
  dir: path.join(root, 'app'),
  name: 'SoundSync',
  platform: 'darwin',
  arch: 'arm64',
  electronVersion,
  out: path.join(root, 'dist'),
  overwrite: true,
  asar: false,
  prune: true,
  icon,
  appBundleId: 'app.soundsync.player',
  appCategoryType: 'public.app-category.music',
  appVersion: '1.2.0',
  extraResource: [alignment],
  extendInfo: { LSMinimumSystemVersion: '14.0', NSHighResolutionCapable: true },
});
const bundle = path.join(outputs[0], 'SoundSync.app');
// Sign every embedded Mach-O first, then the enclosing application. This is
// an ad-hoc test signature, not a Developer ID or Apple notarization.
function walk(dir) {
  const result = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) {
      const target = path.resolve(path.dirname(p), fs.readlinkSync(p));
      if (!target.startsWith(bundle + path.sep)) throw Error('Non-portable external symlink: ' + p);
    } else if (e.isDirectory()) result.push(...walk(p));
    else if (e.isFile()) result.push(p);
  }
  return result;
}
const magic = new Set([
  'cffaedfe',
  'cefaedfe',
  'feedfacf',
  'feedface',
  'cafebabe',
  'bebafeca',
  'cafebabf',
]);
for (const file of walk(path.join(bundle, 'Contents', 'Resources', 'alignment', 'runtime'))) {
  const fd = fs.openSync(file, 'r'),
    bytes = Buffer.alloc(4);
  fs.readSync(fd, bytes, 0, 4, 0);
  fs.closeSync(fd);
  if (magic.has(bytes.toString('hex'))) {
    fs.chmodSync(file, 0o755);
    run('codesign', ['--force', '--sign', '-', '--timestamp=none', file]);
  }
}
run('codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', bundle]);
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle]);
const manifest = {
  app: 'SoundSync',
  architecture: 'arm64',
  minimumMacOS: '14.0',
  electronVersion,
  python: path.basename(distribution),
  signature: 'ad-hoc',
  notarized: false,
  builtAt: new Date().toISOString(),
};
fs.writeFileSync('dist/BUILD-INFO.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Built', bundle);
