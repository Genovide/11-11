"""Local, cached source separation for difficult recordings."""
import subprocess,hashlib,os
from pathlib import Path
def extract_vocals(source,base,cache_dir,event):
 import numpy as np,torch,imageio_ffmpeg
 stat=Path(source).stat();key=hashlib.sha256(f'htdemucs:{source}:{stat.st_size}:{stat.st_mtime_ns}'.encode()).hexdigest();cache=Path(cache_dir)/'vocal-cache'/(key+'.npy')
 if cache.exists():event('separating','Используем сохранённую вокальную дорожку');return np.load(cache,allow_pickle=False)
 torch.hub.set_dir(str(Path(cache_dir)/'engine-cache'/'torch'))
 event('separating','Загружаем модель отделения вокала (при первом запуске — скачивание)')
 from demucs.pretrained import get_model
 from demucs.apply import apply_model
 import julius
 model=get_model('htdemucs');rate=model.samplerate
 decoded=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',source,'-f','f32le','-ac','2','-ar',str(rate),'pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),check=True)
 mix=torch.from_numpy(np.frombuffer(decoded.stdout,np.float32).reshape(-1,2).T.copy());ref=mix.mean(0);mean=ref.mean();std=ref.std().clamp_min(1e-6);mix=(mix-mean)/std
 last=[-1]
 def progress(data):
  if data.get('state')=='end':
   pct=min(99,int((data.get('segment_offset',0)+rate*7.8)/mix.shape[-1]*100))
   if pct//5!=last[0]//5:last[0]=pct;event('separating',f'Отделяем голос от музыки: {pct}%')
 with torch.inference_mode():stems=apply_model(model,mix[None],device='cpu',shifts=0,split=True,overlap=.25,progress=False,num_workers=0,callback=progress)[0]
 vocals=stems[model.sources.index('vocals')]*std+mean;mono=julius.resample_frac(vocals.mean(0),rate,16000).cpu().numpy().astype(np.float32)
 cache.parent.mkdir(parents=True,exist_ok=True);tmp=cache.with_suffix(f'.{os.getpid()}.tmp')
 with tmp.open('wb')as f:np.save(f,mono,allow_pickle=False)
 os.replace(tmp,cache);event('separating','Вокальная дорожка готова');return mono
def activity_ranges(audio, mixture=None):
 """Hysteresis on separated voice; reject brief leakage, retain quiet phrase tails."""
 import numpy as np
 step=320;duration=len(audio)/16000
 def rms(signal):
  signal=np.nan_to_num(np.asarray(signal,dtype=np.float32))
  signal=signal[:len(signal)//step*step]
  return np.sqrt(np.mean(signal.reshape(-1,step)**2,axis=1)) if len(signal) else np.array([])
 energy=rms(audio)
 if not len(energy):return []
 # Median removes isolated percussion clicks without shifting phrase boundaries.
 energy=np.median(np.stack([np.pad(energy,(2,2),mode='edge')[i:i+len(energy)] for i in range(5)]),axis=0)
 peak=float(np.percentile(energy,95));floor=float(np.percentile(energy,10))
 high=max(1e-4,peak*.065,min(floor*2.5,peak*.22));low=high*.45
 strong=energy>=high;weak=energy>=low
 if mixture is not None:
  mix=rms(mixture);n=min(len(mix),len(energy))
  ratio=np.zeros_like(energy);ratio[:n]=energy[:n]/np.maximum(mix[:n],1e-6)
  # A very quiet residual relative to the mix is usually separation leakage.
  strong &= ratio>=.025;weak &= ratio>=.012
 spans=[];begin=None
 for i,on in enumerate(np.append(weak,False)):
  if on and begin is None:begin=i
  if not on and begin is not None:
   if np.count_nonzero(strong[begin:i])>=5:
    start=max(0,begin*.02-.06);end=min(duration,i*.02+.12)
    if spans and start-spans[-1][1]<=.45:spans[-1][1]=end
    else:spans.append([round(start,3),round(end,3)])
   begin=None
 return spans

