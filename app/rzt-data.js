(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RztData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ORIGIN = 'https://risazatvorchestvo.com';
  const text = v => typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  const first = (...values) => values.find(v => v !== undefined && v !== null && v !== '');
  function url(value) {
    try { const u = new URL(text(value), ORIGIN); return u.origin === ORIGIN && /^\/(track|album|release|review)s?\//.test(u.pathname) ? u.pathname + u.search : ''; } catch { return ''; }
  }
  function image(value) {
    if (value && typeof value === 'object') value = first(value.url, value.src, value.path, value.original);
    try { const u = new URL(text(value), ORIGIN); return value && u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
  }
  function score(v) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null; }
  function balanced(source, start) {
    const stack = []; let quoted = false, escaped = false;
    for (let i = start; i < source.length; i++) {
      const c = source[i];
      if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; continue; }
      if (c === '"') quoted = true;
      else if (c === '{' || c === '[') stack.push(c);
      else if (c === '}' || c === ']') { const open = stack.pop(); if ((c === '}' && open !== '{') || (c === ']' && open !== '[')) return null; if (!stack.length) return {end: i + 1, value: source.slice(start, i + 1)}; }
    }
    return null;
  }
  function objects(html) {
    const roots = [], chunks = [];
    for (const m of html.matchAll(/self\.__next_f\.push\(/g)) {
      let start = m.index + m[0].length; while (/\s/.test(html[start] || '')) start++;
      const block = balanced(html, start); if (!block) continue;
      try { const payload = JSON.parse(block.value); if (typeof payload[1] === 'string') chunks.push(payload[1]); } catch {}
    }
    // Next splits a single record across multiple script tags.
    const flight = chunks.join(''), records = new Map();
    for (const match of flight.matchAll(/(?:^|\n)([0-9a-f]+):/g)) {
      const start=match.index+match[0].length;
      if (flight[start]==='T') {
        const header=/^T([0-9a-f]+),/.exec(flight.slice(start));
        if(header) { const bytes=parseInt(header[1],16), raw=flight.slice(start+header[0].length); records.set(match[1],new TextDecoder().decode(new TextEncoder().encode(raw).slice(0,bytes))); }
      } else {
        const block=balanced(flight,start);
        if(block)try{records.set(match[1],JSON.parse(block.value));}catch{}
      }
    }
    const sources = [flight];
    for (const m of html.matchAll(/<script\b[^>]*type=["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi)) sources.push(m[1]);
    for (const source of sources) {
      for (let i = 0; i < source.length; i++) {
        if (source[i] !== '{' && source[i] !== '[') continue;
        const block = balanced(source, i); if (!block) continue;
        try { roots.push(JSON.parse(block.value)); i = block.end - 1; } catch {}
      }
    }
    function resolve(value, trail=new Set(), depth=0) {
      if(depth>80)return null;
      if(typeof value==='string') {
        const ref=/^\$([0-9a-f]+)$/.exec(value);
        if(ref && records.has(ref[1])) { if(trail.has(ref[1]))return null; return resolve(records.get(ref[1]),new Set([...trail,ref[1]]),depth+1); }
        return value.startsWith('$$')?value.slice(1):value;
      }
      if(Array.isArray(value))return value.map(v=>resolve(v,trail,depth+1));
      if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,resolve(v,trail,depth+1)]));
      return value;
    }
    return roots.map(value=>resolve(value));
  }
  function artist(value) {
    if (Array.isArray(value)) return value.map(artist).filter(Boolean).join(', ');
    return typeof value === 'object' && value ? text(first(value.title, value.name, value.username)) : text(value);
  }
  function release(value) {
    const meta = value.meta || {}, title = text(first(value.title, value.name));
    if (!title) return null;
    const type = text(first(value.type, value.release_type, value.releaseType, value.category));
    let route = url(first(value.url, value.href, value.link, value.path));
    if (!route && value.slug && /^(track|album|single|ep)$/i.test(type)) route = url('/' + (/track|single/i.test(type) ? 'track' : 'album') + '/' + value.slug);
    return {id: text(value.id) || route || title, path: route, title,
      artist: artist(first(value.artists, value.artist, value.authors)), type,
      cover: image(first(value.cover, value.image, value.thumbnail, value.cover_url, value.coverUrl, value.picture)),
      date: text(first(value.release_date, value.releaseDate, value.date)),
      scores: {flom: score(meta.total_rating), reviews: score(meta.score_reviews_avg), users: score(meta.users_avg_total)},
      reviewCount: Number(first(meta.reviews_count, meta.score_reviews_count, value.reviews_count)) || null};
  }
  function plainBody(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(plainBody).filter(Boolean).join('\n');
    if (value && typeof value === 'object') return plainBody(first(value.text, value.content, value.children, value.blocks));
    return '';
  }
  function review(value) {
    const body = plainBody(first(value.reviewContent, value.review_content, value.text, value.body, value.content, value.review_text, value.reviewText, value.description, typeof value.review==='string'?value.review:null));
    if (!body.trim()) return null;
    const author = value.user || value.author || value.reviewer || {};
    return {id: text(first(value.reviewId, value.id)) || body.slice(0, 100), path: url(first(value.url, value.href)),
      title: text(first(value.reviewTitle, value.review_title, value.title, value.heading)), body,
      author: artist(first(value.authorName, author.username, author.nickname, author.name, author.login, author.title, typeof author === 'string' ? author : '', value.username)) || 'Участник РЗТ',
      score: score(first(value.total_rating, value.total_score, value.totalRating, value.totalScore, value.total, value.rating, value.score, value.meta?.total_rating)),
      date: text(first(value.reviewDate, value.created_at, value.createdAt, value.date)),
      likes: Number(first(value.likes_count, value.likesCount, value.meta?.likes_count)) || 0};
  }
  function parse(html, requestedPath = '/releases') {
    const releases = new Map(), reviews = new Map(), roots = objects(html), seen = new Set();
    let reviewMarkers = false;
    function addReview(item) {
      if(!item)return;
      const duplicate=[...reviews.values()].find(r=>r.id===item.id || (r.body===item.body && (r.id===r.body.slice(0,100) || item.id===item.body.slice(0,100))));
      if(duplicate){reviews.delete(duplicate.id);item={...duplicate,...item,author:item.author==='Участник РЗТ'?duplicate.author:item.author,score:item.score??duplicate.score,id:item.id===item.body.slice(0,100)?duplicate.id:item.id};}
      reviews.set(item.id,item);
    }
    // RZT renders each review as several React server-component props rather
    // than serializing a review object. Join metadata within the same card.
    function reviewScope(value) {
      const metadata={};let count=0,visits=0;
      function collect(node,depth=0){
        if(!node || typeof node!=='object' || depth>35 || ++visits>15000)return;
        if(Array.isArray(node)){node.forEach(n=>collect(n,depth+1));return;}
        if(typeof node.reviewContent==='string' || typeof node.review_content==='string')count++;
        for(const key of ['reviewId','authorName','user','reviewer','totalRating','totalScore','total_rating','total_score','rating','score','likesCount'])if(node[key]!==undefined && metadata[key]===undefined)metadata[key]=node[key];
        for(const child of Object.values(node))collect(child,depth+1);
      }
      collect(value);return {count,metadata};
    }
    function walk(value, context = '', depth = 0, ancestors = []) {
      if (!value || typeof value !== 'object' || seen.has(value) || depth > 80) return;
      seen.add(value);
      if (Array.isArray(value)) { for (const child of value) walk(child, context, depth + 1, [...ancestors,value]); return; }
      if(typeof value.reviewContent==='string' || typeof value.review_content==='string'){
        reviewMarkers=true;let metadata={};
        for(const parent of ancestors.slice(-12).reverse()){
          const scope=reviewScope(parent);if(scope.count>1)break;
          if(scope.count===1)metadata={...scope.metadata,...metadata};
          if(metadata.reviewId!==undefined && (metadata.user || metadata.authorName))break;
        }
        addReview(review({...metadata,...value}));
      }
      const kind = text(first(value.kind, value.__typename, value.entity_type)).toLowerCase();
      if (kind === 'release' || ((value.artists || value.artist || value.slug) && value.title && (value.meta?.score_reviews_avg !== undefined || value.meta?.total_rating !== undefined))) {
        const item = release(value); if (item) { const old = releases.get(item.id); releases.set(item.id, old ? {...old, ...item, path:item.path || old.path,scores:Object.fromEntries(['flom','reviews','users'].map(k=>[k,item.scores[k]??old.scores[k]]))} : item); }
      }
      const inReviews = /review|recension/i.test(context);
      const hasBody = value.text || value.body || value.content || value.review_text || value.reviewText;
      const hasAuthor = value.user || value.author || value.username;
      const hasScore = value.total_rating !== undefined || value.total_score !== undefined || value.rating !== undefined || value.score !== undefined;
      if (/review|recension/.test(kind) || (hasAuthor && hasBody && (inReviews || hasScore))) {
        reviewMarkers = true; addReview(review(value));
      }
      for (const [key, child] of Object.entries(value)) { if (/reviews/i.test(key)) reviewMarkers = true; walk(child, key, depth + 1, [...ancestors,value]); }
    }
    roots.forEach(root => walk(root));
    const result = {releases:[...releases.values()], reviews:[...reviews.values()], reviewMarkers, structured:roots.length > 0};
    if (typeof DOMParser !== 'undefined') domFallback(html, result, requestedPath);
    return result;
  }
  function domFallback(html, result, requestedPath) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const clean = v => (v || '').replace(/\s+/g, ' ').trim();
    const domScores = scope => {
      const read=selector=>{for(const e of scope.querySelectorAll(selector)){const value=clean(e.textContent).replace(',','.');if(/^\d{1,3}(?:\.\d+)?$/.test(value))return score(value);}return null;};
      return {flom:read('[class*="bg-flomaster"]'),reviews:read('.bg-user-color'),users:read('.border-user-color')};
    };
    const mergeScores=(item,scores)=>{for(const key of ['flom','reviews','users'])item.scores[key]=scores[key]??item.scores[key]??null;};
    const paths = new Map(result.releases.filter(r => r.path).map(r => [r.path, r]));
    for (const a of doc.querySelectorAll('a[href]')) {
      const route = url(a.getAttribute('href'));
      if (!route || !/^\/(track|album|release)\//.test(route)) continue;
      let card=a;
      for(let parent=a.parentElement,i=0;parent&&i<8;parent=parent.parentElement,i++){
        const routes=new Set([...parent.querySelectorAll('a[href]')].map(n=>url(n.getAttribute('href'))).filter(p=>/^\/(track|album|release)\//.test(p)));
        if(routes.size>1)break;
        card=parent;
        if(parent.querySelector('a[href^="/artist/"]')&&parent.querySelector('.bg-user-color,.border-user-color'))break;
      }
      const titleLink=[...card.querySelectorAll('a[href]')].find(n=>url(n.getAttribute('href'))===route&&!n.querySelector('img,svg')&&clean(n.textContent));
      const img=card.querySelector('img'),alt=clean(img?.alt).replace(/,\s*обложка.*$/i,''),title=clean(titleLink?.textContent||a.getAttribute('title')||alt.split(/\s+—\s+/).slice(1).join(' — ')||a.textContent);
      if(!title||title.length>180)continue;
      const artists=[...new Set([...card.querySelectorAll('a[href^="/artist/"]')].map(n=>clean(n.textContent)).filter(Boolean))].join(', ');
      const scores=domScores(card);
      const existing = paths.get(route) || result.releases.find(r => !r.path && clean(r.title).toLowerCase() === title.toLowerCase() && (!artists || !r.artist || clean(r.artist).toLowerCase() === artists.toLowerCase()));
      if (existing) { existing.path = route; existing.cover ||= image(img?.getAttribute('src')); existing.artist ||= artists;if(titleLink)existing.title=title;mergeScores(existing,scores);paths.set(route,existing); }
      else { const item = {id:route,path:route,title,artist:artists,cover:image(img?.getAttribute('src')),type:route.startsWith('/track/')?'track':'album',scores,reviewCount:null}; paths.set(route,item); result.releases.push(item); }
    }
    if (/^\/(track|album|release)\//.test(requestedPath)) {
      const title=clean(doc.querySelector('h1')?.textContent || doc.querySelector('meta[property="og:title"]')?.content?.split(' | ')[0]);
      if (title && !result.releases.some(r => r.path === requestedPath)) result.releases.unshift({id:requestedPath,path:requestedPath,title,artist:'',cover:image(doc.querySelector('meta[property="og:image"]')?.content),type:'',scores:{flom:null,reviews:null,users:null}});
      const selected=result.releases.find(r=>r.path?.split('?')[0]===requestedPath.split('?')[0]);
      if(selected){
        const main=doc.querySelector('main')||doc.body,scores=domScores(main);
        // Current detail header wraps the two audience averages in a button.
        const summary=[...main.querySelectorAll('button')].filter(e=>!e.closest('.review-wrapper')).map(e=>clean(e.textContent)).find(t=>/^\d{1,3}(?:[.,]\d+)?\s+\d{1,3}(?:[.,]\d+)?$/.test(t));if(summary){const values=summary.split(/\s+/);scores.reviews=score(values[0].replace(',','.'));scores.users=score(values[1].replace(',','.'));}
        mergeScores(selected,scores);selected.artist||=clean(main.querySelector('a[href^="/artist/"]')?.textContent);
      }
    }
    // Current RZT renders reviews as ordinary HTML rather than reviewContent props.
    for(const card of doc.querySelectorAll('.review-wrapper')){
      const link=card.querySelector('a[href^="/reviews/"]'),path=url(link?.getAttribute('href')),content=card.querySelector('.prose>div:first-child');
      if(!path||!content)continue;
      const author=[...card.querySelectorAll('a[href^="/user/"]')].map(e=>clean(e.textContent)).find(Boolean)||'Участник РЗТ';
      const number=card.querySelector('[class*="text-[20px]"]'),date=clean(card.querySelector('.prose .text-xs')?.textContent),match=/^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date);
      const item=review({id:path.split('/')[2],url:path,title:card.querySelector('h3')?.textContent,text:content.innerHTML,user:{name:author},rating:clean(number?.textContent),date:match?`${match[3]}-${match[2]}-${match[1]}`:date});
      if(!item)continue;
      const old=result.reviews.find(r=>r.id===item.id||r.path===path||clean(r.body.replace(/<[^>]+>/g,' ')).slice(0,80)===clean(content.textContent).slice(0,80));
      if(old)Object.assign(old,{...item,score:item.score??old.score});else result.reviews.push(item);
      result.reviewMarkers=true;
    }
    for (const element of doc.querySelectorAll('article[data-review-id], [data-review-id], [itemtype="https://schema.org/Review"]')) {
      const body=element.querySelector('[itemprop="reviewBody"], [data-review-text]')?.textContent;
      if (!body) continue;
      const item=review({id:element.getAttribute('data-review-id'),text:body,title:element.querySelector('h2,h3')?.textContent,user:{name:element.querySelector('[itemprop="author"],a[href^="/user/"]')?.textContent},rating:element.querySelector('[itemprop="ratingValue"]')?.textContent});
      if (item && !result.reviews.some(r=>r.id===item.id)) result.reviews.push(item);
    }
    // Author, total score and text can be separate siblings in RZT's HTML.
    // Match the card by its canonical review link, never by page-wide order.
    for(const item of result.reviews){
      const links=[...doc.querySelectorAll('a[href]')].filter(a=>{
        const path=url(a.getAttribute('href'));return /^\/reviews\/\d+/.test(path) && (path.split('/')[2].split('?')[0]===item.id || item.id===item.body.slice(0,100));
      });
      const token=clean(item.body).slice(0,100);
      for(const link of links){
        let card=link.parentElement,matched=null;
        for(let i=0;card&&i<16;i++,card=card.parentElement){
          const ids=new Set([...card.querySelectorAll('a[href]')].map(a=>url(a.getAttribute('href'))).filter(p=>/^\/reviews\/\d+/.test(p)));
          if(ids.size>1)break;
          if(token && clean(card.textContent).includes(token)){matched=card;break;}
        }
        if(!matched)continue;
        item.path=url(link.getAttribute('href'));item.id=item.path.split('/')[2].split('?')[0];
        const author=matched.querySelector('a[href^="/user/"]');
        if(author)item.author=clean(author.textContent)||item.author;
        if(item.score===null){
          const candidates=[...matched.querySelectorAll('div,span,strong,b')].filter(e=>!e.children.length && /^\d{1,2}(?:[.,]\d+)?$/.test(clean(e.textContent)) && Number(clean(e.textContent).replace(',','.'))>10);
          const preferred=candidates.find(e=>/font-bold|text-\[|text-[234]xl|rating/.test(e.className));
          if(preferred || candidates.length===1)item.score=score(clean((preferred||candidates[0]).textContent).replace(',','.'));
        }
        break;
      }
    }
    result.explicitEmpty = /Нет рецензий|Рецензий пока нет|Пока нет рецензий/i.test(doc.body.textContent);
  }
  return {parse, objects, url, release, review};
});
