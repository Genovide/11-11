/* SoundSync — listening dashboard. Kept separate from library and playback logic. */
(()=>{
let home=true;
const main=document.querySelector('main'),hero=document.querySelector('.hero'),nav=document.querySelector('.sidebar nav');
const homeNav=node('button','nav home-nav');homeNav.type='button';homeNav.innerHTML='<span>⌂</span>Главная';nav.prepend(homeNav);
const intro=node('p','hero-description','Любимые треки, новые открытия и твоя коллекция — в одном ритме.');hero.querySelector('h1').innerHTML='Открой<br><em>свою музыку</em>';hero.querySelector('h1').after(intro);
const statue=node('img','hero-statue');statue.src='assets/soundsync-statue.png';statue.alt='Античная статуя в наушниках SoundSync';statue.draggable=false;hero.append(statue);
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
hero.addEventListener('pointermove',e=>{if(reducedMotion.matches||e.pointerType==='touch')return;const r=hero.getBoundingClientRect();hero.style.setProperty('--statue-x',((e.clientX-r.left)/r.width-.5)*7+'px');hero.style.setProperty('--statue-y',((e.clientY-r.top)/r.height-.5)*-5+'px')});hero.addEventListener('pointerleave',()=>{hero.style.setProperty('--statue-x','0px');hero.style.setProperty('--statue-y','0px')});
const homeContent=node('div','home-content');hero.after(homeContent);
const heading=(title,action)=>{const h=node('div','home-section-heading');h.append(node('h2','',title));if(action){const b=node('button','home-see-all','Смотреть всё ↗');b.onclick=action;h.append(b)}return h};
const leave=()=>{home=false;document.body.classList.remove('dashboard-home');homeNav.classList.remove('active')};
const goLibrary=()=>{leave();document.querySelector('[data-view="tracks"]').click();main.scrollTop=0};
const recentKey='soundsync-recent-v1';let recent=[];try{recent=window.initialUiPreferences?.recent??JSON.parse(localStorage.getItem(recentKey)||'[]');if(!Array.isArray(recent))recent=[]}catch{}
let randomIds=[],randomSource='',randomAlbumKeys=[],albumSource='',historyExpanded=false;
let randomTab=window.initialUiPreferences?.randomSourceChoice||localStorage.getItem('home-random-source')||'library';if(!['library','soundcloud'].includes(randomTab))randomTab='library';
let randomRemote=[],randomRemoteBusy=false,randomRemoteError='';const historyRemote=new Map();
async function refreshRemoteRandom(){
 if(randomRemoteBusy)return;randomRemoteBusy=true;randomRemoteError='';if(home)drawHome();
 try{randomRemote=await window.lumen.scRandom()}catch(error){randomRemoteError=cleanError(error)}finally{randomRemoteBusy=false;if(home)drawHome()}
}
function selectRandomTab(value){randomTab=value;localStorage.setItem('home-random-source',value);window.lumen.preferencesSet({randomSourceChoice:value}).catch(()=>{});drawHome();if(value==='soundcloud'&&!randomRemote.length&&!randomRemoteBusy)refreshRemoteRandom()}
window.lumen.scHistory().then(tracks=>{for(const t of tracks)historyRemote.set(t.id,t);const known=new Set(recent);const extra=tracks.filter(t=>!known.has(t.id)).map(t=>t.id);if(extra.length){recent=[...recent,...extra].slice(0,100);localStorage.setItem(recentKey,JSON.stringify(recent));window.lumen.preferencesSet({recent}).catch(()=>{})}if(home)drawHome()}).catch(error=>console.warn('SoundCloud history restore:',cleanError(error)));
function refreshAlbums(albums){const keys=[...albums.keys()];for(let i=keys.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[keys[i],keys[j]]=[keys[j],keys[i]]}randomAlbumKeys=keys.slice(0,6);albumSource=JSON.stringify([...albums.keys()])}
function refreshRandom(){const pool=[...library.tracks];for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}randomIds=pool.slice(0,6).map(t=>t.id);randomSource=JSON.stringify(library.tracks.map(t=>t.id))}
audio.addEventListener('playing',()=>{if(!current)return;if(current.remote){historyRemote.set(current.id,{...current,lyrics:'',alignment:undefined});window.lumen.scHistoryRecord(current.id).catch(error=>toast('Не удалось сохранить историю SoundCloud: '+cleanError(error)))}recent=[current.id,...recent.filter(id=>id!==current.id)].slice(0,100);localStorage.setItem(recentKey,JSON.stringify(recent));window.lumen.preferencesSet({recent}).catch(()=>{});if(home)drawHome()});
function trackCards(tracks,limit=6){const grid=node('div','home-albums');for(const t of tracks.slice(0,limit)){const b=node('button','home-album');b.append(art(t,'home-art'),node('strong','',t.title),node('small','',t.artist));const play=node('span','home-card-play','▶');b.append(play);b.onclick=()=>playList(tracks,tracks.indexOf(t));if(t.remote){b.append(node('span','home-card-source','SoundCloud'));b.setAttribute('aria-label','Слушать '+t.title+' — '+t.artist+' · SoundCloud')}grid.append(b)}return grid}
function drawHome(){homeContent.replaceChildren();const picks=node('div','home-picks');
const choices=[['Твой поток','Знакомое звучит по-новому','flow',()=>{$('shuffle-all').click()}],['Моя волна','Найди новое настроение','wave',()=>{if(typeof waveDialog!=='undefined')waveDialog.showModal()}],['Любимое','То, что хочется повторить','love',()=>{leave();document.querySelector('[data-view="favorites"]').click()}]];
for(const [title,subtitle,cls,action] of choices){const b=node('button','home-pick '+cls),text=node('div');text.append(node('strong','',title),node('small','',subtitle));b.append(node('span','pick-symbol',cls==='flow'?'≋':cls==='wave'?'✦':'♡'),text,node('span','pick-play','▶'));b.onclick=action;picks.append(b)}
homeContent.append(heading('Твой следующий вайб'),picks);
if(randomSource!==JSON.stringify(library.tracks.map(t=>t.id)))refreshRandom();
const list=randomIds.map(id=>library.tracks.find(t=>t.id===id)).filter(Boolean);
const randomHeading=heading('Случайные треки',()=>{if(randomTab==='soundcloud')refreshRemoteRandom();else{refreshRandom();drawHome()}});
const refreshButton=randomHeading.lastChild;refreshButton.textContent=randomRemoteBusy&&randomTab==='soundcloud'?'Загрузка…':'Обновить ⤨';refreshButton.disabled=randomTab==='soundcloud'&&randomRemoteBusy;
const sourceSwitch=node('div','home-random-switch');sourceSwitch.setAttribute('role','group');sourceSwitch.setAttribute('aria-label','Источник случайных треков');
for(const [value,label] of [['library','Личная библиотека'],['soundcloud','SoundCloud']]){const button=node('button',randomTab===value?'active':'',label);button.type='button';button.setAttribute('aria-pressed',String(randomTab===value));button.onclick=()=>selectRandomTab(value);sourceSwitch.append(button)}
randomHeading.insertBefore(sourceSwitch,refreshButton);homeContent.append(randomHeading);
if(randomTab==='soundcloud'){
 if(randomRemote.length)homeContent.append(trackCards(randomRemote));
 else{const message=node('div','home-history-empty',randomRemoteBusy?'Загружаем случайные треки SoundCloud…':randomRemoteError||'Нажми «Обновить», чтобы получить случайные треки SoundCloud.');message.setAttribute('role','status');homeContent.append(message)}
 if(randomRemote.length&&randomRemoteError)homeContent.append(node('p','home-history-empty',randomRemoteError));
}else if(list.length)homeContent.append(trackCards(list));
else{const empty=node('div','home-welcome');empty.append(node('span','','♫'),node('strong','','Начни с любимой музыки'),node('p','','Добавь папку с треками — здесь появится твоя коллекция.'));const add=node('button','primary','Выбрать папку ↗');add.onclick=()=>choose();empty.append(add);homeContent.append(empty)}
const history=recent.map(id=>library.tracks.find(t=>t.id===id)||historyRemote.get(id)||remoteFavoriteTracks.get(id)).filter(Boolean);
const historyHeading=heading('История прослушивания',history.length>6?()=>{historyExpanded=!historyExpanded;drawHome()}:null);if(historyHeading.lastChild.tagName==='BUTTON')historyHeading.lastChild.textContent=historyExpanded?'Свернуть ↑':'Вся история ↗';homeContent.append(historyHeading);
if(history.length){const cards=trackCards(history,historyExpanded?100:6);cards.classList.add('home-history');homeContent.append(cards)}else homeContent.append(node('p','home-history-empty','Здесь появятся треки, которые ты слушал. Включи любой трек из библиотеки.'));
const albums=new Map();for(const t of library.tracks){const key=t.album+'\0'+t.albumartist;if(t.album&&!albums.has(key))albums.set(key,t)}
if(albumSource!==JSON.stringify([...albums.keys()]))refreshAlbums(albums);
if(albums.size){const albumHeading=heading('Твои альбомы',()=>{refreshAlbums(albums);drawHome()});albumHeading.lastChild.textContent='Обновить ⤨';homeContent.append(albumHeading);const grid=node('div','home-albums home-random-albums');for(const key of randomAlbumKeys){const t=albums.get(key);const b=node('button','home-album');b.append(art(t,'home-art'),node('strong','',t.album),node('small','',t.albumartist||t.artist));b.onclick=()=>{leave();view='albums';albumFilter=key;selectedArtist=null;render();main.scrollTop=0};grid.append(b)}homeContent.append(grid)}
}
const prior=render;render=function(){prior();document.body.classList.toggle('dashboard-home',home);homeNav.classList.toggle('active',home);if(home){document.querySelectorAll('nav [data-view]').forEach(b=>b.classList.remove('active'));$('view-label').textContent='Главная';drawHome()}};
homeNav.onclick=()=>{refreshRandom();albumSource='';home=true;selectedArtist=null;albumFilter=null;view='tracks';$('search').value='';render();main.scrollTo({top:0,behavior:'smooth'})};
window.dashboardNavigation={isHome:()=>home,restore:value=>{home=!!value},openHome:()=>homeNav.click()};
lastNavigation=navigationSnapshot();
nav.addEventListener('click',e=>{if(e.target.closest('[data-view]'))leave()},true);
$('search').addEventListener('input',()=>{if($('search').value.trim()){leave();render()}});
const back=node('button','dashboard-back');back.append(icon('back'));back.title='Назад';back.setAttribute('aria-label','Назад');back.onclick=navigateBack;document.querySelector('.topline').prepend(back);
const oldOpenArtist=openArtist;openArtist=function(name){leave();oldOpenArtist(name)};
render();if(randomTab==='soundcloud')refreshRemoteRandom();
})();
