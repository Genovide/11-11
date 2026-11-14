import fs from 'node:fs';
import path from 'node:path';
const assets = {},
  types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
  };
function collect(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p);
    else
      assets[path.relative('public', p).replaceAll('\\', '/')] = {
        type: types[path.extname(p)] || 'application/octet-stream',
        data: fs.readFileSync(p).toString('base64'),
      };
  }
}
collect('public');
const wrap = (file) =>
  `(()=>{const module={exports:{}};${fs.readFileSync(file, 'utf8')}return module.exports;})()`;
// Подставляем модули и ассеты в воркер. Ищем с допуском пробелов (Prettier форматирует
// исходник) и функцией-заменителем, чтобы «$» в JSON не трактовался как шаблон замены.
const imports = [
  ['selection', 'wave-selection.cjs'],
  ['queries', 'wave-query.cjs'],
  ['likesImport', 'soundcloud-likes-import.cjs'],
  ['playlistImport', 'soundcloud-playlist-import.cjs'],
];
let source = fs.readFileSync('worker/index.js', 'utf8');
for (const [name, file] of imports) {
  const pattern = new RegExp(`import ${name} from '\\./${file.replace('.', '\\.')}';`);
  if (!pattern.test(source)) throw Error('Worker bundle placeholder was not found: ' + file);
  source = source.replace(pattern, () => `const ${name}=` + wrap('worker/' + file) + ';');
}
const assetsPattern = /const ASSETS\s*=\s*\{\s*\};/;
if (!assetsPattern.test(source)) throw Error('Worker bundle placeholder was not found: ASSETS');
source = source.replace(assetsPattern, () => 'const ASSETS=' + JSON.stringify(assets) + ';');
fs.mkdirSync('dist/server', { recursive: true });
fs.mkdirSync('dist/.openai', { recursive: true });
fs.writeFileSync('dist/server/index.js', source);
if (fs.existsSync('.openai/hosting.json'))
  fs.copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log(
  `Built ${Object.keys(assets).length} assets and SoundCloud backend; ${Buffer.byteLength(source)} bytes`
);
