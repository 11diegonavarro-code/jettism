// Texturas hechas por código (sin descargar nada): arena, ondas de arena, mármol, roca en estratos y madera.
// Todas se repiten sin costuras.
import * as THREE from 'three';
import { rng } from './math.js';

// Ruido de valor que se repite cada px celdas en x y cada py en y
function valueNoise(px, py, R) {
  const vals = new Float32Array(px * py).map(() => R());
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const i0 = ((xi % px) + px) % px, i1 = (i0 + 1) % px, j0 = ((yi % py) + py) % py, j1 = (j0 + 1) % py;
    const a = vals[j0 * px + i0], b = vals[j0 * px + i1], c = vals[j1 * px + i0], d = vals[j1 * px + i1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// Ruido fractal tileable (periodos distintos en x e y para vetas alargadas), normalizado a 0..1
function fbm(size, px, py, octaves, seed) {
  const R = rng(seed), out = new Float32Array(size * size), oct = [];
  for (let o = 0; o < octaves; o++) {
    const fx = px * 2 ** o, fy = py * 2 ** o;
    oct.push({ fx, fy, n: valueNoise(fx, fy, R), a: 0.5 ** o });
  }
  let max = 0;
  for (const o of oct) max += o.a;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const o of oct) v += o.n((x / size) * o.fx, (y / size) * o.fy) * o.a;
    out[y * size + x] = v / max;
  }
  return out;
}

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function canvasTex(size, fill, { color = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, [r, gg, b] = fill(x, y);
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Mapa de normales a partir de una altura h(x, y)
function normalTex(size, height, strength) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = height(x, y);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  return canvasTex(size, (x, y) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (-dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  }, { color: false });
}

export function noiseTexture({ size = 512, kind = 'sand', seed = 3, colors = null }) {
  switch (kind) {
    case 'sand': {
      const n = fbm(size, 4, 4, 5, seed), A = hex('#c79a68'), B = hex('#f0c994');
      return canvasTex(size, (x, y) => { const v = n[y * size + x]; return mix(A, B, sstep(0.25, 0.75, v)).map(c => c * (0.96 + Math.random() * 0.06)); });
    }
    case 'ripples': {
      const n = fbm(size, 4, 4, 3, seed + 1);
      return normalTex(size, (x, y) => Math.sin(2 * Math.PI * (x / size) * 6 + n[y * size + x] * 9) * 0.6 + n[y * size + x], 2.2);
    }
    case 'marble': {
      const n = fbm(size, 3, 3, 5, seed + 2), base = hex('#f1e9de'), warm = hex('#e6d3bd'), vein = hex('#9c8a78');
      return canvasTex(size, (x, y) => {
        const v = n[y * size + x];
        const s = Math.abs(Math.sin(2 * Math.PI * ((x / size) * 2 + (y / size) * 1) + v * 9));
        const veinAmt = 1 - sstep(0.0, 0.09, s), soft = 1 - sstep(0.0, 0.35, s);
        return mix(mix(base, warm, sstep(0.3, 0.8, v)), vein, veinAmt * 0.8 + soft * 0.12);
      });
    }
    case 'rock': {
      const n = fbm(size, 2, 6, 5, seed + 3), m = fbm(size, 8, 8, 3, seed + 4);
      const pal = ['#8c4630', '#c06a3e', '#dda067', '#ecc999', '#b0603a', '#d18a55', '#7a3a2a', '#e2b07a'].map(hex);
      return canvasTex(size, (x, y) => {
        const v = n[y * size + x], band = (y / size) * pal.length * 2 + v * 3.2;
        const i = Math.floor(band) % pal.length, f = sstep(0.75, 1, band % 1);
        const c = mix(pal[i], pal[(i + 1) % pal.length], f);
        return c.map(k => k * (0.82 + m[y * size + x] * 0.3));
      });
    }
    case 'rockNormal': {
      const n = fbm(size, 2, 6, 5, seed + 3), m = fbm(size, 8, 8, 4, seed + 4);
      return normalTex(size, (x, y) => n[y * size + x] * 1.4 + m[y * size + x] * 0.8 + Math.sin((y / size) * Math.PI * 2 * 16 + n[y * size + x] * 4) * 0.25, 3.5);
    }
    case 'concrete': {
      // hormigón visto: paneles del encofrado, pocos latiguillos, manchas grandes y chorretones de agua
      const n = fbm(size, 3, 3, 5, seed + 6), m = fbm(size, 12, 2, 4, seed + 7), st = fbm(size, 20, 1, 3, seed + 8), big = fbm(size, 2, 2, 3, seed + 10);
      const A = hex('#86837c'), B = hex('#c8c4ba'), boards = 6, R = rng(seed + 9), tone = Array.from({ length: boards * 2 }, () => 0.93 + R() * 0.12);
      return canvasTex(size, (x, y) => {
        const v = n[y * size + x], by = (y / size) * boards, bi = Math.floor(by), bf = by - bi, bx = Math.floor((x / size) * 2);
        let c = mix(A, B, sstep(0.15, 0.9, v * 0.7 + big[y * size + x] * 0.3)).map(k => k * tone[bi * 2 + bx]);
        const seam = 1 - sstep(0.0, 0.018, Math.min(bf, 1 - bf)), vseam = 1 - sstep(0.0, 0.006, Math.abs(((x / size) * 2) % 1 - 0.5) - 0.494);
        c = c.map(k => k * (1 - seam * 0.2 - vseam * 0.12));
        const hx = ((x / size) * 2) % 1, hole = 1 - sstep(0.006, 0.014, Math.hypot((hx - 0.25) / 2, (bf - 0.5) / boards));
        c = c.map(k => k * (1 - hole * 0.45));
        const streak = sstep(0.5, 0.85, st[y * size + x]) * (0.4 + 0.6 * m[y * size + x]);
        return c.map(k => k * (1 - streak * 0.3) * (0.97 + Math.random() * 0.05));
      });
    }
    case 'paint': {
      // pintura: pinceladas cortas en varias direcciones, con tres tonos (oscuro, medio y claro)
      const n = fbm(size, 4, 4, 4, seed + 11), m = fbm(size, 3, 9, 3, seed + 12), q = fbm(size, 9, 3, 3, seed + 13), w = fbm(size, 6, 6, 3, seed + 14);
      const [A, B, C] = (colors || ['#1f8a82', '#2db3a2', '#5fd8c0']).map(hex);
      return canvasTex(size, (x, y) => {
        const i = y * size + x, v = n[i];
        // dos familias de pinceladas (horizontales y verticales) que se alternan por manchas
        const sh = 0.5 + 0.5 * Math.sin((y / size) * Math.PI * 2 * 22 + m[i] * 9), sv = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * 22 + q[i] * 9);
        const stroke = w[i] > 0.5 ? sh : sv;
        let c = mix(A, B, sstep(0.18, 0.82, v * 0.78 + stroke * 0.22));
        c = mix(c, C, sstep(0.8, 0.97, stroke * 0.4 + v * 0.6) * 0.55);
        return c.map(k => k * (0.95 + Math.random() * 0.07));
      });
    }
    case 'wood': {
      const n = fbm(size, 2, 8, 4, seed + 5), A = hex('#4a2a18'), B = hex('#7d4b2b');
      return canvasTex(size, (x, y) => { const v = n[y * size + x]; const r = 0.5 + 0.5 * Math.sin(2 * Math.PI * ((y / size) * 14 + v * 3)); return mix(A, B, r * 0.7 + v * 0.3); });
    }
  }
  throw new Error('textura desconocida ' + kind);
}

// Papel grueso con pliegues y algún trazo de tinta (para los puentes de papel)
export function paperTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d'), R = rng(21);
  g.fillStyle = '#f4ecdc'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(120,90,60,${R() * 0.05})`; g.fillRect(R() * 512, R() * 512, 2, 2); }
  // pliegues: una línea clara y otra oscura juntas
  for (const x of [128, 256, 384]) {
    g.fillStyle = 'rgba(0,0,0,0.13)'; g.fillRect(x - 2, 0, 2, 512);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x, 0, 2, 512);
  }
  g.strokeStyle = 'rgba(40,40,90,0.35)'; g.lineWidth = 2;
  for (let k = 0; k < 9; k++) {
    const y = 40 + k * 52;
    g.beginPath(); g.moveTo(24, y);
    for (let x = 24; x < 490; x += 18) g.lineTo(x, y + Math.sin(x * 0.07 + k) * 3 + (R() - 0.5) * 3);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function checkerTexture(n = 8) {
  const size = 256;
  return canvasTex(size, (x, y) => ((Math.floor((x / size) * n) + Math.floor((y / size) * n)) % 2 ? [20, 20, 24] : [245, 242, 235]));
}

// Textura suave y redonda para partículas
export function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------- Op-art (collage psicodélico) ----------
// kind: 'rainbow' bandas de colores · 'zebra' rayas onduladas · 'rings' anillos concéntricos · 'spiral' espiral
// colors: lista de colores que se repiten; bands: cuántas bandas por textura
export function opTexture({ kind = 'rainbow', colors = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'], bands = 12, size = 512, seed = 1 }) {
  const C = colors.map(hex), n = fbm(size, 3, 3, 3, seed);
  return canvasTex(size, (x, y) => {
    const u = x / size, v = y / size, w = n[y * size + x];
    let t;
    if (kind === 'rainbow') t = v * bands + Math.sin(u * Math.PI * 4) * 0.35 + w * 0.3;
    else if (kind === 'zebra') t = v * bands + Math.sin(u * Math.PI * 6 + Math.sin(v * Math.PI * 4) * 1.5) * 1.2 + w * 1.2;
    else if (kind === 'rings') t = Math.hypot(u - 0.5, v - 0.5) * bands * 2 + w * 0.25;
    else t = Math.hypot(u - 0.5, v - 0.5) * bands * 2 + (Math.atan2(v - 0.5, u - 0.5) / (Math.PI * 2)) * 2 + w * 0.2;
    const i = Math.floor(t), f = t - i, edge = Math.min(f, 1 - f) < 0.05 ? 0.85 : 1;
    return C[((i % C.length) + C.length) % C.length].map(k => k * edge);
  });
}

// Pliego de dibujo técnico: papel con cuadrícula fina y gruesa, círculos y arcos a tinta (se repite sin costuras)
export function diagramTexture({ size = 1024, paper = '#efe3c6', ink = 'rgba(60,40,25,', seed = 31 } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), R = rng(seed);
  g.fillStyle = paper; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 6; i++) { g.fillStyle = `rgba(110,80,40,${R() * 0.06})`; g.fillRect(R() * size, R() * size, 1 + R() * 3, 1 + R() * 3); }
  const line = (a, w) => { g.strokeStyle = ink + a + ')'; g.lineWidth = w; };
  const step = size / 32;
  for (let k = 0; k <= 32; k++) { line(k % 4 ? 0.13 : 0.32, k % 4 ? 1 : 2); g.beginPath(); g.moveTo(k * step, 0); g.lineTo(k * step, size); g.moveTo(0, k * step); g.lineTo(size, k * step); g.stroke(); }
  // círculos y arcos de compás (repetidos en los bordes para que no se note la costura)
  for (let k = 0; k < 7; k++) {
    const x = R() * size, y = R() * size, r = size * (0.06 + R() * 0.3), a0 = R() * 6.28, a1 = a0 + 1 + R() * 5;
    line(0.45, 2);
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) { g.beginPath(); g.arc(x + dx, y + dy, r, a0, a1); g.stroke(); }
    g.fillStyle = ink + '0.6)'; g.beginPath(); g.arc(x, y, 3, 0, 6.28); g.fill();
  }
  // rectángulos áureos anidados
  { let w = size * 0.5, h = w / 1.618, x = size * 0.25, y = size * 0.3; line(0.5, 2.5);
    for (let k = 0; k < 6; k++) { g.strokeRect(x, y, w, h); const a = Math.min(w, h); if (k % 2) { y += a; h -= a; } else { x += a; w -= a; } } }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
