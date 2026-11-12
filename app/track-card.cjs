'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
module.exports=({app,ipcMain,dialog,nativeImage,getWindow,getLibrary,getRemoteTrack,save,refreshAllowed})=>{
 const dir=path.join(app.getPath('userData'),'track-cards'),file=path.join(dir,'cards.json');
 let entries={},operations=Promise.resolve();const pending=new Map();
 const ready=fs.readFile(file,'utf8').then(s=>{const v=JSON.parse(s);if(v&&typeof v==='object'&&!Array.isArray(v))entries=v}).catch(()=>{});
 const authorize=e=>{if(e.sender!==getWindow()?.webContents)throw Error('Unknown window')};
 const find=id=>getLibrary().tracks.find(t=>t.id===id)||getRemoteTrack(id);
 function restore(t){const entry=entries[t?.id];if(entry){Object.assign(t,entry.patch,{trackCardEdited:true});if(t.remote){t.metadataManual=true;t.metadataIdentity=require('./track-identity.js').derive(t)}}return t}
 const snapshot=t=>Object.fromEntries(['title','artist','album','albumartist','year','customCover','metadataManual'].map(k=>[k,t[k]??(k==='metadataManual'?false:'')]));
 ipcMain.handle('track-card-get',async(e,id)=>{authorize(e);await ready;await operations.catch(()=>{});const t=find(id);if(!t)throw Error('Трек больше не доступен');restore(t);return{track:{...t},edited:!!entries[id]}});
 ipcMain.handle('track-card-cover',async e=>{
  authorize(e);const result=await dialog.showOpenDialog(getWindow(),{title:'Обложка трека',properties:['openFile'],filters:[{name:'Изображения',extensions:['png','jpg','jpeg','webp']} ]});if(result.canceled)return null;
  const input=result.filePaths[0],stat=await fs.stat(input);if(stat.size>16*1024*1024)throw Error('Выбери изображение размером до 16 МБ');
  let image=nativeImage.createFromBuffer(await fs.readFile(input));if(image.isEmpty())throw Error('Не удалось прочитать изображение');const size=image.getSize();
  if(Math.max(size.width,size.height)>1600)image=image.resize(size.width>=size.height?{width:1600,quality:'best'}:{height:1600,quality:'best'});
  const data=image.toPNG(),token=crypto.randomUUID();pending.set(token,data);while(pending.size>8)pending.delete(pending.keys().next().value);return{token,preview:image.toDataURL()};
 });
 ipcMain.handle('track-card-save',(e,id,input={})=>{
  authorize(e);const operation=operations.catch(()=>{}).then(async()=>{
   await ready;const t=find(id);if(!t)throw Error('Трек больше не доступен');const previous=entries[id];
   if(!input||typeof input!=='object')throw Error('Некорректная карточка');
   let next;
   if(!input.reset){
    const patch={};for(const k of ['title','artist','album','albumartist']){if(typeof input[k]!=='string'||input[k].length>500)throw Error('Проверь данные карточки');patch[k]=input[k].trim()}
    if(!patch.title||!patch.artist)throw Error('Укажи название и исполнителя');patch.album||=t.remote?'SoundCloud Single':'Без альбома';patch.albumartist||=patch.artist;
    if(input.year!==''&&input.year!==null&&input.year!==undefined&&!/^\d{4}$/.test(String(input.year)))throw Error('Год должен состоять из четырёх цифр');
    patch.year=input.year?Number(input.year):'';if(patch.year&&(patch.year<1000||patch.year>2999))throw Error('Проверь год выпуска');
    if(input.coverToken){const data=pending.get(input.coverToken);if(!data)throw Error('Обложка устарела — выбери её ещё раз');const hash=crypto.createHash('sha256').update(data).digest('hex');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,hash+'.png'),data);patch.customCover='lumen://track-cover/'+hash}
    next={original:previous?.original||snapshot(t),patch:{...previous?.patch,...patch},updatedAt:Date.now()};
   }
   const updated={...entries};if(next)updated[id]=next;else delete updated[id];await fs.mkdir(dir,{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(updated));await fs.rename(file+'.tmp',file);entries=updated;
   if(next)restore(t);else if(previous){Object.assign(t,previous.original);t.trackCardEdited=false;if(t.remote)t.metadataIdentity=require('./track-identity.js').derive(t)}
   if(input.coverToken)pending.delete(input.coverToken);refreshAllowed();await save();return{track:{...t},edited:!!entries[id]};
  });operations=operation;return operation;
 });
 async function cover(request){const hash=new URL(request.url).pathname.slice(1);if(!/^[a-f0-9]{64}$/.test(hash))return new Response(null,{status:404});try{return new Response(await fs.readFile(path.join(dir,hash+'.png')),{headers:{'Content-Type':'image/png','Access-Control-Allow-Origin':'*','Cache-Control':'no-cache'}})}catch{return new Response(null,{status:404})}}
 return{ready,restore,cover,flush:()=>operations.catch(()=>{})};
};
