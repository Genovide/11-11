// Match uploader metadata, never song titles. Missing metadata is not evidence.
const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const families={
 rock:['rock','рок','punk','панк','metal','метал','grunge','гранж','post hardcore'],
 'alternative rock':['alternative rock','альтернативный рок','alt rock','indie rock','grunge','post punk'],
 'art punk':['art punk','арт панк','post punk','постпанк','punk rock'],
 rap:['rap','рэп','hip hop','hiphop','хип хоп','trap'],
 'russian rap':['russian rap','русский рэп','русский хип хоп','rap','hip hop','hiphop'],
 phonk:['phonk','фонк'],jazz:['jazz','джаз','bebop','бибоп','swing'],
 electronic:['electronic','электроника','electronica','edm','house','techno','trance','drum bass','dubstep','ambient'],
 techno:['techno','техно'],ambient:['ambient','эмбиент'],pop:['pop','поп'],metal:['metal','метал','heavy metal','deathcore']
};
const moods={
 'chill ambient':{terms:['chill','chillout','calm','relax','relaxing','ambient','downtempo','lofi','lo fi','спокойное'],maxBpm:115},
 'sad melancholy':{terms:['sad','melancholy','melancholic','depressive','грустное','грусть']},
 'workout gym':{terms:['workout','gym','fitness','running','energetic','спорт','тренировка','dance','edm','drum bass'],minBpm:105},
 'energetic dance':{terms:['energetic','dance','edm','rave','hardstyle','drum bass'],minBpm:105},
 'happy upbeat':{terms:['happy','upbeat','feel good','positive','радость']},
 'sleep ambient':{terms:['sleep','sleeping','ambient','meditation','relaxing','сон'],maxBpm:90},
 'focus instrumental':{terms:['focus','study','instrumental','ambient','lofi','lo fi','concentration'],maxBpm:120},
 romantic:{terms:['romantic','romance','love','романтика']},
 'running energetic':{terms:['running','workout','energetic','dance','drum bass'],minBpm:110},
 'night drive':{terms:['night drive','synthwave','retrowave','chillwave','darkwave']}
};
function has(text,term){const hay=' '+normalize(text)+' ',needle=' '+normalize(term)+' ';return hay.includes(needle)}
function buildProfile(request){if(request.mode==='artist')return null;const key=normalize(request.query);if(request.mode==='genre')return{mode:'genre',terms:families[key]||[key],key};return{mode:'mood',...(moods[key]||{terms:[key]}),key}}
function matchScore(track,profile){
 if(!profile)return 1;
 const genre=track.genre||'',tags=Array.isArray(track.tags)?track.tags.join(' '):track.tags||'';
 const primary=profile.terms.some(t=>has(genre,t)),tagged=profile.terms.some(t=>has(tags,t));
 if(!primary&&!tagged)return 0;
 if(profile.mode==='genre'&&['rock','alternative rock','art punk','metal'].includes(profile.key)&&!primary&&['hip hop','hiphop','rap','рэп','trap','phonk'].some(t=>has(genre,t)))return 0;
 const bpm=Number(track.bpm)||0;
 if(bpm&&((profile.minBpm&&bpm<profile.minBpm)||(profile.maxBpm&&bpm>profile.maxBpm)))return 0;
 return primary?4:2;
}
function filterProfile(tracks,profile){return tracks.map(t=>({t,score:matchScore(t,profile)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.t)}
module.exports={buildProfile,matchScore,filterProfile};
