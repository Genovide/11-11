const navigationTrail=[];
let restoringNavigation=false,lastMouseBack=-Infinity;
const mainScroll=document.querySelector('main');
const navigationSnapshot=()=>({view,artist:selectedArtist,album:albumFilter,query:$('search').value,shown,scroll:mainScroll.scrollTop});
const navigationKey=s=>JSON.stringify([s.view,s.artist,s.album]);
let lastNavigation=navigationSnapshot();
const renderBeforeNavigation=render;
render=function(){
 const next=navigationSnapshot();
 if(!restoringNavigation&&navigationKey(next)!==navigationKey(lastNavigation)){navigationTrail.push(lastNavigation);if(navigationTrail.length>100)navigationTrail.shift()}
 lastNavigation=next;renderBeforeNavigation();
};
mainScroll.addEventListener('scroll',()=>{lastNavigation.scroll=mainScroll.scrollTop},{passive:true});
function navigateBack(){const modal=document.querySelector('dialog[open]');if(modal){modal.close();return}
 if(document.body.classList.contains('lyrics-focus')){closeLyrics.click();return}
 if(document.body.classList.contains('track-focus')){exitImmersive();return}
 const previous=navigationTrail.pop();
 if(previous){
  restoringNavigation=true;view=previous.view;selectedArtist=previous.artist;albumFilter=previous.album;shown=previous.shown;$('search').value=previous.query;
  try{render();mainScroll.scrollTop=previous.scroll}finally{restoringNavigation=false}
  return;
 }
 if(albumFilter||selectedArtist)$('clear-filter').click();
}
// Windows mouse button 4 is button=3 in DOM events. Consume the browser action.
addEventListener('mousedown',event=>{if(event.button===3){event.preventDefault();event.stopImmediatePropagation()}},true);
addEventListener('mouseup',event=>{if(event.button!==3)return;event.preventDefault();event.stopImmediatePropagation();const now=performance.now();if(now-lastMouseBack<180)return;lastMouseBack=now;navigateBack()},true);
addEventListener('auxclick',event=>{if(event.button===3){event.preventDefault();event.stopImmediatePropagation()}},true);
addEventListener('keydown',event=>{if(event.altKey&&event.key==='ArrowLeft'){event.preventDefault();event.stopImmediatePropagation();navigateBack()}},true);
