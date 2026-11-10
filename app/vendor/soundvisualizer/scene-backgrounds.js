/* SoundVisualizer, Copyright (c) 2026 Çağan Turgut (CaYatur), MIT.
 * https://github.com/CaYatur/SoundVisualizer — see LICENSE. */
(function(){const TAU=Math.PI*2;
  function colorsOf(cfg) {
    if (window.SV && typeof window.SV.resolveBackgroundColors === 'function') {
      return window.SV.resolveBackgroundColors(cfg);
    }
    const c = (cfg.background && cfg.background.gradient && cfg.background.gradient.colors) || [];
    return c.length ? c : ['#5b4be0', '#3aa6ff', '#37e0c8', '#7be07b', '#d24bff'];
  }
  function rgbOf(cfg, i) {
    const cols = colorsOf(cfg);
    const c = window.SV.hexToRgb01(cols[((i % cols.length) + cols.length) % cols.length]);
    return [(c[0] * 255) | 0, (c[1] * 255) | 0, (c[2] * 255) | 0];
  }
  function rgba(c, a) {
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  }
  // Palet üzerinde 0..1 konumundan renk (yumuşak geçiş)
  function lerpColor(cfg, pos) {
    const cols = colorsOf(cfg);
    const x = Math.max(0, Math.min(0.9999, pos)) * (cols.length - 1);
    const i = Math.floor(x);
    const f = x - i;
    const a = window.SV.hexToRgb01(cols[i]);
    const b = window.SV.hexToRgb01(cols[Math.min(cols.length - 1, i + 1)]);
    return [
      ((a[0] + (b[0] - a[0]) * f) * 255) | 0,
      ((a[1] + (b[1] - a[1]) * f) * 255) | 0,
      ((a[2] + (b[2] - a[2]) * f) * 255) | 0,
    ];
  }
  function gset(cfg) {
    const g = (cfg.background && cfg.background.gradient) || {};
    return {
      speed: g.speed == null ? 0.45 : g.speed,
      react: g.audioReactivity == null ? 0.85 : g.audioReactivity,
      bright: g.brightness == null ? 1 : g.brightness,
      vignette: g.vignette == null ? 0.25 : g.vignette,
    };
  }
  // Moda özel ayar bloğu (eksik alanlar varsayılanla tamamlanır)
  function mset(cfg, mode, fallback) {
    const m = (cfg.background && cfg.background[mode]) || {};
    const out = {};
    for (const k in fallback) out[k] = m[k] == null ? fallback[k] : m[k];
    return out;
  }
  // Deterministik sözde-rastgele (aynı seed -> aynı sahne; dışa aktarım için şart)
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  function vignette(ctx, W, H, amount) {
    if (amount <= 0.001) return;
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${Math.min(0.92, amount)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const basePalette = (cfg) => colorsOf(cfg).slice();

  class RetroGrid {
    constructor() { this.scroll = 0; }
    draw(ctx, audio, cfg, t, W, H, dt) {
      const g = gset(cfg);
      const m = mset(cfg, 'grid', {
        horizon: 0.52, rows: 18, cols: 26, lineWidth: 1,
        horizonGlow: 0.55, skyIntensity: 0.95, spectrumBars: 1, bassPush: 1.6,
      });
      const horizon = H * Math.max(0.15, Math.min(0.85, m.horizon));
      const step = Math.min(0.05, dt || 0.016);
      this.scroll += step * (0.25 + g.speed * 0.85) * (1 + audio.bass * g.react * m.bassPush);
      this.scroll %= 1;

      const sky = ctx.createLinearGradient(0, 0, 0, horizon);
      sky.addColorStop(0, rgba(lerpColor(cfg, 0.95), m.skyIntensity * g.bright));
      sky.addColorStop(1, rgba(lerpColor(cfg, 0.35), m.skyIntensity * g.bright));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizon);

      ctx.fillStyle = '#07040f';
      ctx.fillRect(0, horizon, W, H - horizon);

      const glowR = Math.max(1, Math.min(W, H) * (0.14 + audio.bass * g.react * 0.16));
      const hg = ctx.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, glowR * 3);
      const hc = lerpColor(cfg, 0.7);
      hg.addColorStop(0, rgba(hc, m.horizonGlow * g.bright));
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, horizon - glowR * 3, W, glowR * 6);

      const lineCol = lerpColor(cfg, 0.55);
      const lw = Math.max(0.5, Math.min(W, H) * 0.0016 * m.lineWidth);
      ctx.strokeStyle = rgba(lineCol, 0.75 * g.bright);
      ctx.lineWidth = lw;

      const ROWS = Math.max(4, Math.min(60, m.rows | 0));
      ctx.beginPath();
      for (let i = 0; i < ROWS; i++) {
        const k = (i + this.scroll) / ROWS;
        const y = horizon + (H - horizon) * k * k;
        if (y > H + 2) continue;
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
      }
      ctx.stroke();

      const COLS = Math.max(4, Math.min(80, m.cols | 0));
      const bars = audio.getBars(COLS, 30, 16000);
      for (let i = 0; i <= COLS; i++) {
        const u = i / COLS - 0.5;
        const bx = W / 2 + u * W * 3.4;
        const amp = (bars && bars[Math.min(COLS - 1, i)] ? bars[Math.min(COLS - 1, i)] : 0) * m.spectrumBars;
        ctx.strokeStyle = rgba(lineCol, Math.min(1, (0.35 + amp * 0.6) * g.bright));
        ctx.beginPath();
        ctx.moveTo(W / 2, horizon);
        ctx.lineTo(bx, H);
        ctx.stroke();
      }
      vignette(ctx, W, H, g.vignette);
    }
    palette(cfg) { return basePalette(cfg); }
  }

  class Embers {
    constructor() {
      this.rand = rng(0x77e2);
      this.N = 260;
      this.x = new Float32Array(this.N);
      this.y = new Float32Array(this.N);
      this.v = new Float32Array(this.N);
      this.s = new Float32Array(this.N);
      this.h = new Float32Array(this.N);
      this.init = false;
    }
    _seed() {
      for (let i = 0; i < this.N; i++) {
        this.x[i] = this.rand();
        this.y[i] = this.rand();
        this.v[i] = 0.3 + this.rand() * 0.8;
        this.s[i] = 0.3 + this.rand() * 0.9;
        this.h[i] = this.rand();
      }
      this.init = true;
    }
    draw(ctx, audio, cfg, t, W, H, dt) {
      const g = gset(cfg);
      const m = mset(cfg, 'embers', { drift: 1, size: 1, glowAmt: 1 });
      if (!this.init) this._seed();
      const step = Math.min(0.05, dt || 0.016);
      const bg = lerpColor(cfg, 0.02);
      ctx.fillStyle = rgba([bg[0] * 0.2 | 0, bg[1] * 0.2 | 0, bg[2] * 0.2 | 0], 1);
      ctx.fillRect(0, 0, W, H);

      const lvl = audio.level * g.react;
      const minDim = Math.min(W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.N; i++) {
        // Yukarı süzülme + yanal salınım
        this.y[i] -= step * this.v[i] * (0.04 + lvl * 0.1) * g.speed * m.drift;
        this.x[i] += Math.sin(t * 0.6 + i) * step * 0.006 * m.drift;
        if (this.y[i] < -0.05) {
          this.y[i] = 1.05;
          this.x[i] = this.rand();
          this.h[i] = this.rand();
        }
        const c = lerpColor(cfg, this.h[i]);
        const r = minDim * 0.004 * this.s[i] * m.size * (0.7 + lvl * 0.8);
        const x = this.x[i] * W;
        const y = this.y[i] * H;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 4 * m.glowAmt);
        grad.addColorStop(0, rgba(c, 0.85 * g.bright));
        grad.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r * 4 * m.glowAmt, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      vignette(ctx, W, H, g.vignette);
    }
    palette(cfg) { return basePalette(cfg); }
  }

window.ImportedBackgrounds={grid:RetroGrid,embers:Embers};})();