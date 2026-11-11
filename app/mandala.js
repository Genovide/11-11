/* Adapted from SoundVisualizer by Çağan Turgut (CaYatur), MIT.
 * https://github.com/CaYatur/SoundVisualizer — vendor/soundvisualizer/LICENSE
 * Original Mandala geometry retained; audio and postprocessing adapted for SoundSync. */
(function () {
  let currentCfg;
  function duoColor(v, f) {
    const colors = currentCfg.colors,
      position = Math.max(0, Math.min(1, f)) * (colors.length - 1),
      i = Math.floor(position),
      k = position - i;
    const rgb = (h) => [1, 3, 5].map((n) => parseInt(h.slice(n, n + 2), 16));
    const a = rgb(colors[i]),
      b = rgb(colors[Math.min(i + 1, colors.length - 1)]);
    return `rgb(${a.map((x, j) => Math.round(x + (b[j] - x) * k)).join(',')})`;
  }
  class Mandala {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.glow = new window.SVGlow();
    }
    resize() {}
    draw(audio, cfg, t) {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      currentCfg = cfg;
      const v = cfg.visualizer;
      const count = Math.max(64, Math.min(256, v.barCount | 0));
      const bars = audio.getBars(count, v.minFreq, v.maxFreq, v.spectrum);
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H / 2;
      const R = Math.min(W, H) * 0.44;
      const layers = 4;
      const lw = Math.max(1, v.lineWidth * (Math.min(W, H) / 900) * 1.8);
      const steps = 240;

      ctx.save();
      ctx.lineJoin = 'round';
      for (let L = 0; L < layers; L++) {
        const band =
          L === 0 ? audio.bass : L === 1 ? audio.mid : L === 2 ? audio.treble : audio.level;
        const petals = 3 + L * 2;
        const scale = (0.35 + L * 0.21) * (1 + band * 0.4 * v.sensitivity);
        const rot = t * (0.12 + L * 0.07) * (L % 2 ? -1 : 1);
        ctx.strokeStyle = duoColor(v, L / (layers - 1), t + L);
        ctx.lineWidth = lw * (1 - L * 0.12);
        ctx.globalAlpha = 0.85 - L * 0.12;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const bi = Math.min(count - 1, Math.floor((i / steps) * count));
          const val = Math.min(1, bars[bi] * v.sensitivity);
          const r =
            R * scale * (Math.abs(Math.cos(petals * a)) * 0.55 + 0.45 + val * 0.35 * v.thickness);
          const x = cx + Math.cos(a + rot) * r;
          const y = cy + Math.sin(a + rot) * r;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
      this.glow.apply(this.canvas, v.glow, 0.9);
    }
    dispose() {}
  }

  class MandalaBackground {
    constructor() {
      this.source = document.createElement('canvas');
      this.mode = new Mandala(this.source);
      this.bloom = new window.SVGlow();
      this.bars = new Float32Array(128);
      this.time = 0;
      this.frames = 0;
    }
    draw(ctx, w, h, response, levels, dt, moving, intensity = 1) {
      if (this.source.width !== w || this.source.height !== h) {
        this.source.width = w;
        this.source.height = h;
      }
      if (moving) this.time += Math.min(80, dt) / 1000;
      const cfg = window.mandalaScene;
      const audio = {
        bass: response.bass,
        mid: response.mid,
        treble: response.high,
        level: response.rms,
        getBars: (count) => {
          for (let i = 0; i < count; i++) {
            const p = (i / (count - 1)) * (levels.length - 1),
              j = Math.floor(p);
            this.bars[i] =
              levels[j] * (1 - (p - j)) + levels[Math.min(j + 1, levels.length - 1)] * (p - j);
          }
          return this.bars;
        },
      };
      this.mode.draw(audio, cfg, this.time);
      this.bloom.apply(this.source, Math.min(1, cfg.bloom * 0.5), 0.9);
      // Mirror the same angular sampling used by SoundVisualizer's kaleido shader.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (!document.body.classList.contains('flat-theme')) {
        const color = [1, 3, 5].map((i) => parseInt(cfg.colors[0].slice(i, i + 2), 16));
        const wash = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
        wash.addColorStop(0, `rgba(${color},.12)`);
        wash.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.translate(w / 2, h / 2);
      ctx.globalAlpha = intensity;
      const half = Math.PI / cfg.slices,
        r = Math.hypot(w, h);
      for (let i = 0; i < cfg.slices * 2; i++) {
        ctx.save();
        ctx.rotate((i % 2 ? i + 1 : i) * half - this.time * cfg.spin);
        if (i % 2) ctx.scale(1, -1);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, -0.0005, half + 0.0005);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(this.source, -w * 0.4, -h * 0.4, w * 0.8, h * 0.8);
        ctx.restore();
      }
      ctx.restore();
      this.frames++;
    }
  }
  window.MandalaBackground = MandalaBackground;
})();
