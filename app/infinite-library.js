(() => {
  const root=document.querySelector('main'),sentinel=document.getElementById('more');
  let scheduled=false;
  sentinel.textContent='';sentinel.setAttribute('aria-hidden','true');sentinel.tabIndex=-1;sentinel.onclick=null;
  function check(){
    scheduled=false;
    if(sentinel.classList.contains('hidden')||!sentinel.getClientRects().length||document.body.classList.contains('track-focus')||document.body.classList.contains('lyrics-focus'))return;
    const edge=sentinel.getBoundingClientRect(),viewport=root.getBoundingClientRect();
    if(edge.top>viewport.bottom+600||edge.bottom<viewport.top)return;
    const top=root.scrollTop;
    shown+=100;render();root.scrollTop=top;
    schedule();
  }
  function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(check)}}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))schedule()},{root,rootMargin:'0px 0px 600px 0px'});
  observer.observe(sentinel);
  const previous=render;render=function(){previous();schedule()};
  root.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
  schedule();
})();
