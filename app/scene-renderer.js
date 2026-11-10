/* Audio/compositing adapter for the selected SoundVisualizer scenes. */
(function(){
 const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
 window.SV={hexToRgb01:hex,sampleThemeColor:(cfg,pos)=>{const colors=cfg.background.gradient.colors,p=Math.max(0,Math.min(.9999,pos))*(colors.length-1),i=Math.floor(p),f=p-i,a=hex(colors[i]),b=hex(colors[Math.min(i+1,colors.length-1)]);return `rgb(${a.map((x,j)=>Math.round((x+(b[j]-x)*f)*255)).join(',')})`}};
 class ImportedSceneRenderer{
  constructor(){this.canvas=document.createElement('canvas');this.glow=new SVGlow();this.modes={};this.backgrounds={};this.time=0;this.frames={};this.smoothed=new Map()}
  draw(ctx,w,h,key,response,freq,sampleRate,fftSize,gain,dt,moving,intensity){
   const cfg=window.importedScenes[key];if(!cfg)return;
   if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}
   this.time+=moving?Math.min(80,dt)/1000:0;
   if(!this.modes[key])this.modes[key]=new SVModes[cfg.visualizer.type](this.canvas);
   if(!this.backgrounds[key])this.backgrounds[key]=cfg.background.type==='solid'?{draw:(c,a,config,t,width,height)=>{c.fillStyle=config.background.solidColor||'#08080f';c.fillRect(0,0,width,height)}}:new ImportedBackgrounds[cfg.background.type]();
   const audio={bass:response.bass,mid:response.mid,treble:response.high,level:response.rms,getBars:(count,min=20,max=20000)=>{
    const id=[key,count,min,max].join(':');let bars=this.smoothed.get(id);if(!bars){bars=new Float32Array(count);this.smoothed.set(id,bars)}
    for(let i=0;i<count;i++){const lo=Math.max(1,Math.floor(min*Math.pow(max/min,i/count)*fftSize/sampleRate)),hi=Math.min(freq?.length||0,Math.max(lo+1,Math.ceil(min*Math.pow(max/min,(i+1)/count)*fftSize/sampleRate)));let power=0,n=0;for(let j=lo;j<hi;j++){power+=Math.pow(freq[j]/255,3);n++}const value=moving&&n?Math.min(1,Math.sqrt(power/n)*gain):0;bars[i]+=(value-bars[i])*(1-Math.exp(-Math.min(80,dt)/(value>bars[i]?90:260)))}return bars;
   }};
   ctx.save();ctx.setTransform(1,0,0,1,0,0);
   if(!document.body.classList.contains('flat-theme'))this.backgrounds[key].draw(ctx,audio,cfg,this.time,w,h,moving?Math.min(80,dt)/1000:1e-9);
   ctx.fillStyle=key==='centerbars'?'rgba(0,0,0,.65)':'rgba(0,0,0,.22)';ctx.fillRect(0,0,w,h);
   const mode=this.modes[key];const oldRot=mode.rot;if(key!=='flowfield'||moving||!this.frames[key])mode.draw(audio,cfg,this.time, moving?Math.min(80,dt)/1000:1e-9);if(!moving&&oldRot!==undefined)mode.rot=oldRot;
   const bloom=cfg.postfx.find(f=>f.type==='bloom'&&f.enabled);if(bloom)this.glow.apply(this.canvas,Math.min(1,(bloom.params.intensity||1)*.5),.9);
   ctx.globalAlpha=intensity;ctx.drawImage(this.canvas,0,0);const vignette=cfg.postfx.find(f=>f.type==='vignette'&&f.enabled);if(vignette){const fade=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.25,w/2,h/2,Math.max(w,h)*.72);fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,'+(vignette.params.amount||.45)+')');ctx.fillStyle=fade;ctx.fillRect(0,0,w,h)}
   if(cfg.postfx.some(f=>f.type==='crt'&&f.enabled)){ctx.globalAlpha=.13;ctx.fillStyle='#000';for(let y=0;y<h;y+=4)ctx.fillRect(0,y,w,1)}
   ctx.restore();this.frames[key]=(this.frames[key]||0)+1;
  }
 }
 window.ImportedSceneRenderer=ImportedSceneRenderer;
})();
