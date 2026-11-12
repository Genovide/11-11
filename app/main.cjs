const {app,BrowserWindow,ipcMain,dialog,protocol,net,safeStorage}=require('electron');app.setPath('userData',require('./platform-config.cjs').userDataPath({exe:app.getPath('exe'),appData:app.getPath('appData')}));const testProfile=process.env.SOUNDSYNC_SMOKE_DIR||process.env.SOUNDSYNC_UI_TEST_DIR;if(testProfile)app.setPath('userData',require('node:path').resolve(testProfile));app.setName('SoundSync');if(process.platform==='win32')app.setAppUserModelId('SoundSync.Player');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const uiThemeFile=path.join(app.getPath('userData'),'ui-preferences.json');
let uiPreferences={},uiThemeWrites=Promise.resolve();
try{const value=JSON.parse(require('node:fs').readFileSync(uiThemeFile,'utf8'));if(value&&typeof value==='object'&&!Array.isArray(value))uiPreferences=value}catch{}
function persistUiPreferences(event,patch){
 if(!win||event.sender!==win.webContents)throw Error('Invalid preference sender');
 if(typeof patch.flatTheme==='boolean')uiPreferences.flatTheme=patch.flatTheme;
 if(typeof patch.volume==='number'&&Number.isFinite(patch.volume)&&patch.volume>=0&&patch.volume<=1)uiPreferences.volume=patch.volume;
 if(['library','soundcloud'].includes(patch.randomSourceChoice))uiPreferences.randomSourceChoice=patch.randomSourceChoice;
 if(Array.isArray(patch.playedTrackKeys))uiPreferences.playedTrackKeys=[...new Set(patch.playedTrackKeys.filter(id=>typeof id==='string'&&id.length<=240))].slice(-100000);
 if(Array.isArray(patch.recent))uiPreferences.recent=patch.recent.filter(id=>typeof id==='string'&&id.length<=200).slice(0,100);
 if(Array.isArray(patch.favoriteIds))uiPreferences.favoriteIds=[...new Set(patch.favoriteIds.filter(id=>typeof id==='string'&&id.length<=200))];
 const data=JSON.stringify(uiPreferences);
 uiThemeWrites=uiThemeWrites.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(uiThemeFile),{recursive:true});await fs.writeFile(uiThemeFile+'.tmp',data);await fs.rename(uiThemeFile+'.tmp',uiThemeFile)});
 return uiThemeWrites;
}
ipcMain.on('ui-theme-read',event=>{event.returnValue=typeof uiPreferences.flatTheme==='boolean'?uiPreferences.flatTheme:null});
ipcMain.handle('ui-theme-save',(event,flat)=>persistUiPreferences(event,{flatTheme:flat}));
ipcMain.on('ui-preferences-read',event=>{event.returnValue=uiPreferences});
ipcMain.handle('ui-preferences-save',(event,patch)=>persistUiPreferences(event,patch&&typeof patch==='object'?patch:{}));
const {pathToFileURL}=require('node:url');
let quitting=false;const rendererErrors=[];
async function startupLog(message){try{const dir=app.getPath('userData');await fs.mkdir(dir,{recursive:true});await fs.appendFile(path.join(dir,'startup.log'),new Date().toISOString()+' '+message+'\n')}catch{}}
async function startupFailure(error){await startupLog(error.stack||String(error));dialog.showErrorBox('SoundSync — ошибка запуска',String(error.message||error)+'\n\nПодробности: '+path.join(app.getPath('userData'),'startup.log'));app.quit()}
ipcMain.on('renderer-diagnostic',(event,payload)=>{if(win&&event.sender===win.webContents){rendererErrors.push(payload);startupLog('Renderer: '+JSON.stringify(payload))}});
app.on('before-quit',event=>{if(!quitting){event.preventDefault();quitting=true;Promise.allSettled([uiThemeWrites,soundcloud?.flush?.(),trackCards?.flush?.()]).finally(()=>app.quit())}});app.on('activate',()=>{if(win&&!win.isDestroyed())win.show()});

protocol.registerSchemesAsPrivileged([{scheme:'lumen',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true,bypassCSP:false}}]);
let soundcloud,alignmentEngine,lyricsStore,libraryMetadata,trackCards;let win,library={folder:'',tracks:[]},allowed=new Map(),scanBusy=false;
const smoke=false;
function allow(){if(trackCards)library.tracks.forEach(trackCards.restore);allowed=new Map();for(const t of library.tracks){allowed.set(t.id,t.path);if(t.cover)allowed.set(t.id+'-cover',t.cover)}}
const dataFile=()=>path.join(app.getPath('userData'),'library.json');
let saveQueue=Promise.resolve();
async function save(){if(trackCards)library.tracks.forEach(trackCards.restore);const snapshot=JSON.stringify(library);saveQueue=saveQueue.catch(()=>{}).then(async()=>{await fs.mkdir(app.getPath('userData'),{recursive:true});const tmp=dataFile()+'.tmp';await fs.writeFile(tmp,snapshot);await fs.rename(tmp,dataFile())});return saveQueue}
async function readLocalTrack(p){
 const {parseFile}=await import('music-metadata');const m=await parseFile(p,{duration:true}),c=m.common,id=crypto.createHash('sha1').update(p).digest('hex');let cover='';
 if(c.picture?.length){const pic=c.picture[0],hash=crypto.createHash('sha1').update(pic.data).digest('hex'),dir=path.join(app.getPath('userData'),'covers');await fs.mkdir(dir,{recursive:true});cover=path.join(dir,hash+'.'+(pic.format.includes('png')?'png':'jpg'));await fs.writeFile(cover,pic.data)}
 return{id,path:p,title:c.title||path.basename(p,path.extname(p)),artist:c.artist||'Неизвестный исполнитель',albumartist:c.albumartist||c.artist||'',album:c.album||'Без альбома',duration:m.format.duration||0,track:c.track?.no||0,year:c.year||'',cover,lyrics:(c.lyrics||[]).map(x=>typeof x==='string'?x:x.text||'').join('\n')};
}
async function scan(folder){
 if(scanBusy)throw Error('Сканирование уже идёт'); scanBusy=true;
 try{
 const {parseFile}=await import('music-metadata');const files=[],seenDirectories=new Set(),known=new Map(library.tracks.map(t=>[t.path,t]));
 async function walk(dir){dir=path.resolve(dir);const real=(await fs.realpath(dir)).toLowerCase();if(seenDirectories.has(real))return;seenDirectories.add(real);for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()&&!e.name.startsWith('.SoundSync-'))await walk(p);else if(/\.(mp3|m4a|flac|wav|ogg|opus|aac)$/i.test(e.name))files.push(p)}}
 if(folder)await walk(folder);if(soundcloud)for(const root of await soundcloud.downloadRoots()){try{await walk(root)}catch(e){if(e.code!=='ENOENT')throw e}}const tracks=[];let cursor=0,done=0,errors=0;
 const downloadRoots=soundcloud?(await soundcloud.downloadRoots()).map(p=>path.resolve(p).toLowerCase()):[];const covers=path.join(app.getPath('userData'),'covers');await fs.mkdir(covers,{recursive:true});
 async function worker(){while(cursor<files.length){const p=files[cursor++];try{const m=await parseFile(p,{duration:false});const c=m.common;const id=crypto.createHash('sha1').update(p).digest('hex');let cover='';if(c.picture?.length){const pic=c.picture[0];const hash=crypto.createHash('sha1').update(pic.data).digest('hex');cover=path.join(covers,hash+'.'+(pic.format.includes('png')?'png':'jpg'));try{await fs.access(cover)}catch{await fs.writeFile(cover,pic.data)}}
 let lyrics=(c.lyrics||[]).map(x=>typeof x==='string'?x:x.syncText?.map(l=>{const s=(l.timestamp||0)/1000;return `[${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}]${l.text}`}).join('\n')||x.text||'').join('\n');
 for(const ext of ['.lrc','.txt']){try{const adjacent=await fs.readFile(p.slice(0,-path.extname(p).length)+ext,'utf8');if(adjacent.trim()){lyrics=adjacent;break}}catch{}}
 tracks.push({...((known.get(p)?.downloaded||downloadRoots.some(root=>path.resolve(p).toLowerCase().startsWith(root+path.sep)))?{downloaded:true,soundcloudId:known.get(p)?.soundcloudId,soundcloudUrl:known.get(p)?.soundcloudUrl}:{}),id,path:p,title:c.title||path.basename(p,path.extname(p)),artist:c.artist||c.artists?.join(', ')||'Неизвестный исполнитель',albumartist:c.albumartist||c.artist||'',album:c.album||'Без альбома',duration:m.format.duration||0,track:c.track?.no||0,year:c.year||'',cover,lyrics});
 }catch{errors++}done++;if(done%25===0||done===files.length)win?.webContents.send('scan-progress',{done,total:files.length,errors})}}
 await Promise.all(Array.from({length:6},worker));tracks.sort((a,b)=>a.artist.localeCompare(b.artist,'ru')||a.album.localeCompare(b.album,'ru')||a.track-b.track||a.title.localeCompare(b.title,'ru'));
 for(const t of library.tracks.filter(t=>t.downloaded))if(!tracks.some(x=>x.id===t.id)){try{await fs.access(t.path);tracks.push(t)}catch{}}if(libraryMetadata)libraryMetadata.restore(tracks);if(lyricsStore)await lyricsStore.restore(tracks);if(alignmentEngine)await alignmentEngine.restore(tracks);library={folder,tracks,errors};allow();await save();return library;
 }finally{scanBusy=false}
}
app.whenReady().then(async()=>{
 trackCards=require('./track-card.cjs')({app,ipcMain,dialog,nativeImage:require('electron').nativeImage,getWindow:()=>win,getLibrary:()=>library,getRemoteTrack:id=>soundcloud?.getTrack(id),save,refreshAllowed:allow});await trackCards.ready;
 libraryMetadata=require('./lyrics-metadata.cjs')({app,ipcMain,getLibrary:()=>library,getWindow:()=>win,save});await libraryMetadata.ready;

 if(smoke)await fs.appendFile(path.resolve(__dirname,'../../../../work/main-started.txt'),'\nready');
 if(smoke)app.setPath('userData',path.join(__dirname,'..','..','..','..','work','lumen-test-profile'));alignmentEngine=require('./alignment.cjs')({app,ipcMain,getLibrary:()=>library,save,send:(channel,data)=>win?.webContents.send(channel,data)});
 lyricsStore=require('./custom-lyrics.cjs')({app,ipcMain,getLibrary:()=>library,save,isAligning:id=>alignmentEngine.isAligning(id)});try{library=JSON.parse(await fs.readFile(dataFile(),'utf8'))}catch{}libraryMetadata.restore(library.tracks);await lyricsStore.restore(library.tracks);await alignmentEngine.restore(library.tracks);allow();require('./lyrics-search.cjs')({app,ipcMain});soundcloud=require('./soundcloud.cjs')({app,ipcMain,dialog,safeStorage,getWindow:()=>win,getLibrary:()=>library,save,refreshAllowed:allow,readTrack:readLocalTrack,applyTrackCard:trackCards.restore,isAligning:id=>scanBusy||alignmentEngine.isAligning(id),send:(channel,data)=>win?.webContents.send(channel,data)});
 require('./song-insight.cjs')({app,ipcMain,safeStorage,getLibrary:()=>library,getRemoteTrack:id=>soundcloud.getTrack(id)});
 require('./local-playback.cjs')({app,ipcMain,getWindow:()=>win,getLibrary:()=>library,register:(id,file)=>allowed.set(id,file)});
 protocol.handle('lumen',async request=>{
  if(new URL(request.url).hostname==='track-cover')return trackCards.cover(request);
  if(new URL(request.url).hostname.startsWith('sc-'))return soundcloud.handleProtocol(request);
  const p=allowed.get(new URL(request.url).pathname.slice(1));if(!p)return new Response('Not found',{status:404});
  try{const {size}=await fs.stat(p);const mime={'.mp3':'audio/mpeg','.m4a':'audio/mp4','.flac':'audio/flac','.wav':'audio/wav','.ogg':'audio/ogg','.opus':'audio/ogg','.aac':'audio/aac','.jpg':'image/jpeg','.png':'image/png'}[path.extname(p).toLowerCase()]||'application/octet-stream';
  let start=0,end=size-1,status=200;const range=request.headers.get('range');
  if(range){const m=/bytes=(\d*)-(\d*)/.exec(range);if(m){if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]))}status=206}}
  if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  const headers={'Content-Type':mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Length, Content-Range, Accept-Ranges'};
  if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  const stream=require('node:fs').createReadStream(p,{start,end});return new Response(require('node:stream').Readable.toWeb(stream),{status,headers});
  }catch{return new Response('File unavailable',{status:404})}
 });
 ipcMain.handle('library',()=>library);
 ipcMain.handle('choose-folder',async()=>{const result=await dialog.showOpenDialog(win,{properties:['openDirectory'],title:'Где лежит твоя музыка?'});if(result.canceled)return null;return scan(result.filePaths[0])});
 ipcMain.handle('rescan',()=>scan(library.folder||''));
 ipcMain.handle('window',(_,action)=>{if(action==='minimize')win.minimize();if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();if(action==='close')win.close()});
 win=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:720,frame:process.platform==='darwin',backgroundColor:'#090c12',icon:path.join(__dirname,process.platform==='darwin'?'icon.png':'icon.ico'),show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:!process.env.SOUNDSYNC_UI_TEST_DIR,contextIsolation:true,nodeIntegration:false,sandbox:true}});
 require('./mini-player.cjs')({app,BrowserWindow,ipcMain,screen:require('electron').screen,getWindow:()=>win});
 if(smoke)win.webContents.on('console-message',(...args)=>fs.appendFile(path.resolve(__dirname,'../../../../work/renderer-log.txt'),JSON.stringify(args.slice(1))+'\n').catch(()=>{}));
 if(smoke)await fs.appendFile(path.resolve(__dirname,'../../../../work/main-started.txt'),'\nwindow');
 win.webContents.on('console-message',(event,level,message,line,sourceId)=>{const detail=typeof event?.message==='string'?event:{level,message,lineNumber:line,sourceId};if(detail.level==='error'||detail.level>=3){rendererErrors.push({message:detail.message,source:detail.sourceId,line:detail.lineNumber});startupLog('Console: '+detail.message)}});
 win.webContents.on('render-process-gone',(_e,details)=>startupLog('Renderer stopped: '+JSON.stringify(details)));
 win.webContents.on('preload-error',(_e,_preload,error)=>{rendererErrors.push(error.message);startupLog('Preload: '+error.stack)});
 if(process.platform==='darwin')win.on('close',event=>{if(!quitting){event.preventDefault();win.hide()}});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 if(smoke)win.webContents.setBackgroundThrottling(false);await win.loadFile('index.html');if(!process.env.SOUNDSYNC_UI_TEST_DIR)win.show();
 if(process.env.SOUNDSYNC_SMOKE_DIR){await new Promise(resolve=>setTimeout(resolve,1500));const state=await win.webContents.executeJavaScript("({title:document.title,brand:document.querySelector('.brand-name')?.textContent,sorting:!!document.querySelector('#library-sort'),metadata:!!window.TrackIdentity,reviews:!!window.RztData,platform:navigator.platform,bridge:typeof window.lumen,navs:[...document.querySelectorAll('[data-view]')].map(e=>e.dataset.view),controls:getComputedStyle(document.querySelector('.window-actions')).display})");await fs.writeFile(path.join(app.getPath('userData'),'smoke-report.json'),JSON.stringify({state,rendererErrors,versions:process.versions,arch:process.arch,platform:process.platform,runtime:require('./runtime-paths.cjs').python},null,2));await fs.writeFile(path.join(app.getPath('userData'),'startup.png'),(await win.webContents.capturePage()).toPNG());app.quit();}

}).catch(startupFailure);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
require('./updates.cjs')({ipcMain,shell:require('electron').shell});

require('./rzt-reviews.cjs')({app,ipcMain,BrowserWindow,getWindow:()=>win});
