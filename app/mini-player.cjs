'use strict';
const path=require('node:path');
module.exports=({app,BrowserWindow,ipcMain,screen,getWindow})=>{
 let mini=null,latest={},quitting=false;app.on('before-quit',()=>{quitting=true});
 const mainSender=e=>e.sender===getWindow()?.webContents,miniSender=e=>mini&&!mini.isDestroyed()&&e.sender===mini.webContents;
 function publish(){if(mini&&!mini.isDestroyed())mini.webContents.send('mini-player-state',{...latest,pinned:mini.isAlwaysOnTop()})}
 ipcMain.on('mini-player-state',(e,state)=>{
  if(!mainSender(e)||!state||typeof state!=='object')return;
  latest={id:typeof state.id==='string'?state.id.slice(0,200):'',title:String(state.title||'Пока тихо').slice(0,500),artist:String(state.artist||'Выбери трек в библиотеке').slice(0,500),cover:typeof state.cover==='string'&&/^lumen:\/\/(media|sc-cover|track-cover)\//.test(state.cover)?state.cover:'',playing:state.playing===true,liked:state.liked===true,position:Number.isFinite(state.position)?Math.max(0,state.position):0,duration:Number.isFinite(state.duration)?Math.max(0,state.duration):0,volume:Number.isFinite(state.volume)?Math.min(1,Math.max(0,state.volume)):.7};publish();
 });
 ipcMain.handle('mini-player-open',async e=>{
  if(!mainSender(e))throw Error('Unknown window');
  const main=getWindow();if(!mini||mini.isDestroyed()){
   const area=screen.getDisplayMatching(main.getBounds()).workArea;
   mini=new BrowserWindow({width:380,height:192,x:area.x+area.width-404,y:area.y+area.height-218,resizable:false,maximizable:false,fullscreenable:false,frame:false,alwaysOnTop:true,show:false,backgroundColor:'#111719',title:'SoundSync · Мини-плеер',icon:path.join(__dirname,process.platform==='darwin'?'icon.png':'icon.ico'),webPreferences:{preload:path.join(__dirname,'mini-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
   const window=mini;window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',event=>event.preventDefault());
   window.on('closed',()=>{if(mini===window)mini=null;if(!quitting&&main&&!main.isDestroyed()){main.webContents.setBackgroundThrottling(!process.env.SOUNDSYNC_UI_TEST_DIR);main.show();main.focus()}});
   const destroy=()=>{if(!window.isDestroyed())window.destroy()};main.once('closed',destroy);window.once('closed',()=>main.removeListener('closed',destroy));
   await window.loadFile(path.join(__dirname,'mini-player.html'));if(window.isDestroyed())return false;
  }
  main.webContents.setBackgroundThrottling(false);publish();mini.show();main.hide();return true;
 });
 ipcMain.handle('mini-player-command',(e,action,value,id)=>{
  if(!miniSender(e))throw Error('Unknown window');const main=getWindow();
  if(action==='restore'||action==='close'){mini.close();return}
  if(action==='pin'){mini.setAlwaysOnTop(!mini.isAlwaysOnTop());publish();return{pinned:mini.isAlwaysOnTop()}}
  if(!['play','previous','next','favorite','seek','volume'].includes(action))return;
  if((action==='seek'||action==='volume')&&(!Number.isFinite(value)||value<0||value>1))return;
  if(main&&!main.isDestroyed())main.webContents.send('mini-player-command',{action,value,id:typeof id==='string'?id:''});
 });
 return{getWindow:()=>mini};
};
