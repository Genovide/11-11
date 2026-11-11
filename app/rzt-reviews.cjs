'use strict';
const path = require('node:path');
const HOME = 'https://risazatvorchestvo.com';

module.exports = ({app, ipcMain, BrowserWindow, getWindow}) => {
  const {session} = require('electron');
  let verification = null, cache = new Map(), pending = new Map();
  function authorized(event) { const owner=getWindow(); if (!owner || event.sender !== owner.webContents) throw new Error('Unknown window'); return owner; }
  function validPath(value) {
    if (typeof value !== 'string' || value.length > 1600) throw new Error('Некорректный адрес РЗТ');
    const u=new URL(value,HOME);
    if (u.origin !== HOME || !/^\/(?:releases|search|track\/[^/]+|album\/[^/]+|release\/[^/]+|reviews?\/[^/]+)(?:\/reviews)?\/?$/.test(u.pathname)) throw new Error('Некорректный адрес РЗТ');
    return u.pathname + u.search;
  }
  function rztSession() {
    const s=session.fromPartition('persist:rzt-reviews');
    s.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    s.setPermissionCheckHandler(()=>false);
    return s;
  }
  async function fetchPage(route, force) {
    const stored=cache.get(route);
    if (!force && stored && Date.now()-stored.fetchedAt < 180000) return {...stored,cached:true};
    if (pending.has(route)) return pending.get(route);
    const request=(async()=>{
      try {
        const response=await rztSession().fetch(HOME+route,{signal:AbortSignal.timeout(25000),headers:{'Accept':'text/html,application/xhtml+xml','Accept-Language':'ru-RU,ru;q=0.9'}});
        if (!response.ok) return {error:response.status===429?'Слишком много запросов к РЗТ. Подожди немного и попробуй снова.':'РЗТ временно недоступен. Попробуй позже.',code:'NETWORK'};
        const reader=response.body.getReader(); let size=0; const parts=[];
        while (true) { const {done,value}=await reader.read(); if (done) break; size+=value.length; if (size>10*1024*1024) { await reader.cancel(); return {error:'Страница РЗТ слишком большая.',code:'FORMAT'}; } parts.push(Buffer.from(value)); }
        const html=Buffer.concat(parts).toString('utf8');
        if (/\/tmgrdfrend\/|<title>\s*(?:Verification|Верификация|Вы не робот\?|Are you not a robot\?)/i.test(response.url+' '+html)) return {code:'VERIFY',error:'РЗТ просит подтвердить, что ты не робот. Пройди проверку сайта, затем нажми «Обновить».'};
        const result={html,fetchedAt:Date.now(),cached:false}; cache.set(route,result);
        if(cache.size>30) cache.delete(cache.keys().next().value);
        return result;
      } catch { return {code:'NETWORK',error:'Не удалось подключиться к РЗТ. Проверь интернет и попробуй снова.'}; }
      finally { pending.delete(route); }
    })();
    pending.set(route,request); return request;
  }
  ipcMain.handle('rzt-page',async(event,payload={})=>{authorized(event); return fetchPage(validPath(payload.path),!!payload.force);});
  ipcMain.handle('rzt-reviews-open',event=>{
    const owner=authorized(event);
    rztSession();
    if (verification && !verification.isDestroyed()) { if(verification.isMinimized()) verification.restore(); verification.show(); verification.focus(); return; }
    verification=new BrowserWindow({parent:owner,width:1000,height:780,minWidth:760,minHeight:560,title:'Проверка сайта РЗТ',autoHideMenuBar:true,backgroundColor:'#111111',show:false,
      webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:rzt-reviews'}});
    const window=verification, contents=window.webContents;
    const allowed=value=>{try{const u=new URL(value);return u.protocol==='https:' && u.hostname==='risazatvorchestvo.com';}catch{return false;}};
    contents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault();});
    contents.on('will-redirect',(event,url)=>{if(!allowed(url))event.preventDefault();});
    contents.setWindowOpenHandler(()=>({action:'deny'}));
    window.setMenu(null);
    window.once('ready-to-show',()=>window.show());
    window.on('closed',()=>{verification=null;cache.clear();});
    contents.loadURL(HOME+'/releases').catch(()=>{if(!window.isDestroyed())window.close();});
  });
};
