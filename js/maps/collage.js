// Nivel 1: Collage psicodélico. Un edificio op-art cerrado y técnico, con la arquitectura del Laberinto (kit de
// arquitectura): galerías de muros pintados con bandas de colores y arcos que hay que atravesar, salas altas abiertas
// al cielo, un pozo por el que se sube, una escalinata gigante y un sótano de pilares; esculturas de formas abstractas
// sobre los voladizos y un busto de anillos asomando por encima. Fácil: secciones anchas y obstáculos suaves.
// JS puro (también se simula en Node); lo que se dibuja está en collage-view.js.
import { V3 } from '../math.js';
import { kit } from './kit.js';
import { buildCanyon } from './canyon.js';
import { artFar } from './art.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 50, 0, 'm'], [60, 50, -300, 'm'], [260, 60, -520, 'm'], [520, 50, -560, 'm'], [760, 60, -420, 'm'], [860, 110, -150, 'm'],
  [780, 80, 120, 'm'], [560, 60, 260, 'm'], [300, 50, 300, 'm'], [60, 50, 330, 'm'], [-160, 55, 200, 'm'], [-120, 50, 100, 'm'],
];
const G = { W: 40, top: [70, 140], floor: 40, ceil: 40, ceilP: 0.35, arches: 120, archHW: 26, archHH: 34 };
// zona de cada tramo: galerías, salas abiertas, pozo, escalinata y sótano
export const ZONES = [G, G, { W: 66, top: [110, 180], floor: 0, ceil: 0 }, { ...G, ceilP: 0.5 }, { W: 40, top: [170, 240], floor: 0, ceil: 0, beams: true },
  { W: 66, top: [100, 160], floor: 0, ceil: 0 }, { W: 40, top: [80, 140], floor: 0, ceil: 0, steps: true }, { W: 58, top: [30, 30], floor: 24, ceil: 28, ceilP: 0.85, pillars: true },
  { ...G, arches: 100 }, { W: 66, top: [100, 170], floor: 0, ceil: 0 }, G, G];
export const COURSE = { name: 'Collage psicodélico', gates: GATES, boosts: [[1, 0.5], [4, 0.5], [7, 0.5], [10, 0.5]] };
export const SECTIONS = [[1, 'La galería de los arcos'], [4, 'El pozo'], [6, 'La escalinata'], [7, 'El sótano'], [9, 'La sala de los discos']];

export function build(T) {
  const K = kit(T), { R, rr, sAt, at } = K, D = T.decor;
  buildCanyon(T, ZONES, { sculpt: 0.45, bg: { n: 140, x: [-500, 1300], z: [-900, 700] } });
  // el busto de anillos, asomando por encima de los muros
  { const F = at(sAt(6, 0.5)), c = new V3(F.P.x + F.Rh.x * 220, 0, F.P.z + F.Rh.z * 220); T.stat({ type: 'capsule', a: new V3(c.x, -10, c.z), b: new V3(c.x, 200, c.z), r: 30 }, 'head'); D.push({ kind: 'head', col: { a: new V3(c.x, -10, c.z), b: new V3(c.x, 200, c.z), r: 30 } }); T.stat({ type: 'ellipsoid', c: new V3(c.x, 290, c.z), r: new V3(60, 82, 68), yaw: 0 }, 'head'); D.push({ kind: 'head', bust: true, col: { c: new V3(c.x, 290, c.z), r: new V3(60, 82, 68), yaw: Math.atan2(-F.Rh.x, -F.Rh.z) } }); }
  // formas enormes en el horizonte
  artFar(D, R, { n: 60, cx: 380, cz: -100, r: [1500, 2500], size: [100, 260], kinds: { blob: 1, knot: 1, vase: 1, coral: 1, shell: 1 }, colors: 9 });
  void rr;
  // obstáculos suaves en las salas: manchas que suben y bajan y una bola roja que orbita
  [[2, 0.5], [5, 0.45], [9, 0.5]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), P = F.P, col = T.tag({ type: 'ellipsoid', c: P.clone(), r: new V3(15, 10, 15), yaw: 0 }, 'bob'), period = 8 + k, ph = k * 2;
    T.mover({ kind: 'bob', cols: [col], aiDodge: 'normal', bound: { c: P.clone(), r: 50 }, update(t) { col.c.y = P.y + 20 * Math.sin((2 * Math.PI * t) / period + ph); } });
  });
  [[5, 0.75]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), C = F.P.clone().addScaled(F.Rh, 18), col = T.tag({ type: 'sphere', c: C.clone(), r: 8 }, 'ball'), w = (2 * Math.PI) / 11, ph = k * 3;
    T.mover({ kind: 'ball', cols: [col], aiDodge: 'normal', bound: { c: C.clone(), r: 40 }, update(t) { const a = w * t + ph; col.c.set(C.x + Math.cos(a) * F.Rh.x * 26 + Math.sin(a) * F.Th.x * 26, C.y, C.z + Math.cos(a) * F.Rh.z * 26 + Math.sin(a) * F.Th.z * 26); } });
  });
}

export default {
  id: 'collage', name: 'Collage psicodélico', key: 'collage1', laps: 1, start: 'air', seed: 5,
  blurb: 'Un edificio op-art: galerías con arcos y muros pintados de colores, salas abiertas al cielo, un pozo, una escalinata y un sótano de pilares, con esculturas de formas abstractas.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 28.8, oro: 30.5, plata: 33.5, bronce: 38 },
};
