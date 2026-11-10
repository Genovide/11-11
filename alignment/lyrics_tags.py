"""Write only lyric tags, retaining an exact lyric-tag backup and replacing atomically."""
import json,sys,os,tempfile,shutil
from pathlib import Path
import mutagen
from mutagen.id3 import ID3,USLT,SYLT
from mutagen.mp4 import MP4

def snapshot(media):
 tags=media.tags
 if isinstance(tags,ID3):
  values=[]
  for frame in tags.values():
   if isinstance(frame,USLT):values.append(dict(type='USLT',encoding=int(frame.encoding),lang=frame.lang,desc=frame.desc,text=frame.text))
   elif isinstance(frame,SYLT):values.append(dict(type='SYLT',encoding=int(frame.encoding),lang=frame.lang,desc=frame.desc,format=frame.format,kind=frame.type,text=frame.text))
  return dict(kind='id3',values=values)
 if isinstance(media,MP4):return dict(kind='mp4',values=list((tags or {}).get('\xa9lyr',[])))
 if media.__class__.__name__ in ['FLAC','OggVorbis','OggOpus']:
  return dict(kind='vorbis',values={k:list(v)for k,v in (tags or {}).items()if 'lyric' in k.lower()})
 raise ValueError('В этом формате запись текста пока не поддерживается. Поддерживаются MP3, M4A, FLAC, OGG, OPUS и WAV.')
def replace_lyrics(media,data):
 if media.tags is None:media.add_tags()
 tags=media.tags
 if data['kind']=='id3':
  tags.delall('USLT');tags.delall('SYLT')
  for row in data['values']:
   if row['type']=='USLT':tags.add(USLT(encoding=row['encoding'],lang=row['lang'],desc=row['desc'],text=row['text']))
   else:tags.add(SYLT(encoding=row['encoding'],lang=row['lang'],desc=row['desc'],format=row['format'],type=row['kind'],text=[tuple(x)for x in row['text']]))
 elif data['kind']=='mp4':
  tags.pop('\xa9lyr',None)
  if data['values']:tags['\xa9lyr']=data['values']
 else:
  for key in list(tags):
   if 'lyric' in key.lower():del tags[key]
  for key,value in data['values'].items():tags[key]=value
def run(job):
 source=Path(job['audio']);media=mutagen.File(source)
 if media is None:raise ValueError('Не удалось прочитать музыкальный файл')
 if media.tags is None:
  try:media.add_tags()
  except Exception:raise ValueError('Этот формат не поддерживает запись текста')
 before=snapshot(media);backup=Path(job['backup'])
 if job['action']=='restore':
  if not backup.exists():return {'written':False}
  desired=json.loads(backup.read_text(encoding='utf-8'))['tags']
 else:
  text=job['text']
  if before['kind']=='id3':desired=dict(kind='id3',values=[dict(type='USLT',encoding=3,lang='eng',desc='',text=text)])
  elif before['kind']=='mp4':desired=dict(kind='mp4',values=[text])
  else:desired=dict(kind='vorbis',values={'lyrics':[text]})
  if not backup.exists():
   backup.parent.mkdir(parents=True,exist_ok=True);backup.write_text(json.dumps(dict(version=1,audio=str(source),tags=before),ensure_ascii=False),encoding='utf-8')
 fd,temp=tempfile.mkstemp(prefix='.SoundSync-lyrics-',suffix=source.suffix,dir=source.parent);os.close(fd)
 try:
  shutil.copy2(source,temp);edited=mutagen.File(temp)
  if edited.tags is None:edited.add_tags()
  version=edited.tags.version[1]if isinstance(edited.tags,ID3)else None
  replace_lyrics(edited,desired)
  if version in (3,4):edited.save(v2_version=version)
  else:edited.save()
  check=mutagen.File(temp);after=snapshot(check)
  # ID3v2.3 rewrites UTF-8 as UTF-16; compare logical text rather than encoding.
  if desired['kind']=='id3':
   clean=lambda rows:sorted(json.dumps({k:v for k,v in r.items()if k!='encoding'},sort_keys=True,ensure_ascii=False)for r in rows)
   if clean(after['values'])!=clean(desired['values']):raise ValueError('Не удалось проверить сохранённый текст')
  elif after!=desired:raise ValueError('Не удалось проверить сохранённый текст')
  os.replace(temp,source)
 finally:
  if os.path.exists(temp):os.unlink(temp)
 return {'written':True}
if __name__=='__main__':
 try:print(json.dumps(run(json.load(sys.stdin)),ensure_ascii=False))
 except Exception as e:print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)
