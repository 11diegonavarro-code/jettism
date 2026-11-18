// Nivel: Rostro. Una cara enorme de collage maximalista, como una máscara de 640 m en medio de un campo de formas y
// estampados. Se entra por la boca (entre los dientes; la mandíbula de abajo muerde), se rodea la cabeza por detrás
// subiendo y se vuelve a atravesar por un ojo. Alrededor: cubos isométricos, planetas con anillos, engranajes, setas,
// pilares de ajedrez y esferas estampadas. Obstáculos: la mandíbula y planetas que orbitan cruzando la línea.
// JS puro (también se simula en Node); lo que se dibuja está en rostro-view.js.
import { kit, V3 } from './kit.js';

// la máscara: plano frontal en z = FACE.z, de x0 a x1 y de 0 a H; agujeros de la boca y de los ojos
export const FACE = { z: -400, depth: 40, x0: -260, x1: 260, H: 640, mouth: { x: 0, y: 90, hw: 80, hh: 40 }, eyes: [{ x: -110, y: 340, h: 45 }, { x: 110, y: 340, h: 45 }] };
const GATES = [
  [0, 70, 400, 'm'], [0, 82, 150, 'm'], [0, 90, -400, 'm'], [0, 140, -640, 'm'], [-160, 250, -760, 'm'], [-200, 330, -620, 'm'],
  [-110, 340, -400, 'm'], [-80, 300, -160, 'm'], [200, 220, 0, 'm'], [420, 150, 200, 'm'], [300, 100, 450, 'm'], [100, 80, 560, 'm'],
];
export const COURSE = { name: 'Rostro', gates: GATES, boosts: [[0, 0.5], [3, 0.5], [8, 0.5]] };
export const SECTIONS = [[2, 'La boca'], [4, 'La nuca'], [6, 'El ojo'], [9, 'El collage']];
const MIN = { cube: 20, planet: 24, gear: 22, mush: 18, pillar: 18, ball: 18, far: 80, hair: 30 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L } = K, D = T.decor, F = FACE, zc = F.z - F.depth / 2;
  // ---------- la máscara: tiras verticales de cajas que dejan los agujeros ----------
  const holes = [
    { x0: F.mouth.x - F.mouth.hw, x1: F.mouth.x + F.mouth.hw, y0: F.mouth.y - F.mouth.hh, y1: F.mouth.y + F.mouth.hh },
    ...F.eyes.map(e => ({ x0: e.x - e.h, x1: e.x + e.h, y0: e.y - e.h, y1: e.y + e.h })),
  ];
  const xs = [...new Set([F.x0, F.x1, ...holes.flatMap(h => [h.x0, h.x1])])].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1], mid = (a + b) / 2, cut = holes.filter(h => mid > h.x0 && mid < h.x1).sort((p, q) => p.y0 - q.y0);
    let y = 0;
    for (const h of [...cut, { y0: F.H, y1: F.H }]) {
      if (h.y0 - y > 0.5) { const c = new V3(mid, (y + h.y0) / 2, zc), hh = new V3((b - a) / 2, (h.y0 - y) / 2, F.depth / 2); T.stat({ type: 'box', c, h: hh, yaw: 0 }, 'mask'); D.push({ kind: 'mask', c, h: hh }); }
      y = h.y1;
    }
  }
  // dientes de arriba (fijos) y nariz y labios por delante
  const M = F.mouth;
  for (let k = 0; k < 8; k++) { const x = M.x - M.hw + 10 + k * 20, c = new V3(x, M.y + M.hh - 11, F.z - 6), h = new V3(9, 11, 8); T.stat({ type: 'box', c, h, yaw: 0 }, 'tooth'); D.push({ kind: 'tooth', c, h }); }
  { const c = new V3(0, 215, F.z + 30), r = new V3(42, 78, 36); T.stat({ type: 'ellipsoid', c, r, yaw: 0 }, 'nose'); D.push({ kind: 'nose', c, r }); }
  for (let k = 0; k < 28; k++) {
    const a0 = (k / 28) * Math.PI * 2, a1 = ((k + 1) / 28) * Math.PI * 2, rx = M.hw + 14, ry = M.hh + 14;
    T.stat({ type: 'capsule', a: new V3(M.x + Math.cos(a0) * rx, M.y + Math.sin(a0) * ry, F.z + 8), b: new V3(M.x + Math.cos(a1) * rx, M.y + Math.sin(a1) * ry, F.z + 8), r: 10 }, 'lip');
  }
  D.push({ kind: 'lips', x: M.x, y: M.y, rx: M.hw + 14, ry: M.hh + 14, z: F.z + 8 });
  // pelo: masas estampadas encima y a los lados de la cabeza
  for (let k = 0; k < 22; k++) { const a = rr(0.1, Math.PI - 0.1), c = new V3(Math.cos(a) * rr(240, 330), F.H - 40 + Math.sin(a) * rr(40, 160), zc + rr(-80, 40)); K.sphere(c, rr(40, 80), 'hair', { tex: Math.floor(R() * 4) }); }

  // ---------- el campo de collage ----------
  const near = (l0, l1, up0, up1) => { const Fr = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(l0, l1); return new V3(Fr.P.x + Fr.Rh.x * sd * l, Fr.P.y + rr(up0, up1), Fr.P.z + Fr.Rh.z * sd * l); };
  for (let k = 0; k < 50; k++) { const p = near(40, 320, -60, 120), s = rr(10, 34); if (p.y < s) p.y = s; K.box(p, new V3(s, s, s), rr(0, 6.28), 'cube', { tex: Math.floor(R() * 3) }); }
  for (let k = 0; k < 16; k++) { const p = near(60, 340, -20, 160), r = rr(16, 40); if (p.y < r) p.y = r + 5; K.sphere(p, r, 'planet', { ring: rr(1.6, 2.3), tilt: rr(-0.6, 0.6), tex: Math.floor(R() * 4) }); }
  for (let k = 0; k < 20; k++) { const p = near(40, 300, -30, 120), r = rr(14, 30); if (p.y < r) p.y = r; K.sphere(p, r, 'gear', { yaw: rr(0, 6.28), tex: Math.floor(R() * 3) }); }
  for (let k = 0; k < 40; k++) { const p = near(40, 380, 0, 0), h = rr(14, 40); K.capsule(new V3(p.x, -2, p.z), new V3(p.x, h, p.z), rr(2.5, 5), 'mush', { cap: rr(8, 18), h, tex: Math.floor(R() * 4) }); }
  for (let k = 0; k < 30; k++) { const p = near(40, 380, 0, 0), H = rr(60, 200), r = rr(6, 14); K.capsule(new V3(p.x, -2, p.z), new V3(p.x, H, p.z), r, 'pillar', { H }); }
  for (let k = 0; k < 40; k++) { const p = near(30, 260, -40, 150), r = rr(6, 18); if (p.y < r) p.y = r; K.sphere(p, r, 'ball', { tex: Math.floor(R() * 4) }); }
  for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = rr(1400, 2300), r = rr(90, 260); K.sphere(new V3(Math.cos(a) * d, r * rr(0.3, 1.1), -100 + Math.sin(a) * d), r, 'far', { tex: Math.floor(R() * 4) }); }
  for (const p of K.commit(MIN).kept) {
    const c = p.c;
    if (c.type === 'capsule') D.push({ kind: p.kind, a: c.a, b: c.b, r: c.r, ...(p.extra || {}) });
    else if (c.type === 'sphere') D.push({ kind: p.kind, c: c.c, r: c.r, ...(p.extra || {}) });
    else D.push({ kind: p.kind, c: c.c, h: c.h, yaw: c.yaw, ...(p.extra || {}) });
  }

  // ---------- obstáculos que se mueven ----------
  // la mandíbula: los dientes de abajo suben y bajan (el hueco nunca baja de 30 m)
  {
    const lo = M.y - M.hh, period = 3.6, col = T.tag({ type: 'box', c: new V3(M.x, lo, F.z - 6), h: new V3(M.hw - 2, 11, 8), yaw: 0 }, 'jaw');
    T.mover({ kind: 'jaw', cols: [col], bite: 0, bound: { c: new V3(M.x, M.y, F.z), r: M.hw + 20 }, aiDodge: 'normal', update(t) { const u = Math.max(0, Math.sin((2 * Math.PI * t) / period)); this.bite = u * u; col.c.y = lo + 2 + this.bite * 22; } });
  }
  // planetas con anillos que orbitan cruzando la línea
  [[1, 0.5, 1], [8, 0.5, -1], [10, 0.5, 1]].forEach(([i, f, sd], k) => {
    const Fr = at(sAt(i, f)), C = new V3(Fr.P.x + Fr.Rh.x * sd * 26, Fr.P.y, Fr.P.z + Fr.Rh.z * sd * 26), Ro = 48, r = 11, w = ((2 * Math.PI) / (11 + k)) * (k % 2 ? -1 : 1), ph = k * 2;
    const col = T.tag({ type: 'sphere', c: C.clone(), r }, 'orb'), { Rh, Th } = Fr;
    T.mover({ kind: 'orb', tex: k, cols: [col], bound: { c: C.clone(), r: Ro + r + 5 }, aiDodge: 'up', aiUp: 26, update(t) { const a = w * t + ph; col.c.set(C.x + (Math.cos(a) * Rh.x + Math.sin(a) * Th.x) * Ro, C.y, C.z + (Math.cos(a) * Rh.z + Math.sin(a) * Th.z) * Ro); } });
  });
}

export default {
  id: 'rostro', name: 'Rostro', key: 'rostro1', laps: 1, start: 'air', seed: 97,
  blurb: 'Una cara enorme de collage maximalista: entras por la boca entre dientes que muerden, rodeas la cabeza y la atraviesas por un ojo. Alrededor, un campo de estampados.',
  course: COURSE, sections: SECTIONS, build,
  medals: { autor: 31, oro: 33, plata: 36.5, bronce: 41 },
};
