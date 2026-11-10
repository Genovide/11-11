function artworkCandidates(value){
 try{const url=new URL(value);if(url.protocol!=='https:'||!(url.hostname==='sndcdn.com'||url.hostname.endsWith('.sndcdn.com')))return[];
 const variants=['original','t500x500'].map(size=>{const copy=new URL(url);copy.pathname=copy.pathname.replace(/-(?:large|small|badge|tiny|t\d+x\d+|original)(\.[a-z0-9]+)$/i,'-'+size+'$1');return copy.href});return[...new Set([...variants,url.href])];
 }catch{return[]}
}
module.exports={artworkCandidates};
