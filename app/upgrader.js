/* Апгрейдер: ставишь трек, который тебе скорее всего не зайдёт, и пробуешь превратить его
   в трек получше. Чем выше цель, тем меньше шанс. Выиграл — апгрейдишь дальше, проиграл —
   ставка сгорает. Оценки «зайдёт / не зайдёт» даёт TasteModel по твоему вкусу. */
(() => {
  'use strict';
  const M = window.TasteModel;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const pct = (x) => Math.round(x * 100) + '%';
  const short = (text, n = 34) => (text.length > n ? text.slice(0, n - 1).trimEnd() + '…' : text);
  const STATS_KEY = 'upgrader-stats-v1',
    SOUND_KEY = 'upgrader-sound';
  const readStats = () => {
    try {
      return {
        spins: 0,
        wins: 0,
        bestChain: 0,
        history: [],
        ...JSON.parse(localStorage.getItem(STATS_KEY) || '{}'),
      };
    } catch {
      return { spins: 0, wins: 0, bestChain: 0, history: [] };
    }
  };
  const writeStats = () => {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {}
  };
  let stats = readStats(),
    soundOn = (() => {
      try {
        return localStorage.getItem(SOUND_KEY) !== 'off';
      } catch {
        return true;
      }
    })();

  // ——— Разметка ———
  const dialog = el('dialog', 'upg-dialog');
  dialog.setAttribute('aria-labelledby', 'upg-title');
  const shell = el('div', 'upg-shell');
  dialog.append(shell);

  const header = el('header', 'upg-header'),
    brand = el('div', 'upg-brand', '⇪'),
    heading = el('div', 'upg-heading'),
    eyebrow = el('div', 'upg-eyebrow', 'SOUNDSYNC · ИГРА'),
    title = el('h2', '', 'Апгрейдер'),
    subtitle = el(
      'p',
      'upg-subtitle',
      'Поставь трек, который вряд ли зайдёт, и рискни поменять его на тот, что попадёт в твой вкус.'
    );
  title.id = 'upg-title';
  heading.append(eyebrow, title, subtitle);
  const statsBox = el('div', 'upg-stats'),
    soundButton = el('button', 'upg-icon-button'),
    closeButton = el('button', 'upg-icon-button upg-close', '×');
  closeButton.setAttribute('aria-label', 'Закрыть апгрейдер');
  closeButton.onclick = () => dialog.close();
  soundButton.onclick = () => {
    soundOn = !soundOn;
    try {
      localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off');
    } catch {}
    renderSound();
  };
  header.append(brand, heading, statsBox, soundButton, closeButton);

  const stage = el('section', 'upg-stage'),
    stakeSlot = el('div', 'upg-slot upg-stake'),
    targetSlot = el('div', 'upg-slot upg-target'),
    center = el('div', 'upg-center');
  stage.append(stakeSlot, center, targetSlot);

  // Колесо: кольцо, дуга выигрыша по часовой стрелке от верха, риски и стрелка.
  const NS = 'http://www.w3.org/2000/svg',
    svg = (tag, attrs) => {
      const e = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
      return e;
    };
  const R = 86,
    C = 2 * Math.PI * R;
  const wheel = svg('svg', { viewBox: '0 0 200 200', class: 'upg-wheel', 'aria-hidden': 'true' });
  const defs = svg('defs');
  const glow = svg('filter', {
    id: 'upg-glow',
    x: '-50%',
    y: '-50%',
    width: '200%',
    height: '200%',
  });
  glow.append(svg('feGaussianBlur', { stdDeviation: '3.2', result: 'b' }));
  const merge = svg('feMerge');
  merge.append(svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' }));
  glow.append(merge);
  defs.append(glow);
  const track = svg('circle', { cx: 100, cy: 100, r: R, class: 'upg-wheel-track' });
  const arc = svg('circle', {
    cx: 100,
    cy: 100,
    r: R,
    class: 'upg-wheel-arc',
    transform: 'rotate(-90 100 100)',
    filter: 'url(#upg-glow)',
  });
  const ticks = svg('g', { class: 'upg-wheel-ticks' });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2,
      long = i % 5 === 0,
      r1 = R - 13,
      r2 = R - (long ? 21 : 17);
    ticks.append(
      svg('line', {
        x1: 100 + Math.sin(a) * r1,
        y1: 100 - Math.cos(a) * r1,
        x2: 100 + Math.sin(a) * r2,
        y2: 100 - Math.cos(a) * r2,
        class: long ? 'long' : '',
      })
    );
  }
  const needle = svg('g', { class: 'upg-needle' });
  needle.append(
    svg('path', { d: 'M100 8 L106 24 L100 21 L94 24 Z', class: 'upg-needle-head' }),
    svg('line', { x1: 100, y1: 22, x2: 100, y2: 62, class: 'upg-needle-shaft' })
  );
  wheel.append(defs, track, arc, ticks, needle);
  const wheelBox = el('div', 'upg-wheel-box'),
    readout = el('div', 'upg-readout'),
    chanceText = el('strong', 'upg-chance', '—'),
    chanceLabel = el('span', 'upg-chance-label', 'шанс'),
    multText = el('span', 'upg-mult', '');
  readout.append(chanceText, chanceLabel, multText);
  const burst = el('div', 'upg-burst');
  wheelBox.append(wheel, readout, burst);
  const spinButton = el('button', 'upg-spin', 'Апгрейд'),
    chainText = el('div', 'upg-chain'),
    resultBox = el('div', 'upg-result');
  resultBox.setAttribute('aria-live', 'polite');
  center.append(wheelBox, spinButton, chainText, resultBox);

  const pickers = el('section', 'upg-pickers');
  const stakePanel = el('div', 'upg-panel'),
    stakeHead = el('div', 'upg-panel-head'),
    stakeRefresh = el('button', 'upg-ghost', 'Другие треки ↻'),
    stakeList = el('div', 'upg-cards upg-stake-cards');
  stakeHead.append(
    el('h3', '', '1 · Ставка'),
    el('p', '', 'Треки, которые тебе скорее всего не зайдут'),
    stakeRefresh
  );
  stakePanel.append(stakeHead, stakeList);
  const targetPanel = el('div', 'upg-panel'),
    targetHead = el('div', 'upg-panel-head'),
    quick = el('div', 'upg-quick'),
    tierChips = el('div', 'upg-tiers'),
    targetList = el('div', 'upg-cards upg-target-cards');
  targetHead.append(
    el('h3', '', '2 · Цель'),
    el('p', '', 'Чем выше уровень, тем меньше шанс'),
    quick
  );
  targetPanel.append(targetHead, tierChips, targetList);
  const historyRow = el('div', 'upg-history');
  pickers.append(stakePanel, targetPanel);
  const notice = el('div', 'upg-notice hidden');
  shell.append(header, notice, stage, pickers, historyRow);
  document.body.append(dialog);

  // ——— Состояние ———
  let profile = null,
    stakes = [],
    targets = [],
    stake = null,
    target = null,
    tierFilter = 'all',
    chain = 0,
    spinning = false,
    needleAngle = 0,
    loadGeneration = 0;
  const burned = new Set(),
    scored = new Map();
  const score = (t) => {
    if (!scored.has(t.id)) scored.set(t.id, M.scoreTrack(t, profile));
    return scored.get(t.id);
  };

  // ——— Звук ———
  let audioContext = null;
  function tone(freq, start, length, { type = 'sine', gain = 0.06, to } = {}) {
    if (!soundOn) return;
    try {
      audioContext ||= new AudioContext();
      const t0 = audioContext.currentTime + start,
        osc = audioContext.createOscillator(),
        amp = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + length);
      amp.gain.setValueAtTime(0.0001, t0);
      amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
      osc.connect(amp).connect(audioContext.destination);
      osc.start(t0);
      osc.stop(t0 + length + 0.02);
    } catch {}
  }
  const sounds = {
    tick: () => tone(2100, 0, 0.025, { type: 'square', gain: 0.018 }),
    win: () =>
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(f, i * 0.085, 0.42, { gain: 0.07 })),
    lose: () => tone(180, 0, 0.5, { type: 'sawtooth', gain: 0.05, to: 55 }),
  };

  // ——— Карточки ———
  function cover(t, cls) {
    const box = el('div', cls);
    if (t.cover) {
      const img = el('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = media(t, true);
      img.onerror = () => img.replaceWith(el('span', 'upg-cover-note', '♪'));
      box.append(img);
    } else box.append(el('span', 'upg-cover-note', '♪'));
    return box;
  }
  function card(t, { chance, selected, onPick }) {
    const s = score(t),
      tier = M.tierOf(s.score),
      b = el('button', 'upg-card' + (selected ? ' selected' : ''));
    b.style.setProperty('--tier', tier.color);
    b.dataset.tier = tier.id;
    b.title = s.reasons.join(' · ');
    const info = el('div', 'upg-card-info');
    info.append(
      el('span', 'upg-tier-badge', tier.name),
      el('strong', 'upg-card-title', t.title),
      el('span', 'upg-card-artist', t.artist)
    );
    const meter = el('div', 'upg-meter');
    const fill = el('i');
    fill.style.width = pct(s.score);
    meter.append(fill);
    const foot = el('div', 'upg-card-foot');
    foot.append(el('span', '', 'Вкус ' + pct(s.score)));
    if (chance !== undefined) foot.append(el('span', 'upg-card-chance', 'Шанс ' + pct(chance)));
    b.append(cover(t, 'upg-card-cover'), info, meter, foot);
    b.onclick = () => !spinning && onPick(t);
    return b;
  }
  function slot(box, t, label, empty) {
    box.replaceChildren(el('div', 'upg-slot-label', label));
    if (!t) {
      box.append(el('div', 'upg-slot-empty', empty));
      box.style.removeProperty('--tier');
      return;
    }
    const s = score(t),
      tier = M.tierOf(s.score);
    box.style.setProperty('--tier', tier.color);
    const big = el('div', 'upg-slot-card');
    const art = cover(t, 'upg-slot-cover');
    const listen = el('button', 'upg-listen', '▶');
    listen.title = 'Послушать';
    listen.setAttribute('aria-label', 'Послушать ' + t.title);
    listen.onclick = () => playList([t], 0);
    art.append(listen);
    const reasons = el('ul', 'upg-reasons');
    for (const r of s.reasons) reasons.append(el('li', '', r));
    big.append(
      art,
      el('span', 'upg-tier-badge', tier.name),
      el('strong', 'upg-slot-title', t.title),
      el('span', 'upg-slot-artist', t.artist),
      el('div', 'upg-slot-score', 'Попадание во вкус · ' + pct(s.score)),
      reasons
    );
    box.append(big);
  }

  // ——— Отрисовка ———
  function chance() {
    return stake && target ? M.upgradeChance(score(stake).score, score(target).score) : 0;
  }
  function renderSound() {
    soundButton.textContent = soundOn ? '🔊' : '🔈';
    soundButton.setAttribute('aria-label', soundOn ? 'Выключить звуки' : 'Включить звуки');
    soundButton.title = soundButton.getAttribute('aria-label');
  }
  function renderStats() {
    statsBox.replaceChildren();
    for (const [label, value] of [
      ['Попыток', stats.spins],
      ['Апгрейдов', stats.wins],
      ['Лучшая цепочка', stats.bestChain],
    ]) {
      const item = el('div', 'upg-stat');
      item.append(el('strong', '', String(value)), el('span', '', label));
      statsBox.append(item);
    }
    historyRow.replaceChildren();
    if (!stats.history.length) return;
    historyRow.append(el('span', 'upg-history-label', 'Последние'));
    for (const h of stats.history.slice(-12)) {
      const chip = el('span', 'upg-history-chip ' + (h.win ? 'win' : 'lose'));
      chip.style.setProperty('--tier', M.TIERS.find((t) => t.id === h.tier)?.color || '#888');
      chip.textContent = (h.win ? '▲ ' : '✕ ') + pct(h.chance);
      chip.title = (h.win ? 'Апгрейд: ' : 'Сгорело: ') + h.title;
      historyRow.append(chip);
    }
  }
  function renderWheel() {
    const c = chance(),
      tier = target ? M.tierOf(score(target).score) : null;
    arc.setAttribute('stroke-dasharray', `${(C * c).toFixed(2)} ${C.toFixed(2)}`);
    wheelBox.style.setProperty('--tier', tier?.color || '#ffd629');
    chanceText.textContent = stake && target ? pct(c) : '—';
    multText.textContent =
      stake && target ? '×' + M.multiplier(score(stake).score, score(target).score).toFixed(1) : '';
    spinButton.disabled = !stake || !target || spinning;
    spinButton.textContent = spinning ? 'Крутим…' : stake && target ? 'Апгрейд' : 'Выбери треки';
    chainText.textContent = chain ? `Цепочка ×${chain}` : '';
  }
  function renderStakes() {
    stakeList.replaceChildren();
    const list = stakes.filter((t) => !burned.has(t.id));
    if (!list.length) stakeList.append(el('div', 'upg-empty', 'Подбираем плохие треки…'));
    for (const t of list)
      stakeList.append(
        card(t, {
          selected: stake?.id === t.id,
          onPick: (picked) => {
            stake = picked;
            chain = 0;
            if (target && score(target).score <= score(stake).score) target = null;
            renderAll();
          },
        })
      );
  }
  function availableTargets() {
    const base = stake ? score(stake).score : 0;
    return targets
      .filter((t) => t.id !== stake?.id && !burned.has(t.id) && score(t).score > base + 0.05)
      .sort((a, b) => score(a).score - score(b).score);
  }
  function renderTargets() {
    const list = availableTargets();
    tierChips.replaceChildren();
    for (const tier of [{ id: 'all', name: 'Все', color: '#f5f3eb' }, ...M.TIERS.slice(1)]) {
      const count =
        tier.id === 'all'
          ? list.length
          : list.filter((t) => M.tierOf(score(t).score).id === tier.id).length;
      const chip = el('button', 'upg-tier-chip' + (tierFilter === tier.id ? ' active' : ''));
      chip.style.setProperty('--tier', tier.color);
      chip.append(el('span', '', tier.name), el('small', '', String(count)));
      chip.disabled = !count && tier.id !== 'all';
      chip.onclick = () => {
        tierFilter = tier.id;
        renderTargets();
      };
      tierChips.append(chip);
    }
    quick.replaceChildren();
    if (stake)
      for (const m of [1.5, 2, 3, 5]) {
        const q = el('button', 'upg-ghost', '×' + m);
        q.title = 'Выбрать цель с множителем около ×' + m;
        q.onclick = () => {
          if (spinning || !list.length) return;
          const s = score(stake).score;
          target = list.reduce((best, t) =>
            Math.abs(Math.log(M.multiplier(s, score(t).score) / m)) <
            Math.abs(Math.log(M.multiplier(s, score(best).score) / m))
              ? t
              : best
          );
          tierFilter = 'all';
          renderAll();
          scrollToSelected();
        };
        quick.append(q);
      }
    targetList.replaceChildren();
    const shown = list.filter(
      (t) => tierFilter === 'all' || M.tierOf(score(t).score).id === tierFilter
    );
    if (!stake) targetList.append(el('div', 'upg-empty', 'Сначала выбери ставку'));
    else if (!shown.length)
      targetList.append(
        el(
          'div',
          'upg-empty',
          targets.length ? 'Нет целей выше этой ставки' : 'Ищем треки под твой вкус…'
        )
      );
    for (const t of shown)
      targetList.append(
        card(t, {
          chance: M.upgradeChance(score(stake).score, score(t).score),
          selected: target?.id === t.id,
          onPick: (picked) => {
            target = picked;
            renderAll();
          },
        })
      );
  }
  // Прокручиваем только ленту целей: scrollIntoView прокручивал всё окно и прятал шапку.
  function scrollToSelected() {
    const picked = targetList.querySelector('.selected');
    if (!picked) return;
    const left = picked.offsetLeft - (targetList.clientWidth - picked.offsetWidth) / 2;
    targetList.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }
  function renderAll() {
    slot(stakeSlot, stake, 'Ставка', 'Выбери трек, который вряд ли зайдёт');
    slot(targetSlot, target, 'Цель', 'Выбери, во что апгрейдить');
    renderWheel();
    renderStakes();
    renderTargets();
    renderStats();
  }

  // ——— Данные ———
  function tasteSources() {
    const lib = library?.tracks || [];
    const byId = new Map(lib.map((t) => [t.id, t]));
    const remoteLiked =
      typeof remoteFavoriteTracks !== 'undefined' ? [...remoteFavoriteTracks.values()] : [];
    const liked = [...lib.filter((t) => favorites.has(t.id)), ...remoteLiked];
    const keys = new Set([
      ...(window.initialUiPreferences?.playedTrackKeys || []),
      ...(window.initialUiPreferences?.recent || []).map((id) =>
        id.startsWith('sc-') ? id : 'local-' + id
      ),
    ]);
    const played = [...keys]
      .filter((k) => k.startsWith('local-'))
      .map((k) => byId.get(k.slice(6)))
      .filter(Boolean);
    const disliked = typeof excludedOnlineTracks !== 'undefined' ? excludedOnlineTracks : [];
    return { liked, played, owned: lib, disliked };
  }
  const playable = (t) => t && !t.playbackUnavailable && t.title && (t.remote || t.path);
  async function load() {
    const generation = ++loadGeneration;
    const sources = tasteSources();
    try {
      sources.played.push(...((await window.lumen.scHistory()) || []).slice(-300));
    } catch {}
    profile = M.buildProfile(sources);
    scored.clear();
    notice.classList.toggle('hidden', profile.signals >= 5);
    notice.textContent =
      'Пока мало данных о твоём вкусе. Лайкай треки и слушай музыку — оценки станут точнее.';
    stakes = [];
    targets = [];
    renderAll();
    await Promise.all([loadStakes(generation), loadTargets(generation)]);
  }
  async function loadStakes(generation) {
    const seen = [...burned, ...stakes.map((t) => t.id)];
    const results = await Promise.allSettled([
      window.lumen.scRandom(seen),
      window.lumen.scRandom(seen),
    ]);
    if (generation !== loadGeneration) return;
    const pool = new Map();
    for (const r of results)
      if (r.status === 'fulfilled') for (const t of r.value || []) pool.set(t.id, t);
    for (const t of library?.tracks || []) if (!favorites.has(t.id)) pool.set(t.id, t);
    const candidates = [...pool.values()]
      .filter((t) => playable(t) && !burned.has(t.id) && score(t).score < 0.42)
      .sort((a, b) => score(a).score - score(b).score);
    // Немного случайности, чтобы набор ставок менялся.
    const lowest = candidates.slice(0, 18);
    for (let i = lowest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lowest[i], lowest[j]] = [lowest[j], lowest[i]];
    }
    stakes = lowest.slice(0, 6).sort((a, b) => score(a).score - score(b).score);
    if (!stake || burned.has(stake.id)) stake = stakes[0] || null;
    if (!stakes.length)
      stakeList.replaceChildren(
        el(
          'div',
          'upg-empty',
          'Не удалось подобрать треки. Проверь интернет и нажми «Другие треки».'
        )
      );
    renderAll();
  }
  async function loadTargets(generation) {
    const queries = [
      ...profile.topArtists.slice(0, 4).map((a) => a.name),
      ...profile.topGenres.slice(0, 2).map((g) => g.tag),
    ].filter(Boolean);
    if (!queries.length) queries.push('rap', 'electronic', 'indie');
    const results = await Promise.allSettled(queries.map((q) => window.lumen.scSearch(q)));
    if (generation !== loadGeneration) return;
    const pool = new Map();
    for (const r of results)
      if (r.status === 'fulfilled') for (const t of (r.value || []).slice(0, 25)) pool.set(t.id, t);
    for (const t of library?.tracks || []) pool.set(t.id, t);
    targets = [...pool.values()].filter(
      (t) => playable(t) && !favorites.has(t.id) && !profile.dislikedIds.has(t.id)
    );
    renderAll();
  }
  stakeRefresh.onclick = () => {
    if (spinning) return;
    stakes = [];
    renderStakes();
    loadStakes(loadGeneration);
  };

  // ——— Вращение ———
  const ease = (p) => 1 - Math.pow(1 - p, 4);
  function spawnBurst(color) {
    burst.replaceChildren();
    for (let i = 0; i < 34; i++) {
      const p = el('i'),
        a = (i / 34) * Math.PI * 2 + Math.random() * 0.3,
        d = 90 + Math.random() * 110;
      p.style.setProperty('--dx', (Math.cos(a) * d).toFixed(1) + 'px');
      p.style.setProperty('--dy', (Math.sin(a) * d).toFixed(1) + 'px');
      p.style.setProperty('--delay', (Math.random() * 80).toFixed(0) + 'ms');
      p.style.background = i % 3 ? color : '#fff';
      burst.append(p);
    }
  }
  function spin() {
    if (spinning || !stake || !target) return;
    const c = chance(),
      result = M.roll(c, () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296),
      tier = M.tierOf(score(target).score),
      from = needleAngle,
      to = from + 360 * 5 + ((result.angle - (from % 360) + 360) % 360),
      duration = 4800,
      start = performance.now();
    const won = target,
      lost = stake;
    spinning = true;
    resultBox.replaceChildren();
    stage.classList.remove('win', 'lose');
    stage.classList.add('spinning');
    renderWheel();
    let lastTick = Math.floor(from / 12);
    const frame = (now) => {
      const p = Math.min(1, (now - start) / duration),
        angle = from + (to - from) * ease(p);
      needle.setAttribute('transform', `rotate(${angle.toFixed(2)} 100 100)`);
      const tickIndex = Math.floor(angle / 12);
      if (tickIndex !== lastTick) {
        lastTick = tickIndex;
        sounds.tick();
      }
      wheelBox.classList.toggle('hot', angle % 360 < c * 360);
      if (p < 1 && dialog.open) requestAnimationFrame(frame);
      else finish();
    };
    const finish = () => {
      needleAngle = to % 360;
      needle.setAttribute('transform', `rotate(${needleAngle.toFixed(2)} 100 100)`);
      spinning = false;
      stage.classList.remove('spinning');
      stats.spins++;
      stats.history.push({ win: result.win, chance: c, tier: tier.id, title: won.title });
      stats.history = stats.history.slice(-30);
      if (result.win) {
        chain++;
        stats.wins++;
        stats.bestChain = Math.max(stats.bestChain, chain);
        stage.classList.add('win');
        spawnBurst(tier.color);
        sounds.win();
        showResult(true, won, lost, tier);
      } else {
        chain = 0;
        burned.add(lost.id);
        stage.classList.add('lose');
        sounds.lose();
        showResult(false, won, lost, tier);
      }
      writeStats();
      renderWheel();
      renderStats();
    };
    requestAnimationFrame(frame);
  }
  spinButton.onclick = spin;

  function showResult(win, won, lost, tier) {
    resultBox.replaceChildren();
    resultBox.style.setProperty('--tier', tier.color);
    const actions = el('div', 'upg-result-actions');
    if (win) {
      resultBox.append(
        el('strong', 'upg-result-title', 'Апгрейд!'),
        el('p', '', `«${short(lost.title)}» → «${short(won.title)}» · ${tier.name}`)
      );
      const listen = el('button', 'upg-primary', '▶ Слушать'),
        like = el('button', 'upg-ghost', favorites.has(won.id) ? '♥ В любимом' : '♡ В любимое'),
        next = el('button', 'upg-ghost', 'Дальше ⇪');
      listen.onclick = () => playList([won], 0);
      like.onclick = () => {
        if (favorites.has(won.id)) return;
        if (won.remote && typeof remoteFavoriteTracks !== 'undefined')
          remoteFavoriteTracks.set(won.id, { ...won, lyrics: '' });
        toggleFavorite(won.id);
        like.textContent = '♥ В любимом';
      };
      next.onclick = () => {
        stake = won;
        if (!stakes.some((t) => t.id === won.id)) stakes.unshift(won);
        target = availableTargets()[0] || null;
        stage.classList.remove('win');
        resultBox.replaceChildren();
        renderAll();
      };
      actions.append(listen, like, next);
    } else {
      resultBox.append(
        el('strong', 'upg-result-title', 'Сгорело'),
        el('p', '', `«${short(lost.title)}» не дотянул до «${short(won.title)}». Цепочка сброшена.`)
      );
      const again = el('button', 'upg-primary', 'Новая ставка');
      again.onclick = () => {
        stake = stakes.find((t) => !burned.has(t.id)) || null;
        if (target && stake && score(target).score <= score(stake).score) target = null;
        stage.classList.remove('lose');
        resultBox.replaceChildren();
        renderAll();
        if (!stake) stakeRefresh.click();
      };
      actions.append(again);
    }
    resultBox.append(actions);
    renderAll();
    slot(stakeSlot, win ? won : lost, win ? 'Теперь у тебя' : 'Ставка', '');
    if (!win) stakeSlot.querySelector('.upg-slot-card')?.classList.add('burned');
  }

  // ——— Открытие ———
  const openButton = document.getElementById('upgrader-open');
  function open() {
    if (!dialog.open) dialog.showModal();
    renderSound();
    stage.classList.remove('win', 'lose');
    resultBox.replaceChildren();
    load().catch((e) => toast('Апгрейдер: ' + e.message));
  }
  openButton?.addEventListener('click', open);
  dialog.addEventListener('close', () => {
    if (spinning) needleAngle %= 360;
  });
  window.trackUpgrader = {
    open,
    state: () => ({ stake, target, stakes, targets, chain, spinning, profile }),
  };
})();
