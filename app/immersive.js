const svgPaths={play:'M9 5l11 7-11 7z',pause:'M8 5v14M16 5v14',previous:'M5 5v14M19 5l-10 7 10 7z',next:'M19 5v14M5 5l10 7-10 7z',shuffle:'M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 3-2 4-4M14 8c1-1 2-2 4-2h3M17 2l4 4-4 4',repeat:'M4 10V8a4 4 0 014-4h12M17 1l3 3-3 3M20 14v2a4 4 0 01-4 4H4M7 17l-3 3 3 3',close:'M6 6l12 12M18 6L6 18',back:'M15 5l-7 7 7 7'};
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('fill',name==='play'?'currentColor':'none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('aria-hidden','true');const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',svgPaths[name]||svgPaths.play);s.append(p);return s}
function refreshPlayIcon(){$('play').replaceChildren(icon(audio.paused?'play':'pause'))}
for(const id of ['previous','next','shuffle','repeat'])$(id).replaceChildren(icon(id));
audio.addEventListener('play',refreshPlayIcon);audio.addEventListener('pause',refreshPlayIcon);refreshPlayIcon();
const immersive=node('section','immersive hidden');immersive.id='immersive';immersive.setAttribute('aria-label','Экран трека');
const immersiveTop=node('div','immersive-top'),closeImmersive=node('button','back-button');closeImmersive.type='button';closeImmersive.append(icon('back'),node('span','','В библиотеку'));
const immersiveBadge=node('span','immersive-badge','СЕЙЧАС ИГРАЕТ');
const viewSwitch=node('div','listening-switch');viewSwitch.setAttribute('role','tablist');viewSwitch.setAttribute('aria-label','Экран трека');
const showVisual=node('button','listening-tab active','Визуализация'),showLyrics=node('button','listening-tab','Текст песни');
for(const [button,id,panel] of [[showVisual,'visual-view-tab','visual-panel'],[showLyrics,'lyrics-view-tab','listening-lyrics']]){button.id=id;button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-controls',panel);viewSwitch.append(button)}
const listeningControls=node('div','listening-controls');immersiveTop.append(closeImmersive,viewSwitch,listeningControls);
const immersiveArt=node('div','immersive-art'),immersiveTitle=node('h1','immersive-title'),immersiveArtist=node('p','immersive-artist'),immersiveAlbum=node('p','immersive-album'),immersiveInfo=node('div','immersive-info'),listeningActions=node('div','listening-actions');immersiveInfo.append(immersiveBadge,immersiveArt,immersiveTitle,immersiveArtist,immersiveAlbum,listeningActions);
const visualPanel=node('div','visual-panel'),visualHeader=node('div','visual-header');visualPanel.id='visual-panel';visualPanel.setAttribute('role','tabpanel');visualPanel.setAttribute('aria-labelledby',showVisual.id);
const visualStatus=node('span','visual-status','НАЖМИ PLAY'),visualMode=node('select','visual-mode');visualHeader.append(node('span','','АУДИОВИЗУАЛИЗАЦИЯ'),visualMode);
const visualCanvas=node('canvas','visual-canvas');visualCanvas.id='visualizer';visualCanvas.setAttribute('aria-label','Визуализация звука');const visualFooter=node('div','visual-footer');visualFooter.append(visualStatus,node('span','','ЖИВОЙ СИГНАЛ'));visualPanel.append(visualHeader,visualCanvas,visualFooter);
const listeningLyrics=node('div','listening-lyrics hidden');listeningLyrics.id='listening-lyrics';listeningLyrics.setAttribute('role','tabpanel');listeningLyrics.setAttribute('aria-labelledby',showLyrics.id);
immersive.append(immersiveTop,immersiveInfo,visualPanel,listeningLyrics);document.body.append(immersive);
let listeningView='visual',listeningReturnFocus=null,sidebarLyrics=true;
const listeningHomes=new Map();
function mountListeningContent(){
 sidebarLyrics=!$('lyrics').classList.contains('hidden');
 for(const [selector,target] of [['.alignment-tools',listeningActions],['.song-insight',listeningActions],['.now-panel .panel-tabs',listeningLyrics],['#lyrics',listeningLyrics],['#queue',listeningLyrics]]){
  const element=document.querySelector(selector);if(!element)continue;
  const placeholder=document.createComment('listening-home');element.before(placeholder);listeningHomes.set(element,placeholder);target.append(element);
 }
}
function restoreListeningContent(){for(const [element,placeholder] of listeningHomes){placeholder.replaceWith(element)}listeningHomes.clear();panelTab(sidebarLyrics)}
function setListeningView(mode){
 listeningView=mode==='lyrics'?'lyrics':'visual';const lyrics=listeningView==='lyrics';
 document.body.classList.toggle('lyrics-focus',lyrics);immersive.classList.toggle('showing-lyrics',lyrics);
 visualPanel.classList.toggle('hidden',lyrics);listeningLyrics.classList.toggle('hidden',!lyrics);listeningControls.classList.toggle('hidden',lyrics);
 for(const [button,active] of [[showVisual,!lyrics],[showLyrics,lyrics]]){button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1}
 if(lyrics){panelTab(true);requestAnimationFrame(()=>{if(typeof targetLyricScroll==='function')targetLyricScroll()})}
}
viewSwitch.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?showVisual:event.key==='End'?showLyrics:document.activeElement===showVisual?showLyrics:showVisual;next.click();next.focus()});
let visualPreset=['mandala','cover','starburst','centerbars','milkdrop','flowfield'].includes(localStorage.getItem('visual-preset'))?localStorage.getItem('visual-preset'):'mandala',visualTick=0,visualPaints=0;
function updateImmersive(){if(!current)return;const artKey=current.id+':'+current.cover;if(immersiveArt.dataset.track!==artKey){immersiveArt.replaceChildren(art(current,'immersive-image'));immersiveArt.dataset.track=artKey}immersiveTitle.textContent=current.title;immersiveArtist.textContent=current.artist;immersiveAlbum.textContent=current.album;visualStatus.textContent=audio.paused?'НА ПАУЗЕ':'СЕЙЧАС ЗВУЧИТ'}
function openImmersive(){if(!current){toast('Сначала выбери трек');return}if(immersive.classList.contains('hidden')){listeningReturnFocus=document.activeElement;mountListeningContent()}document.body.classList.add('track-focus');immersive.classList.remove('hidden');setListeningView('visual');updateImmersive();showVisual.focus()}
function exitImmersive(){if(immersive.classList.contains('hidden'))return;document.body.classList.remove('track-focus','lyrics-focus');immersive.classList.add('hidden');restoreListeningContent();if(listeningReturnFocus?.isConnected)listeningReturnFocus.focus();else $('mini-cover').focus()}
for(const id of ['mini-cover','now-cover']){const e=$(id);e.tabIndex=0;e.setAttribute('role','button');e.setAttribute('aria-label','Открыть экран трека');e.title='Визуализация и текст песни';e.onclick=openImmersive;e.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openImmersive()}}}
closeImmersive.onclick=exitImmersive;showVisual.onclick=()=>setListeningView('visual');showLyrics.onclick=()=>setListeningView('lyrics');
const closeLyrics=closeImmersive;
expand.onclick=openImmersive;expand.title='Открыть экран трека';expand.setAttribute('aria-label','Открыть визуализацию и текст песни');
addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))exitImmersive()});
audio.addEventListener('play',updateImmersive);audio.addEventListener('pause',()=>visualStatus.textContent='НА ПАУЗЕ');audio.addEventListener('loadedmetadata',updateImmersive);
const loadBeforeImmersive=load;load=function(track){loadBeforeImmersive(track);updateImmersive()};
const vg=visualCanvas.getContext('2d'),levels=new Float32Array(80);
let ribbonTime=0,ribbonPrevious=0,ribbonEnergy=0;
const response=new AudioResponse();
const mandalaBackground=new MandalaBackground();
const milkdropBackground=new MilkdropBackground();
const importedSceneRenderer=new ImportedSceneRenderer();
const reactionLabel=node('label','reaction-control'),reactionText=node('span','','Реакция'),reactionSlider=node('input');reactionSlider.type='range';reactionSlider.min='.5';reactionSlider.max='3';reactionSlider.step='.1';reactionSlider.value=localStorage.getItem('visual-sensitivity')||'1.4';reactionSlider.setAttribute('aria-label','Чувствительность визуализации');reactionSlider.oninput=()=>localStorage.setItem('visual-sensitivity',reactionSlider.value);reactionLabel.append(reactionText,reactionSlider);listeningControls.append(reactionLabel);

function drawVisualizer(ms){
 requestAnimationFrame(drawVisualizer);
 if(document.hidden||immersive.classList.contains('hidden')||visualPanel.classList.contains('hidden')||ms-visualTick<32)return;
 visualTick=ms;visualPaints++;
 const w=visualCanvas.clientWidth,h=visualCanvas.clientHeight,dpr=Math.min(devicePixelRatio,1.5);
 if(!w||!h)return;
 if(visualCanvas.width!==Math.round(w*dpr)||visualCanvas.height!==Math.round(h*dpr)){visualCanvas.width=Math.round(w*dpr);visualCanvas.height=Math.round(h*dpr)}
 vg.setTransform(dpr,0,0,dpr,0,0);vg.clearRect(0,0,w,h);
 const playing=analyser&&!audio.paused,animate=playing&&effect&&!reduced;
 if(playing){analyser.getByteFrequencyData(freq);analyser.getByteTimeDomainData(wave)}
 let signal=0;
 for(let i=0;i<80;i++){const bin=Math.min((freq?.length||512)-1,Math.floor(2*Math.pow((freq?.length||512)/2,i/80)));const raw=playing?freq[bin]/255:0;levels[i]+=(raw-levels[i])*.08;signal+=levels[i]}
 ribbonEnergy+=(signal/80-ribbonEnergy)*.12;
 const dt=Math.min(80,ms-(ribbonPrevious||ms));ribbonPrevious=ms;
 response.update(freq,wave,ctx?.sampleRate||48000,analyser?.fftSize||1024,Number(reactionSlider.value),!!animate,dt||32);
 if(animate)ribbonTime+=dt*.0002*(response.rms*.7+response.bass*.6);
 if(!effect)return;
 const hex=color=>'#'+color.map(x=>Math.round(Math.min(255,x*.65+70)).toString(16).padStart(2,'0')).join('');
 const sceneColors=palette.map(hex);window.mandalaScene.colors=[sceneColors[1],sceneColors[0],sceneColors[2],sceneColors[0]];
 for(const config of Object.values(window.importedScenes)){config.colors=sceneColors;if(config.background?.gradient)config.background.gradient.colors=sceneColors;config.visualizer.color=sceneColors[0];config.visualizer.color2=sceneColors[1];config.visualizer.colorMode='theme'}
 if(visualPreset==='mandala'){vg.save();vg.setTransform(1,0,0,1,0,0);mandalaBackground.draw(vg,visualCanvas.width,visualCanvas.height,response,levels,dt,!!animate,effect===1?.65:1);vg.restore();return}
 if(visualPreset==='milkdrop'){milkdropBackground.draw(vg,visualCanvas.width,visualCanvas.height,response,wave,dt,!!animate,Number(reactionSlider.value),effect===1?.65:1);return}
 if(window.importedScenes[visualPreset]){vg.save();vg.setTransform(1,0,0,1,0,0);importedSceneRenderer.draw(vg,visualCanvas.width,visualCanvas.height,visualPreset,response,freq,ctx?.sampleRate||48000,analyser?.fftSize||1024,Number(reactionSlider.value),dt,!!animate,effect===1?.65:1);vg.restore();return}
 const glow=palette[0].map(x=>Math.round(Math.min(255,x*.65+80)));
 const cool=palette[1].map(x=>Math.round(Math.min(255,x*.75+50)));
 const t=ribbonTime,amp=h*(.012+response.bass*.18+response.rms*.09),opacity=playing?Math.min(1,.18+response.rms*.7+response.hit*.35):.15;
 const gradient=vg.createLinearGradient(0,0,w,h);gradient.addColorStop(0,`rgb(${cool})`);gradient.addColorStop(.5,`rgb(${glow})`);gradient.addColorStop(1,`rgb(${cool})`);
 vg.strokeStyle=gradient;vg.globalCompositeOperation='screen';
 for(let ribbon=0;ribbon<3;ribbon++){
  for(let line=0;line<30;line++){
   const q=line/29,phase=q*Math.PI*1.2+ribbon*1.9;
   vg.beginPath();
   for(let x=-8;x<=w+8;x+=8){
    const u=x/w;const position=Math.max(0,Math.min(79,u*79));const bi=Math.floor(position);const band=levels[bi]*(1-(position-bi))+levels[Math.min(79,bi+1)]*(position-bi);
    const envelope=.55+.45*Math.sin(u*Math.PI);
    const main=Math.sin(u*7.8+t+phase)*amp*1.2;
    const harmonic=Math.sin(u*12-t*.65+response.mid*.45+ribbon*2+q*.7)*h*(.004+response.mid*.055);
    const spread=(q-.5)*h*(.015+response.bass*.19+response.high*.08)*Math.sin(u*8-t*.55+ribbon*2);
    const wi=Math.max(0,Math.min(126,u*127));const wj=Math.floor(wi);const actualWave=response.shape[wj]*(1-(wi-wj))+response.shape[wj+1]*(wi-wj);
    const reaction=animate?(Math.sin(u*14+t+phase)*band*h*.006+Math.sin(u*4+phase)*response.hit*h*.025):0;
    const y=h*(.55+ribbon*.025)+(main+harmonic)*envelope+spread+reaction;
    x===-8?vg.moveTo(x,y):vg.lineTo(x,y);
   }
   vg.globalAlpha=(line%7===0?.5:.2)*opacity*(effect===1?.65:1);
   vg.lineWidth=(line%7===0?1.25:.7)+response.hit*.3+response.high*.15;
   vg.shadowColor=`rgba(${glow},.6)`;vg.shadowBlur=line%7===0?6+response.hit*9+response.high*5:0;vg.stroke();
  }
 }
 vg.shadowBlur=0;vg.globalAlpha=1;vg.globalCompositeOperation='source-over';
}
requestAnimationFrame(drawVisualizer);
// Put the palette switch with the top controls; the canvas fills the entire background.
listeningControls.append(visualMode);const visualOptions={mandala:'Mandala Drop',cover:'Волны · цвет обложки',starburst:'Огненные лучи',centerbars:'Ретро-спектр',milkdrop:'MilkDrop Backdrop',flowfield:'Flow Backdrop'};
for(const [id,label]of Object.entries(visualOptions)){const option=node('option','',label);option.value=id;visualMode.append(option)}
function refreshVisualMode(){
 immersive.classList.toggle('milkdrop-layout',visualPreset==='milkdrop'||visualPreset==='flowfield');immersive.classList.toggle('mandala-layout',visualPreset==='mandala');immersive.classList.toggle('starburst-layout',visualPreset==='starburst');immersive.classList.toggle('bars-layout',visualPreset==='centerbars');
 visualMode.value=visualPreset;visualMode.title='Выбрать визуализацию';visualMode.setAttribute('aria-label','Визуализация');
}
refreshVisualMode();
visualMode.onchange=()=>{visualPreset=visualMode.value;localStorage.setItem('visual-preset',visualPreset);refreshVisualMode()};
window.runImmersiveTest=async()=>{$('mini-cover').click();await new Promise(r=>setTimeout(r,1200));const checks={opens:!immersive.classList.contains('hidden'),cover:!!immersiveArt.querySelector('img')?.naturalWidth,title:immersiveTitle.textContent===current?.title,canvas:visualCanvas.width>0&&visualPaints>0,separateCanvas:visualPanel.classList.contains('visual-panel')&&getComputedStyle(visualPanel).position==='relative'};const presetBefore=visualPreset;visualMode.value=presetBefore==='cover'?'mandala':'cover';visualMode.dispatchEvent(new Event('change'));checks.modeSwitch=visualPreset!==presetBefore;visualPreset='mandala';refreshVisualMode();dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));checks.escapeCloses=immersive.classList.contains('hidden');openImmersive();await start();await new Promise(r=>setTimeout(r,900));checks.reactsToAudio=levels.some(x=>x>.05);checks.mandalaRendered=mandalaBackground.frames>0;checks.mandalaSelected=visualPreset==='mandala';const artBounds=immersiveArt.getBoundingClientRect(),visualBounds=visualCanvas.getBoundingClientRect();checks.noCoverOverlap=artBounds.right<=visualBounds.left;checks.visualizerSpace=visualBounds.width>400&&visualBounds.height>300;checks.dropdown=visualMode.tagName==='SELECT'&&visualMode.options.length===6;checks.noCyanOption=![...visualMode.options].some(o=>o.value==='cyan');for(const key of ['starburst','centerbars','cover','milkdrop','flowfield']){visualMode.value=key;visualMode.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,500));checks[key+'Selected']=visualPreset===key;if(key==='milkdrop'){await new Promise(r=>setTimeout(r,2500));checks.milkdropEngine=!!milkdropBackground.mode?.gl&&!!milkdropBackground.mode?.preset&&!milkdropBackground.mode?.error;checks.milkdropFrames=milkdropBackground.mode?.frameNo>10}else if(key!=='cover')checks[key+'Rendered']=importedSceneRenderer.frames[key]>0}visualMode.value='mandala';visualMode.dispatchEvent(new Event('change'));return {ok:Object.values(checks).every(Boolean),checks}};
