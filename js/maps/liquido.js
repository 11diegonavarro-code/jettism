// Nivel: Líquido. Un laboratorio cerrado con la arquitectura del Laberinto (kit de arquitectura): muros de líquido
// jaspeado naranja y verde azulado, relieves de cromo iridiscente, galerías con arcos, salas, una escalinata, un pozo y
// un sótano de pilares; esculturas de gotas y masas de metal líquido.
// (Idea tomada de un cartel: solo la idea del líquido iridiscente naranja y verde, no la imagen ni su texto.)
// Obstáculos: burbujas que laten (crecen y encogen junto a la línea), columnas de burbujas que suben por el pozo y
// émbolos que salen de las paredes (dejan libre el centro).
// JS puro (también se simula en Node); lo que se dibuja está en liquido-view.js.
import { V3 } from '../math.js';
import { kit } from './kit.js';
import { buildCanyon } from './canyon.js';
import { artFar } from './art.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 60, 0, 'm'], [0, 60, -280, 'm'], [120, 70, -500, 'm'], [340, 90, -580, 'm'], [560, 80, -500, 'm'], [680, 60, -300, 'm'],
  [660, 120, -80, 'm'], [520, 150, 100, 'm'], [300, 110, 180, 'm'], [120, 70, 240, 'm'], [-60, 60, 200, 'm'], [-60, 60, 80, 'm'],
];
const GL = { W: 32, top: [80, 150], floor: 44, ceil: 36, ceilP: 0.55, arches: 110, archHW: 22, archHH: 28 };
const SL = { W: 54, top: [100, 170], floor: 0, ceil: 50, ceilP: 0.4 };
export const ZONES = [GL, GL, SL, { W: 34, top: [80, 140], floor: 0, ceil: 0, steps: true }, SL, GL, { W: 36, top: [160, 230], floor: 0, ceil: 0, beams: true }, SL,
  { W: 54, top: [30, 30], floor: 26, ceil: 28, ceilP: 0.85, pillars: true }, GL, SL, GL];
export const COURSE = { name: 'Líquido', gates: GATES, boosts: [[0, 0.5], [4, 0.5], [8, 0.5]] };
export const SECTIONS = [[1, 'Las galerías'], [3, 'La escalinata'], [6, 'El pozo de burbujas'], [8, 'El sótano'], [10, 'La sala de las gotas']];

export function build(T) {
  const K = kit(T), { R, rr, sAt, at } = K, D = T.decor;
  buildCanyon(T, ZONES, { sculpt: 0.55, bg: { n: 120, x: [-500, 1200], z: [-1000, 650] } });
  artFar(D, R, { n: 50, cx: 300, cz: -150, r: [1500, 2400], size: [100, 260], kinds: { blob: 2, drip: 2, knot: 1 }, colors: 6 });

  // burbujas que laten: crecen y encogen junto a la línea en las salas (nunca llegan a menos de 5 m del centro)
  [[2, 0.3, 1], [2, 0.7, -1], [4, 0.4, -1], [4, 0.75, 1], [7, 0.5, 1], [10, 0.35, -1], [10, 0.7, 1]].forEach(([i, f, sd], k) => {
    const F = at(sAt(i, f)), c = new V3(F.P.x + F.Rh.x * sd * 19, F.P.y + rr(-6, 6), F.P.z + F.Rh.z * sd * 19), period = 2.8 + (k % 3) * 0.6, ph = k * 1.1;
    const col = T.tag({ type: 'sphere', c, r: 6 }, 'bubble');
    T.mover({ kind: 'bubble', cols: [col], tint: k % 4, bound: { c: c.clone(), r: 26 }, aiDodge: 'center', update(t) { col.r = 4 + 10 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period + ph)); } });
  });
  // columnas de burbujas que suben por el pozo cruzando la línea
  for (let k = 0; k < 5; k++) {
    const F = at(sAt(6, 0.15 + k * 0.17)), base = F.P.y - 70, H = 140, speed = 28 + k * 4, ph = k * 37, lat = (k % 2 ? 1 : -1) * rr(0, 8);
    const col = T.tag({ type: 'sphere', c: new V3(), r: 7 }, 'rise');
    T.mover({ kind: 'rise', cols: [col], tint: k % 4, bound: { c: F.P.clone(), r: 80 }, aiDodge: 'normal', update(t) { col.c.set(F.P.x + F.Rh.x * lat, base + (((t * speed + ph) % H) + H) % H, F.P.z + F.Rh.z * lat); } });
  }
  // émbolos que salen de las paredes de las galerías (dejan 7 m libres a cada lado del centro)
  [[0, 0.6, 1], [1, 0.55, -1], [5, 0.5, 1], [9, 0.5, -1], [11, 0.45, 1]].forEach(([i, f, sd], k) => {
    const F = at(sAt(i, f)), W = GL.W, period = 3.2 + k * 0.3, ph = k * 1.4, col = T.tag({ type: 'box', c: new V3(), h: new V3(6, 9, 6), yaw: F.yaw }, 'piston');
    T.mover({ kind: 'piston', cols: [col], e: 0, bound: { c: F.P.clone(), r: W + 20 }, aiDodge: 'center', update(t) { this.e = Math.max(0, Math.sin((2 * Math.PI * t) / period + ph)); const lat = sd * (W + 6 - this.e * (W - 7)); col.c.set(F.P.x + F.Rh.x * lat, F.P.y, F.P.z + F.Rh.z * lat); } });
  });
}

export default {
  id: 'liquido', name: 'Líquido', key: 'liquido1', laps: 1, start: 'air', seed: 113,
  blurb: 'Un laboratorio de líquido jaspeado naranja y verde: galerías con arcos, salas, un pozo y un sótano; burbujas que laten, burbujas que suben y émbolos que salen de las paredes.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 25.2, oro: 26.6, plata: 29.2, bronce: 32.5 },
};
