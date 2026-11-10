(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.TrackIdentity=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clean=s=>String(s||'').normalize('NFKC').replace(/[\u200b-\u200f\ufeff]/g,'').replace(/\s+/g,' ').trim();
 const norm=s=>clean(s).toLocaleLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
 const damaged=s=>!clean(s)||/[?�]{2,}/u.test(clean(s))||/^(?:unknown|unknown artist|неизвестный исполнитель|soundcloud)$/iu.test(clean(s));
 const unknownAlbum=s=>damaged(s)||/^(?:soundcloud\s*single|без\s*альбома|unknown\s*album)$/iu.test(clean(s));
 const versionPattern=/\b(slowed(?:\s*(?:down|and|\+|&)?\s*reverb)?|sped\s*up|speed\s*up|nightcore|remix|rework|bootleg|live|acoustic|instrumental|cover|demo|edit)\b|замедлен\S*|ускорен\S*|ремикс|лайв|акустик\S*/iu;
 const unsafePattern=/slowed|sped\s*up|speed\s*up|nightcore|замедлен|ускорен/iu;
 const versionTag=s=>/^(?:slowed(?:\s+(?:down|and|reverb)|\s*[+&]\s*reverb)*|sped\s*up|speed\s*up|nightcore|live(?:\s+(?:at|in|from)\s+.+)?|acoustic(?:\s+version)?|instrumental(?:\s+version)?|cover(?:\s+by\s+.+)?|demo|(?:radio|extended)\s+edit|remix|rework|bootleg|edit|замедлен\S*|ускорен\S*|ремикс|лайв|акустик\S*)$/iu.test(clean(s))||/\s+(?:remix|rework|bootleg|edit)$/iu.test(clean(s));
 function splitTitle(input){
  let value=clean(input),versions=[];
  value=value.replace(/[([]([^\])]+)[\])]/g,(whole,inside)=>{
   if(versionTag(inside)){versions.push(clean(inside));return ' ';}
   if(/^(?:official\s*(?:audio|video|music video|visuali[sz]er)|lyrics?(?:\s*video)?|audio|hq|hd|4k|prod\.?\s+.+)$/iu.test(clean(inside)))return ' ';
   return whole;
  });
  value=value.replace(/\s*[-–—|]\s*(official\s+(?:audio|video|music video)|lyrics?\s*video|hq|hd|4k)\s*$/iu,'');
  const suffix=value.match(/\s+[-–—|]\s*([^|]+)$/u);
  if(suffix&&versionTag(suffix[1])){versions.push(clean(suffix[1]));value=value.slice(0,suffix.index);}
  return {value:clean(value),version:[...new Set(versions)].join(' · ')};
 }
 function derive(track={}){
  const manual=!!track.metadataManual,original=track.metadataOriginal||{title:track.title,artist:track.artist,album:track.album};
  const raw=clean(manual?track.title:(track.originalTitle||original.title||track.title));
  const parsed=splitTitle(raw);let title=parsed.value,artist=clean(manual?track.artist:(track.publisherArtist||track.artist)),confidence=manual?'manual':track.metadataSource?'catalog':track.publisherArtist?'publisher':'unverified';
  if(!manual){
   const pair=title.match(/^(.{1,150}?)\s+[-–—]\s+(.+)$/u);
   if(pair){
    const prefix=clean(pair[1]),rest=clean(pair[2]);
    if(!track.publisherArtist || norm(prefix)===norm(track.publisherArtist)){artist=prefix;title=rest;if(confidence==='unverified')confidence='parsed';}
   }else if(track.originalTitle&&track.title&&norm(splitTitle(track.title).value)!==norm(title)&&track.metadataSource){title=splitTitle(track.title).value;}
  }
  // A confirmed catalog/manual identity takes precedence over an upload title.
  if(manual||track.metadataSource){title=splitTitle(track.title).value;artist=clean(track.artist);}
  const version=clean(manual?(track.metadataVersion||parsed.version):parsed.version||splitTitle(track.title).version);
  const featured=title.match(/\s*(?:\((?:feat\.?|ft\.?)\s+([^)]*)\)|\[(?:feat\.?|ft\.?)\s+([^\]]*)\]|\s+(?:feat\.?|ft\.?)\s+(.+))$/iu);
  if(featured)title=clean(title.slice(0,featured.index));
  const album=clean(track.album);const albumKnown=album&&!/^(soundcloud\s*single|без\s*альбома|unknown\s*album)$/iu.test(album);
  return {title:title||clean(track.title),artist,album:albumKnown?album:'',version,uploader:clean(track.uploader),originalTitle:raw,
   featured:featured?clean(featured[1]||featured[2]||featured[3]):'',confidence,confirmed:['manual','catalog','publisher'].includes(confidence),timingUnsafe:unsafePattern.test(version),
   derivative:versionPattern.test(version),queries:[...new Set([[damaged(artist)?'':artist,title].filter(Boolean).join(' '),title].filter(Boolean))]};
 }
 function versionCompatible(a,b){const left=derive(a),right=derive(b);if(left.timingUnsafe||right.timingUnsafe)return false;return norm(left.version)===norm(right.version);}
 function metadataPatch(track,candidate,{automatic=false}={}){
  if(!candidate||damaged(candidate.artist)||damaged(candidate.title))return {};
  if(automatic&&(!candidate.exact||track.metadataManual))return {};
  const current=derive(track),found=derive({title:candidate.title,artist:candidate.artist,album:candidate.album});
  const title=clean(candidate.title)+(current.version&&!found.version?' ('+current.version+')':'');
  const patch={};
  if(!automatic||damaged(track.title))patch.title=title;
  if(!automatic||damaged(track.artist)){patch.artist=clean(candidate.artist);patch.albumartist=clean(candidate.artist);}
  if(clean(candidate.album)&&!unknownAlbum(candidate.album)&&(!automatic||unknownAlbum(track.album)))patch.album=clean(candidate.album);
  for(const key of Object.keys(patch))if(patch[key]===track[key])delete patch[key];
  return patch;
 }
 return {derive,clean,norm,splitTitle,versionCompatible,damaged,unknownAlbum,metadataPatch};
});
