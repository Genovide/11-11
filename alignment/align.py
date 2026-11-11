"""Local audio/text alignment worker. Communicates progress as JSON lines."""
import os,sys,json,re,traceback,subprocess,difflib,bisect,hashlib
from pathlib import Path
BASE=Path(__file__).resolve().parent
sys.path.insert(0,str(BASE))
os.environ['HF_HUB_OFFLINE']='1'
os.environ['PYTHONDONTWRITEBYTECODE']='1'
CACHE=Path(os.environ.get('SOUNDSYNC_CACHE_DIR',str(BASE/'models')))
os.environ['HF_HOME']=str(CACHE/'huggingface')
os.environ['XDG_CACHE_HOME']=str(CACHE)
def event(stage,message,**kw):print(json.dumps(dict(stage=stage,message=message,**kw),ensure_ascii=False),flush=True)
def plain_lines(raw):
 result=[]
 rows=raw.splitlines()
 timed=[line for line in rows if re.search(r'\[\d+:\d+(?:\.\d+)?\]',line)]
 # Some files contain a plain transcript followed by another copy as LRC.
 # Match the same copy used by the player, rather than aligning the song twice.
 for line in timed or rows:
  clean=re.sub(r'<\d+:\d+(?:\.\d+)?>','',re.sub(r'\[[^\]]*\]','',line)).strip()
  if clean:result.append(clean)
 return result
def run(job):
 from timing_refinement import word_reliable
 event('loading','Загружаем движок синхронизации')
 import numpy as np,torch,stable_whisper,imageio_ffmpeg
 torch.set_num_threads(max(1,min(8,(os.cpu_count()or 4)//2)))
 event('decoding','Читаем аудио')
 cmd=[imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',job['audio']]
 if job.get('test_limit'):cmd+=['-t',str(job['test_limit'])]
 cmd+=['-f','f32le','-ac','1','-ar','16000','pipe:1']
 decoded=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),check=True)
 audio=np.frombuffer(decoded.stdout,np.float32).copy();duration=len(audio)/16000
 source_stat=Path(job['audio']).stat();recognition_key=hashlib.sha256(f"{job['audio']}:{source_stat.st_size}:{source_stat.st_mtime_ns}:{duration}".encode()).hexdigest()
 recognition_file=Path(job['output']).parent/'recognition-cache'/(recognition_key+'.json')
 lines=plain_lines(job['lyrics'])
 if not lines:raise ValueError('В песне нет текста. Добавь текст перед синхронизацией.')
 language='ru'if re.search('[а-яА-ЯёЁ]', '\n'.join(lines))else'en'
 event('model','Загружаем встроенную модель синхронизации')
 model=stable_whisper.load_model('small',device='cpu',download_root=str(BASE/'models'/'whisper'))
 event('aligning','Сопоставляем слова с вокалом. Это может занять несколько минут.')
 method='direct';anchor_count=0
 result=None if recognition_file.exists() else model.align(audio,'\n'.join(lines),language=language,verbose=None,suppress_silence=True,k_size=3,regroup=False)
 def failure_ratio(candidate):
  words=[w for s in candidate.segments for w in (s.words or [])]if candidate else[]
  return sum(not word_reliable(w) for w in words)/len(words)if words else 1
 if failure_ratio(result)>.2:
  event('recognizing','Определяем опорные фразы в записи для сложной песни.')
  source_stat=Path(job['audio']).stat();recognition_key=hashlib.sha256(f"{job['audio']}:{source_stat.st_size}:{source_stat.st_mtime_ns}:{duration}".encode()).hexdigest()
  recognition_file=Path(job['output']).parent/'recognition-cache'/(recognition_key+'.json')
  if recognition_file.exists():recognized=stable_whisper.WhisperResult(str(recognition_file))
  else:
   recognized=model.transcribe(audio,language=language,temperature=0.0,beam_size=1,best_of=1,fp16=False,verbose=None,suppress_silence=False,condition_on_previous_text=False,regroup=False)
   recognition_file.parent.mkdir(parents=True,exist_ok=True);recognition_file.write_text(json.dumps(recognized.to_dict(),ensure_ascii=False),encoding='utf-8')
  from anchor_alignment import anchored_alignment
  event('anchored','Закрепляем распознанные слова и уточняем промежутки между ними.')
  candidate,anchor_count=anchored_alignment(model,audio,lines,recognized,language,event)
  if failure_ratio(candidate)<=failure_ratio(result):result=candidate;method='fixed-word-anchors'
 if result is None:raise ValueError('Не удалось сопоставить текст с записью.')
 boundary_refined=False
 if failure_ratio(result)<=.2:
  event('refining','Уточняем начало и конец слов, учитываем паузы в записи.')
  from timing_refinement import refine_boundaries
  try:
   result=refine_boundaries(model,audio,result,language,stable_whisper);boundary_refined=True
  except Exception as error:
   event('review','Уточнение границ не завершено; сохранена исходная разметка: '+str(error))
 output=[];unmatched=0;total=0
 for segment in result.segments:
  words=[]
  for w in segment.words or []:
   total+=1
   matched=word_reliable(w)
   if not matched:unmatched+=1
   if not(0<=w.start<=w.end<=duration+.5):raise ValueError('Модель вернула некорректное время слов.')
   words.append(dict(time=float(round(w.start,3)),end=float(round(w.end,3)),text=str(w.word),matched=matched))
  if words:output.append(dict(time=words[0]['time'],end=words[-1]['end'],text=segment.text.strip(),words=words))
 if not output or unmatched/max(1,total)>.2:
  raise ValueError(f'Не удалось определить время для {unmatched} из {total} слов. Проверь текст и версию песни.')
 from line_layout import restore_lines
 output=restore_lines(output,lines)
 for line in output:
  timed=[w for w in line['words'] if w['matched']]
  if timed:line.update(time=timed[0]['time'],end=timed[-1]['end'])
 response=dict(version=2,layoutVersion=1,timingVersion=2,boundaryRefined=boundary_refined,engine='stable-ts/whisper-small',method=method,anchors=anchor_count,language=language,duration=duration,lines=output,words=total,unmatched=unmatched,needsReview=unmatched>0 or not boundary_refined)
 target=Path(job['output']);target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(response,ensure_ascii=False),encoding='utf-8');temporary.replace(target)
 event('done','Синхронизация готова',words=total,unmatched=unmatched)
if __name__=='__main__':
 try:run(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig')))
 except Exception as e:event('error',str(e));traceback.print_exc(file=sys.stderr);sys.exit(1)
