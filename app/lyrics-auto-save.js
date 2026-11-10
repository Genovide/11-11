function applyLyricsMetadata(t,updated){
 const oldAlbum=t.album+'\0'+t.albumartist;const keys=['title','artist','album','albumartist','metadataManual','metadataVersion','metadataOriginal','metadataIdentity','lyricsMetadataSource','lyricsMetadataOriginal'];
 for(const target of [t,current,...library.tracks,...scTracks,...queue,...upNext,...remoteFavoriteTracks.values()])if(target?.id===t.id)for(const key of keys)if(updated[key]!==undefined||key.startsWith('lyricsMetadata'))target[key]=updated[key];
 if(albumFilter===oldAlbum)albumFilter=t.album+'\0'+t.albumartist;
 if(current?.id===t.id){$('now-title').textContent=$('mini-title').textContent=current.title;$('now-artist').textContent=$('mini-artist').textContent=current.artist;updateImmersive()}
 cacheRemoteFavorites();render();renderOnline();renderQueue();
}
async function persistLyricsMetadata(t,candidate,{automatic=false}={}){
 const patch=TrackIdentity.metadataPatch(t,candidate,{automatic});if(!Object.keys(patch).length)return;
 let updated;if(t.remote){const found=TrackIdentity.derive(t);updated=await window.lumen.scMetadataSet(t.id,{title:patch.title||t.title,artist:patch.artist||t.artist,album:patch.album||t.album,version:found.version})}
 else updated=await window.lumen.lyricsMetadataApply(t.id,candidate,{automatic});
 applyLyricsMetadata(t,updated);
}
async function updateMetadataAfterLyrics(t,candidate,options){try{await persistLyricsMetadata(t,candidate,options)}catch(e){toast('Текст сохранён, но данные обновить не удалось: '+cleanError(e))}}
// Save provider results automatically; alignment is started only by the user.
const automaticLyricsSaves=new Map();
function updateFoundTrack(t,response){
 for(const target of [t,current,...library.tracks.filter(x=>x.id===t.id)]){
  if(target?.id!==t.id)continue;
  target.lyrics=response.lyrics;target.sourceLyrics=response.sourceLyrics;target.customLyrics=true;delete target.alignment;
 }
 if(current?.id===t.id)setLyrics(current);
 refreshAlignmentUI();
}
async function saveFoundLyrics(t,candidate,{automatic=false}={}){
 const text=candidate.syncedLyrics||candidate.plainLyrics;
 if(!text?.trim()||candidate.instrumental)return;
 if(automatic&&t.lyrics?.trim())return;
 if(t.remote){t.lyrics=text;if(current?.id===t.id)setLyrics(t);if(updateMetadata)await updateMetadataAfterLyrics(t,candidate,{automatic});return}
 if(automaticLyricsSaves.has(t.id))return automaticLyricsSaves.get(t.id);
 const task=(async()=>{
  let resume;
  try{
   if(current?.id===t.id&&audio.getAttribute('src')){
    resume={time:audio.currentTime,playing:!audio.paused};audio.pause();audio.removeAttribute('src');audio.load();await new Promise(r=>setTimeout(r,100));
   }
   if(automatic&&t.lyrics?.trim())return;
   const response=await window.lumen.saveLyrics(t.id,text);updateFoundTrack(t,response);

  }finally{
   if(resume&&current?.id===t.id){
    const restore=()=>{if(current?.id!==t.id)return;audio.currentTime=Math.min(resume.time,Number.isFinite(audio.duration)?audio.duration:resume.time);if(resume.playing)start()};
    audio.addEventListener('loadedmetadata',restore,{once:true});audio.src=media(current);audio.load();
   }
  }
 })();automaticLyricsSaves.set(t.id,task);
 try{await task;if(updateMetadata)await updateMetadataAfterLyrics(t,candidate,{automatic})}finally{automaticLyricsSaves.delete(t.id)}
}
