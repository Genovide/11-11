const metadataAttempted=new Set();
async function refreshTrackMetadata(t,force=false){
 if(!t?.remote||(!force&&metadataAttempted.has(t.id)))return;metadataAttempted.add(t.id);
 if(force)toast('Уточняем артиста и альбом…');
 try{
  const identityBefore=lyricsIdentityKey(t);
  const improved=await window.lumen.scMetadata(t.id,force),keys=['title','artist','album','albumartist','metadataSource','metadataSourceUrl','metadataCoverMatched','metadataEncodingFixed','metadataIdentity','metadataOriginal','metadataManual','metadataVersion','originalTitle','uploader','publisherArtist'];
  for(const target of [t,current,...scTracks,...queue,...upNext,...remoteFavoriteTracks.values()])if(target?.id===t.id)for(const key of keys)if(improved[key]!==undefined)target[key]=improved[key];
  if(identityBefore!==lyricsIdentityKey(t)){lyricsCandidates.delete(t.id);autoLyricsAttempted.delete(t.id);if(current?.id===t.id)setLyrics(t)}
  cacheRemoteFavorites();if(current?.id===t.id){$('now-title').textContent=$('mini-title').textContent=current.title;$('now-artist').textContent=$('mini-artist').textContent=current.artist;updateImmersive()}
  render();renderOnline();renderQueue();if(force)toast(improved.metadataSource?'Метаданные уточнены: '+improved.artist+' — '+improved.album:improved.metadataEncodingFixed?'Кодировка артиста и альбома восстановлена':'Надёжное совпадение не найдено — данные оставлены прежними');
 }catch(e){if(force)toast(cleanError(e))}
}
const renderBeforeMetadata=render;render=function(){for(const t of [...library.tracks,...scTracks,...remoteFavoriteTracks.values()])repairTrackMetadata(t);return renderBeforeMetadata()};
const loadBeforeMetadata=load;load=function(t){repairTrackMetadata(t);loadBeforeMetadata(t);if(t?.remote)refreshTrackMetadata(t)};
const openMenuBeforeMetadata=openTrackMenu;openTrackMenu=function(t,anchor){openMenuBeforeMetadata(t,anchor);if(t.remote){const button=node('button','','Уточнить артиста и альбом');button.onclick=()=>{closeTrackMenu();refreshTrackMetadata(t,true)};trackMenu.append(button);const top=parseFloat(trackMenu.style.top)||12;if(top+trackMenu.offsetHeight>innerHeight-12)trackMenu.style.top=Math.max(12,innerHeight-trackMenu.offsetHeight-12)+'px'}};
render();
