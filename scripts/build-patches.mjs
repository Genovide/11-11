import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';
const files=['index.html','dashboard.css','dashboard.js','assets/soundsync-statue.png','package.json','updates.cjs'];
const root=path.resolve('.build/patch-1.2.1');fs.mkdirSync(root,{recursive:true});
for(const file of files){const dest=path.join(root,'payload',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join('app',file),dest)}
const manifest=files.map(file=>({path:file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'payload',file))).digest('hex')}));fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2));fs.writeFileSync(path.join(root,'SHA256SUMS-payload.txt'),manifest.map(e=>e.sha256+'  payload/'+e.path).join('\n')+'\n');
fs.copyFileSync('scripts/Patch-SoundSync.ps1',path.join(root,'Update-SoundSync.ps1'));fs.copyFileSync('scripts/Patch-SoundSync.command',path.join(root,'Update-SoundSync.command'));
fs.writeFileSync(path.join(root,'Update-SoundSync.bat'),'@echo off\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-SoundSync.ps1"\r\npause\r\n');
fs.writeFileSync(path.join(root,'ОБНОВЛЕНИЕ.txt'),'SoundSync 1.2.1 — обновление поверх полной версии 1.2.0.\nЗакрой плеер. Распакуй архив в отдельную папку.\nWindows: запусти Update-SoundSync.bat и выбери папку плеера.\nMac: запусти Update-SoundSync.command. Нужна SoundSync.app 1.2.0 для Apple Silicon.\nСоздаётся резервная копия; медиатека, музыка, настройки и история сохраняются.\nMac: после замены интерфейса ad-hoc подпись восстанавливается через системный codesign. Нотариализации Apple нет.\n');
fs.mkdirSync('dist',{recursive:true});
const python=process.env.SOUNDSYNC_PYTHON||'python';
const code=`import pathlib,zipfile,sys;root=pathlib.Path(sys.argv[1]);plat=sys.argv[2];out=sys.argv[3];z=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6)
for p in root.rglob('*'):
 if not p.is_file():continue
 if plat=='Windows' and p.suffix=='.command':continue
 if plat=='macOS' and p.suffix in ('.ps1','.bat'):continue
 name=p.relative_to(root).as_posix();info=zipfile.ZipInfo(name);info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3;info.external_attr=(0o100755 if p.suffix=='.command' else 0o100644)<<16;z.writestr(info,p.read_bytes())
z.close()`;
const sums=[];for(const [platform,arch] of [['Windows','x64'],['macOS','arm64']]){const name=`SoundSync-1.2.1-Update-${platform}-${arch}.zip`;execFileSync(python,['-c',code,root,platform,'dist/'+name],{stdio:'inherit'});sums.push(crypto.createHash('sha256').update(fs.readFileSync('dist/'+name)).digest('hex')+'  '+name)}fs.writeFileSync('dist/SHA256SUMS-1.2.1.txt',sums.join('\n')+'\n');console.log('Update-only packages created');
