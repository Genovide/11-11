let lyricScrollTarget=null,lyricScrollPauseUntil=0,lastLyricFrame=0,lyricScrollVelocity=0;
const lyricBox=$('lyrics');let lyricsVocalRanges=null;let manualLyricMode=false;const lyricGap=node('span','lyric-gap hidden');document.querySelector('.panel-tabs').append(lyricGap);
function seekToLyric(line){const target=lyricStart(line);if(target===null||!current)return;const id=current.id;const seek=()=>{if(current?.id!==id)return;lyricScrollPauseUntil=0;lyricScrollVelocity=0;audio.currentTime=Math.max(0,Number.isFinite(audio.duration)?Math.min(target,audio.duration-.01):target);activeLine=-1;syncLyrics();start()};if(audio.readyState>=1)seek();else audio.addEventListener('loadedmetadata',seek,{once:true})}

lyricBox.addEventListener('wheel',()=>{lyricScrollPauseUntil=performance.now()+4500;lyricScrollVelocity=0},{passive:true});
lyricBox.addEventListener('touchstart',()=>{lyricScrollPauseUntil=performance.now()+4500;lyricScrollVelocity=0},{passive:true});
function targetLyricScroll(){const line=lyricBox.children[activeLine];if(!line)return;const box=lyricBox.getBoundingClientRect(),rect=line.getBoundingClientRect();lyricScrollTarget=Math.min(Math.max(0,lyricBox.scrollHeight-lyricBox.clientHeight),Math.max(0,rect.top-box.top+lyricBox.scrollTop-lyricBox.clientHeight*(document.body.classList.contains('lyrics-focus')?.18:.22)))}
setLyrics=function(t){
 manualLyricMode=!!t.alignment?.manual;lyricsVocalRanges=t.alignment?.vocalRanges||null;activeLine=-1;lyricScrollTarget=null;lyricScrollVelocity=0;lyricScrollPauseUntil=0;lyricLines=t.alignment?.lines?.length?restoreAlignmentLines(t.alignment,t.lyrics):parseLumenLyrics(t.lyrics||'');if(manualLyricMode)lyricLines=lyricLines.map(l=>l.end<=l.time?{...l,time:null}:l);
 const synced=lyricLines.some(l=>l.time!==null);lyricBox.classList.toggle('synced',synced);if(!synced){lyricGap.classList.add('hidden');lyricBox.classList.remove('no-vocals','manual-gap')}lyricBox.replaceChildren();
 if(!lyricLines.length){lyricBox.append(node('span','lyrics-mark','“'),node('p','','В этом файле пока нет текста.\nМожно положить .lrc или .txt рядом с песней и обновить библиотеку.'));return}
 for(const line of lyricLines){
  const e=node('button','lyric-line');
  if(line.words.length){e.classList.add('word-timed');for(const word of line.words){const span=node('span','lyric-word',word.text);span.style.setProperty('--fill','0%');e.append(span)}}
  else e.append(node('span','lyric-line-text',line.text||'♪'));
  if(line.time!==null)e.onclick=event=>{event.preventDefault();event.stopPropagation();seekToLyric(line)};else{e.disabled=true;e.classList.add('plain')}
  lyricBox.append(e);
 }
 lyricBox.scrollTop=0;syncLyrics();
};
syncLyrics=function(){
 if(!lyricBox.classList.contains('synced'))return;
 let idx=-1;for(let i=0;i<lyricLines.length;i++)if(lyricLines[i].time!==null&&audio.currentTime>=lyricLines[i].time)idx=i;if(manualLyricMode)idx=lyricPlaybackState(lyricLines,audio.currentTime).index;lyricGap.classList.add('hidden');lyricBox.classList.toggle('no-vocals',manualLyricMode&&idx<0);lyricBox.classList.toggle('manual-gap',manualLyricMode&&idx<0);
 if(idx===activeLine)return;activeLine=idx;
 [...lyricBox.children].forEach((e,i)=>{const distance=i-idx;e.classList.toggle('current',i===idx);e.classList.toggle('past',i<idx);e.classList.toggle('near',Math.abs(distance)===1);e.classList.toggle('distant',Math.abs(distance)>1);e.style.setProperty('--lyric-delay',Math.min(180,Math.abs(distance)*35)+'ms')});
 targetLyricScroll();
};
function paintLyricWords(time){if(activeLine<0)return;
 for(let i=Math.max(0,activeLine-1);i<=Math.min(lyricLines.length-1,activeLine+1);i++){
  const line=lyricLines[i];if(!line.words.length)continue;const children=lyricBox.children[i]?.children;if(!children)continue;
  for(let j=0;j<line.words.length;j++){const word=line.words[j];const end=word.end??line.words[j+1]?.time??lyricLines[i+1]?.time??(Number.isFinite(audio.duration)?audio.duration:word.time+1.5);const progress=Math.max(0,Math.min(1,(time-word.time)/Math.max(.06,end-word.time)));children[j].style.setProperty('--fill',(progress*100).toFixed(2)+'%');children[j].style.setProperty('--word-lift',(Math.sin(Math.PI*progress)*2.6).toFixed(2)+'px');children[j].style.setProperty('--word-scale',(1+Math.sin(Math.PI*progress)*.018).toFixed(4));children[j].classList.toggle('singing',progress>0&&progress<1);children[j].classList.toggle('sung',progress>=1)}
 }
}
function animateLyrics(now){requestAnimationFrame(animateLyrics);if(document.hidden||now-lastLyricFrame<16||!lyricBox.classList.contains('synced'))return;const dt=Math.min(50,now-lastLyricFrame||16);lastLyricFrame=now;
 if(!lyricBox.classList.contains('hidden')&&lyricBox.clientHeight){syncLyrics();paintLyricWords(audio.currentTime);if(lyricScrollTarget!==null&&now>lyricScrollPauseUntil){const noMotion=!effect||reduced;const delta=lyricScrollTarget-lyricBox.scrollTop;if(noMotion||Math.abs(delta)<.3&&Math.abs(lyricScrollVelocity)<2){lyricBox.scrollTop=lyricScrollTarget;lyricScrollVelocity=0}else{const seconds=dt/1000,omega=12,error=-delta,term=lyricScrollVelocity+omega*error,decay=Math.exp(-omega*seconds);lyricBox.scrollTop=lyricScrollTarget+(error+term*seconds)*decay;lyricScrollVelocity=(lyricScrollVelocity-omega*term*seconds)*decay}}}
}
requestAnimationFrame(animateLyrics);
new ResizeObserver(()=>{if(activeLine>=0)targetLyricScroll()}).observe(lyricBox);
audio.addEventListener('seeked',()=>{activeLine=-1;syncLyrics();for(let i=0;i<lyricLines.length;i++)if(i<activeLine-1||i>activeLine+1){const line=lyricBox.children[i];for(const span of line?.querySelectorAll('.lyric-word')||[]){span.style.setProperty('--fill',i<activeLine?'100%':'0%');span.classList.remove('singing');span.classList.toggle('sung',i<activeLine)}}paintLyricWords(audio.currentTime)});
window.runLyricAnimationTest=()=>{const before=audio.currentTime;audio.currentTime=1.5;const original=current?.lyrics||'';setLyrics({lyrics:'[00:01.00]<00:01.00>Первое <00:02.00>слово\n[00:04.00]Следующая строка'});paintLyricWords(1.5);const first=lyricBox.querySelector('.lyric-word');const checks={wordSpans:lyricBox.querySelectorAll('.lyric-word').length===2,wordProgress:first.style.getPropertyValue('--fill')==='50.00%',wordHighlight:first.classList.contains('singing'),lineFallback:!!lyricBox.querySelector('.lyric-line-text'),scrollAnimation:typeof targetLyricScroll==='function'};audio.currentTime=before;setLyrics({lyrics:original});return {ok:Object.values(checks).every(Boolean),checks}};
window.runLyricPlaybackTest=()=>{const before=audio.currentTime,original=current;audio.currentTime=0;setLyrics({lyrics:'',alignment:{vocalRanges:[[12,15],[25,27]],lines:[{time:0,end:15,text:'Первая строка',words:[{time:0,end:0,text:'?',matched:false},{time:12,end:15,text:'Первая строка'}]},{time:25,end:27,text:'Вторая строка',words:[{time:25,end:27,text:'Вторая строка'}]}]}});syncLyrics();const checks={rollbackLineSelection:activeLine===0&&!lyricBox.classList.contains('no-vocals')};audio.currentTime=20;syncLyrics();checks.rollbackNoVocalGate=activeLine===0&&lyricGap.classList.contains('hidden');lyricBox.children[0].click();checks.firstLineSeeks=audio.currentTime>=12&&audio.currentTime<12.3;audio.pause();audio.currentTime=before;if(original)setLyrics(original);return {ok:Object.values(checks).every(Boolean),checks}};
