import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const port = process.env.SOUNDSYNC_TEST_PORT || '9227';
const output = path.resolve(process.env.SOUNDSYNC_SCREENSHOTS || 'work/ui-screenshots');
fs.mkdirSync(output, { recursive: true });
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find((p) => p.type === 'page');
assert.ok(page, 'Renderer is available');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
let id = 0;
const pending = new Map(),
  errors = [],
  checks = [];
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const request = pending.get(message.id);
    pending.delete(message.id);
    message.error
      ? request.reject(Error(JSON.stringify(message.error)))
      : request.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown')
    errors.push(message.params.exceptionDetails);
};
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function check(name, expression) {
  const actual = await evaluate(expression);
  assert.equal(actual, true, name + ': ' + JSON.stringify(actual));
  checks.push(name);
}
async function screenshot(name) {
  const { data } = await call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data, 'base64'));
}
try {
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 980,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (let ready = 0; ready < 100; ready++) {
    if (
      await evaluate(
        `document.readyState==='complete'&&!!document.querySelector('.home-nav')&&typeof library!=='undefined'&&library.tracks.length>=12`
      )
    )
      break;
    if (ready === 99) throw Error('Player scripts did not become ready');
    await pause(100);
  }
  await evaluate(
    `Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});localStorage.setItem('volume','0');audio.volume=0;audio.muted=true;$('volume').value='0';$('volume').dispatchEvent(new Event('input'));document.querySelector('.home-nav').click();setFlatTheme(true);playList(library.tracks,0);getComputedStyle(document.querySelector('.now-panel')).backgroundColor`
  );
  await pause(1700);
  await check(
    'Playback and cover loaded',
    `!audio.paused&&audio.currentTime>0&&$('now-cover').querySelector('img').naturalWidth>0`
  );
  await check(
    'Flat shell surfaces are neutral',
    `[document.body,document.querySelector('.titlebar'),document.querySelector('.sidebar'),document.querySelector('main'),document.querySelector('.now-panel'),document.querySelector('.player'),document.querySelector('.hero')].every(e=>{const g=document.createElement('canvas').getContext('2d');g.fillStyle=getComputedStyle(e).backgroundColor;g.fillRect(0,0,1,1);const c=[...g.getImageData(0,0,1,1).data].slice(0,3);return Math.max(...c)-Math.min(...c)<=3})`
  );
  await check(
    'Flat hero has no gradient',
    `getComputedStyle(document.querySelector('.hero')).backgroundImage==='none'`
  );
  await check(
    'Back icon is centered',
    `(()=>{const a=document.querySelector('.dashboard-back').getBoundingClientRect(),b=document.querySelector('.dashboard-back svg').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<1&&Math.abs(a.y+a.height/2-b.y-b.height/2)<1})()`
  );
  await check(
    'Lyric action buttons have equal height',
    `Math.abs(editLyrics.getBoundingClientRect().height-alignButton.getBoundingClientRect().height)<1`
  );
  await screenshot('flat-home');
  await evaluate(`$('mini-cover').click()`);
  await pause(1000);
  await check(
    'Visualization opens first',
    `listeningView==='visual'&&showVisual.getAttribute('aria-selected')==='true'&&!immersive.classList.contains('hidden')&&!visualPanel.classList.contains('hidden')`
  );
  await check(
    'Visual controls fit the header',
    `[closeImmersive,viewSwitch,listeningControls].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>0})`
  );
  await check(
    'Cover and canvas do not overlap',
    `immersiveArt.getBoundingClientRect().right<visualCanvas.getBoundingClientRect().left`
  );
  await check('Visualization renders', `visualPaints>0&&visualCanvas.width>0`);
  await screenshot('flat-visual');
  const before = await evaluate('audio.currentTime');
  await evaluate('showLyrics.click()');
  await pause(350);
  await check(
    'Lyrics switch preserves playback and the same nodes',
    `!audio.paused&&audio.currentTime>=${before}&&listeningView==='lyrics'&&$('lyrics')===lyricBox&&$('lyrics').closest('#listening-lyrics')===listeningLyrics&&immersive.querySelectorAll('#lyrics').length===1`
  );
  await check(
    'Full lyrics use the shared screen',
    `document.body.classList.contains('track-focus')&&showLyrics.getAttribute('aria-selected')==='true'&&visualPanel.classList.contains('hidden')&&!listeningLyrics.classList.contains('hidden')`
  );
  await screenshot('flat-lyrics');
  await evaluate(`$('queue-tab').click()`);
  await check(
    'Queue remains available',
    `!$('queue').classList.contains('hidden')&&$('lyrics').classList.contains('hidden')`
  );
  await evaluate(
    `$('lyrics-tab').click();showVisual.click();showLyrics.focus();showLyrics.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`
  );
  await check(
    'Switch supports keyboard navigation',
    `document.activeElement===showVisual&&listeningView==='visual'`
  );
  await evaluate(`exitImmersive()`);
  await check(
    'Closing restores sidebar nodes and controls',
    `$('lyrics').closest('.now-panel')!==null&&alignmentTools.closest('.now-details')!==null&&!document.body.classList.contains('track-focus')&&listeningHomes.size===0`
  );
  await evaluate(
    `setFlatTheme(false);applyCoverPalette([[180,52,58],[90,40,69],[210,130,80]]);getComputedStyle(document.documentElement).getPropertyValue('--cover-primary')`
  );
  await pause(1300);
  await screenshot('gradient-warm-home');
  const warm = await evaluate(`getComputedStyle(document.querySelector('main')).backgroundColor`);
  await evaluate(
    `applyCoverPalette([[35,102,180],[30,70,120],[75,160,170]]);getComputedStyle(document.documentElement).getPropertyValue('--cover-primary')`
  );
  await pause(1300);
  await screenshot('gradient-home');
  await check(
    'Gradient shell follows a different cover palette',
    `getComputedStyle(document.querySelector('main')).backgroundColor!==${JSON.stringify(warm)}&&getComputedStyle(document.querySelector('.player')).backgroundColor!==getComputedStyle(document.querySelector('main')).backgroundColor`
  );
  await screenshot('gradient-home');
  await evaluate(`openImmersive()`);
  await pause(900);
  await screenshot('gradient-visual');
  await evaluate(`showLyrics.click()`);
  await pause(250);
  await screenshot('gradient-lyrics');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1000,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await pause(400);
  await check(
    'Compact lyrics stay above the player',
    `listeningLyrics.getBoundingClientRect().bottom<=document.querySelector('.player').getBoundingClientRect().top+1&&immersiveInfo.scrollWidth<=immersiveInfo.clientWidth+2`
  );
  await screenshot('compact-lyrics');
  await evaluate(`showVisual.click()`);
  await pause(500);
  await check(
    'Compact visualization has no overlapping controls',
    `(()=>{const a=viewSwitch.getBoundingClientRect(),b=listeningControls.getBoundingClientRect();return b.top>=a.bottom-1&&b.right<=innerWidth})()`
  );
  await screenshot('compact-visual');
  await evaluate(`showLyrics.click();exitImmersive();openImmersive()`);
  await check(
    'Reopening always starts with visualization',
    `listeningView==='visual'&&showVisual.getAttribute('aria-selected')==='true'`
  );
  await evaluate(`exitImmersive();setPalette({...current,cover:''})`);
  await check(
    'Missing cover clears the previous album palette',
    `JSON.stringify(targetPalette)===JSON.stringify(CoverPalette.fallback)`
  );
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 980,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    `exitImmersive();window.dashboardNavigation.openHome();for(const track of library.tracks){current=track;audio.dispatchEvent(new Event('playing'))}document.querySelector('main').style.scrollBehavior='auto';[...document.querySelectorAll('.home-section-heading')].find(h=>h.querySelector('h2').textContent==='История прослушивания')?.querySelector('button')?.click()`
  );
  await pause(400);
  const historyTop = await evaluate(
    `(()=>{const main=document.querySelector('main');main.scrollTop=Math.min(600,main.scrollHeight-main.clientHeight);return main.scrollTop})()`
  );
  assert.ok(historyTop > 100, 'History fixture can scroll');
  await evaluate(`document.querySelectorAll('.home-history .home-album')[3].click()`);
  await pause(1100);
  await check(
    'History track selection and playback preserve scroll',
    `Math.abs(document.querySelector('main').scrollTop-${historyTop})<=1&&!audio.paused`
  );
  await evaluate(
    `audio.pause();setLyrics({lyrics:'[00:03.00]<00:03.00>Первая <00:04.00>строка'});audio.currentTime=2.99;syncLyrics();paintLyricLetters(2.99)`
  );
  await check(
    'Letters stay unfilled before the first word',
    `[...lyricBox.querySelectorAll('.lyric-glyph')].every(e=>Number.parseFloat(e.style.getPropertyValue('--glyph-fill'))===-20)&&lumenLetterPose(2.99,3,1,0,6).glow===0`
  );
  await evaluate(
    `setLyrics({lyrics:'И так',alignment:{lines:[{time:.68,end:4,text:'И так',words:[{time:.68,end:3.2,text:'И ',matched:false},{time:3.2,end:4,text:'так',matched:true}]}]}});audio.currentTime=1;syncLyrics();paintLyricLetters(1)`
  );
  await check(
    'Uncertain intro words do not activate the line',
    `activeLine===-1&&lyricBox.querySelector('.lyric-glyph').style.getPropertyValue('--glyph-fill')==='-20%'`
  );
  const card = (slug, title, artist, a, b) =>
    `<section><a href="/album/${slug}"><img alt="${artist} — ${title}, обложка альбома" src="https://example.com/cover.jpg"><span>39</span><span>137</span></a><div><a href="/album/${slug}">${title}</a><a href="/artist/test">${artist}</a></div><div class="bg-user-color">${a}</div><div class="border-user-color">${b}</div></section>`;
  const review = `<div class="review-wrapper"><a href="/user/1"><img></a><a href="/user/1">Reviewer</a><div class="text-[20px] font-bold"><span>65</span></div><button>8</button><h3>Review title</h3><div class="prose"><div>First paragraph<br><br>Second paragraph.</div><div class="text-xs">11.11.2026</div></div><footer><span>2</span><a href="/reviews/192216">Link</a></footer></div>`;
  const cards = await evaluate(
    `RztData.parse(${JSON.stringify('<main>' + card('8ballz', '8BALLZ', 'BOOKER', 72, 69) + card('zero', 'Zero', 'Other', 0, 12) + '</main>')},'/releases')`
  );
  assert.equal(cards.releases.length, 2);
  assert.equal(cards.releases[0].title, '8BALLZ');
  assert.equal(cards.releases[0].scores.reviews, 72);
  assert.equal(cards.releases[0].scores.users, 69);
  assert.equal(cards.releases[1].scores.reviews, 0);
  const detail = await evaluate(
    `RztData.parse(${JSON.stringify('<main><h1>8BALLZ</h1><a href="/artist/booker">BOOKER</a><button><span>72</span> <span>69</span></button>' + review + card('related', 'Related', 'Other', 11, 22) + '</main>')},'/album/8ballz')`
  );
  assert.equal(detail.releases.find((t) => t.path === '/album/8ballz').scores.reviews, 72);
  assert.equal(detail.reviews[0].author, 'Reviewer');
  assert.equal(detail.reviews[0].score, 65);
  assert.equal(detail.reviews[0].path, '/reviews/192216');
  assert.ok(!detail.reviews[0].body.includes('11.11.2026'));
  checks.push('RZT modern cards, zero scores, authors, review content and rating isolation');
  // Editor and mini-player share the live library/audio, including when the main window is hidden.
  await evaluate(
    `document.querySelector('[data-view="tracks"]').click();window.__cardOriginalTitle=library.tracks[0].title;openTrackMenu(library.tracks[0],document.querySelector('.track-options'));[...trackMenu.querySelectorAll('button')].find(b=>b.textContent==='Редактировать карточку').click()`
  );
  const until = async (expression) => {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error('Timed out: ' + expression);
  };
  await until(`document.querySelector('#track-card-dialog').open`);
  await evaluate(
    `document.querySelector('#card-title').value='Карточка 1.2.6';document.querySelector('#card-year').value='2026';document.querySelector('#track-card-dialog .card-actions .primary').click()`
  );
  await until(`!document.querySelector('#track-card-dialog').open`);
  await check(
    'Track card saves metadata through the native backend',
    `library.tracks[0].title==='Карточка 1.2.6'&&library.tracks[0].year===2026`
  );
  await evaluate(
    `openTrackMenu(library.tracks[0],document.querySelector('.track-options'));[...trackMenu.querySelectorAll('button')].find(b=>b.textContent==='Редактировать карточку').click()`
  );
  await until(
    `document.querySelector('#track-card-dialog').open&&!document.querySelector('#track-card-dialog .card-actions .quiet').disabled`
  );
  await evaluate(`document.querySelector('#track-card-dialog .card-actions .quiet').click()`);
  await until(`!document.querySelector('#track-card-dialog').open`);
  await check(
    'Original track card can be restored',
    `library.tracks[0].title===window.__cardOriginalTitle`
  );
  await evaluate(`playList(library.tracks,0)`);
  await pause(300);
  await evaluate(`$('open-mini-player').focus()`);
  await until(`getComputedStyle($('open-mini-player')).opacity==='1'`);
  await check(
    'Mini-player launcher is on the artwork and keyboard-accessible',
    `$('mini-cover').parentElement.contains($('open-mini-player'))&&!document.querySelector('.volume-control #open-mini-player')&&getComputedStyle($('open-mini-player')).opacity==='1'`
  );
  await evaluate(`window.__miniSource=audio.src;window.lumen.miniPlayerOpen()`);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(),
    miniTarget = targets.find((p) => p.url.endsWith('/mini-player.html'));
  assert.ok(miniTarget, 'Native mini-player window exists');
  const miniSocket = new WebSocket(miniTarget.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    miniSocket.onopen = resolve;
    miniSocket.onerror = reject;
  });
  let miniId = 0;
  const miniPending = new Map();
  miniSocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && miniPending.has(message.id)) {
      const request = miniPending.get(message.id);
      miniPending.delete(message.id);
      message.error
        ? request.reject(Error(JSON.stringify(message.error)))
        : request.resolve(message.result);
    }
  };
  const miniEval = (expression) =>
    new Promise((resolve, reject) => {
      miniPending.set(++miniId, {
        resolve: (result) => {
          if (result.exceptionDetails) reject(Error(JSON.stringify(result.exceptionDetails)));
          else resolve(result.result.value);
        },
        reject,
      });
      miniSocket.send(
        JSON.stringify({
          id: miniId,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true, userGesture: true },
        })
      );
    });
  assert.equal(await miniEval(`document.querySelectorAll('button svg').length>=8`), true);
  checks.push('Mini-player uses SVG controls');
  await miniEval(`document.querySelector('#play').click()`);
  await until('audio.paused');
  await miniEval(`document.querySelector('#play').click()`);
  await until('!audio.paused');
  await miniEval(
    `document.querySelector('#volume').value=.25;document.querySelector('#volume').dispatchEvent(new Event('input'))`
  );
  await until('Math.abs(audio.volume-.25)<.01');
  await miniEval(`document.querySelector('#mute').click()`);
  await until('audio.volume===0');
  await miniEval(`document.querySelector('#mute').click()`);
  await until('Math.abs(audio.volume-.25)<.01');
  await miniEval(
    `document.querySelector('#seek').value=.5;document.querySelector('#seek').dispatchEvent(new Event('change'))`
  );
  await until('audio.currentTime>=44');
  checks.push('Mini-player pause, resume, volume, mute and seeking control the original audio');
  const miniClosed = new Promise((resolve) =>
    miniSocket.addEventListener('close', resolve, { once: true })
  );
  miniSocket.send(
    JSON.stringify({
      id: ++miniId,
      method: 'Input.dispatchKeyEvent',
      params: { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
    })
  );
  await Promise.race([miniClosed, pause(2500)]);
  await check(
    'Escape returns to the main player without restarting audio',
    `!audio.paused&&audio.src===window.__miniSource&&audio.currentTime>=44`
  );
  const afterMini = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  assert.equal(
    afterMini.some((p) => p.url.endsWith('/mini-player.html')),
    false
  );
  miniSocket.close();

  await call('Emulation.setDeviceMetricsOverride', {
    width: 1600,
    height: 980,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(`$('feedback-open').click()`);
  await check(
    'General feedback form is available outside recommendations',
    `$('feedback-dialog').open&&typeof window.lumen.feedbackOpen==='function'&&$('feedback-type').options.length===3&&$('feedback-dialog').textContent.includes('о любой части приложения')`
  );
  await evaluate(
    `$('feedback-title').value='Проверка формы';$('feedback-message').value='Описание общей проблемы с приложением.';$('feedback-info').checked=false`
  );
  await check(
    'Feedback allows a message without system information',
    `$('feedback-form').checkValidity()&&!$('feedback-info').checked&&!!$('feedback-contact')&&$('feedback-submit').textContent==='Отправить'`
  );
  await screenshot('feedback-dialog');
  await evaluate(`$('feedback-dialog').querySelector('.feedback-close').click()`);
  await check('Feedback can close without opening GitHub', `!$('feedback-dialog').open`);
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1000,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await check(
    'Feedback launcher stays accessible in a short window',
    `(()=>{const r=$('feedback-open').getBoundingClientRect(),p=document.querySelector('.player').getBoundingClientRect();return r.top>=0&&r.bottom<=54&&r.right<=innerWidth})()`
  );
  assert.equal(errors.length, 0, 'No renderer exceptions');
  checks.push('No renderer exceptions');
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: true, checks }, null, 2));
  console.log(JSON.stringify({ ok: true, checks }, null, 2));
} finally {
  socket.close();
}
