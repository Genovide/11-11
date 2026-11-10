"""Preserve the author's line breaks independently of model segmentation."""
import unicodedata

def normalize(text):
 return ''.join(c for c in unicodedata.normalize('NFKC',text).casefold().replace('ё','е') if c.isalnum())

def restore_lines(output,lines):
 words=[w for line in output for w in line.get('words',[])]
 if not words or ''.join(map(normalize,lines))!=''.join(normalize(w['text']) for w in words):return output
 groups=[];boundary=0
 for text in lines:
  boundary+=len(normalize(text));groups.append(dict(text=text,words=[],boundary=boundary))
 cursor=0;index=0
 for word in words:
  while index<len(groups)-1 and cursor>=groups[index]['boundary']:index+=1
  groups[index]['words'].append(word);cursor+=len(normalize(word['text']))
 result=[]
 for group in groups:
  if group['words']:
   del group['boundary'];group.update(time=group['words'][0]['time'],end=group['words'][-1]['end']);result.append(group)
 return result
