const fs=require('node:fs/promises'),path=require('node:path');
module.exports=function({app,ipcMain,getLibrary,save,isAligning,tagWriter=require("./lyrics-tags.cjs")}){
 const tagBackup=id=>path.join(app.getPath('userData'),'lyrics',id+'.tags-backup.json');const file=id=>path.join(app.getPath('userData'),'lyrics',id+'.txt');
 async function restore(tracks){await Promise.all(tracks.map(async t=>{try{const text=await fs.readFile(file(t.id),'utf8');if(t.sourceLyrics===undefined)t.sourceLyrics=t.lyrics;t.lyrics=text;t.customLyrics=true}catch{if(t.customLyrics){t.lyrics=t.sourceLyrics||'';delete t.sourceLyrics;delete t.customLyrics}}}))}
 ipcMain.handle('lyrics-save',async(_,id,text)=>{
  const t=getLibrary().tracks.find(t=>t.id===id);if(!t)throw Error('Трек не найден');if(isAligning(id))throw Error('Сначала отмени синхронизацию этой песни');
  if(typeof text!=='string'||text.length>200000||!text.trim())throw Error('Вставь текст песни (до 200 000 символов)');text=text.replace(/\r\n?/g,'\n').trim();
  await tagWriter({action:'write',audio:t.path,text,backup:tagBackup(id)});await fs.mkdir(path.dirname(file(id)),{recursive:true});const tmp=file(id)+'.tmp';await fs.writeFile(tmp,text,'utf8');await fs.rename(tmp,file(id));
  if(t.sourceLyrics===undefined)t.sourceLyrics=t.lyrics;t.lyrics=text;t.customLyrics=true;delete t.alignment;await fs.unlink(path.join(app.getPath('userData'),'alignment',id+'.json')).catch(()=>{});await save();return {id,lyrics:t.lyrics,sourceLyrics:t.sourceLyrics,customLyrics:true};
 });
 ipcMain.handle('lyrics-reset',async(_,id)=>{const t=getLibrary().tracks.find(t=>t.id===id);if(!t)throw Error('Трек не найден');if(isAligning(id))throw Error('Сначала отмени синхронизацию этой песни');await tagWriter({action:'restore',audio:t.path,backup:tagBackup(id)});await fs.unlink(file(id)).catch(e=>{if(e.code!=='ENOENT')throw e});if(t.customLyrics)t.lyrics=t.sourceLyrics||'';delete t.customLyrics;delete t.sourceLyrics;delete t.alignment;await fs.unlink(path.join(app.getPath('userData'),'alignment',id+'.json')).catch(()=>{});await save();return {id,lyrics:t.lyrics,customLyrics:false}});
 return {restore};
};
