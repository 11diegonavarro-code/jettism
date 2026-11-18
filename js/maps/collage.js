// Nivel 1: Collage psicodélico. Una cueva op-art: el recorrido va encerrado por rocas de colores apiladas (gargantas y
// cavernas de sección irregular), con tramos al aire libre entre torres de discos apilados, manchas de
// cebra, discos de anillos, muros arcoíris y un busto gigante. Dentro, cientos de formas irregulares pintadas (kit de
// arte) que cuelgan del techo, salen del suelo y de las paredes. Fácil: secciones anchas y obstáculos suaves.
// JS puro (también se simula en Node); lo que se dibuja está en collage-view.js.
import { V3 } from '../math.js';
import { kit } from './kit.js';
import { buildCave, caveInside } from './cave.js';
import { artScatter, artKeep, artFar } from './art.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 50, 0, 'm'], [60, 50, -300, 'm'], [260, 60, -520, 'm'], [520, 50, -560, 'm'], [760, 60, -420, 'm'], [860, 110, -150, 'm'],
  [780, 80, 120, 'm'], [560, 60, 260, 'm'], [300, 50, 300, 'm'], [60, 50, 330, 'm'], [-160, 55, 200, 'm'], [-120, 50, 100, 'm'],
];
// sección de cada tramo: [media anchura, media altura, tipo] (c pasillo, h sala, p pozo, o al aire libre)
// cueva de cada tramo: [radio, tipo] (n garganta, w caverna, o al aire libre)
export const SECT = [[0, 'o'], [26, 'n'], [44, 'w'], [26, 'n'], [34, 'w'], [46, 'w'], [28, 'n'], [44, 'w'], [26, 'n'], [0, 'o'], [40, 'w'], [0, 'o']];
export const COURSE = { name: 'Collage psicodélico', gates: GATES, boosts: [[1, 0.5], [4, 0.5], [7, 0.5], [10, 0.5]] };
export const SECTIONS = [[1, 'La galería'], [4, 'El pozo'], [5, 'La sala de los discos'], [9, 'El jardín de torres']];
// fuera, todo lejos de las paredes (las secciones llegan a 50 m de la línea)
const MIN = { stack: 70, blob: 70, disc: 76, wall: 70, head: 80, far: 120, art: 10, artOut: 66 };

export function build(T) {
  const K = kit(T), { S, R, rr, sAt, at, L } = K, D = T.decor;
  // la cueva: rocas de colores apiladas alrededor de la línea; dentro, cintas, pétalos, tentáculos y caracolas
  buildCave(K, T, SECT, { kinds: { rock: 10, drip: 1, coral: 1, shell: 1 }, perRing: 10, colors: 9 });
  caveInside(K, T, SECT, { n: 700, kinds: { ribbon: 2, tendril: 3, petal: 3, shell: 2, knot: 1, coral: 2, vase: 1 }, size: [0.12, 0.35], colors: 9 });
  // fuera: lo de siempre, más lejos
  const near = (lat0, lat1, up0, up1) => { const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(lat0, lat1); return new V3(F.P.x + F.Rh.x * sd * l, F.P.y + rr(up0, up1), F.P.z + F.Rh.z * sd * l); };
  for (let k = 0; k < 48; k++) { const p = near(90, 320, 0, 0), r = rr(18, 34), H = rr(70, 240); K.capsule(new V3(p.x, -10, p.z), new V3(p.x, H, p.z), r, 'stack', { H, r }); }
  for (let k = 0; k < 60; k++) { const p = near(90, 340, -10, 180); K.cand.push({ c: { type: 'ellipsoid', c: p, r: new V3(rr(22, 60), rr(16, 42), rr(22, 60)), yaw: rr(0, 6.28) }, kind: 'blob', extra: { tex: Math.floor(R() * 4) } }); }
  for (let k = 0; k < 30; k++) { const p = near(95, 320, 10, 140), r = rr(30, 62); K.cand.push({ c: { type: 'ellipsoid', c: p, r: new V3(r, r, 5), yaw: rr(0, 6.28) }, kind: 'disc', extra: { tex: Math.floor(R() * 3) } }); }
  for (let k = 0; k < 30; k++) {
    const p = near(95, 340, 0, 0), yaw = rr(0, 6.28), steps = 2 + Math.floor(R() * 3);
    for (let j = 0; j < steps; j++) { const h = rr(25, 90), len = rr(40, 90); K.box(new V3(p.x + Math.cos(yaw) * j * len * 0.8, h / 2, p.z - Math.sin(yaw) * j * len * 0.8), new V3(len / 2, h / 2, 4 + j), yaw + j * 0.35, 'wall', { tex: Math.floor(R() * 3) }); }
  }
  { const F = at(sAt(6, 0.5)), c = new V3(F.P.x + F.Rh.x * 170, 0, F.P.z + F.Rh.z * 170); K.capsule(new V3(c.x, -10, c.z), new V3(c.x, 120, c.z), 26, 'head'); K.cand.push({ c: { type: 'ellipsoid', c: new V3(c.x, 195, c.z), r: new V3(52, 72, 60), yaw: Math.atan2(-F.Rh.x, -F.Rh.z) }, kind: 'head', extra: { bust: true } }); }
  for (let k = 0; k < 40; k++) { const a = R() * Math.PI * 2, d = rr(1200, 2200), c = new V3(380 + Math.cos(a) * d, rr(80, 400), -100 + Math.sin(a) * d); K.cand.push({ c: { type: 'ellipsoid', c, r: new V3(rr(80, 220), rr(80, 300), rr(80, 220)), yaw: rr(0, 6) }, kind: 'far', extra: { tex: Math.floor(R() * 4) } }); }
  artScatter(K, { n: 320, kinds: { blob: 2, vase: 2, coral: 2, shell: 1, drip: 2, knot: 1, tendril: 1 }, lat: [80, 420], size: [12, 40], ground: true, colors: 9, tag: 'artOut' });
  const kept = K.commit(MIN).kept;
  artKeep(kept, D); artKeep(kept, D, 'artOut');
  for (const p of kept) if (p.kind !== 'art' && p.kind !== 'artOut') D.push({ kind: p.kind, col: p.c, ...(p.extra || {}) });
  artFar(D, R, { n: 60, cx: 380, cz: -100, r: [1500, 2500], size: [100, 260], kinds: { blob: 1, knot: 1, vase: 1, coral: 1, shell: 1 }, colors: 9 });
  void S;

  // obstáculos suaves en las salas: manchas que suben y bajan y bolas rojas que orbitan
  [[2, 0.5], [5, 0.45], [7, 0.5]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), P = F.P, col = T.tag({ type: 'ellipsoid', c: P.clone(), r: new V3(15, 10, 15), yaw: 0 }, 'bob'), period = 8 + k, ph = k * 2;
    T.mover({ kind: 'bob', cols: [col], aiDodge: 'normal', bound: { c: P.clone(), r: 50 }, update(t) { col.c.y = P.y + 20 * Math.sin((2 * Math.PI * t) / period + ph); } });
  });
  [[5, 0.75]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), C = F.P.clone().addScaled(F.Rh, 18), col = T.tag({ type: 'sphere', c: C.clone(), r: 8 }, 'ball'), w = (2 * Math.PI) / 11, ph = k * 3;
    T.mover({ kind: 'ball', cols: [col], aiDodge: 'up', aiUp: 18, bound: { c: C.clone(), r: 40 }, update(t) { const a = w * t + ph; col.c.set(C.x + Math.cos(a) * F.Rh.x * 26 + Math.sin(a) * F.Th.x * 26, C.y, C.z + Math.cos(a) * F.Rh.z * 26 + Math.sin(a) * F.Th.z * 26); } });
  });
}

export default {
  id: 'collage', name: 'Collage psicodélico', key: 'collage1', laps: 1, start: 'air', seed: 5,
  blurb: 'Un edificio op-art que se vuela por dentro: galerías con ventanas, salas con lucernarios llenas de formas pintadas, un pozo y jardines de torres de discos.',
  course: COURSE, sections: SECTIONS, build, sect: SECT, ai: AI_NARROW,
  medals: { autor: 28.8, oro: 30.5, plata: 33.5, bronce: 38 },
};
