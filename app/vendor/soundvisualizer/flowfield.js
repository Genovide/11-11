/*
 * SoundVisualizer — CaYaDev Ses Görselleştirici
 * Copyright (c) 2026 Çağan Turgut (CaYatur) — CaYaDev, https://cayadev.com
 * https://github.com/CaYatur/SoundVisualizer
 * SPDX-License-Identifier: MIT
 */
'use strict';
/* Üretken (generative) görselleştirici modları.

   Sözleşme mevcut modlarla aynı:
     new Mode(canvas) -> draw(audio, cfg, t, dt) -> dispose()

   Bu dosyadaki modların ortak yanı, spektrumu doğrudan çizmek yerine bir
   SİSTEM sürmeleri: bir akış alanı, bir sürü, bir hücre bölünmesi, bir fizik
   ipi. Ses sistemin parametrelerini değiştirir, görüntü sistemin kendi
   davranışından çıkar. Bar grafiğinden farklı olarak aynı parça iki kez
   çalındığında aynı görüntü çıkar ama tek bir karesi bile sesin doğrudan
   fotoğrafı değildir.

   Belirlenimlilik: rastgelelik yalnızca tohumlu üreteçten gelir, hiçbir yerde
   Math.random() yok. Çevrimdışı dışa aktarımın kare kare tekrarlanabilir
   olması buna bağlı. */
(function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ==========================================================================
  // Ortak yardımcılar
  // ==========================================================================
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  // Sahne paleti: arkaplan gradyanının renkleri tüm modlarda ortak
  function colorsOf(cfg) {
    const c = (cfg.background && cfg.background.gradient && cfg.background.gradient.colors) || [];
    return c.length ? c : ['#5b4be0', '#3aa6ff', '#37e0c8', '#7be07b', '#d24bff'];
  }
  function paletteAt(cfg, pos) {
    const cols = colorsOf(cfg);
    const x = clamp(pos, 0, 0.9999) * (cols.length - 1);
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
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /* Renk seçimi: gökkuşağı açıksa spektrum boyunca kayar, kapalıysa
     kullanıcının iki rengi arasında geçilir. Tüm modlar aynı kuralı izler ki
     palet değiştirince sahnenin tamamı birlikte değişsin. */
  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (h % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp >= 0 && hp < 1) { r1 = c; g1 = x; }
    else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; }
    else if (hp >= 2 && hp < 3) { g1 = c; b1 = x; }
    else if (hp >= 3 && hp < 4) { g1 = x; b1 = c; }
    else if (hp >= 4 && hp < 5) { r1 = x; b1 = c; }
    else if (hp >= 5 && hp < 6) { r1 = c; b1 = x; }
    const m = l - c / 2;
    return [((r1 + m) * 255) | 0, ((g1 + m) * 255) | 0, ((b1 + m) * 255) | 0];
  }

  function tone(v, cfg, f, t) {
    const colorMode = v.colorMode || (v.rainbow ? 'rainbow' : 'custom');
    if (colorMode === 'rainbow') {
      const hue = ((f * 300 + t * 20) % 360 + 360) % 360;
      return hslToRgb(hue, 0.88, 0.62);
    }
    if (colorMode === 'theme') return paletteAt(cfg, (f + t * 0.03) % 1);
    const a = window.SV.hexToRgb01(v.color);
    const b = window.SV.hexToRgb01(v.color2 || v.color);
    const k = clamp(f, 0, 1);
    return [
      ((a[0] + (b[0] - a[0]) * k) * 255) | 0,
      ((a[1] + (b[1] - a[1]) * k) * 255) | 0,
      ((a[2] + (b[2] - a[2]) * k) * 255) | 0,
    ];
  }

  // Değer gürültüsü (2B) — akış alanı ve doku için. Tohumlu, bu yüzden
  // dışa aktarımda tekrarlanabilir.
  function makeNoise(seed) {
    const r = rng(seed);
    const P = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (r() * (i + 1)) | 0;
      const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp;
    }
    for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
    const fade = (x) => x * x * (3 - 2 * x);
    const grad = (h, x, y) => {
      const u = (h & 1) ? x : -x;
      const v = (h & 2) ? y : -y;
      return u + v;
    };
    return function (x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const vv = fade(yf);
      const aa = P[P[X] + Y];
      const ab = P[P[X] + Y + 1];
      const ba = P[P[X + 1] + Y];
      const bb = P[P[X + 1] + Y + 1];
      const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
      const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
      return (x1 + vv * (x2 - x1)) * 0.5;
    };
  }

  /* İz tamponunu SAYDAMA doğru soldurur.

     Eskiden iz siyahla boyanarak soluyordu (source-over). Birkaç saniyede
     tampon tamamen opaklaşıyor ve görselleştirici tuvali arkaplanın
     üstüne siyah bir perde gibi iniyordu: Akış Alanı, Osiloskop,
     Gonyometre ve Çekici Alanı seçilince arkaplan görünmüyordu (tuvalin
     alfa ortalaması 249-253/255). destination-out yalnız alfayı eritir.

     8 bit alfada küçük bir solma çarpımla sıfıra inmiyor: 0,035'lik solma
     14/255'te takılıyor ve iz hiç tam silinmiyor. On altı karede bir
     yapılan daha güçlü bir geçiş kalıntıyı 1/255'e indiriyor; tabanın
     solması bunu telafi edecek kadar azaltılıyor ki iz uzunluğu değişmesin
     (ölçüldü: 30. karede eski yöntemle aynı parlaklık, ±%5). */
  const CLEAN_EVERY = 16;
  const CLEAN_ALPHA = 0.25;
  function fadeTrail(tc, W, H, amount, self) {
    // 16 karede bir 0,25'lik geçişin payı tabandan düşülüyor
    const base = Math.max(0.004, amount - 0.009);
    tc.globalCompositeOperation = 'destination-out';
    tc.fillStyle = 'rgba(0,0,0,' + base.toFixed(3) + ')';
    tc.fillRect(0, 0, W, H);
    self._fadeN = ((self._fadeN || 0) + 1) % CLEAN_EVERY;
    if (self._fadeN === 0) {
      tc.fillStyle = 'rgba(0,0,0,' + CLEAN_ALPHA + ')';
      tc.fillRect(0, 0, W, H);
    }
  }

  // Ortak vuruş algılayıcı sarmalayıcısı (bkz. src/shared/onset.js)
  function onset(refractory) {
    return new window.SVOnset.Onset({ refractory: refractory == null ? 0.11 : refractory });
  }

  // ==========================================================================
  // AKIŞ ALANI — parçacıklar gürültü alanında sürüklenir
  // ==========================================================================
  class FlowField {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.noise = makeNoise(0x1f35);
      this.rand = rng(0x9e21);
      this.N = 1400;
      this.px = new Float32Array(this.N);
      this.py = new Float32Array(this.N);
      this.age = new Float32Array(this.N);
      this.hue = new Float32Array(this.N);
      this.init = false;
      this.trail = null;
      this.tctx = null;
    }
    resize() { this.init = false; this.trail = null; }
    _seed(W, H) {
      for (let i = 0; i < this.N; i++) {
        this.px[i] = this.rand() * W;
        this.py[i] = this.rand() * H;
        this.age[i] = this.rand();
        this.hue[i] = this.rand();
      }
      this.init = true;
    }
    draw(audio, cfg, t, dt) {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      const v = cfg.visualizer;
      const step = Math.min(0.05, dt || 0.016);
      if (!this.init) this._seed(W, H);

      // İz tamponu: parçacıkların geçtiği yol solarak kalır
      if (!this.trail || this.trail.width !== W || this.trail.height !== H) {
        this.trail = document.createElement('canvas');
        this.trail.width = W;
        this.trail.height = H;
        this.tctx = this.trail.getContext('2d');
      }
      const tc = this.tctx;
      fadeTrail(tc, W, H, 0.035 + (1 - v.thickness) * 0.06, this);
      tc.globalCompositeOperation = 'lighter';

      const sens = v.sensitivity || 1;
      const bass = clamp(audio.bass * sens, 0, 1.4);
      const treb = clamp(audio.treble * sens, 0, 1.4);
      // Bas alanı genişletir (büyük kıvrımlar), tiz türbülans ekler
      const scale = 0.0012 + 0.0022 * (1 - bass * 0.6);
      const turb = 0.4 + treb * 2.4;
      const speed = (40 + bass * 220) * Math.min(W, H) / 1080;
      const minDim = Math.min(W, H);

      for (let i = 0; i < this.N; i++) {
        const n = this.noise(this.px[i] * scale, this.py[i] * scale + t * 0.06);
        const n2 = this.noise(this.py[i] * scale * turb - t * 0.03, this.px[i] * scale * turb);
        const ang = (n + n2 * 0.5) * TAU * 2;
        const dx = Math.cos(ang) * speed * step;
        const dy = Math.sin(ang) * speed * step;
        const x0 = this.px[i];
        const y0 = this.py[i];
        this.px[i] += dx;
        this.py[i] += dy;
        this.age[i] -= step * 0.28;

        if (this.age[i] <= 0 || this.px[i] < -20 || this.px[i] > W + 20 || this.py[i] < -20 || this.py[i] > H + 20) {
          this.px[i] = this.rand() * W;
          this.py[i] = this.rand() * H;
          this.age[i] = 0.6 + this.rand() * 0.6;
          this.hue[i] = this.rand();
          continue;
        }
        const c = tone(v, cfg, this.hue[i], t);
        tc.strokeStyle = rgba(c, clamp(this.age[i], 0, 1) * (0.25 + bass * 0.5));
        tc.lineWidth = Math.max(0.6, v.lineWidth * 0.35 * (minDim / 1080));
        tc.beginPath();
        tc.moveTo(x0, y0);
        tc.lineTo(this.px[i], this.py[i]);
        tc.stroke();
      }

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(this.trail, 0, 0);
    }
    dispose() { this.trail = null; this.tctx = null; }
  }

window.SVModes=window.SVModes||{};window.SVModes.flowfield=FlowField;})();
