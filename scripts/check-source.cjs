const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  { userDataPath } = require('../app/platform-config.cjs');
assert.equal(
  userDataPath({
    platform: 'darwin',
    exe: '/Applications/SoundSync.app/Contents/MacOS/SoundSync',
    appData: '/Users/test/Library/Application Support',
  }),
  path.join('/Users/test/Library/Application Support', 'SoundSync')
);
assert.equal(
  userDataPath({ platform: 'win32', exe: path.join(root, 'SoundSync.exe'), appData: 'unused' }),
  path.join(root, 'Data')
);
const main = fs.readFileSync(path.join(root, 'app/main.cjs'), 'utf8');
assert.ok(main.includes('.catch(startupFailure)'));
assert.ok(main.includes('smoke-report.json'));
assert.ok(main.includes('platform-config.cjs'));
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      assert.notEqual(entry.name, 'Data');
      walk(file);
    } else if (/\.(js|cjs|mjs)$/.test(file)) execFileSync(process.execPath, ['--check', file]);
  }
}
walk(path.join(root, 'app'));
walk(path.join(root, 'scripts'));
console.log('Source syntax, clean payload, macOS/Windows data paths and launch diagnostics passed');
