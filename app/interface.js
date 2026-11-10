/* Keep a single set of interactive lyric nodes when switching listening views. */
(()=>{
 const panel=document.querySelector('body>.now-panel');
 const summary=node('div','now-summary');
 for(const selector of ['.now-heading','#now-cover','.now-details'])summary.append(panel.querySelector(selector));
 panel.prepend(summary);
 const actionRow=node('div','now-actions-row'),actionBody=node('div','now-action-tools');
 alignmentTools.before(actionRow);actionBody.append(alignmentTools,currentActions);actionRow.append(actionBody,sidebarFeedback);

 const disclosure=node('details','insight-disclosure'),label=node('summary','','AI-описание');
 disclosure.append(label,...insightCard.childNodes);insightCard.append(disclosure);
 svgPaths.expand='M8 8L3 3M3 8V3h5M16 8l5-5M16 3h5v5M8 16l-5 5M3 16v5h5M16 16l5 5M16 21h5v-5';
 svgPaths.folder='M3 8V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 8h5l2 2h12l-3 10H3L1 8z';
 expand.replaceChildren(icon('expand'));expand.title='Открыть на весь экран';expand.setAttribute('aria-label','Открыть трек на весь экран');
 $('choose-folder').replaceChildren(node('span','','Выбрать папку'),icon('folder'));

 const heroShuffle=$('shuffle-all');heroShuffle.replaceChildren(icon('shuffle'));heroShuffle.setAttribute('aria-label','Перемешать и слушать');heroShuffle.title='Перемешать и слушать';
 const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
 const motionSelector='.home-pick,.home-album,.album-card,.folder-card';
 let movingCard=null,motionFrame=0,pointerX=0,pointerY=0;
 function resetMotion(){if(!movingCard)return;for(const key of ['--hover-x','--hover-y','--hover-rx','--hover-ry'])movingCard.style.removeProperty(key);movingCard.classList.remove('pointer-hover');movingCard=null}
 function paintMotion(){motionFrame=0;if(!movingCard?.isConnected)return;
  const rect=movingCard.getBoundingClientRect(),x=Math.max(-.5,Math.min(.5,(pointerX-rect.left)/rect.width-.5)),y=Math.max(-.5,Math.min(.5,(pointerY-rect.top)/rect.height-.5));
  movingCard.style.setProperty('--hover-x',x*5+'px');movingCard.style.setProperty('--hover-y',y*4+'px');movingCard.style.setProperty('--hover-rx',-y*2+'deg');movingCard.style.setProperty('--hover-ry',x*2+'deg');
 }
 document.addEventListener('pointermove',event=>{if(event.pointerType==='touch'||motionQuery.matches)return;const card=event.target.closest(motionSelector);if(!card){resetMotion();return}if(card!==movingCard){resetMotion();movingCard=card;card.classList.add('pointer-hover')}pointerX=event.clientX;pointerY=event.clientY;if(!motionFrame)motionFrame=requestAnimationFrame(paintMotion)},{passive:true});
 document.addEventListener('pointerout',event=>{if(movingCard&&!movingCard.contains(event.relatedTarget))resetMotion()},{passive:true});
 addEventListener('blur',resetMotion);motionQuery.addEventListener('change',resetMotion);
 const listRoot=document.querySelector('main'),renderBeforeScrollPreservation=render;
 const listContext=()=>JSON.stringify([view,selectedArtist,albumFilter,$('search').value]);
 render=function(){
  const context=listContext(),top=listRoot.scrollTop;
  const preserve=!document.body.classList.contains('dashboard-home')&&!document.body.classList.contains('track-focus');
  renderBeforeScrollPreservation();
  if(preserve&&context===listContext()&&!document.body.classList.contains('dashboard-home'))listRoot.scrollTop=top;
 };
})();
