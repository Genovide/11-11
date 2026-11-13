function validate(value){const u=new URL(String(value||'').trim());if(u.protocol!=='https:'||u.username||u.password||u.port||!['soundcloud.com','www.soundcloud.com','m.soundcloud.com','on.soundcloud.com'].includes(u.hostname))throw Error('Нужна HTTPS-ссылка SoundCloud.');return u}
module.exports=async function expand(value,{fetchImpl=fetch,cancelled=()=>false}={}){
 let url=validate(value);
 for(let hop=0;hop<6;hop++){
  if(cancelled())throw Error('Импорт отменён.');
  if(url.hostname!=='on.soundcloud.com')return url.href;
  const r=await fetchImpl(url.href,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
  const location=r.headers.get('location');
  if(![301,302,303,307,308].includes(r.status)||!location)throw Error('Не удалось раскрыть короткую ссылку SoundCloud. Скопируй полный адрес из браузера.');
  url=validate(new URL(location,url).href);
 }
 throw Error('Слишком много перенаправлений SoundCloud.');
};
