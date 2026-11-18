// Nivel: Espiral áurea. Un dibujo de geometría hecho mundo, al atardecer: el suelo es un pliego de papel con la
// cuadrícula, los cuadrados de Fibonacci levantados como muros de papel y sus arcos dorados; en el centro, una doble
// hélice dorada alrededor de una columna. El recorrido entra por la espiral áurea bajando, sube por dentro de la
// hélice dando vueltas y vuelve por arriba en una espiral que se abre, atravesando anillos de latón.
// Obstáculos: compases gigantes que barren el paso como péndulos, poliedros que orbitan y radios que giran dentro
// de la hélice (se pasan por encima o por debajo).
// JS puro (también se simula en Node); lo que se dibuja está en espiral-view.js.
import { kit, V3 } from './kit.js';
import { AI_NARROW } from '../ai.js';

export const PHI = (1 + Math.sqrt(5)) / 2;
export const CENTER = { x: 0, z: -620 };
const pt = (deg, r, y) => { const a = (deg * Math.PI) / 180; return [Math.round(CENTER.x + Math.cos(a) * r), Math.round(y), Math.round(CENTER.z + Math.sin(a) * r), 'm']; };
// espiral áurea hacia dentro (el radio se divide por φ cada cuarto de vuelta), bajando
const IN = Array.from({ length: 8 }, (_, k) => pt(45 * k, 520 * PHI ** (-k / 2) + 18, 220 - 17 * k));
// hélice: una vuelta y algo subiendo alrededor de la columna
export const HELIX = { r: 112, y0: 100, rise: 32 }; // sube 32 m cada 60°
const UPW = Array.from({ length: 7 }, (_, j) => pt(360 + 60 * j, HELIX.r, HELIX.y0 + HELIX.rise * j));
// espiral que se abre por arriba, de vuelta a la salida
const OUT = [[0, 135, 312], [1, 175, 316], [2, 225, 314], [3, 285, 305], [4, 365, 288], [5, 440, 265], [6, 520, 242]].map(([m, r, y]) => pt(780 + 45 * m, r, y));
const GATES = [...IN, ...UPW, ...OUT];
export const COURSE = { name: 'Espiral áurea', gates: GATES, boosts: [[1, 0.5], [9, 0.5], [16, 0.5]] };
export const SECTIONS = [[2, 'La espiral'], [8, 'La hélice'], [15, 'Los anillos'], [19, 'La vuelta']];
const MIN = { wall: 20, arc: 20, solid: 16, strand: 18, rung: 18, core: 30, obelisk: 22, far: 60, frame: 18 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L, S } = K, D = T.decor;
  const C = new V3(CENTER.x, 0, CENTER.z);

  // ---------- el suelo dibujado: cuadrados de Fibonacci levantados como muros de papel, y sus arcos ----------
  // rectángulo áureo; en cada paso se corta un cuadrado por un lado (izquierda, arriba, derecha, abajo) y se sigue
  {
    let x0 = 0, z0 = 0, x1 = 1000 * PHI, z1 = 1000;
    const squares = [];
    for (let n = 0; n < 10; n++) {
      const dir = n % 4, a = Math.min(x1 - x0, z1 - z0);
      let sq;
      if (dir === 0) { sq = [x0, z0, x0 + a, z1]; x0 += a; }
      else if (dir === 1) { sq = [x0, z0, x1, z0 + a]; z0 += a; }
      else if (dir === 2) { sq = [x1 - a, z0, x1, z1]; x1 -= a; }
      else { sq = [x0, z1 - a, x1, z1]; z1 -= a; }
      squares.push({ sq, a, dir });
    }
    // el punto al que converge la espiral va al centro del mapa
    const ox = C.x - (x0 + x1) / 2, oz = C.z - (z0 + z1) / 2;
    squares.forEach(({ sq, a, dir }, n) => {
      const [ax, az, bx, bz] = [sq[0] + ox, sq[1] + oz, sq[2] + ox, sq[3] + oz], h = Math.max(8, 70 - n * 7), th = Math.max(1.5, 5 - n * 0.4);
      for (const [cx, cz, hx, hz] of [[(ax + bx) / 2, az, (bx - ax) / 2, th], [(ax + bx) / 2, bz, (bx - ax) / 2, th], [ax, (az + bz) / 2, th, (bz - az) / 2], [bx, (az + bz) / 2, th, (bz - az) / 2]])
        K.box(new V3(cx, h / 2, cz), new V3(hx, h / 2, hz), 0, 'wall', { n });
      // arco de un cuarto de círculo dentro del cuadrado (la espiral de Fibonacci), en tramos dorados
      const piv = [[bx, bz], [ax, bz], [ax, az], [bx, az]][dir], a0 = Math.PI + (dir * Math.PI) / 2;
      for (let k = 0; k < 12; k++) {
        const t0 = a0 + (k / 12) * (Math.PI / 2), t1 = a0 + ((k + 1) / 12) * (Math.PI / 2);
        const p0 = new V3(piv[0] + Math.cos(t0) * a, h + 4, piv[1] + Math.sin(t0) * a), p1 = new V3(piv[0] + Math.cos(t1) * a, h + 4, piv[1] + Math.sin(t1) * a);
        K.capsule(p0, p1, Math.max(1.5, 6 - n * 0.5), 'arc');
      }
      D.push({ kind: 'square', ax, az, bx, bz, n });
    });
  }

  // ---------- la columna y la doble hélice dorada ----------
  const yAt = deg => HELIX.y0 + (HELIX.rise * (deg - 360)) / 60, RS = 168; // RS: radio de las hebras // altura del recorrido en la hélice según el ángulo
  K.capsule(new V3(C.x, -10, C.z), new V3(C.x, 330, C.z), 26, 'core');
  // las dos hebras van media vuelta desfasadas: 42 m por encima y por debajo de la altura del recorrido
  for (const [off, name] of [[42, 'A'], [-42, 'B']]) {
    for (let deg = -140; deg < 1100; deg += 9) {
      const y0 = yAt(deg) + off, y1 = yAt(deg + 9) + off;
      if (y0 < 20 || y1 > 245) continue;
      const a0 = (deg * Math.PI) / 180, a1 = ((deg + 9) * Math.PI) / 180, r = RS;
      K.capsule(new V3(C.x + Math.cos(a0) * r, y0, C.z + Math.sin(a0) * r), new V3(C.x + Math.cos(a1) * r, y1, C.z + Math.sin(a1) * r), 4.5, 'strand', { name });
    }
  }
  // peldaños verticales entre las dos hebras
  for (let deg = -120; deg < 1080; deg += 30) {
    const a = (deg * Math.PI) / 180, lo = Math.max(20, yAt(deg) - 42), hi = Math.min(245, yAt(deg) + 42);
    if (hi - lo < 20) continue;
    K.capsule(new V3(C.x + Math.cos(a) * RS, lo, C.z + Math.sin(a) * RS), new V3(C.x + Math.cos(a) * RS, hi, C.z + Math.sin(a) * RS), 2, 'rung');
  }

  // ---------- poliedros flotando y obeliscos dibujados ----------
  for (let k = 0; k < 70; k++) {
    const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(30, 220), r = rr(6, 28);
    K.sphere(new V3(F.P.x + F.Rh.x * sd * l, F.P.y + rr(-60, 110), F.P.z + F.Rh.z * sd * l), r, 'solid', { shape: Math.floor(R() * 4), spin: rr(-0.4, 0.4) });
  }
  for (let k = 0; k < 26; k++) {
    const a = R() * Math.PI * 2, d = rr(250, 900), x = C.x + Math.cos(a) * d, z = C.z + Math.sin(a) * d, H = rr(90, 260), w = rr(6, 14);
    K.box(new V3(x, H / 2, z), new V3(w, H / 2, w), rr(0, 1.5), 'obelisk', { H });
  }
  // marcos de cuadrados dorados de pie, girados (como las figuras del dibujo)
  for (let k = 0; k < 18; k++) {
    const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(60, 200), c = new V3(F.P.x + F.Rh.x * sd * l, F.P.y + rr(-30, 60), F.P.z + F.Rh.z * sd * l), half = rr(25, 60), yaw = rr(0, 3.14);
    const ux = Math.cos(yaw), uz = -Math.sin(yaw);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => new V3(c.x + ux * a * half, c.y + b * half, c.z + uz * a * half));
    for (let j = 0; j < 4; j++) K.capsule(corners[j], corners[(j + 1) % 4], 2.2, 'frame', { id: k });
  }
  // a lo lejos: arcos y anillos enormes
  for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2 + rr(-0.05, 0.05), d = rr(1500, 2400); K.sphere(new V3(C.x + Math.cos(a) * d, rr(60, 380), C.z + Math.sin(a) * d), rr(60, 160), 'far', { shape: Math.floor(R() * 4) }); }
  const kept = K.commit(MIN).kept;
  // un marco solo se dibuja si quedaron sus cuatro lados
  const frames = {};
  for (const p of kept) if (p.kind === 'frame') (frames[p.extra.id] ||= []).push(p);
  for (const p of kept) {
    if (p.kind === 'frame') { if (frames[p.extra.id].length === 4) D.push({ kind: 'frame', a: p.c.a, b: p.c.b, r: p.c.r }); continue; }
    if (p.c.type === 'capsule') D.push({ kind: p.kind, a: p.c.a, b: p.c.b, r: p.c.r, ...(p.extra || {}) });
    else if (p.c.type === 'sphere') D.push({ kind: p.kind, c: p.c.c, r: p.c.r, ...(p.extra || {}) });
    else D.push({ kind: p.kind, c: p.c.c, h: p.c.h, yaw: p.c.yaw, ...(p.extra || {}) });
  }
  void S;

  // ---------- anillos de latón en la espiral de vuelta (se pasa por dentro) ----------
  for (let s = sAt(15, 0.2), k = 0; s < sAt(18, 0.6); s += 48, k++) {
    const P = S.pointAt(s), t = S.tangentAt(s), u = new V3(-t.z, 0, t.x).normalize(), v = new V3().crossVectors(u, t).normalize(), r = 30 + (k % 2) * 4, n = 16, pts = [];
    for (let j = 0; j <= n; j++) { const a = (j / n) * Math.PI * 2 + k * 0.4; pts.push(new V3(P.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r, P.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r, P.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r)); }
    for (let j = 0; j < n; j++) T.stat({ type: 'capsule', a: pts[j], b: pts[j + 1], r: 1.8 }, 'ring');
    D.push({ kind: 'ring', c: P, t: t.clone(), r });
  }

  // ---------- obstáculos que se mueven ----------
  // compases gigantes: dos patas desde una bisagra alta; una barre el paso de lado a lado como un péndulo
  [[2, 0.5], [4, 0.45], [6, 0.5]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), Lg = 150, pivot = F.P.clone().addScaled(K.UP, Lg - 12), lat = F.Rh.clone();
    const leg = T.tag({ type: 'capsule', a: pivot, b: new V3(), r: 2.6 }, 'compass'), tip = T.tag({ type: 'sphere', c: leg.b, r: 5 }, 'compass');
    const amp = 0.42, period = 6.5 + k * 0.7, phase = k * 2.1;
    T.mover({
      kind: 'compass', cols: [leg, tip], pivot, lat, L: Lg, angle: 0, fixed: F.Th.clone(), aiDodge: 'normal',
      bound: { c: F.P.clone(), r: Lg * Math.sin(amp) + 30 },
      update(t) { this.angle = amp * Math.sin((2 * Math.PI * t) / period + phase); leg.b.copy(pivot).addScaled(lat, Lg * Math.sin(this.angle)).addScaled(K.UP, -Lg * Math.cos(this.angle)); },
    });
  });
  // poliedros que orbitan cruzando la línea
  [[1, 0.6, 1], [5, 0.6, -1], [19, 0.5, 1], [3, 0.5, -1]].forEach(([i, f, sd], k) => {
    const F = at(sAt(i, f)), C2 = new V3(F.P.x + F.Rh.x * sd * 26, F.P.y, F.P.z + F.Rh.z * sd * 26), Ro = 46, r = 10;
    const w = ((2 * Math.PI) / (10 + k)) * (k % 2 ? -1 : 1), ph = k * 1.7, col = T.tag({ type: 'sphere', c: C2.clone(), r }, 'orb');
    const { Rh, Th } = F;
    T.mover({
      kind: 'orb', shape: k % 4, cols: [col], bound: { c: C2.clone(), r: Ro + r + 5 }, aiDodge: 'up', aiUp: 28,
      update(t) { const a = w * t + ph; col.c.set(C2.x + (Math.cos(a) * Rh.x + Math.sin(a) * Th.x) * Ro, C2.y, C2.z + (Math.cos(a) * Rh.z + Math.sin(a) * Th.z) * Ro); },
    });
  });
  // radios que giran dentro de la hélice, de la columna a las hebras (se pasan por encima o por debajo)
  [[165, 1, 7], [245, -1, 8.5]].forEach(([y, dir, period], k) => {
    const bar = T.tag({ type: 'capsule', a: new V3(), b: new V3(), r: 3 }, 'spoke'), w = (dir * 2 * Math.PI) / period, ph = k * 2;
    T.mover({
      kind: 'spoke', cols: [bar], angle: 0, y, bound: { c: new V3(C.x, y, C.z), r: 158 }, aiDodge: 'normal',
      update(t) { this.angle = w * t + ph; const c = Math.cos(this.angle), s = Math.sin(this.angle); bar.a.set(C.x + c * 30, y, C.z + s * 30); bar.b.set(C.x + c * 152, y, C.z + s * 152); },
    });
  });
}

export default {
  id: 'espiral', name: 'Espiral áurea', key: 'espiral1', laps: 1, start: 'air', seed: 31,
  blurb: 'Un dibujo de geometría al atardecer: entras por la espiral áurea, subes dentro de una doble hélice dorada y vuelves por anillos de latón. Compases gigantes y radios que giran.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 48.6, oro: 51, plata: 55.5, bronce: 61 },
};
