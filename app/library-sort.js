(() => {
  const options=[['original','Исходный порядок'],['title','По названию'],['artist','По исполнителю'],['album','По альбому'],['duration','По длительности'],['year','По году']];
  let setting;try{setting=JSON.parse(localStorage.getItem('library-sort')||'null')}catch{}
  let key=options.some(([value])=>value===setting?.key)?setting.key:'original',descending=!!setting?.descending;
  const collator=new Intl.Collator('ru',{sensitivity:'base',numeric:true});
  const row=node('div','library-sort'),label=node('label','','Сортировка'),select=node('select'),direction=node('button','library-sort-direction');
  select.id='library-sort';select.setAttribute('aria-label','Сортировка музыки');direction.type='button';
  for(const [value,text]of options){const option=node('option','',text);option.value=value;select.append(option)}
  label.append(select);row.append(label,direction);document.querySelector('.collection-header').after(row);
  function sync(){
    select.value=key;direction.disabled=key==='original';direction.textContent=key==='duration'?(descending?'Длиннее → короче':'Короче → длиннее'):key==='year'?(descending?'Новые → старые':'Старые → новые'):(descending?'Я → А':'А → Я');
    direction.setAttribute('aria-label',descending?'Переключить на сортировку по возрастанию':'Переключить на сортировку по убыванию');direction.setAttribute('aria-pressed',String(descending));
    direction.title=key==='original'?'Для исходного порядка направление не применяется':direction.textContent;
  }
  function compare(a,b){
    let result=0;
    if(key==='duration'||key==='year'){
      const left=Number(a[key]),right=Number(b[key]),hasLeft=Number.isFinite(left)&&left>0,hasRight=Number.isFinite(right)&&right>0;
      if(hasLeft!==hasRight)return hasLeft?-1:1;
      if(hasLeft)result=left-right;
    }else result=collator.compare(String(a[key]||''),String(b[key]||''));
    if(result)return descending?-result:result;
    return collator.compare(String(a.artist||''),String(b.artist||''))||collator.compare(String(a.album||''),String(b.album||''))||(Number(a.track)||0)-(Number(b.track)||0)||collator.compare(String(a.title||''),String(b.title||''));
  }
  const beforeFiltered=filtered;filtered=function(){const tracks=beforeFiltered();return key==='original'?tracks:[...tracks].sort(compare)};
  const beforeRender=render;render=function(){beforeRender();row.hidden=view==='soundcloud'||view==='artists'||(view==='albums'&&!albumFilter);sync()};
  function change(){localStorage.setItem('library-sort',JSON.stringify({key,descending}));shown=100;document.querySelector('main').scrollTop=0;render()}
  select.onchange=()=>{key=select.value;change()};direction.onclick=()=>{descending=!descending;change()};
  render();
})();
