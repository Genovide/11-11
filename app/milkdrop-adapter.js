/* Local audio adapter for SoundVisualizer's MIT MilkDrop renderer. */
(function(){
 class MilkdropBackground{
  constructor(){this.canvas=document.createElement('canvas');this.mode=null;this.frames=0;this.initialized=false;this.silent=new Uint8Array(1024).fill(128)}
  draw(ctx,w,h,response,wave,dt,moving,gain,intensity){
   if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h}
   if(!this.mode)this.mode=new SVModes.milkdrop(this.canvas);
   if(moving||!this.initialized){
    const cfg=window.milkdropScene;cfg.visualizer.sensitivity=.7*gain;
    this.mode.draw({bass:response.bass,mid:response.mid,treble:response.high,level:response.rms,timeBytes:moving&&wave?wave:this.silent},cfg,0,Math.max(.001,Math.min(80,dt)/1000));
    this.initialized=!!this.mode.preset;
   }
   ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=.55*intensity;ctx.drawImage(this.canvas,0,0,w,h);ctx.globalAlpha=1;
   const vignette=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.25,w/2,h/2,Math.max(w,h)*.72);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.5)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);ctx.restore();this.frames++;
  }
 }
 window.MilkdropBackground=MilkdropBackground;
})();
