import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
if(process.platform!=='darwin')throw Error('Archive on macOS to preserve executable permissions and symbolic links');
const app='dist/SoundSync-darwin-arm64/SoundSync.app';
const prefix='SoundSync-1.2.0-macOS-arm64';
execFileSync('ditto',['-c','-k','--sequesterRsrc','--keepParent',app,`dist/${prefix}.zip`],{stdio:'inherit'});
fs.mkdirSync('.build/dmg',{recursive:true});execFileSync('ditto',[app,'.build/dmg/SoundSync.app'],{stdio:'inherit'});
if(!fs.existsSync('.build/dmg/Applications'))fs.symlinkSync('/Applications','.build/dmg/Applications');
execFileSync('hdiutil',['create','-volname','SoundSync','-srcfolder','.build/dmg','-ov','-format','UDZO',`dist/${prefix}.dmg`],{stdio:'inherit'});
const updateDir=path.resolve('.build/update'),source=path.resolve(app),model=path.join(source,'Contents/Resources/alignment/models/whisper/small.pt');
fs.mkdirSync(updateDir,{recursive:true});
fs.cpSync(source,path.join(updateDir,'SoundSync.app'),{recursive:true,verbatimSymlinks:true,filter:file=>file!==model});
fs.copyFileSync('scripts/Update-SoundSync.command',path.join(updateDir,'Update-SoundSync.command'));fs.chmodSync(path.join(updateDir,'Update-SoundSync.command'),0o755);
fs.writeFileSync(path.join(updateDir,'ОБНОВЛЕНИЕ.txt'),'SoundSync 1.2.0\nЗакрой SoundSync через меню приложения и запусти Update-SoundSync.command.\nНужна уже установленная SoundSync.app с встроенной Whisper Small. Для старой неработающей версии установи полную сборку.\nОбновляются приложение, Python и FFmpeg; модель берётся из установленной версии и проверяется по SHA-256.\nПользовательские данные не заменяются; создаётся резервная копия приложения.\n');
// Verify that restoring the one omitted, immutable model reconstructs the
// signed app exactly before making this update available for download.
const updateModel=path.join(updateDir,'SoundSync.app/Contents/Resources/alignment/models/whisper/small.pt');fs.copyFileSync(model,updateModel);
execFileSync('codesign',['--verify','--deep','--strict',path.join(updateDir,'SoundSync.app')],{stdio:'inherit'});fs.unlinkSync(updateModel);
execFileSync('ditto',['-c','-k','--sequesterRsrc',updateDir,'dist/SoundSync-1.2.0-Update-macOS-arm64.zip'],{stdio:'inherit'});
const names=[`${prefix}.zip`,`${prefix}.dmg`,'SoundSync-1.2.0-Update-macOS-arm64.zip'];
const checks=[];for(const name of names){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream('dist/'+name))hash.update(chunk);checks.push(hash.digest('hex')+'  '+name)}fs.writeFileSync('dist/SHA256SUMS-macOS.txt',checks.join('\n')+'\n');
