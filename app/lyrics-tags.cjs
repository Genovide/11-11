const path=require('node:path'),{spawn}=require('node:child_process');
module.exports=function writeLyricsTags(job){return new Promise((resolve,reject)=>{
 const child=spawn(require('./runtime-paths.cjs').python,[require('./runtime-paths.cjs').script('lyrics_tags.py')],{windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'}});let out='',err='';const timer=setTimeout(()=>child.kill(),90000);
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err=(err+s).slice(-2000));child.on('error',reject);child.on('close',code=>{clearTimeout(timer);try{const response=JSON.parse(out);if(code||response.error)throw Error(response.error||err||'Не удалось записать текст в файл');resolve(response)}catch(e){reject(e)}});child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(job));
})};
