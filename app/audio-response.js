// Audio-driven envelopes, shared by the renderer and the deterministic checks.
(function(root){
 class AudioResponse{
  constructor(){this.bass=0;this.mid=0;this.high=0;this.rms=0;this.hit=0;this.previous=0;this.shape=new Float32Array(128)}
  update(freq,wave,sampleRate=48000,fftSize=1024,gain=1.4,playing=true,dt=32){
   const smooth=(old,value,attack=.16,release=.065)=>old+(value-old)*(1-Math.pow(1-(value>old?attack:release),dt/32));
   const band=(low,high)=>{let sum=0,n=0;for(let i=Math.max(1,Math.ceil(low*fftSize/sampleRate));i<Math.min(freq?.length||0,Math.ceil(high*fftSize/sampleRate));i++){sum+=Math.pow(freq[i]/255,3);n++}return playing&&n?Math.min(1,Math.sqrt(sum/n)*gain):0};
   let power=0;for(let i=0;playing&&i<(wave?.length||0);i++)power+=Math.pow((wave[i]-128)/128,2);
   const rms=playing&&wave?.length?Math.min(1,Math.sqrt(power/wave.length)*gain*2.8):0;
   const bass=band(30,190),mid=band(190,2600),high=band(2600,14000);
   const onset=Math.min(1,Math.max(0,bass*.6+rms*.4-this.previous)*5);
   this.previous=bass*.6+rms*.4;
   this.bass=smooth(this.bass,bass);this.mid=smooth(this.mid,mid);this.high=smooth(this.high,high);this.rms=smooth(this.rms,rms);this.hit=smooth(this.hit,onset,.2,.075);
   for(let i=0;i<128;i++){let sum=0,n=0;const center=Math.floor(i/127*((wave?.length||1)-1));for(let j=-7;j<=7;j++){const idx=Math.max(0,Math.min((wave?.length||1)-1,center+j));sum+=playing?(wave[idx]-128)/128:0;n++}this.shape[i]=smooth(this.shape[i],sum/n*gain,.12,.08)}
   return this;
  }
 }
 root.AudioResponse=AudioResponse;
})(typeof module==='object'?module.exports:globalThis);
