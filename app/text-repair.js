(function(root){
 const dec1251=new TextDecoder('windows-1251'),dec1252=new TextDecoder('windows-1252'),utf8=new TextDecoder('utf-8',{fatal:true});
 const inverse=decoder=>new Map(Array.from({length:256},(_,i)=>[decoder.decode(Uint8Array.of(i)),i]));
 const maps=[inverse(dec1251),inverse(dec1252)];
 const suspicious=s=>/[À-ÿ]{3,}|[ÃÂÐÑ][\u0080-\u00ff]|(?:Р.|С.){3,}/u.test(s);
 const quality=s=>{const letters=s.match(/\p{L}/gu)||[],cyr=s.match(/[А-Яа-яЁё]/g)||[];return cyr.length/Math.max(1,letters.length)*10-(s.match(/[ÃÂÐÑ]|[�]/g)||[]).length*2-(s.match(/(?:Р.|С.){3,}/g)||[]).join('').length*.2};
 function repairText(value){if(typeof value!=='string'||!suspicious(value))return value;const candidates=[value];const encoders=[s=>[...s].every(c=>c.codePointAt(0)<=255)?Uint8Array.from([...s],c=>c.codePointAt(0)):null,...maps.map(map=>s=>[...s].every(c=>map.has(c))?Uint8Array.from([...s],c=>map.get(c)):null)];
  for(const encode of encoders){const bytes=encode(value);if(!bytes)continue;for(const decoder of [dec1251,utf8]){try{const s=decoder.decode(bytes);if(!s.includes('�')&&(s.match(/[А-Яа-яЁё]/g)||[]).length>=4)candidates.push(s)}catch{}}}
  const best=candidates.sort((a,b)=>quality(b)-quality(a))[0];return quality(best)>=quality(value)+2&&quality(best)>=7.5?best:value;
 }
 function repairTrackMetadata(track){for(const key of ['title','artist','albumartist','album']){const fixed=repairText(track[key]);if(fixed!==track[key]){track[key]=fixed;track.metadataEncodingFixed=true}}return track}
 root.repairText=repairText;root.repairTrackMetadata=repairTrackMetadata;
})(typeof module==='object'?module.exports:globalThis);
