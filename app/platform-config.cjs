const path=require('node:path');
function userDataPath({platform=process.platform,exe,appData}){return platform==='win32'?path.join(path.dirname(exe),'Data'):path.join(appData,'SoundSync')}
module.exports={userDataPath};
