const svgPaths={play:'M9 5l11 7-11 7z',pause:'M8 5v14M16 5v14',previous:'M5 5v14M19 5l-10 7 10 7z',next:'M19 5v14M5 5l10 7-10 7z',shuffle:'M3 6h3c5 0 7 12 12 12h3M17 14l4 4-4 4M3 18h3c2 0 3-2 4-4M14 8c1-1 2-2 4-2h3M17 2l4 4-4 4',repeat:'M4 10V8a4 4 0 014-4h12M17 1l3 3-3 3M20 14v2a4 4 0 01-4 4H4M7 17l-3 3 3 3',close:'M6 6l12 12M18 6L6 18',back:'M15 5l-7 7 7 7'};
function icon(name){const s=document.createElementNS('http://www.w3.org/2000/svg','svg');s.setAttribute('viewBox','0 0 24 24');s.setAttribute('fill',name==='play'?'currentColor':'none');s.setAttribute('stroke','currentColor');s.setAttribute('stroke-width','1.8');s.setAttribute('stroke-linecap','round');s.setAttribute('stroke-linejoin','round');s.setAttribute('aria-hidden','true');const p=document.createElementNS(s.namespaceURI,'path');p.setAttribute('d',svgPaths[name]||svgPaths.play);s.append(p);return s}
function refreshPlayIcon(){$('play').replaceChildren(icon(audio.paused?'play':'pause'))}
for(const id of ['previous','next','shuffle','repeat'])$(id).replaceChildren(icon(id));
audio.addEventListener('play',refreshPlayIcon);audio.addEventListener('pause',refreshPlayIcon);refreshPlayIcon();
const immersive=node('section','immersive hidden');immersive.id='immersive';immersive.setAttribute('aria-label','Полнооконный плеер');
const immersiveTop=node('div','immersive-top'),closeImmersive=node('button','back-button');closeImmersive.append(icon('back'),node('span','','В библиотеку'));const immersiveBadge=node('span','immersive-badge','ТВОЙ ЗВУК · ТВОЁ ПРОСТРАНСТВО');const showLyrics=node('button','lyrics-view-button','Текст песни ↗');immersiveTop.append(closeImmersive,immersiveBadge,showLyrics);
const immersiveArt=node('div','immersive-art'),immersiveTitle=node('h1','immersive-title'),immersiveArtist=node('p','immersive-artist'),immersiveAlbum=node('p','immersive-album'),immersiveInfo=node('div','immersive-info');immersiveInfo.append(immersiveArt,immersiveTitle,immersiveArtist,immersiveAlbum);
const visualPanel=node('div','visual-panel'),visualHeader=node('div','visual-header');const visualStatus=node('span','visual-status','НАЖМИ PLAY');const visualMode=node('select','visual-mode');visualHeader.append(node('span','','АУДИОВИЗУАЛИЗАЦИЯ'),visualMode);const visualCanvas=node('canvas','visual-canvas');visualCanvas.id='visualizer';const visualFooter=node('div','visual-footer');visualFooter.append(visualStatus,node('span','','ЖИВОЙ СИГНАЛ'));visualPanel.append(visualHeader,visualCanvas,visualFooter);immersive.append(immersiveTop,immersiveInfo,visualPanel);document.body.append(immersive);
let visualPreset=['mandala','cover','starburst','centerbars','milkdrop','flowfield'].includes(localStorage.getItem('visual-preset'))?localStorage.getItem('visual-preset'):'mandala',visualTick=0,visualPaints=0;

function updateImmersive(){if(!current)return;immersiveArt.replaceChildren(art(current,'immersive-image'));immersiveTitle.textContent=current.title;immersiveArtist.textContent=current.artist;immersiveAlbum.textContent=current.album;visualStatus.textContent=audio.paused?'НА ПАУЗЕ':'СЕЙЧАС ЗВУЧИТ'}
function openImmersive(){if(!current){toast('Сначала выбери трек');return}document.body.classList.remove('lyrics-focus');document.body.classList.add('track-focus');immersive.classList.remove('hidden');updateImmersive();closeImmersive.focus()}
function exitImmersive(){document.body.classList.remove('track-focus');immersive.classList.add('hidden');$('mini-cover').focus()}
for(const id of ['mini-cover','now-cover']){const e=$(id);e.tabIndex=0;e.setAttribute('role','button');e.setAttribute('aria-label','Открыть трек на всё окно');e.title='Открыть трек на всё окно';e.onclick=openImmersive;e.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();openImmersive()}}}
closeImmersive.onclick=exitImmersive;showLyrics.onclick=()=>{exitImmersive();document.body.classList.add('lyrics-focus');panelTab(true)};addEventListener('keydown',e=>{if(e.key==='Escape')exitImmersive()});audio.addEventListener('play',updateImmersive);audio.addEventListener('pause',()=>visualStatus.textContent='НА ПАУЗЕ');audio.addEventListener('loadedmetadata',updateImmersive);
const vg=visualCanvas.getContext('2d'),levels=new Float32Array(80);
let lyricsReturnToTrack=false;
const closeLyrics=node('button','close-lyrics-button');closeLyrics.append(icon('close'),node('span','','Закрыть текст'));closeLyrics.setAttribute('aria-label','Закрыть текст песни');document.body.append(closeLyrics);
showLyrics.onclick=()=>{lyricsReturnToTrack=true;exitImmersive();document.body.classList.add('lyrics-focus');panelTab(true);closeLyrics.focus()};
const originalExpandClick=expand.onclick;expand.onclick=()=>{lyricsReturnToTrack=false;originalExpandClick();if(document.body.classList.contains('lyrics-focus'))closeLyrics.focus()};
closeLyrics.onclick=()=>{document.body.classList.remove('lyrics-focus');expand.textContent='↗';if(lyricsReturnToTrack){lyricsReturnToTrack=false;openImmersive()}else expand.focus()};
let ribbonTime=0,ribbonPrevious=0,ribbonEnergy=0;
const response=new AudioResponse();
const mandalaBackground=new MandalaBackground();
const milkdropBackground=new MilkdropBackground();
const importedSceneRenderer=new ImportedSceneRenderer();
const reactionLabel=node('label','reaction-control'),reactionText=node('span','','Реакция'),reactionSlider=node('input');reactionSlider.type='range';reactionSlider.min='.5';reactionSlider.max='3';reactionSlider.step='.1';reactionSlider.value=localStorage.getItem('visual-sensitivity')||'1.4';reactionSlider.setAttribute('aria-label','Чувствительность визуализации');reactionSlider.oninput=()=>localStorage.setItem('visual-sensitivity',reactionSlider.value);reactionLabel.append(reactionText,reactionSlider);immersiveTop.insertBefore(reactionLabel,showLyrics);

function drawVisualizer(ms){
 requestAnimationFrame(drawVisualizer);
 if(document.hidden||immersive.classList.contains('hidden')||ms-visualTick<32)return;
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
immersiveTop.insertBefore(visualMode,showLyrics);const visualOptions={mandala:'Mandala Drop',cover:'Волны · цвет обложки',starburst:'Огненные лучи',centerbars:'Ретро-спектр',milkdrop:'MilkDrop Backdrop',flowfield:'Flow Backdrop'};
for(const [id,label]of Object.entries(visualOptions)){const option=node('option','',label);option.value=id;visualMode.append(option)}
function refreshVisualMode(){
 immersive.classList.toggle('milkdrop-layout',visualPreset==='milkdrop'||visualPreset==='flowfield');immersive.classList.toggle('mandala-layout',visualPreset==='mandala');immersive.classList.toggle('starburst-layout',visualPreset==='starburst');immersive.classList.toggle('bars-layout',visualPreset==='centerbars');
 visualMode.value=visualPreset;visualMode.title='Выбрать визуализацию';visualMode.setAttribute('aria-label','Визуализация');
}
refreshVisualMode();
visualMode.onchange=()=>{visualPreset=visualMode.value;localStorage.setItem('visual-preset',visualPreset);refreshVisualMode()};
window.runImmersiveTest=async()=>{$('mini-cover').click();await new Promise(r=>setTimeout(r,1200));const checks={opens:!immersive.classList.contains('hidden'),cover:!!immersiveArt.querySelector('img')?.naturalWidth,title:immersiveTitle.textContent===current?.title,canvas:visualCanvas.width>0&&visualPaints>0,fullBackground:visualPanel.classList.contains('visual-panel')&&getComputedStyle(visualPanel).position==='absolute'};const presetBefore=visualPreset;visualMode.value=presetBefore==='cover'?'mandala':'cover';visualMode.dispatchEvent(new Event('change'));checks.modeSwitch=visualPreset!==presetBefore;visualPreset='mandala';refreshVisualMode();dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));checks.escapeCloses=immersive.classList.contains('hidden');openImmersive();await start();await new Promise(r=>setTimeout(r,900));checks.reactsToAudio=levels.some(x=>x>.05);checks.mandalaRendered=mandalaBackground.frames>0;checks.mandalaSelected=visualPreset==='mandala';const artBounds=immersiveArt.getBoundingClientRect(),visualBounds=visualCanvas.getBoundingClientRect();checks.noCoverOverlap=artBounds.right<=visualBounds.left;checks.visualizerSpace=visualBounds.width>400&&visualBounds.height>300;checks.dropdown=visualMode.tagName==='SELECT'&&visualMode.options.length===6;checks.noCyanOption=![...visualMode.options].some(o=>o.value==='cyan');for(const key of ['starburst','centerbars','cover','milkdrop','flowfield']){visualMode.value=key;visualMode.dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,500));checks[key+'Selected']=visualPreset===key;if(key==='milkdrop'){await new Promise(r=>setTimeout(r,2500));checks.milkdropEngine=!!milkdropBackground.mode?.gl&&!!milkdropBackground.mode?.preset&&!milkdropBackground.mode?.error;checks.milkdropFrames=milkdropBackground.mode?.frameNo>10}else if(key!=='cover')checks[key+'Rendered']=importedSceneRenderer.frames[key]>0}visualMode.value='mandala';visualMode.dispatchEvent(new Event('change'));return {ok:Object.values(checks).every(Boolean),checks}};
