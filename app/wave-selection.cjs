const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/ё/g,'е').replace(/[^\p{L}\p{N}]/gu,'');
const artistKey=s=>normalize(String(s||'').split(/\s+(?:feat\.?|ft\.?|при уч\.)\s+|[,;&]/i)[0]);
function artistAliases(name){const keys=[artistKey(name)],words=String(name||'').split(/[,;&]/)[0].trim().split(/\s+/).filter(Boolean);if(words.length>=3){const initials=words.map(w=>w[0]).join('');keys.push(normalize(initials));const letters={'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','э':'e','ю':'yu','я':'ya'};keys.push(normalize(initials).split('').map(c=>letters[c]||c).join(''))}return keys.filter(Boolean)}
const owner=t=>{try{return new URL(t.pageUrl).pathname.split('/').filter(Boolean)[0]?.toLowerCase()||''}catch{return''}};
const identity=t=>artistKey(t.artist)+'\0'+normalize(String(t.title||'').replace(/[([][^\])]*(?:prod\.?|slowed|sped|lyrics|official audio|bass boosted)[^\])]*[\])]/gi,''));
function selectDiverse(candidates,{seedArtists=[],seedOwners=[],seenIds=new Set(),seenIdentities=new Set(),recentArtists=[],limit=12}={}){
 const excluded=new Set(seedArtists.flatMap(artistAliases)),owners=new Set(seedOwners.filter(Boolean)),unique=new Map();
 for(const [index,t]of candidates.entries()){if(t.playbackUnavailable)continue;
  const artist=artistKey(t.artist),key=identity(t);if(!artist||['soundcloud','unknown','неизвестныйисполнитель'].includes(artist)||seenIds.has(t.id)||seenIdentities.has(key)||excluded.has(artist)||owners.has(owner(t)))continue;
  // Fan reuploads can label the uploader as artist but retain the seed artist in the title.
  if([...excluded].some(a=>a.length>=3&&normalize(t.title).startsWith(a)))continue;
  if(!unique.has(key))unique.set(key,{t,artist,index});
 }
 const pool=[...unique.values()],selected=[],counts=new Map(),recent=recentArtists.map(artistKey).filter(Boolean);
 while(selected.length<limit&&pool.length){const last=recent.at(-1);let best=-1,bestScore=-Infinity;
  for(let i=0;i<pool.length;i++){const item=pool[i],used=counts.get(item.artist)||0;if(used>=2||item.artist===last||recent.slice(-9).filter(a=>a===item.artist).length>=2)continue;const score=100+(item.t.relationVotes||1)*10-item.index*.25-used*20+(recent.includes(item.artist)?-8:0);if(score>bestScore){bestScore=score;best=i}}
  if(best<0&&selected.length<4){for(let i=0;i<pool.length;i++){const item=pool[i],used=counts.get(item.artist)||0;if(used>=2||item.artist===last)continue;const score=100+(item.t.relationVotes||1)*10-item.index*.25-used*20-recent.slice(-9).filter(a=>a===item.artist).length*12;if(score>bestScore){bestScore=score;best=i}}}if(best<0)break;const item=pool.splice(best,1)[0];selected.push(item.t);counts.set(item.artist,(counts.get(item.artist)||0)+1);recent.push(item.artist);
 }
 return selected;
}
module.exports={normalize,artistKey,artistAliases,owner,identity,selectDiverse};

