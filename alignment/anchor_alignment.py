"""Keep recognized word anchors fixed; align only text missing between them."""
import re,difflib
from types import SimpleNamespace

def normalize(text):return re.sub(r'[^\w]','',text.casefold().replace('ё','е'))

def anchored_alignment(model,audio,lines,recognized,language,event):
 words=[];line_indices=[]
 for line in lines:
  start=len(words);words.extend(re.findall(r'\S+\s*',line));line_indices.append((start,len(words)))
 heard=[];times=[]
 for segment in recognized.segments:
  for w in segment.words or []:
   if normalize(w.word):heard.append(normalize(w.word));times.append((float(w.start),float(w.end)))
 anchors={}
 for block in difflib.SequenceMatcher(None,[normalize(w)for w in words],heard,autojunk=False).get_matching_blocks():
  if block.size<2:continue
  for k in range(block.size):anchors[block.a+k]=times[block.b+k]
 if len(anchors)<max(8,len(words)*.12):raise ValueError('Недостаточно уверенно распознанных слов для привязки текста.')
 duration=len(audio)/16000;aligned=[None]*len(words)
 for i,(start,end)in anchors.items():aligned[i]=SimpleNamespace(start=start,end=end,word=words[i],probability=1.0)
 limits=[-1]+sorted(anchors)+[len(words)];gaps=[(a,b)for a,b in zip(limits,limits[1:])if b-a>1]
 for number,(a,b)in enumerate(gaps):
  left=anchors[a][1]if a>=0 else max(0,anchors[b][0]-(b-a-1)*.8)
  right=anchors[b][0]if b<len(words)else duration
  left=max(0,min(duration,left));right=max(left,min(duration,right));missing=words[a+1:b];found=[]
  if right-left>=.025:
   clip=audio[int(left*16000):int(right*16000)]
   part=model.align_words(clip,[dict(start=0,end=len(clip)/16000,text=' '.join(w.strip()for w in missing))],language=language,verbose=None,suppress_silence=False,regroup=False)
   found=[w for s in part.segments for w in (s.words or [])]if part else[]
  for k,text in enumerate(missing):
   if len(found)==len(missing):
    w=found[k];start=min(right,max(left,left+float(w.start)));end=min(right,max(start,left+float(w.end)));probability=float(w.probability or 0)
   else:start=end=left;probability=0
   aligned[a+1+k]=SimpleNamespace(start=start,end=end,word=text,probability=probability)
  if number%6==0 or number+1==len(gaps):event('refining',f'Уточняем фразы между опорными словами: {number+1} из {len(gaps)}')
 segments=[]
 for line,(start,end)in zip(lines,line_indices):
  segment_words=aligned[start:end]
  if segment_words:segments.append(SimpleNamespace(text=line,words=segment_words,start=segment_words[0].start,end=segment_words[-1].end))
 return SimpleNamespace(segments=segments),len(anchors)
