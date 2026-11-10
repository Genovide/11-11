"""Public SoundCloud extraction and atomic, tagged downloads. JSON over stdio."""
import sys,json,re,os,subprocess,tempfile,shutil,urllib.request
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from text_repair import repair_text

def emit(kind,**data):
 print(json.dumps(dict(kind=kind,**data),ensure_ascii=False),flush=True)

def metadata(info):
 title=str(info.get('track')or info.get('title')or 'Без названия').strip()
 explicit=info.get('artist')or next(iter(info.get('artists')or []),None)
 artist=explicit or info.get('uploader')or info.get('creator')or 'SoundCloud'
 # Only spaced separators: hyphenated artist names must remain intact.
 split=re.match(r'^(.+?)\s+[-–—]\s+(.+)$',title)
 if split and not explicit:artist,title=split.group(1).strip(),split.group(2).strip()
 description=info.get('description')or''
 if not explicit and not split:
  found=re.search(r'(?im)^(?:artist|исполнитель)\s*:\s*(.+)$',description)
  if found:artist=found.group(1).strip()
 url=info.get('webpage_url')or info.get('original_url')or info.get('url')or''
 if not url.startswith(('https://soundcloud.com/','https://www.soundcloud.com/')):url='https://soundcloud.com/'+str(info.get('uploader_id',''))+'/'+str(info.get('id',''))
 thumb=info.get('thumbnail')or next((t.get('url')for t in reversed(info.get('thumbnails')or[])if t.get('url')),'')
 title=repair_text(title);artist=repair_text(str(artist))
 return dict(id='sc-'+str(info['id']),scId=str(info['id']),remote=True,genre=info.get('genre')or ' '.join(info.get('genres')or []),tags=info.get('tags')or [],bpm=info.get('bpm'),title=title,artist=str(artist),album=repair_text(info.get('album')or'SoundCloud Single'),albumartist=str(artist),duration=info.get('duration')or 0,cover=thumb or'',pageUrl=url,lyrics='',downloadable=any(f.get('format_id')=='download'for f in (info.get('formats')or[])))

def valid_page(url):
 from urllib.parse import urlparse
 u=urlparse(url)
 if u.scheme!='https' or u.hostname not in ['soundcloud.com','www.soundcloud.com','m.soundcloud.com','on.soundcloud.com']:raise ValueError('Нужна ссылка https://soundcloud.com/…')
 return url

def options(job):
 import imageio_ffmpeg
 return dict(quiet=True,no_warnings=True,noplaylist=True,skip_download=True,ignoreerrors=False,socket_timeout=25,retries=2,extractor_retries=2,cachedir=str(Path(job['cache'])/'yt-dlp'),ffmpeg_location=imageio_ffmpeg.get_ffmpeg_exe(),format='bestaudio/best',logger=Logger())

class Logger:
 def debug(self,*a):pass
 def warning(self,*a):pass
 def error(self,*a):pass

def artwork_candidates(url):
 from urllib.parse import urlsplit,urlunsplit
 try:
  parsed=urlsplit(url)
  if parsed.scheme!='https' or not(parsed.hostname=='sndcdn.com'or(parsed.hostname or'').endswith('.sndcdn.com')):return []
  variants=[urlunsplit(parsed._replace(path=re.sub(r'-(?:large|small|badge|tiny|t\d+x\d+|original)(\.[a-z0-9]+)$','-'+size+r'\1',parsed.path,flags=re.I)))for size in ['original','t500x500']]
  return list(dict.fromkeys(variants+[url]))
 except Exception:return []

def artwork(info,job):
 """Artwork first, then uploader avatar from the public track JSON."""
 urls=[metadata(info)['cover']]
 # Most tracks already carry artwork: avoid opening the page again.
 for url in [candidate for value in urls if value for candidate in artwork_candidates(value)]:
  try:
   from urllib.parse import urlparse
   host=urlparse(url).hostname or ''
   if not(host=='sndcdn.com'or host.endswith('.sndcdn.com')):continue
   request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
   with urllib.request.urlopen(request,timeout=15) as response:data=response.read(10000001)
   if len(data)>10000000:continue
   if data.startswith(b'\xff\xd8'):return data,'image/jpeg'
   if data.startswith(b'\x89PNG'):return data,'image/png'
  except Exception:pass
 try:
  req=urllib.request.Request(valid_page(info.get('webpage_url')or job['url']),headers={'User-Agent':'Mozilla/5.0'})
  page=urllib.request.urlopen(req,timeout=20).read(4000000).decode('utf-8','replace')
  raw=re.search(r'window\.__sc_hydration\s*=\s*(\[.*?\]);',page)
  if raw:
   for item in json.loads(raw.group(1)):
    data=item.get('data',{})
    if item.get('hydratable')=='sound':urls.extend([data.get('artwork_url'),data.get('user',{}).get('avatar_url')])
 except Exception:pass
 for url in [candidate for value in urls if value for candidate in artwork_candidates(value)]:
  try:
   from urllib.parse import urlparse
   host=urlparse(url).hostname or''
   if not(host=='sndcdn.com'or host.endswith('.sndcdn.com')):continue
   req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
   response=urllib.request.urlopen(req,timeout=20);data=response.read(10000001)
   if len(data)>10000000:continue
   if data.startswith(b'\xff\xd8'):return data,'image/jpeg'
   if data.startswith(b'\x89PNG'):return data,'image/png'
  except Exception:continue
 return None,None

def tag_file(file,meta,picture,mime,force=False,force_metadata=False):
 import mutagen
 from mutagen.id3 import ID3,TIT2,TPE1,TPE2,TALB,APIC
 from mutagen.flac import FLAC,Picture
 from mutagen.mp4 import MP4,MP4Cover
 obj=mutagen.File(str(file))
 if obj is None:raise ValueError('Не удалось прочитать скачанный аудиофайл')
 if obj.tags is None:obj.add_tags()
 if isinstance(obj.tags,ID3):
  for key,value,cls in [('TIT2',meta['title'],TIT2),('TPE1',meta['artist'],TPE1),('TPE2',meta['artist'],TPE2),('TALB',meta['album'],TALB)]:
   if force or force_metadata or not obj.tags.get(key):obj.tags.add(cls(encoding=3,text=[value]))
   else:obj.tags[key].text=[repair_text(str(x))for x in obj.tags[key].text]
  if picture and force:obj.tags.delall('APIC')
  if picture and (force or not obj.tags.getall('APIC')):obj.tags.add(APIC(encoding=3,mime=mime,type=3,desc='Cover',data=picture))
 elif isinstance(obj,MP4):
  for key,value in [('\xa9nam',meta['title']),('\xa9ART',meta['artist']),('aART',meta['artist']),('\xa9alb',meta['album'])]:
   if force or force_metadata or not obj.tags.get(key):obj.tags[key]=[value]
   else:obj.tags[key]=[repair_text(str(x))for x in obj.tags[key]]
  if picture and (force or not obj.tags.get('covr')):obj.tags['covr']=[MP4Cover(picture,imageformat=MP4Cover.FORMAT_PNG if mime=='image/png'else MP4Cover.FORMAT_JPEG)]
 else:
  for key,value in [('title',meta['title']),('artist',meta['artist']),('albumartist',meta['artist']),('album',meta['album'])]:
   if force or force_metadata or not obj.tags.get(key):obj.tags[key]=[value]
   else:obj.tags[key]=[repair_text(str(x))for x in obj.tags[key]]
  if picture:
   pic=Picture();pic.type=3;pic.mime=mime;pic.data=picture
   if isinstance(obj,FLAC):
    if force:obj.clear_pictures()
    if not obj.pictures:obj.add_picture(pic)
   elif force or not obj.tags.get('metadata_block_picture'):
    import base64
    obj.tags['metadata_block_picture']=[base64.b64encode(pic.write()).decode()]
 obj.save()
 check=mutagen.File(str(file))
 keys=['TIT2','TPE1','TALB']if isinstance(check.tags,ID3)else['\xa9nam','\xa9ART','\xa9alb']if isinstance(check,MP4)else['title','artist','album']
 if any(not check.tags.get(k)for k in keys):raise ValueError('Не удалось сохранить обязательные теги')

def run(job):
 import yt_dlp,imageio_ffmpeg
 action=job['action'];opts=options(job)
 if action=='runtime':return dict(ffmpeg=imageio_ffmpeg.get_ffmpeg_exe())
 if action in ['search','related']:
  query=str(job.get('query','')).strip()[:300]
  if not query and action=='search':raise ValueError('Введи исполнителя, трек или ссылку')
  url=valid_page(job['url']).rstrip('/')+'/recommended'if action=='related'else valid_page(query)if query.startswith('https://')else'scsearch20:'+query
  opts.update(extract_flat=True,playlistend=80 if action=='related'else 20,noplaylist=False)
  with yt_dlp.YoutubeDL(opts)as ydl:info=ydl.extract_info(url,download=False)
  items=info.get('entries')if info.get('_type')in ['playlist','multi_video']else[info]
  return dict(tracks=[metadata(i)for i in items or[]if i and i.get('id')])
 url=valid_page(job['url'])
 if action=='details':
  opts.update(ignore_no_formats_error=True,extractor_args={'soundcloud':{'formats':['none']}})
  with yt_dlp.YoutubeDL(opts)as ydl:info=ydl.extract_info(url,download=False)
  return dict(track=metadata(info))
 if job.get('extractor_info')and str(job['extractor_info'].get('webpage_url',''))==url:info=job['extractor_info']
 elif job.get('official_url')and job.get('official_metadata'):info=job['official_metadata']
 else:
  with yt_dlp.YoutubeDL(opts)as ydl:info=ydl.extract_info(url,download=False)
 if info.get('is_live')or info.get('has_drm'):raise ValueError('Этот трек недоступен для загрузки или защищён')
 meta=metadata(info)
 if action=='download':
  for key in ['title','artist','album']:
   value=(job.get('metadata_override')or{}).get(key)
   if isinstance(value,str)and value.strip():meta[key]=repair_text(value.strip()[:500])
  meta['albumartist']=meta['artist']
 if action=='resolve':
  formats=info.get('formats')or[]
  stream=next((f for f in reversed(formats)if f.get('url')and not f.get('has_drm')and f.get('vcodec')=='none'),None)
  if not stream:raise ValueError('Открытый поток этого трека недоступен')
  return dict(track=meta,url=stream['url'],headers=info.get('http_headers')or{},ffmpeg=imageio_ffmpeg.get_ffmpeg_exe(),mp3=stream.get('ext')=='mp3',protocol='progressive'if stream.get('protocol')in ['http','https']else'hls',extractor_info=info)
 if action!='download':raise ValueError('Неизвестное действие')
 dest=Path(job['folder']);dest.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='.SoundSync-',dir=dest)as temporary:
  tmp=Path(temporary);official=job.get('official_url');used_original=False
  if official:
   # The URL is issued by SoundCloud API, not supplied by the renderer.
   req=urllib.request.Request(official,headers=job.get('official_headers')or{})
   with urllib.request.urlopen(req,timeout=40)as response, (tmp/'original').open('wb')as out:shutil.copyfileobj(response,out)
   original=tmp/'original';used_original=True
  else:
   formats=info.get('formats')or[];used_original=any(f.get('format_id')=='download'for f in formats)
   if not used_original and not job.get('allow_stream_download'):raise ValueError('Автор не разрешил прямую загрузку. Включи сохранение открытого потока в настройках, если у тебя есть разрешение.')
   def progress(p):
    if p['status']=='downloading':emit('progress',message='Скачиваем аудио',percent=round(100*p.get('downloaded_bytes',0)/max(1,p.get('total_bytes')or p.get('total_bytes_estimate')or 1)))
   opts.update(skip_download=False,outtmpl=str(tmp/'audio.%(ext)s'),format='download/bestaudio/best'if used_original else'bestaudio/best',progress_hooks=[progress])
   with yt_dlp.YoutubeDL(opts)as ydl:downloaded=ydl.process_ie_result(dict(info),download=True);original=Path(ydl.prepare_filename(downloaded))
  import mutagen
  parsed=mutagen.File(str(original));extension=original.suffix.lower()
  if extension not in ['.mp3','.m4a','.flac','.ogg','.opus','.wav']or parsed is None:
   if parsed:
    from mutagen.mp3 import MP3
    from mutagen.mp4 import MP4
    from mutagen.flac import FLAC
    if isinstance(parsed,MP3):extension='.mp3'
    elif isinstance(parsed,MP4):extension='.m4a'
    elif isinstance(parsed,FLAC):extension='.flac'
   if extension not in ['.mp3','.m4a','.flac','.ogg','.opus','.wav']:
    converted=tmp/'converted.mp3';subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-v','error','-i',str(original),'-vn','-b:a','192k',str(converted)],check=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));original=converted;extension='.mp3'
  if original.suffix.lower()!=extension:renamed=tmp/('tagged'+extension);original.rename(renamed);original=renamed
  emit('progress',message='Заполняем теги и обложку',percent=98)
  pic,mime=artwork(info,job);tag_file(original,meta,pic,mime,force=not used_original,force_metadata=bool(job.get('metadata_confirmed')))
  safe=lambda s:re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',s).strip(' .')[:100]or'track'
  target=dest/(safe(meta['artist'])+' - '+safe(meta['title'])+' ['+meta['scId']+']'+extension)
  if target.exists():raise ValueError('Этот файл уже есть в папке загрузок')
  # Exclusive creation prevents a simultaneous download from overwriting a track.
  created=False
  try:
   with target.open('xb')as out:
    created=True
    with original.open('rb')as inp:shutil.copyfileobj(inp,out)
  except Exception:
   if created:target.unlink(missing_ok=True)
   raise
  return dict(path=str(target),metadata=meta,original=used_original,artwork=bool(pic),artworkWarning=''if pic else'У трека и профиля нет доступной обложки')

if __name__=='__main__':
 try:emit('result',**run(json.load(sys.stdin)))
 except Exception as e:emit('error',message=str(e));sys.exit(1)
