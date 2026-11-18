// Nivel: Rostro. Una cara enorme de collage maximalista, como una máscara de 640 m en medio de un campo de formas y
// estampados. Se entra por la boca (entre los dientes; la mandíbula de abajo muerde), se rodea la cabeza por detrás
// subiendo y se vuelve a atravesar por un ojo. Alrededor, un campo sobrecargado de formas irregulares (masas, cintas,
// tentáculos, jarrones torcidos, cristales, pétalos, gotas, nudos, caracolas y corales), setas y pilares de ajedrez. Obstáculos: la mandíbula y planetas que orbitan cruzando la línea.
// JS puro (también se simula en Node); lo que se dibuja está en rostro-view.js.
import { kit, V3 } from './kit.js';
import { artScatter, artKeep, artFar } from './art.js';
import { buildCanyon } from './canyon.js';
import { AI_NARROW } from '../ai.js';

// la máscara: plano frontal en z = FACE.z, de x0 a x1 y de 0 a H; agujeros de la boca y de los ojos
export const FACE = { z: -400, depth: 40, x0: -260, x1: 260, H: 640, mouth: { x: 0, y: 90, hw: 80, hh: 40 }, eyes: [{ x: -110, y: 340, h: 45 }, { x: 110, y: 340, h: 45 }] };
const GATES = [
  [0, 70, 400, 'm'], [0, 82, 150, 'm'], [0, 90, -400, 'm'], [0, 140, -640, 'm'], [-160, 250, -760, 'm'], [-200, 330, -620, 'm'],
  [-110, 340, -400, 'm'], [-80, 300, -160, 'm'], [200, 220, 0, 'm'], [420, 150, 200, 'm'], [300, 100, 450, 'm'], [100, 80, 560, 'm'],
];
export const COURSE = { name: 'Rostro', gates: GATES, boosts: [[0, 0.5], [3, 0.5], [8, 0.5]] };
export const SECTIONS = [[2, 'La boca'], [4, 'La nuca'], [6, 'El ojo'], [9, 'El collage']];
const MIN = { art: 14, mush: 60, pillar: 60, artOut: 70 };
// zona de cada tramo (kit de arquitectura): se llega a la boca por una galería de collage; detrás de la cabeza, salas
// abiertas; la cara, al aire libre
const GL = { W: 36, top: [80, 160], floor: 40, ceil: 40, ceilP: 0.4, arches: 120, archHW: 24, archHH: 30 }, SL = { W: 56, top: [110, 200], floor: 0, ceil: 0 };
export const ZONES = [GL, GL, { open: true }, SL, SL, { open: true }, { open: true }, GL, SL, SL, GL, GL];

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
  // ---------- el campo de collage: cientos de formas irregulares (kit de arte) ----------
  buildCanyon(T, ZONES, { sculpt: 0.5 });
  artScatter(K, { n: 160, kinds: { vase: 3, coral: 3, shard: 2, drip: 2, blob: 2, shell: 1 }, lat: [170, 460], size: [12, 46], ground: true, colors: 8, tag: 'artOut' });
  // setas de lunares y pilares de ajedrez, como remiendos
  for (let k = 0; k < 30; k++) { const Fr = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(40, 380), x = Fr.P.x + Fr.Rh.x * sd * l, z = Fr.P.z + Fr.Rh.z * sd * l, h = rr(14, 40); K.capsule(new V3(x, -2, z), new V3(x, h, z), rr(2.5, 5), 'mush', { cap: rr(8, 18), h, tex: Math.floor(R() * 4) }); }
  for (let k = 0; k < 16; k++) { const Fr = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(50, 380), x = Fr.P.x + Fr.Rh.x * sd * l, z = Fr.P.z + Fr.Rh.z * sd * l, H = rr(60, 200); K.capsule(new V3(x, -2, z), new V3(x, H, z), rr(6, 12), 'pillar', { H }); }
  const kept = K.commit(MIN).kept;
  artKeep(kept, D); artKeep(kept, D, 'artOut');
  for (const p of kept) { const c = p.c; if (p.kind !== 'art' && p.kind !== 'artOut') D.push({ kind: p.kind, a: c.a, b: c.b, r: c.r, ...(p.extra || {}) }); }
  // pelo: tentáculos, caracolas y cintas enormes alrededor de la cabeza (sin colisionador: está lejos de la línea)
  for (let k = 0; k < 70; k++) {
    const a = rr(0.05, Math.PI - 0.05), r0 = rr(230, 330), art = ['tendril', 'shell', 'ribbon', 'petal', 'tendril'][k % 5];
    D.push({ kind: 'art', art, v: k % 6, p: new V3(Math.cos(a) * r0, F.H * 0.55 + Math.sin(a) * rr(220, 330), zc + rr(-60, 30)), s: rr(40, 95), rot: [rr(0, 6), rr(0, 6), rr(0, 6)], ci: k % 8, upright: false });
  }
  // lejos: figuras enormes en el horizonte
  artFar(D, R, { n: 70, cx: 0, cz: -100, r: [1300, 2300], size: [90, 260], kinds: { blob: 1, knot: 1, vase: 1, coral: 1, shell: 1, drip: 1 }, colors: 8 });

  // ---------- obstáculos que se mueven ----------
  // la mandíbula: los dientes de abajo suben y bajan (el hueco nunca baja de 30 m)
  {
    const lo = M.y - M.hh, period = 3.6, col = T.tag({ type: 'box', c: new V3(M.x, lo, F.z - 6), h: new V3(M.hw - 2, 11, 8), yaw: 0 }, 'jaw');
    T.mover({ kind: 'jaw', cols: [col], bite: 0, bound: { c: new V3(M.x, M.y, F.z), r: M.hw + 20 }, aiDodge: 'normal', update(t) { const u = Math.max(0, Math.sin((2 * Math.PI * t) / period)); this.bite = u * u; col.c.y = lo + 2 + this.bite * 22; } });
  }
  // planetas con anillos que orbitan cruzando la línea
  [[1, 0.5, 1], [8, 0.5, -1], [10, 0.5, 1]].forEach(([i, f, sd], k) => {
    const Fr = at(sAt(i, f)), C = new V3(Fr.P.x + Fr.Rh.x * sd * 8, Fr.P.y, Fr.P.z + Fr.Rh.z * sd * 8), Ro = 24, r = 9, w = ((2 * Math.PI) / (11 + k)) * (k % 2 ? -1 : 1), ph = k * 2;
    const col = T.tag({ type: 'sphere', c: C.clone(), r }, 'orb'), { Rh, Th } = Fr;
    T.mover({ kind: 'orb', tex: k, cols: [col], bound: { c: C.clone(), r: Ro + r + 5 }, aiDodge: 'normal', update(t) { const a = w * t + ph; col.c.set(C.x + (Math.cos(a) * Rh.x + Math.sin(a) * Th.x) * Ro, C.y, C.z + (Math.cos(a) * Rh.z + Math.sin(a) * Th.z) * Ro); } });
  });
}

export default {
  id: 'rostro', name: 'Rostro', key: 'rostro1', laps: 1, start: 'air', seed: 97,
  blurb: 'Una cara enorme de collage maximalista: entras por la boca entre dientes que muerden, rodeas la cabeza y la atraviesas por un ojo. Alrededor, un campo de estampados.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 31, oro: 33, plata: 36.5, bronce: 41 },
};
