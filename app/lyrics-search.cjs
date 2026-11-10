const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const norm=s=>(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
module.exports=function setupLyricsSearch({app,ipcMain,fetchImpl=fetch}){
 const identity=require('./track-identity.js');
 const dir=path.join(app.getPath('userData'),'lyrics-search');let blockedUntil=0,requestTail=Promise.resolve(),lastRequest=0;const pending=new Map();
 async function request(endpoint){const previous=requestTail;let release;requestTail=new Promise(r=>release=r);await previous;try{if(Date.now()<blockedUntil)throw Error('LRCLIB просит подождать перед следующим поиском');const wait=lastRequest+350-Date.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();const response=await fetchImpl('https://lrclib.net'+endpoint,{headers:{'User-Agent':'SoundSync/1.0 (personal desktop music player)','Accept':'application/json'},signal:AbortSignal.timeout(20000)});if(response.status===429||response.status===503){const header=response.headers.get('retry-after'),seconds=Number(header);blockedUntil=Date.now()+(Number.isFinite(seconds)&&seconds>0?seconds*1000:Math.max(1000,Date.parse(header)-Date.now())||60000)+Math.random()*1000;throw Error('Сервис текстов занят. Попробуй позже.')}if(response.status===404)return null;if(!response.ok)throw Error('Поиск текстов: HTTP '+response.status);return response.json()}finally{release()}}
 function record(r,track,lookup){
  const candidate=identity.derive({title:r.trackName,artist:r.artistName,album:r.albumName}),delta=Math.abs(Number(r.duration||0)-Number(track.duration||0));
  const titleMatch=identity.norm(candidate.title)===identity.norm(lookup.title),artistMatch=!!lookup.artist&&identity.norm(candidate.artist)===identity.norm(lookup.artist);
  const versionMatch=identity.versionCompatible({title:lookup.title,artist:lookup.artist,metadataManual:true,metadataVersion:lookup.version},{title:r.trackName,artist:r.artistName});
  const exact=titleMatch&&artistMatch&&track.duration>0&&r.duration>0&&delta<=3&&versionMatch&&(!track.remote||lookup.confidence!=='unverified');
  const words=value=>identity.norm(String(value||'').replace(/\[\d+:\d+(?:\.\d+)?\]/g,''));
  const existing=words(track.lyrics),textMatch=existing.length>=40&&existing===words(r.plainLyrics||r.syncedLyrics);
  return{id:r.id,title:r.trackName,artist:r.artistName,album:r.albumName,duration:r.duration,instrumental:!!r.instrumental,plainLyrics:r.plainLyrics||(lookup.timingUnsafe?String(r.syncedLyrics||'').replace(/\[\d+:\d+(?:\.\d+)?\]/g,'').trim():''),syncedLyrics:lookup.timingUnsafe?'':r.syncedLyrics||'',exact,
   textMatch,versionMismatch:!versionMatch,timingUnsafe:lookup.timingUnsafe,matchNote:textMatch?'Совпадает с сохранённым текстом':lookup.timingUnsafe?'Изменена скорость: таймкоды оригинала отключены':!versionMatch?'Другая версия — проверь текст':exact?'Точное совпадение':'Проверь совпадение',
   score:(textMatch?20:0)+(titleMatch?5:0)+(artistMatch?5:0)+(delta<=3&&track.duration>0?3:0)+(versionMatch?2:-6)+(r.syncedLyrics&&!lookup.timingUnsafe?1:0)};
 }
 async function search(input,query=''){
  if(!input||typeof input.title!=='string'||typeof input.artist!=='string')throw Error('Не указаны название и исполнитель');
  const track={...input,title:input.title.slice(0,300),artist:input.artist.slice(0,300),album:String(input.album||'').slice(0,300),duration:Number(input.duration)||0};
  const lookup=identity.derive(track);query=String(query||'').trim().slice(0,500);
  const lyricKey=crypto.createHash('sha256').update(String(track.lyrics||'').slice(0,200000)).digest('hex');
  const key=crypto.createHash('sha256').update(JSON.stringify(['identity-v2',lookup,track.duration,!!track.remote,query,lyricKey])).digest('hex');
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
   await fs.mkdir(dir,{recursive:true});const file=path.join(dir,key+'.json');
   try{const cached=JSON.parse(await fs.readFile(file,'utf8'));if(Date.now()-cached.time<(cached.results.length?7*86400000:3600000))return cached.results}catch{}
   const results=[];
   async function collect(endpoint){const found=await request(endpoint);for(const r of Array.isArray(found)?found:found?[found]:[])if(!results.some(x=>x.id===r.id))results.push(record(r,track,lookup));}
   if(query){await collect('/api/search?'+new URLSearchParams({q:query}));}
   else{
    const artistReliable=!identity.damaged(lookup.artist)&&(!track.remote||lookup.confidence!=='unverified');
    if(lookup.artist&&artistReliable&&!lookup.derivative){const params=new URLSearchParams({track_name:lookup.title,artist_name:lookup.artist});if(lookup.album)params.set('album_name',lookup.album);if(track.duration>=1&&track.duration<=3600)params.set('duration',String(track.duration));await collect('/api/get?'+params);}
    if(!results.some(r=>r.exact)){
     const params=new URLSearchParams({track_name:lookup.title});if(lookup.artist&&artistReliable)params.set('artist_name',lookup.artist);
     await collect('/api/search?'+params);
    }
    if(!results.some(r=>r.exact)&&lookup.artist&&artistReliable)await collect('/api/search?'+new URLSearchParams({track_name:lookup.title}));
   }
   const exact=results.filter(r=>r.exact&&!r.instrumental&&(r.syncedLyrics||r.plainLyrics));
   const textKey=r=>identity.norm((r.plainLyrics||r.syncedLyrics).replace(/\[[^\]]*\]/g,''));
   if(new Set(exact.map(textKey)).size>1)for(const r of exact){r.exact=false;r.matchNote='Несколько разных текстов — выбери вручную';}
   const sorted=results.sort((a,b)=>b.score-a.score).slice(0,20);await fs.writeFile(file,JSON.stringify({time:Date.now(),results:sorted}));return sorted;
  })();pending.set(key,task);try{return await task}finally{pending.delete(key)}
 }
 ipcMain.handle('lyrics-search',(_,track,query)=>search(track,query));return{search};
};
