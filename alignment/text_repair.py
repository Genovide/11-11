import re

def quality(s):
 letters=sum(c.isalpha()for c in s);cyr=len(re.findall('[А-Яа-яЁё]',s))
 return cyr/max(1,letters)*10-len(re.findall('[ÃÂÐÑ�]',s))*2-sum(map(len,re.findall(r'(?:Р.|С.){3,}',s)))*.2

def repair_text(value):
 if not isinstance(value,str)or not re.search(r'[À-ÿ]{3,}|[ÃÂÐÑ][\x80-\xff]|(?:Р.|С.){3,}',value):return value
 candidates=[value]
 for encoding in ['latin1','cp1252','cp1251']:
  try:data=value.encode(encoding)
  except UnicodeError:continue
  for decoding in ['cp1251','utf8']:
   try:
    text=data.decode(decoding)
    if len(re.findall('[А-Яа-яЁё]',text))>=4:candidates.append(text)
   except UnicodeError:pass
 best=max(candidates,key=quality)
 return best if quality(best)>=quality(value)+2 and quality(best)>=7.5 else value
