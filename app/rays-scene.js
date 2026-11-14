/* «Лучи»: мягкие световые лучи из светящегося ядра, окрашенные в цвета обложки.
   Рисуется фрагментным шейдером WebGL, поэтому идёт на полной частоте кадров. */
(function (root) {
  const VERTEX = `
attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

  const FRAGMENT = `
precision highp float;
uniform vec2 resolution;
uniform float time, spin, bass, mid, high, level, hit, ring, intensity;
uniform vec3 colorA, colorB, colorC;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float value = 0.0, amp = 0.55;
  for (int i = 0; i < 4; i++) {
    value += amp * noise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    amp *= 0.5;
  }
  return value;
}
// Лучи как шум по окружности: точки берутся на круге, поэтому шва на угле ±π нет.
float beams(float angle, float density, float drift, float seed) {
  vec2 q = vec2(cos(angle), sin(angle)) * density;
  float n = fbm(q + vec2(seed, drift));
  return smoothstep(0.42, 0.95, n);
}

// В GLSL smoothstep с обратным порядком краёв и pow с отрицательным основанием не определены:
// на Windows (Direct3D через ANGLE) они давали NaN, и весь кадр становился чёрным.
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * resolution) / resolution.y;
  float r = length(p), a = atan(p.y, p.x + 1e-6);

  float reach = 0.55 + bass * 0.75 + level * 0.25;
  vec3 color = vec3(0.0);

  // Три слоя лучей: широкие медленные, средние и тонкие быстрые.
  float wide = beams(a + spin * 0.6, 2.2, time * 0.05, 3.1);
  float medium = beams(a - spin * 0.9, 4.0, time * 0.08 + mid * 0.6, 11.7);
  float fine = beams(a + spin * 1.7, 9.0, time * 0.15, 27.3);

  float fallWide = exp(-r / (0.28 * reach));
  float fallMedium = exp(-r / (0.20 * reach + mid * 0.08));
  float fallFine = exp(-r / (0.12 * reach + high * 0.12));

  color += colorA * pow(wide, 1.5) * fallWide * (1.0 + bass * 1.5);
  color += colorB * pow(medium, 2.0) * fallMedium * (0.8 + mid * 1.4);
  color += mix(colorC, vec3(1.0), 0.15) * pow(fine, 3.0) * fallFine * (0.4 + high * 1.6);

  // Мягкий ореол вокруг ядра и само ядро.
  float halo = exp(-r * (9.0 - bass * 3.5));
  float core = 0.004 / (r * r + 0.006 + 0.012 * (1.0 - bass));
  color += colorA * halo * (0.3 + level * 0.8);
  color += mix(colorB, vec3(1.0), 0.45) * core * (0.3 + bass * 0.6 + hit * 0.9);

  // Кольцо, которое расходится от ядра на сильной доле.
  float ringDistance = (r - ring) * 26.0;
  float wave = exp(-ringDistance * ringDistance) * hit * smoothstep(0.0, 0.08, ring);
  color += mix(colorC, vec3(1.0), 0.3) * wave * 0.9;

  // Искры на высоких частотах: редкие точки, которые плывут от центра.
  vec2 sparkCell = vec2(a * 18.0, r * 24.0 - time * (0.6 + high * 2.0));
  float spark = step(0.985, hash(floor(sparkCell))) * (1.0 - smoothstep(0.0, 0.5, length(fract(sparkCell) - 0.5)));
  color += vec3(1.0) * spark * high * 0.9 * exp(-r * 1.6);

  // Тёмная подложка в цвет обложки, мягкое тонирование и виньетка.
  vec3 base = mix(colorC * 0.06, colorB * 0.1, 1.0 - smoothstep(0.0, 0.9, r));
  color = base + color * intensity;
  // Тонирование по яркости сохраняет оттенок: прежнее покомпонентное выбеливало цвета.
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color *= (1.0 - exp(-lum * 1.3)) / max(lum, 1e-4);
  color = mix(color, vec3(1.0), smoothstep(0.85, 2.2, lum) * 0.5);
  color *= 1.0 - smoothstep(0.35, 1.25, length(p * vec2(0.85, 1.0)));
  // Дизеринг убирает полосы на плавных градиентах.
  color += (hash(gl_FragCoord.xy + fract(time)) - 0.5) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}`;

  // Чуть осветляем тёмные обложки, но не выбеливаем насыщенные цвета.
  const mixColor = (rgb, lift) => {
    const c = rgb.map((x) => x / 255),
      peak = Math.max(...c, 0.05);
    return c.map((x) => Math.min(1, (x / peak) * (0.75 + lift) + 0.04));
  };

  class RaysScene {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.time = 0;
      this.spin = 0;
      this.ring = 1;
      this.hit = 0;
      this.colors = null;
      this.frames = 0;
      this.error = null;
    }
    init() {
      const gl = this.canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      if (!gl) throw Error('WebGL недоступен');
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw Error(gl.getShaderInfoLog(shader) || 'Shader compile failed');
        return shader;
      };
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw Error(gl.getProgramInfoLog(program) || 'Shader link failed');
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      this.uniforms = {};
      for (const name of [
        'resolution',
        'time',
        'spin',
        'bass',
        'mid',
        'high',
        'level',
        'hit',
        'ring',
        'intensity',
        'colorA',
        'colorB',
        'colorC',
      ])
        this.uniforms[name] = gl.getUniformLocation(program, name);
      this.gl = gl;
      // Видеокарта может сбросить контекст (сон, смена GPU, сбой драйвера): тогда кадр чёрный.
      if (!this.watchingContext) {
        this.watchingContext = true;
        this.canvas.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          this.gl = null;
          this.lost = true;
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
          this.lost = false;
        });
      }
    }
    // palette — три цвета обложки [r,g,b] 0..255; response — AudioResponse.
    draw(target, width, height, response, palette, dt, moving, intensity) {
      if (this.error || this.lost) return false;
      try {
        if (!this.gl) this.init();
      } catch (e) {
        this.error = e;
        console.error('Rays scene:', e);
        return false;
      }
      const gl = this.gl,
        seconds = Math.min(80, dt || 16) / 1000;
      // Рендерим в пониженном разрешении: лучи мягкие, а шейдеру так легче на 4K и Retina.
      const scale = Math.min(1, 1100 / Math.max(width, height)),
        w = Math.max(2, Math.round(width * scale)),
        h = Math.max(2, Math.round(height * scale));
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      // На паузе сцена не замирает полностью, а медленно дышит.
      const pace = moving ? 1 : 0.15;
      this.time += seconds * pace;
      this.spin += seconds * pace * (0.04 + response.mid * 0.18 + response.hit * 0.25);
      if (moving && response.hit > 0.35 && this.ring > 0.45) {
        this.ring = 0;
        this.hit = response.hit;
      }
      this.ring = Math.min(2, this.ring + seconds * (0.55 + response.bass * 0.6));
      this.hit *= Math.exp(-seconds * 1.6);
      const target3 = [
        mixColor(palette[0], 0.35),
        mixColor(palette[1], 0.3),
        mixColor(palette[2], 0.25),
      ];
      if (!this.colors) this.colors = target3.map((c) => [...c]);
      const ease = 1 - Math.exp(-seconds * 2.5);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) this.colors[i][j] += (target3[i][j] - this.colors[i][j]) * ease;
      const u = this.uniforms,
        level = moving ? 1 : 0.35;
      gl.uniform2f(u.resolution, w, h);
      gl.uniform1f(u.time, this.time);
      gl.uniform1f(u.spin, this.spin);
      gl.uniform1f(u.bass, response.bass * level);
      gl.uniform1f(u.mid, response.mid * level);
      gl.uniform1f(u.high, response.high * level);
      gl.uniform1f(u.level, response.rms * level);
      gl.uniform1f(u.hit, this.hit);
      gl.uniform1f(u.ring, this.ring);
      gl.uniform1f(u.intensity, intensity);
      gl.uniform3fv(u.colorA, this.colors[0]);
      gl.uniform3fv(u.colorB, this.colors[1]);
      gl.uniform3fv(u.colorC, this.colors[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Проверка вывода: в центре всегда светится ядро, поэтому полностью чёрный кадр означает,
      // что драйвер не справился с шейдером. Тогда отдаём место запасной 2D-сцене.
      if (this.frames === 8 || this.frames === 60) {
        const pixel = new Uint8Array(4);
        let lit = 0;
        for (const [x, y] of [
          [0.5, 0.5],
          [0.45, 0.55],
          [0.6, 0.4],
        ]) {
          gl.readPixels(
            Math.floor(w * x),
            Math.floor(h * y),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel
          );
          lit += pixel[0] + pixel[1] + pixel[2];
        }
        if (!lit || gl.isContextLost()) {
          this.error = Error('Видеокарта не отрисовала сцену «Лучи»');
          console.warn('Rays scene:', this.error.message);
          return false;
        }
      }
      target.save();
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.imageSmoothingQuality = 'high';
      target.drawImage(this.canvas, 0, 0, width, height);
      target.restore();
      this.frames++;
      return true;
    }
  }
  root.RaysScene = RaysScene;
})(globalThis);
