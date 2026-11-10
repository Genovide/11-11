/* Keep a single set of interactive lyric nodes when switching listening views. */
(()=>{
 const panel=document.querySelector('body>.now-panel');
 const summary=node('div','now-summary');
 for(const selector of ['.now-heading','#now-cover','.now-details'])summary.append(panel.querySelector(selector));
 panel.prepend(summary);
 const disclosure=node('details','insight-disclosure'),label=node('summary','','AI-описание');
 disclosure.append(label,...insightCard.childNodes);insightCard.append(disclosure);
 expand.replaceChildren(icon('next'));expand.querySelector('svg path').setAttribute('d','M7 17L17 7M7 7h10v10');
})();
