(function(root){
 const stamp=s=>{const a=s.split(':').map(Number);return a.length===3?a[0]*3600+a[1]*60+a[2]:a[0]*60+a[1]};
 function parseLumenLyrics(raw){
  const offset=Number(/\[offset:([+-]?\d+)\]/i.exec(raw)?.[1]||0)/1000,lines=[];
  for(const row of raw.split(/\r?\n/)){
   const times=[...row.matchAll(/\[(\d+:\d+(?:\.\d+)?)\]/g)].map(m=>stamp(m[1]));
   const body=row.replace(/\[[^\]]*\]/g,'');
   const wordMarks=[...body.matchAll(/<(\d+:\d+(?:\.\d+)?)>([^<]*)/g)];
   const text=body.replace(/<\d+:\d+(?:\.\d+)?>/g,'').trim();
   if(!times.length){if(text)lines.push({time:null,text,words:[]});continue}
   for(const time of times){const shift=time-times[0];const words=wordMarks.filter(m=>m[2].length).map(m=>({time:Math.max(0,stamp(m[1])+shift+offset),text:m[2]}));lines.push({time:Math.max(0,time+offset),text,words})}
  }
  return lines.some(l=>l.time!==null)?lines.filter(l=>l.time!==null).sort((a,b)=>a.time-b.time):lines;
 }
 root.parseLumenLyrics=parseLumenLyrics;
})(typeof module==='object'?module.exports:globalThis);
