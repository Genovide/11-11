const assert=require('node:assert/strict'),{profileUrl,readLikes}=require('../app/soundcloud-likes-import.cjs'),setup=require('../app/soundcloud-import.cjs');
assert.equal(profileUrl('https://m.soundcloud.com/person/likes?si=123'),'https://soundcloud.com/person');
for(const bad of ['https://soundcloud.com/you/likes','https://evil.test/person','http://soundcloud.com/person','https://soundcloud.com/a/song','https://user:pass@soundcloud.com/a'])assert.throws(()=>profileUrl(bad));
const track=id=>({id:'sc-'+id,scId:String(id),remote:true,title:'Track '+id,artist:'Artist',pageUrl:'https://soundcloud.com/person/song-'+id});
(async()=>{
 let page=0;
 const read=await readLikes('https://soundcloud.com/person',{api:async endpoint=>{
  if(endpoint==='resolve')return{kind:'user',id:123,username:'Profile',permalink_url:'https://soundcloud.com/person'};
  page++;return page===1?{collection:[{track:{kind:'track',id:1,permalink_url:'https://soundcloud.com/a/b'}},{playlist:{kind:'playlist'}},{track:{kind:'track',id:2,permalink_url:'https://soundcloud.com/a/c'}}],next_href:'https://api-v2.soundcloud.com/users/123/likes?offset=2'}:{collection:[{track:{kind:'track',id:1,permalink_url:'https://soundcloud.com/a/b'}},{track:{kind:'track',id:3,permalink_url:'https://soundcloud.com/a/d'}}]};
 },mapTrack:raw=>({...track(raw.id),playbackUnavailable:raw.id===2})});
 assert.equal(page,2);assert.deepEqual(read.tracks.map(t=>t.id),['sc-1','sc-3']);assert.equal(read.stats.playlists,1);assert.equal(read.stats.unavailable,1);
 await assert.rejects(()=>readLikes('https://soundcloud.com/person',{api:async endpoint=>endpoint==='resolve'?{kind:'user',id:123}:{collection:[],next_href:'https://evil.test/a'},mapTrack:x=>x}));
 await assert.rejects(()=>readLikes('https://soundcloud.com/person',{api:async()=>({kind:'user',id:123}),mapTrack:x=>x,cancelled:()=>true}));
 const handlers=new Map(),sender={id:1,send:()=>{},isDestroyed:()=>false},saved=new Map([['sc-1',track(1)]]);let writes=0,fail=false;
 setup({ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},getWindow:()=>({webContents:sender}),readLikes:async()=>({...read,tracks:[track(1),track(2),track(3),track(4)]}),getFavorites:()=>saved,getLibrary:()=>({tracks:[{id:'local-2',soundcloudId:'2'}]}),readFavoriteIds:async()=>['local-2'],isExcluded:t=>t.id==='sc-4',register:x=>x,persist:async()=>{if(fail)throw Error('disk full');writes++}});
 await assert.rejects(()=>handlers.get('sc-import-preview')({sender:{}},'url'));assert.equal(writes,0);
 let preview=await handlers.get('sc-import-preview')({sender},'url');assert.equal(preview.already,2);assert.equal(preview.excluded,1);assert.equal(preview.toAdd,1);assert.equal(saved.size,1,'Preview never changes favorites');
 const imported=await handlers.get('sc-import-commit')({sender},preview.token);assert.equal(imported.added,1);assert.ok(saved.has('sc-3'));assert.equal(writes,1);
 preview=await handlers.get('sc-import-preview')({sender},'url');assert.equal(preview.toAdd,0);assert.equal((await handlers.get('sc-import-commit')({sender},preview.token)).added,0);
 saved.delete('sc-3');preview=await handlers.get('sc-import-preview')({sender},'url');fail=true;await assert.rejects(()=>handlers.get('sc-import-commit')({sender},preview.token));assert.ok(!saved.has('sc-3'),'Failed persistence rolls back new favorites');assert.ok(saved.has('sc-1'));
 console.log('SoundCloud import passed: safe profile links, pagination, cancellation, unavailable/playlist handling, preview, sender checks, existing local/remote favorites, repeat import and failed-write rollback');
})().catch(e=>{console.error(e);process.exitCode=1});
