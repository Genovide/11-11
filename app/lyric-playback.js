(function(root){
 const valid=w=>Number.isFinite(w.time)&&w.matched!==false&&(!Number.isFinite(w.end)||w.end>w.time);
 function lyricStart(line){const words=(line.words||[]).filter(valid);return words.length?Math.min(...words.map(w=>w.time)):(line.words||[]).length?null:Number.isFinite(line.time)?line.time:null}
 function lyricIntervals(line,next){
  if(!line.text?.trim())return [];
  const words=(line.words||[]).filter(valid);let spans=[];
  if(words.length)spans=words.map((w,i)=>[w.time,Number.isFinite(w.end)?w.end:Math.min(words[i+1]?.time??Infinity,next?.time??Infinity,w.time+3)]);
  else if(!(line.words||[]).length&&Number.isFinite(line.time))spans=[[line.time,Number.isFinite(line.end)?line.end:Math.min(next?.time??Infinity,line.time+6)]];
  spans.sort((a,b)=>a[0]-b[0]);const merged=[];
  for(const span of spans){if(span[1]<=span[0])continue;const last=merged[merged.length-1];if(last&&span[0]-last[1]<=1.1)last[1]=Math.max(last[1],span[1]);else merged.push([...span])}
  return merged;
 }
 function lyricPlaybackState(lines,time,ranges){
  let active=-1,previous=-1,next=-1;const allowed=!ranges||ranges.some(r=>time>=r[0]&&time<r[1]);
  for(let i=0;i<lines.length;i++){const spans=lyricIntervals(lines[i],lines[i+1]);if(spans.some(s=>s[1]<=time))previous=i;if(next<0&&spans.some(s=>s[0]>time))next=i;if(allowed&&spans.some(s=>time>=s[0]&&time<s[1]))active=i}
  return {index:active,previous,next,gap:active>=0?'':ranges&&allowed?'Нет точной разметки':previous<0?'Вступление':next>=0?'Проигрыш':'Концовка'};
 }
 root.lyricStart=lyricStart;root.lyricPlaybackState=lyricPlaybackState;
})(typeof module==='object'?module.exports:globalThis);
