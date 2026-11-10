const VERSION='1.2.4',REPO='Genovide/SoundSync';
function newer(a,b){const parse=v=>String(v).replace(/^v/,'').split('.').map(Number);if(!/^v?\d+\.\d+\.\d+$/.test(a))return false;const x=parse(a),y=parse(b);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return false}
module.exports=function({ipcMain,shell,fetchImpl=fetch}){
 ipcMain.handle('updates-check',async()=>{const response=await fetchImpl(`https://api.github.com/repos/${REPO}/releases/latest`,{headers:{Accept:'application/vnd.github+json','User-Agent':'SoundSync-player'},signal:AbortSignal.timeout(15000)});if(response.status===404)return{version:VERSION,available:false,unpublished:true};if(!response.ok)throw Error('Не удалось проверить обновления (HTTP '+response.status+')');const r=await response.json();return{version:VERSION,latest:r.tag_name,available:newer(r.tag_name,VERSION),unpublished:false}});
 ipcMain.handle('updates-open',()=>shell.openExternal(`https://github.com/${REPO}/releases/latest`));
};module.exports.newer=newer;
