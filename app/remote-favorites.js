// Store remote track metadata alongside favorite IDs; never download audio on like.
const remoteFavoriteTracks=new Map();
try{for(const t of JSON.parse(localStorage.getItem('remote-favorite-tracks')||'[]'))if(t.remote&&favorites.has(t.id))remoteFavoriteTracks.set(t.id,t)}catch{}
function cacheRemoteFavorites(){localStorage.setItem('remote-favorite-tracks',JSON.stringify([...remoteFavoriteTracks.values()]))}
const filteredBeforeRemoteFavorites=filtered;filtered=function(){const local=filteredBeforeRemoteFavorites();if(view!=='favorites')return local;const q=$('search').value.trim().toLocaleLowerCase();const extra=[...remoteFavoriteTracks.values()].filter(t=>favorites.has(t.id)&&!local.some(x=>x.id===t.id)&&(!selectedArtist||artistKey(trackArtist(t))===artistKey(selectedArtist))&&(!albumFilter||t.album+'\0'+t.albumartist===albumFilter)&&(!q||(t.title+' '+t.artist+' '+t.album).toLocaleLowerCase().includes(q)));return[...local,...extra]};
let remoteFavoritesWrite=Promise.resolve();const changedRemoteFavorites=new Set();
const toggleFavoriteBeforeRemote=toggleFavorite;toggleFavorite=function(id){
 const track=[current,...scTracks,...queue,...remoteFavoriteTracks.values()].find(t=>t?.id===id);
 const removing=favorites.has(id);
 if(track?.remote||id.startsWith('sc-')){changedRemoteFavorites.add(id);if(removing)remoteFavoriteTracks.delete(id);else if(track)remoteFavoriteTracks.set(id,{...track,alignment:undefined,lyrics:''});cacheRemoteFavorites()}
 toggleFavoriteBeforeRemote(id);
 if(track?.remote||id.startsWith('sc-'))remoteFavoritesWrite=remoteFavoritesWrite.catch(()=>{}).then(()=>window.lumen.scFavoriteSet(id,!removing)).catch(e=>toast('Не удалось сохранить избранное SoundCloud: '+cleanError(e)));
};
window.lumen.scFavoriteTracks([...favorites].filter(id=>id.startsWith('sc-'))).then(tracks=>{for(const t of tracks)if(!changedRemoteFavorites.has(t.id)){remoteFavoriteTracks.set(t.id,t);favorites.add(t.id)}cacheRemoteFavorites();localStorage.setItem('favorites',JSON.stringify([...favorites]));render();updateFavorite()}).catch(e=>{if(remoteFavoriteTracks.size)render();console.warn('SoundCloud favorites restore:',cleanError(e))});
