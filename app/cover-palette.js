(function(root){
 const fallback=[[82,88,104],[66,72,86],[111,105,119]];
 function fromPixels(pixels){
  const buckets=new Map();
  for(let i=0;i+3<pixels.length;i+=4){
   if(pixels[i+3]<160)continue;
   const color=[pixels[i],pixels[i+1],pixels[i+2]],high=Math.max(...color),low=Math.min(...color);
   if(high<28||low>238)continue;
   const key=color.map(x=>Math.floor(x/40)).join(',');
   const bucket=buckets.get(key)||{count:0,sum:[0,0,0],saturation:0};
   bucket.count++;color.forEach((x,j)=>bucket.sum[j]+=x);bucket.saturation+=high-low;buckets.set(key,bucket);
  }
  const colors=[...buckets.values()].sort((a,b)=>b.count*(1+b.saturation/b.count/180)-a.count*(1+a.saturation/a.count/180))
   .map(b=>b.sum.map(x=>Math.round(x/b.count)));
  const distinct=[];
  for(const color of colors){if(distinct.every(c=>Math.hypot(...c.map((x,j)=>x-color[j]))>70))distinct.push(color);if(distinct.length===3)break}
  return distinct.length?Array.from({length:3},(_,i)=>[...distinct[i%distinct.length]]):fallback.map(c=>[...c]);
 }
 const api={fromPixels,fallback};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.CoverPalette=api;
})(typeof window!=='undefined'?window:globalThis);
