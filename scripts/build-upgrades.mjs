import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {stageWindowsRepair} from './stage-windows-repair.mjs';

const version='1.2.2';
const python=process.env.SOUNDSYNC_PYTHON||'python3';
const selected=process.env.SOUNDSYNC_UPDATE_PLATFORM;
if(selected&&!['Windows','macOS'].includes(selected))throw Error('Unknown update platform');
fs.mkdirSync('.build',{recursive:true});fs.mkdirSync('dist',{recursive:true});
const sums=[];
for(const [platform,arch] of [['Windows','x64'],['macOS','arm64']]) {
 if(selected&&selected!==platform)continue;
 // Separate, fresh trees prevent Windows files or stale payloads leaking into Mac updates.
 const root=fs.mkdtempSync(path.resolve(`.build/upgrade-${version}-${platform}-`));
 const payload=path.join(root,'payload');
 fs.cpSync('app',path.join(payload,'resources/app'),{recursive:true,filter:p=>!p.split(path.sep).includes('node_modules')});
 fs.mkdirSync(path.join(payload,'alignment'),{recursive:true});
 for(const name of fs.readdirSync('alignment'))if(name.endsWith('.py'))fs.copyFileSync(path.join('alignment',name),path.join(payload,'alignment',name));
 const repair=platform==='Windows'?stageWindowsRepair(path.join(payload,'alignment/runtime/Lib/site-packages'),python):null;
 const manifest=[];
 function collect(dir) {
  for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
   const file=path.join(dir,e.name);
   if(e.isDirectory())collect(file);
   else manifest.push({path:path.relative(payload,file).split(path.sep).join('/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
  }
 }
 collect(payload);
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(root,'SHA256SUMS-payload.txt'),manifest.map(e=>e.sha256+'  payload/'+e.path).join('\n')+'\n');
 if(platform==='Windows') {
  const base=JSON.parse(fs.readFileSync('scripts/upgrade-base.json','utf8'));
  // Only paths supplied by this update may be repaired without fetching the full base.
  const replaced=new Set(manifest.map(e=>e.path));
  base.windows.compatibility=base.windows.compatibility.filter(e=>!replaced.has(e.path));
  base.windows.torchInitSha256=repair.torchInitSha256;
  fs.writeFileSync(path.join(root,'base.json'),JSON.stringify(base));
  for(const name of ['Update-Archive.ps1','Update-Transaction.ps1'])fs.copyFileSync('scripts/'+name,path.join(root,name));
  fs.copyFileSync('scripts/Upgrade-SoundSync.ps1',path.join(root,'Update-SoundSync.ps1'));
  fs.copyFileSync('build/PYTORCH-LICENSE.txt',path.join(root,'PYTORCH-LICENSE.txt'));
  fs.writeFileSync(path.join(root,'Update-SoundSync.bat'),'@echo off\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-SoundSync.ps1"\r\npause\r\n');
 } else fs.copyFileSync('scripts/Upgrade-SoundSync.command',path.join(root,'Update-SoundSync.command'));
 const instructions=`SoundSync ${version} — накопительное обновление (${platform} ${arch}).\nПолностью закрой плеер. Распакуй ZIP отдельно и запусти ${platform==='Windows'?'Update-SoundSync.bat':'Update-SoundSync.command'}. Выбери установленный плеер. Промежуточные апдейты не нужны.\n${platform==='Windows'?'Пакет восстанавливает отсутствующие Python-модули PyTorch. Совместимая основа сохраняется, ZIP распаковывается через .NET. Музыка и Data остаются на месте.':'Только Mac Apple Silicon, macOS 14+. Windows-компонентов в этом архиве нет. Подпись ad-hoc, без нотариализации Apple. Данные portable-версии переносятся в Application Support/SoundSync при отсутствии профиля.'}\nДвижок Python проверяется до успешного завершения установки. Создаётся резервная копия, при ошибке замены или проверки Windows восстанавливает прежние файлы.\nДля несовместимой основы компоненты загружаются с GitHub с проверкой SHA-256; нужны интернет и место для основы и резервной копии.\n`;
 fs.writeFileSync(path.join(root,'ОБНОВЛЕНИЕ.txt'),instructions);
 const name=`SoundSync-${version}-Update-${platform}-${arch}.zip`;
 execFileSync(python,['-I','-S','-B','-c',`
import pathlib,zipfile,sys
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in sorted(root.rglob('*')):
  if not p.is_file():continue
  info=zipfile.ZipInfo(p.relative_to(root).as_posix());info.compress_type=zipfile.ZIP_DEFLATED;info.create_system=3
  info.external_attr=(0o100755 if p.suffix=='.command' else 0o100644)<<16
  z.writestr(info,p.read_bytes())
`,root,'dist/'+name],{stdio:'inherit'});
 sums.push(crypto.createHash('sha256').update(fs.readFileSync('dist/'+name)).digest('hex')+'  '+name);
 console.log(`${platform}: ${manifest.length} payload files -> dist/${name}`);
}
fs.writeFileSync(`dist/SHA256SUMS-${version}.txt`,sums.join('\n')+'\n');
