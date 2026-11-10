(function(root){
 const clone=x=>JSON.parse(JSON.stringify(x));
 const valid=w=>w.matched!==false&&Number.isFinite(w.time)&&Number.isFinite(w.end)&&w.end>w.time;
 function bounds(line){const words=(line.words||[]).filter(valid);if(words.length){line.time=Math.min(...words.map(w=>w.time));line.end=Math.max(...words.map(w=>w.end))}return line}
 function shift(lines,delta,duration,index=null){const result=clone(lines);for(let i=0;i<result.length;i++){if(index!==null&&i!==index)continue;const line=result[i];for(const item of [line,...(line.words||[])])for(const key of ['time','end'])if(Number.isFinite(item[key])){const t=Math.round((item[key]+delta)*1000)/1000;if(t<0||t>duration+.01)throw Error('Сдвиг выходит за границы трека');item[key]=t}}return result}
 function wordTime(lines,lineIndex,wordIndex,start,end){if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Конец слова должен быть позже начала');const result=clone(lines),line=result[lineIndex],word=line?.words?.[wordIndex];if(!word)throw Error('Слово не найдено');word.time=start;word.end=end;word.matched=true;bounds(line);return result}
 function validate(lines,reference,duration){if(!Array.isArray(lines)||lines.length!==reference.length)throw Error('Изменился текст или число строк');let previous=-1;let timed=0;
  for(let i=0;i<lines.length;i++){const line=lines[i],base=reference[i];if(line.text!==base.text||!Array.isArray(line.words)||line.words.length!==(base.words||[]).length)throw Error('Редактор времени не должен изменять текст');
   for(const item of [line,...line.words]){if(!Number.isFinite(item.time)||!Number.isFinite(item.end)||item.time<0||item.end<item.time||item.end>duration+.05)throw Error('Время должно находиться внутри трека')}
   if(line.words.length){for(let j=0;j<line.words.length;j++){const w=line.words[j];if(w.text!==base.words[j].text)throw Error('Изменился текст слова');if(valid(w)){if(w.time<previous-.001)throw Error('Слова должны идти по порядку. Проверь соседние строки');previous=w.time;timed++}}}else if(line.end>line.time){if(line.time<previous-.001)throw Error('Строки должны идти по порядку');previous=line.time;timed++}
  }if(!timed)throw Error('Нужно указать время хотя бы одной строки или слова');return true;
 }
 function seconds(raw){const parts=String(raw).trim().replace(',','.').split(':').map(Number);if(parts.some(n=>!Number.isFinite(n)||n<0)||parts.length>3)return NaN;return parts.reduce((a,b)=>a*60+b,0)}
 root.TimingEdit={clone,bounds,shift,wordTime,validate,seconds};
})(typeof module==='object'?module.exports:globalThis);
