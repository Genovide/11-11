const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function payload(input,{version,platform=process.platform}={}){
 if(!input||typeof input!=='object')throw Error('Заполни форму обратной связи.');
 const text=(v,min,max,error)=>{if(typeof v!=='string')throw Error(error);const s=v.trim();if(s.length<min||s.length>max)throw Error(error);return s};
 return{type:['bug','idea','other'].includes(input.type)?input.type:'other',id:typeof input.id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(input.id)?input.id:crypto.randomUUID(),title:text(input.title,3,120,'Тема: от 3 до 120 символов.'),message:text(input.message,10,3000,'Сообщение: от 10 до 3000 символов.'),contact:text(input.contact||'',0,160,'Контакт: максимум 160 символов.'),...(input.includeInfo?{version,platform:{win32:'Windows',darwin:'macOS',linux:'Linux'}[platform]||platform}:{})};
}
module.exports=function({ipcMain,getWindow,version,fetchImpl=fetch,endpoint}){
 ipcMain.handle('feedback-open',async(event,input)=>{
  if(event.sender!==getWindow()?.webContents)throw Error('Неизвестное окно');
  const body=payload(input,{version});
  let target=endpoint;if(target===undefined){try{target=JSON.parse(fs.readFileSync(path.join(__dirname,'feedback-config.json'),'utf8')).endpoint}catch{}}
  if(!target)throw Error('Приём обращений ещё настраивается. Текст можно скопировать и отправить позже.');
  const url=new URL(target);if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Некорректный адрес обратной связи.');
  try{const response=await fetchImpl(url.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Не удалось отправить обращение. Попробуй позже.');return{sent:true,id:data.id}}catch(e){if(e.name==='TimeoutError'||e.name==='AbortError'||e instanceof TypeError)throw Error('Нет соединения с сервисом. Текст сохранён в форме — попробуй ещё раз.');throw e}
 });
};
module.exports.payload=payload;
