// Nivel: Jardín de las delicias. Un prado verde y luminoso de pintura antigua: un estanque redondo con una fuente rosa
// de pináculos en el centro, una cabalgata de criaturas dando vueltas alrededor del estanque, frutas gigantes
// (fresas, cerezas, uvas), esferas de cristal azul, y al fondo torres rosas y azules como rocas fantásticas.
// (Idea tomada de un tríptico antiguo, de dominio público; aquí solo se usa la idea, todo está hecho de formas simples.)
// Ahora se vuela casi todo por dentro: invernaderos de cristal, pabellones rosas con lucernarios y un pozo, llenos de
// formas pintadas (kit de arte); el estanque queda al aire libre. Fácil. Obstáculos suaves: la cabalgata que gira (se pasa entre las criaturas) y fresas que suben y bajan.
// JS puro (también se simula en Node); lo que se dibuja está en jardin-view.js.
import { kit, V3 } from './kit.js';
import { buildCave, caveInside } from './cave.js';
import { artScatter, artKeep, artFar } from './art.js';
import { AI_NARROW } from '../ai.js';

export const POND = { x: 400, z: -420, r: 130, ride: 175 };
const GATES = [
  [0, 60, 0, 'm'], [40, 50, -260, 'm'], [200, 26, -440, 'l'], [400, 34, -330, 'l'], [600, 28, -430, 'l'], [760, 80, -300, 'm'],
  [840, 120, -60, 'm'], [700, 90, 180, 'm'], [460, 60, 260, 'm'], [220, 50, 260, 'm'], [80, 66, 230, 'm'], [0, 62, 130, 'm'],
];
// tramos: invernaderos (pasillos de cristal), pabellones con lucernarios, un pozo, y el estanque al aire libre
export const SECT = [[26, 'n'], [0, 'o'], [0, 'o'], [0, 'o'], [42, 'w'], [32, 'w'], [46, 'w'], [26, 'n'], [42, 'w'], [26, 'n'], [28, 'n'], [0, 'o']];
export const COURSE = { name: 'Jardín de las delicias', gates: GATES, boosts: [[1, 0.5], [4, 0.5], [8, 0.5]] };
export const SECTIONS = [[2, 'La cabalgata'], [3, 'El estanque'], [6, 'Las torres'], [8, 'Las frutas']];
const MIN = { fruit: 66, globe: 64, spire: 24, tower: 40, tree: 62, far: 80, art: 10, artOut: 64 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L } = K, D = T.decor;
  // grutas de jardín: rocas rosas, azules y verdes, con corales y caracolas; dentro, pétalos y flores
  buildCave(K, T, SECT, { kinds: { rock: 9, coral: 2, shell: 1, drip: 1 }, perRing: 10, colors: 9 });
  caveInside(K, T, SECT, { n: 420, kinds: { petal: 5, coral: 2, shell: 2, tendril: 2, ribbon: 1, vase: 1 }, size: [0.12, 0.35], colors: 9 });
  artScatter(K, { n: 150, kinds: { vase: 2, coral: 2, petal: 2, blob: 2, shell: 1, tendril: 1 }, lat: [80, 420], size: [12, 38], ground: true, colors: 9, tag: 'artOut' });
  const near = (lat0, lat1) => { const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(lat0, lat1); return new V3(F.P.x + F.Rh.x * sd * l, 0, F.P.z + F.Rh.z * sd * l); };

  // la fuente rosa del estanque: un tronco con pináculos y una esfera azul arriba
  const FX = POND.x, FZ = POND.z - 80;
  K.capsule(new V3(FX, -5, FZ), new V3(FX, 110, FZ), 16, 'spire', { part: 'trunk' });
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, x = FX + Math.cos(a) * 28, z = FZ + Math.sin(a) * 28, h = rr(60, 95); K.capsule(new V3(x, -5, z), new V3(x + Math.cos(a) * 8, h, z + Math.sin(a) * 8), 5, 'spire', { part: 'pin' }); }
  K.sphere(new V3(FX, 132, FZ), 22, 'globe', { tint: 0 });
  // torres rosas y azules del fondo (rocas fantásticas)
  for (let k = 0; k < 22; k++) {
    const a = rr(-0.9, 1.2), d = rr(650, 1100), x = 380 + Math.cos(a) * d, z = -100 + Math.sin(a) * d - 400, H = rr(120, 340), r = rr(18, 46);
    K.capsule(new V3(x, -5, z), new V3(x, H, z), r, 'tower', { H, pink: R() < 0.6 });
  }
  // frutas gigantes por el prado
  for (let k = 0; k < 46; k++) {
    const p = near(40, 320), kind = Math.floor(R() * 3), r = kind === 0 ? rr(14, 30) : kind === 1 ? rr(10, 20) : rr(8, 14);
    if (kind === 0) K.cand.push({ c: { type: 'ellipsoid', c: new V3(p.x, r * 1.1, p.z), r: new V3(r, r * 1.25, r), yaw: 0 }, kind: 'fruit', extra: { fruit: 'fresa' } });
    else if (kind === 1) K.sphere(new V3(p.x, r, p.z), r, 'fruit', { fruit: 'cereza' });
    else for (let j = 0; j < 5; j++) K.sphere(new V3(p.x + rr(-12, 12), r + j * r * 1.2, p.z + rr(-12, 12)), r, 'fruit', { fruit: 'uva' });
  }
  // esferas de cristal azul flotando
  for (let k = 0; k < 30; k++) { const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(35, 260), r = rr(8, 26); K.sphere(new V3(F.P.x + F.Rh.x * sd * l, F.P.y + rr(-20, 90), F.P.z + F.Rh.z * sd * l), r, 'globe', { tint: Math.floor(R() * 3) }); }
  // árboles redondos
  for (let k = 0; k < 60; k++) { const p = near(40, 380), h = rr(14, 30); K.capsule(new V3(p.x, -2, p.z), new V3(p.x, h, p.z), 1.6, 'tree', { crown: rr(7, 14), h }); }
  // a lo lejos, colinas azules
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, d = rr(1700, 2500), r = rr(160, 320); K.sphere(new V3(380 + Math.cos(a) * d, -r * 0.4, -100 + Math.sin(a) * d), r, 'far'); }
  const kept = K.commit(MIN).kept;
  artKeep(kept, D); artKeep(kept, D, 'artOut');
  artFar(D, R, { n: 50, cx: 380, cz: -100, r: [1500, 2400], size: [100, 240], kinds: { blob: 1, vase: 1, coral: 1, petal: 1, shell: 1 }, colors: 9 });
  for (const p of kept) {
    const c = p.c;
    if (p.kind === 'art' || p.kind === 'artOut') continue;
    if (c.type === 'capsule') D.push({ kind: p.kind, a: c.a, b: c.b, r: c.r, ...(p.extra || {}) });
    else if (c.type === 'sphere') D.push({ kind: p.kind, c: c.c, r: c.r, ...(p.extra || {}) });
    else D.push({ kind: p.kind, c: c.c, rr: c.r, ...(p.extra || {}) });
  }
  D.push({ kind: 'pond', x: POND.x, z: POND.z, r: POND.r });

  // ---------- obstáculos que se mueven ----------
  // la cabalgata: criaturas que dan vueltas alrededor del estanque; el recorrido cruza el círculo dos veces
  const n = 14, w = (2 * Math.PI) / 46;
  for (let k = 0; k < n; k++) {
    const col = T.tag({ type: 'sphere', c: new V3(), r: 9 }, 'rider'), a0 = (k / n) * Math.PI * 2, y = 14 + (k % 3) * 4;
    T.mover({
      kind: 'rider', cols: [col], k, angle: 0, bound: { c: new V3(POND.x, 20, POND.z), r: POND.ride + 15 }, aiDodge: 'up', aiUp: 20,
      update(t) { this.angle = a0 + w * t; col.c.set(POND.x + Math.cos(this.angle) * POND.ride, y + Math.abs(Math.sin(t * 3 + k)) * 3, POND.z + Math.sin(this.angle) * POND.ride); },
    });
  }
  // fresas gigantes que suben y bajan sobre la línea
  [[1, 0.6, 30], [4, 0.5, 18], [8, 0.5, 18]].forEach(([i, f, amp], k) => {
    const F = at(sAt(i, f)), P = F.P, period = 8 + k, ph = k * 2, col = T.tag({ type: 'ellipsoid', c: P.clone(), r: new V3(11, 13, 11), yaw: 0 }, 'bob');
    T.mover({ kind: 'bob', cols: [col], bound: { c: P.clone(), r: 60 }, aiDodge: 'normal', update(t) { col.c.y = P.y + amp * Math.sin((2 * Math.PI * t) / period + ph); } });
  });
}

export default {
  id: 'jardin', name: 'Jardín de las delicias', key: 'jardin1', laps: 1, start: 'air', seed: 83,
  blurb: 'Un prado verde de pintura antigua: un estanque con una fuente rosa de pináculos, una cabalgata de criaturas que da vueltas, frutas gigantes y esferas de cristal.',
  course: COURSE, sections: SECTIONS, build, sect: SECT, ai: AI_NARROW,
  medals: { autor: 27.6, oro: 29.2, plata: 32, bronce: 36 },
};
