// Both installed builds carry their own interpreter, models and FFmpeg.
const path=require('node:path'),fs=require('node:fs');
const candidates=[path.join(process.resourcesPath||__dirname,'alignment'),path.resolve(__dirname,'../../alignment')];
const base=candidates.find(p=>fs.existsSync(path.join(p,'runtime')))||candidates[0];
const python=path.join(base,'runtime',process.platform==='win32'?'python.exe':'bin/python3.12');
const script=name=>path.join(base,name);
module.exports={base,python,script};
