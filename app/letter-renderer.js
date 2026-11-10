let lyricGlyphGroups=[];
const graphemeSegmenter=new Intl.Segmenter('ru',{granularity:'grapheme'});
const graphemes=text=>[...graphemeSegmenter.segment(text)].map(x=>x.segment);
function uncertainCompletionTime(words,index){
 const valid=w=>w.matched!==false&&Number.isFinite(w.time)&&Number.isFinite(w.end)&&w.end>w.time;
 const next=words.slice(index+1).find(valid);
 if(next)return next.time;
 const previous=words.slice(0,index).filter(valid).at(-1);
 return previous?previous.end:Infinity;
}
function glyphGroup(element,text,start,duration,fill){
 const chars=graphemes(text);element.replaceChildren();element.setAttribute('aria-label',text);const glyphs=[];
 for(const char of chars){const span=node('span','lyric-glyph',char);span.setAttribute('aria-hidden','true');element.append(span);glyphs.push(span)}
 return {glyphs,start,duration,fill,text,element};
}
const setLyricsBeforeLetters=setLyrics;
setLyrics=function(t){
 setLyricsBeforeLetters(t);lyricGlyphGroups=[];
 for(let i=0;i<lyricLines.length;i++){
  const line=lyricLines[i],button=lyricBox.children[i];if(line.time===null||!button)continue;
  const next=lyricLines[i+1]?.time,end=next??Math.min(Number.isFinite(audio.duration)?audio.duration:line.time+3,line.time+6),duration=Math.max(.5,end-line.time);
  button.setAttribute('aria-label',line.text||'Пауза');
  if(line.words.length){button.classList.add('letter-timed');for(let j=0;j<line.words.length;j++){const word=line.words[j],wordEnd=word.end??line.words[j+1]?.time??end;const group=glyphGroup(button.children[j],word.text,word.time,Math.max(.06,wordEnd-word.time),true);group.uncertain=word.matched===false;group.completeAt=group.uncertain?uncertainCompletionTime(line.words,j):Infinity;if(group.uncertain)group.element.title='Не удалось определить время этого слова';lyricGlyphGroups.push(group)}}
  else{
   // Line-only timing distributes the visual sweep across the line; this is approximate.
   const container=button.querySelector('.lyric-line-text');if(!container)continue;container.replaceChildren();
   const tokens=line.text.match(/\S+\s*|\s+/gu)||['♪'];const count=graphemes(line.text).length;let offset=0;
   for(const token of tokens){const cluster=node('span','lyric-cluster');container.append(cluster);const group=glyphGroup(cluster,token,line.time+duration*offset/Math.max(1,count),duration*graphemes(token).length/Math.max(1,count),true);lyricGlyphGroups.push(group);offset+=graphemes(token).length}
   button.classList.add('letter-decorative');
  }
 }
 paintLyricLetters(audio.currentTime);
};
function paintLyricLetters(time){
 const motion=effect&&!reduced;
 for(const group of lyricGlyphGroups){
  if(group.uncertain||lyricBox.classList.contains('manual-gap')){group.reset=null;const completed=group.uncertain&&!lyricBox.classList.contains('manual-gap')&&time>=group.completeAt;group.element.style.setProperty("--word-halo","0");for(const span of group.glyphs){span.style.transform="";span.style.textShadow="";span.style.setProperty("--glyph-fill",completed?"120%":"-20%")}continue}
  const elapsed=time-group.start;
  const glowIn=Math.max(0,Math.min(1,(elapsed+.12)/.4)),glowOut=Math.max(0,Math.min(1,(group.duration+.65-elapsed)/.75));
  const wordGlow=motion?glowIn*glowIn*(3-2*glowIn)*glowOut*glowOut*(3-2*glowOut):0;
  group.element.style.setProperty('--word-halo',wordGlow.toFixed(3));
  if(elapsed<-.15||elapsed>group.duration+1.6){const state=elapsed>0?'past':'future';if(group.reset!==state){for(const span of group.glyphs){span.style.transform='';span.style.textShadow='';if(group.fill)span.style.setProperty('--glyph-fill',state==='past'?'120%':'-20%')}group.reset=state}continue}group.reset=false;
  const visibleCount=group.glyphs.filter(span=>span.textContent.trim()).length;let visibleIndex=0;
  group.glyphs.forEach((span,j)=>{
   const pose=motion&&span.textContent.trim()?lumenLetterPose(time,group.start,group.duration,visibleIndex,visibleCount):{lift:0,spread:0,scale:1,glow:0};
   span.style.transform=`translate(${pose.spread.toFixed(4)}em,${(-pose.lift).toFixed(4)}em) scale(${pose.scale.toFixed(4)})`;
   span.style.textShadow=pose.glow?`0 0 .24em rgba(255,255,255,${pose.glow.toFixed(3)})`:'';
   if(group.fill){const progress=Math.max(0,Math.min(1,(time-group.start)/group.duration));const fill=Math.max(0,Math.min(1,progress*visibleCount-visibleIndex));span.style.setProperty('--glyph-fill',(fill*140-20).toFixed(2)+'%')}
   if(span.textContent.trim())visibleIndex++;
  });
 }
}
const paintWordsBeforeLetters=paintLyricWords;paintLyricWords=function(time){paintWordsBeforeLetters(time);paintLyricLetters(time)};
function refreshLettersAfterSeek(){for(const group of lyricGlyphGroups)group.reset=null;lyricScrollVelocity=0;activeLine=-1;syncLyrics();paintLyricWords(audio.currentTime)}
audio.addEventListener('seeking',refreshLettersAfterSeek);audio.addEventListener('seeked',refreshLettersAfterSeek);
window.runLetterMotionTest=()=>{
 const original=current?.lyrics||'';setLyrics({lyrics:'[00:01.00]<00:01.00>Буквы <00:03.00>летят\n[00:05.00]Отдельные буквы'});paintLyricLetters(1.35);const chars=[...lyricBox.querySelectorAll('.lyric-word:first-child .lyric-glyph')];const checks={individualGlyphs:chars.length===6,differentPoses:chars[0].style.transform!==chars[3].style.transform,letterFill:chars[0].style.getPropertyValue('--glyph-fill')!=='0.00%',lineOnlyFallback:!!lyricBox.querySelector('.letter-decorative .lyric-glyph'),noTextLoss:lyricBox.children[0].textContent==='Буквы летят'};paintLyricLetters(30);checks.settles=chars.every(x=>!x.style.transform);checks.seekForwardFills=chars.every(x=>x.style.getPropertyValue('--glyph-fill')==='120%');paintLyricLetters(0);checks.seekBackwardDims=chars.every(x=>x.style.getPropertyValue('--glyph-fill')==='-20%');paintLyricLetters(30);checks.repeatSeekFills=chars.every(x=>x.style.getPropertyValue('--glyph-fill')==='120%');paintLyricLetters(1.35);checks.seekIntoWord=chars[0].style.getPropertyValue('--glyph-fill')!=='-20%'&&chars[3].style.getPropertyValue('--glyph-fill')==='-20.00%';setLyrics({lyrics:original});return {ok:Object.values(checks).every(Boolean),checks};
};
