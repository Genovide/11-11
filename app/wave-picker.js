// Curated starting points; artist suggestions come from the user's library.
const wavePickerGroups={
 mood:[['Спокойно','спокойное','≋','mint'],['Немного грусти','грустное','☾','violet'],['Больше энергии','энергичное','ϟ','gold'],['Хорошее настроение','веселое','✷','coral'],['Романтика','романтичное','♡','rose']],
 genre:[['Русский рэп','russian rap','↗','mint'],['Альтернатива','alternative rock','✳','coral'],['Фонк','фонк','ϟ','violet'],['Джаз','джаз','∿','gold'],['Электроника','электроника','◈','blue'],['Арт-панк','art punk','✦','rose']],
 activity:[['Бегу и не устаю','running energetic','↗','blue'],['Для тренировки','для тренировки','ϟ','coral'],['Сосредоточиться','для работы','◎','mint'],['Ночной маршрут','night drive','☾','violet'],['Время выдохнуть','спокойное','≋','gold'],['Засыпаю','для сна','✧','blue']]
};
const wavePickerHeader=node('div','wave-picker-header'),wavePickerClose=node('button','wave-picker-close','×');wavePickerClose.setAttribute('aria-label','Закрыть выбор волны');wavePickerClose.onclick=()=>waveDialog.close();
wavePickerHeader.append(waveDialog.querySelector('h2'),wavePickerClose);waveDialog.prepend(wavePickerHeader);wavePickerHeader.querySelector('h2').textContent='Твоя волна';waveDialog.classList.add('wave-picker');waveDialog.querySelector('.sc-hint').textContent='От знакомого артиста — к новому звучанию. Или просто выбери настроение.';
const wavePickerTabs=node('div','wave-picker-tabs'),wavePickerGrid=node('div','wave-picker-grid'),wavePickerSection=node('section','wave-picker-section');wavePickerTabs.setAttribute('role','tablist');wavePickerTabs.setAttribute('aria-label','Подборки волны');wavePickerGrid.setAttribute('role','tabpanel');wavePickerGrid.id='wave-picker-content';wavePickerSection.append(wavePickerTabs,wavePickerGrid);waveDialog.insertBefore(wavePickerSection,waveSearchMode);
const waveCustomTitle=node('div','wave-custom-title','Или задай своё направление');waveDialog.insertBefore(waveCustomTitle,waveSearchMode);const waveCustomFields=node('div','wave-custom-fields');waveDialog.insertBefore(waveCustomFields,waveSearchMode);waveCustomFields.append(waveSearchMode,waveQuery);waveActions.classList.add('wave-actions');waveStart.textContent='Запустить свою волну';waveCancel.textContent='Закрыть';
let wavePickerCategory='for-you';
function waveSuggestedArtists(){
 const groups=new Map();
 for(const t of library.tracks){const name=(t.artist||t.albumartist||'').trim();if(!name||/неизвестный|unknown/i.test(name))continue;const key=name.toLocaleLowerCase();let item=groups.get(key);if(!item){item={name,track:t,count:0};groups.set(key,item)}item.count++;if(!item.track.cover&&t.cover)item.track=t}
 const ranked=[...groups.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ru'));
 if(current?.artist){const key=current.artist.trim().toLocaleLowerCase();const found=ranked.findIndex(a=>a.name.toLocaleLowerCase()===key);if(found>=0)ranked.unshift(...ranked.splice(found,1));else ranked.unshift({name:current.artist,track:current,count:0})}
 return ranked.slice(0,4);
}
function launchWavePick(query,mode){waveQuery.value=query;waveSearchMode.value=mode;localStorage.setItem('wave-search-mode',mode);updateSearchExample(waveSearchMode,waveQuery);waveStart.click()}
function makeWavePick(title,query,mode,symbol,tone,subtitle,track){
 const button=node('button','wave-pick wave-pick-'+tone),visual=node('span','wave-pick-visual'),copy=node('span','wave-pick-copy'),arrow=node('span','wave-pick-arrow','↗');button.type='button';
 if(track?.cover){visual.classList.add('wave-pick-portrait');visual.append(art(track,'wave-pick-image'))}else visual.append(node('span','wave-pick-symbol',symbol));
 copy.append(node('span','wave-pick-label',subtitle),node('strong','',title));button.append(visual,copy,arrow);button.setAttribute('aria-label','Запустить волну: '+title);button.onclick=()=>launchWavePick(query,mode);return button;
}
function renderWavePicker(category=wavePickerCategory){
 wavePickerCategory=category;wavePickerGrid.replaceChildren();for(const tab of wavePickerTabs.children){const active=tab.dataset.category===category;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active)wavePickerGrid.setAttribute('aria-labelledby',tab.id)}
 if(category==='for-you'){
  const artists=waveSuggestedArtists();for(const a of artists)wavePickerGrid.append(makeWavePick(a.name,a.name,'artist','◈','artist','На основе твоей музыки',a.track));
  for(const item of [wavePickerGroups.mood[0],wavePickerGroups.genre[0],wavePickerGroups.activity[0],wavePickerGroups.mood[1]]){const [title,query,symbol,tone]=item;wavePickerGrid.append(makeWavePick(title,query,item===wavePickerGroups.genre[0]?'genre':'mood',symbol,tone,'Сейчас подойдёт'))}
 }else for(const [title,query,symbol,tone]of wavePickerGroups[category])wavePickerGrid.append(makeWavePick(title,query,category==='genre'?'genre':'mood',symbol,tone,category==='genre'?'Жанровая волна':category==='activity'?'В твоём ритме':'Настроение'));
}
for(const [key,label]of [['for-you','Для тебя'],['mood','Настроения'],['genre','Жанры'],['activity','Занятия']]){const tab=node('button','wave-picker-tab',label);tab.type='button';tab.dataset.category=key;tab.id='wave-picker-tab-'+key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',wavePickerGrid.id);tab.onclick=()=>renderWavePicker(key);wavePickerTabs.append(tab)}
wavePickerTabs.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...wavePickerTabs.children],index=tabs.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].click();tabs[next].focus()});
const openWavePickerBefore=waveOrb.onclick;waveOrb.onclick=()=>{if(typeof waveMode!=='undefined'&&waveMode){waveQuery.value=localStorage.getItem('wave-seed')||current?.artist||'';waveDialog.showModal()}else openWavePickerBefore();if(waveDialog.open){renderWavePicker();wavePickerTabs.querySelector('.active')?.focus()}};
