// Nivel: Mar rojo. Galerías y terrazas de piedra arenisca rojiza (kit de arquitectura) sobre un mar rojo al
// atardecer, con tramos sobre el agua junto a una cabeza dormida colosal medio hundida, torres petrolíferas de celosía y
// barcos hundidos que asoman. Una garganta entre acantilados y un pozo para subir.
// (Idea tomada de una ilustración: solo la idea del mar rojo con una cabeza gigante dormida, no la imagen.)
// Obstáculos: bombas de petróleo que cabecean (su balancín baja cruzando el paso) y las torres de celosía en el mar.
// JS puro (también se simula en Node); lo que se dibuja está en mar-view.js.
import { V3 } from '../math.js';
import { kit } from './kit.js';
import { buildCanyon } from './canyon.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 45, 0, 'm'], [0, 40, -280, 'm'], [140, 30, -480, 'm'], [380, 26, -560, 'm'], [600, 35, -480, 'm'], [700, 60, -280, 'm'],
  [660, 95, -60, 'm'], [500, 70, 120, 'm'], [300, 38, 200, 'm'], [120, 32, 250, 'm'], [-40, 45, 200, 'm'], [-60, 45, 80, 'm'],
];
const GL = { W: 30, top: [70, 140], floor: 30, ceil: 32, ceilP: 0.45, arches: 100, archHW: 21, archHH: 26 };
const TER = { W: 52, top: [60, 130], floor: 0, ceil: 0 };
export const ZONES = [GL, GL, { open: true }, { open: true }, TER, { W: 30, top: [130, 230], floor: 0, ceil: 0 }, { W: 34, top: [160, 230], floor: 0, ceil: 0, beams: true }, TER, { open: true }, { open: true }, GL, GL];
export const COURSE = { name: 'Mar rojo', gates: GATES, boosts: [[1, 0.5], [4, 0.5], [8, 0.5]] };
export const SECTIONS = [[2, 'El mar'], [3, 'La cabeza dormida'], [5, 'La garganta'], [8, 'Las torres']];
export const HEAD = { x: 470, z: -700, r: [150, 95, 120] };
const MIN = { rig: 16, boat: 12, rock: 18, head: 30, far: 80 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L } = K, D = T.decor, S = T.spline, cp = S.cpS;
  buildCanyon(T, ZONES, { sculpt: 0.35, bg: { n: 70, x: [-600, 1300], z: [-300, 800] } });
  // la cabeza dormida, medio hundida, mirando al cielo
  K.cand.push({ c: { type: 'ellipsoid', c: new V3(HEAD.x, -25, HEAD.z), r: new V3(...HEAD.r), yaw: 0.5 }, kind: 'head', extra: { face: true } });
  // en el mar (tramos abiertos): torres petrolíferas, barcos hundidos y rocas
  const seaS = () => (R() < 0.5 ? rr(cp[2], cp[4]) : rr(cp[8], cp[10]));
  for (let k = 0; k < 34; k++) { const F = at(seaS()), sd = R() < 0.5 ? -1 : 1, l = rr(24, 260), x = F.P.x + F.Rh.x * sd * l, z = F.P.z + F.Rh.z * sd * l, H = rr(70, 140); K.capsule(new V3(x, -5, z), new V3(x, H, z), 7, 'rig', { H }); }
  for (let k = 0; k < 22; k++) { const F = at(seaS()), sd = R() < 0.5 ? -1 : 1, l = rr(20, 240), x = F.P.x + F.Rh.x * sd * l, z = F.P.z + F.Rh.z * sd * l, len = rr(14, 34); K.cand.push({ c: { type: 'obb', c: new V3(x, rr(2, 8), z), h: new V3(len, rr(3, 6), len * 0.3), ax: new V3(Math.cos(k), 0.25 * (k % 3 - 1), Math.sin(k)).normalize(), ay: new V3(0, 1, 0), az: new V3(-Math.sin(k), 0, Math.cos(k)) }, kind: 'boat' }); }
  for (let k = 0; k < 30; k++) { const F = at(seaS()), sd = R() < 0.5 ? -1 : 1, l = rr(40, 320), x = F.P.x + F.Rh.x * sd * l, z = F.P.z + F.Rh.z * sd * l, r = rr(10, 34); K.cand.push({ c: { type: 'ellipsoid', c: new V3(x, r * 0.2, z), r: new V3(r * 1.4, r * 0.7, r), yaw: rr(0, 6) }, kind: 'rock' }); }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, d = rr(1600, 2400), r = rr(140, 300); K.cand.push({ c: { type: 'ellipsoid', c: new V3(320 + Math.cos(a) * d, -r * 0.3, -150 + Math.sin(a) * d), r: new V3(r * 1.6, r * 0.8, r), yaw: rr(0, 6) }, kind: 'far' }); }
  for (const p of K.commit(MIN).kept) {
    const c = p.c;
    if (c.type === 'capsule') D.push({ kind: p.kind, a: c.a, b: c.b, r: c.r, ...(p.extra || {}) });
    else if (c.type === 'obb') D.push({ kind: p.kind, c: c.c, h: c.h, ax: c.ax, ay: c.ay, az: c.az });
    else D.push({ kind: p.kind, c: c.c, rr: c.r, yaw: c.yaw, ...(p.extra || {}) });
  }
  // figuras diminutas en la orilla mirando la cabeza (como en la ilustración)
  { const F = at(sAt(3, 0.2)); for (let k = 0; k < 6; k++) D.push({ kind: 'figure', p: new V3(F.P.x + F.Rh.x * (60 + k * 3), 3, F.P.z + F.Rh.z * (60 + k * 3)) }); }

  // bombas de petróleo: un balancín largo que cabecea y baja cruzando el paso (en las terrazas y el mar)
  [[4, 0.35, 1], [4, 0.75, -1], [7, 0.45, 1], [8, 0.5, -1], [9, 0.45, 1]].forEach(([i, f, sd], k) => {
    const F = at(sAt(i, f)), pivot = new V3(F.P.x + F.Rh.x * sd * 26, F.P.y + 22, F.P.z + F.Rh.z * sd * 26), len = 34, period = 3.4 + k * 0.4, ph = k * 1.3;
    const col = T.tag({ type: 'capsule', a: pivot.clone(), b: new V3(), r: 2.6 }, 'pump');
    T.mover({
      kind: 'pump', cols: [col], pivot, angle: 0, sd, Rh: F.Rh, base: new V3(F.P.x + F.Rh.x * sd * 26, 0, F.P.z + F.Rh.z * sd * 26), bound: { c: pivot.clone(), r: len + 6 }, aiDodge: 'normal',
      update(t) {
        this.angle = 0.6 * Math.sin((2 * Math.PI * t) / period + ph); // positivo: la cabeza del balancín baja hacia la línea
        const dir = F.Rh.clone().scale(-sd * Math.cos(this.angle)), y = -Math.sin(this.angle) * len - 4;
        col.b.set(pivot.x + dir.x * len, pivot.y + y, pivot.z + dir.z * len);
      },
    });
  });
  void L;
}

export default {
  id: 'mar', name: 'Mar rojo', key: 'mar1', laps: 1, start: 'air', seed: 131,
  blurb: 'Galerías y terrazas de piedra rojiza sobre un mar rojo al atardecer, con una cabeza dormida colosal medio hundida, torres petrolíferas, barcos hundidos y bombas que cabecean.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 29.2, oro: 30.8, plata: 33.6, bronce: 37.2 },
};
