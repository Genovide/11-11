// Independent per-grapheme renderer. Inspired by the observed staggered-letter effect;
// no code from Spicy Lyrics is included.
(function(root){
 function lumenLetterPose(time,start,duration,index,count){
  const letterStart=start+duration*index/Math.max(1,count);
  const span=Math.max(.8,Math.min(1.4,duration*.65)),local=(time-letterStart)/span;
  if(local<=0||local>=1)return {lift:0,spread:0,scale:1,glow:0};
  const rise=Math.sin(Math.PI*local),envelope=rise*rise;
  return {lift:envelope*.045,spread:0,scale:1+envelope*.012,glow:envelope*.16};
 }
 root.lumenLetterPose=lumenLetterPose;
})(typeof module==='object'?module.exports:globalThis);
