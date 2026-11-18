// Nivel 1: Collage psicodélico. Un mundo abierto y luminoso de formas op-art: torres de discos rojos apilados, manchas
// blandas con rayas de cebra, discos gigantes de anillos de colores, muros plegados de bandas arcoíris y un busto
// enorme hecho de anillos. Recorrido ancho y fácil; obstáculos suaves: manchas que suben y bajan y bolas que orbitan.
// JS puro; lo que se dibuja está en collage-view.js.
import { V3 } from '../math.js';
import { kit } from './kit.js';

const GATES = [
  [0, 90, 0, 'l'], [60, 100, -300, 'l'], [260, 120, -520, 'l'], [520, 140, -560, 'l'], [760, 150, -420, 'l'], [860, 130, -150, 'l'],
  [780, 110, 120, 'l'], [560, 90, 260, 'l'], [300, 80, 300, 'l'], [60, 110, 330, 'l'], [-160, 130, 200, 'l'], [-120, 100, 100, 'l'],
];
export const COURSE = { name: 'Collage psicodélico', gates: GATES, boosts: [[1, 0.5], [4, 0.5], [7, 0.5], [10, 0.5]] };
export const SECTIONS = [[3, 'Las torres rojas'], [6, 'El busto'], [9, 'Los discos']];
const MIN = { stack: 26, blob: 24, disc: 34, wall: 24, head: 30, far: 80 };

export function build(T) {
  const K = kit(T), { S, R, rr, sAt, at, L } = K, D = T.decor;
  const near = (lat0, lat1, up0, up1) => { const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(lat0, lat1); return new V3(F.P.x + F.Rh.x * sd * l, F.P.y + rr(up0, up1), F.P.z + F.Rh.z * sd * l); };
  // torres de discos rojos apilados
  for (let k = 0; k < 48; k++) { const p = near(45, 280, 0, 0), r = rr(18, 34), H = rr(70, 240); K.capsule(new V3(p.x, -10, p.z), new V3(p.x, H, p.z), r, 'stack', { H, r }); }
  // manchas con rayas de cebra
  for (let k = 0; k < 80; k++) { const p = near(40, 300, -40, 180); K.cand.push({ c: { type: 'ellipsoid', c: p, r: new V3(rr(22, 60), rr(16, 42), rr(22, 60)), yaw: rr(0, 6.28) }, kind: 'blob', extra: { tex: Math.floor(R() * 4) } }); }
  // discos de anillos, de pie
  for (let k = 0; k < 34; k++) { const p = near(45, 280, -10, 140), r = rr(30, 62); K.cand.push({ c: { type: 'ellipsoid', c: p, r: new V3(r, r, 5), yaw: rr(0, 6.28) }, kind: 'disc', extra: { tex: Math.floor(R() * 3) } }); }
  // muros plegados de bandas arcoíris (escalonados)
  for (let k = 0; k < 34; k++) {
    const p = near(50, 300, 0, 0), yaw = rr(0, 6.28), steps = 2 + Math.floor(R() * 3);
    for (let j = 0; j < steps; j++) { const h = rr(25, 90), len = rr(40, 90); K.box(new V3(p.x + Math.cos(yaw) * j * len * 0.8, h / 2, p.z - Math.sin(yaw) * j * len * 0.8), new V3(len / 2, h / 2, 4 + j), yaw + j * 0.35, 'wall', { tex: Math.floor(R() * 3) }); }
  }
  // el busto de anillos
  { const F = at(sAt(6, 0.5)), c = new V3(F.P.x + F.Rh.x * 120, 0, F.P.z + F.Rh.z * 120); K.capsule(new V3(c.x, -10, c.z), new V3(c.x, 120, c.z), 26, 'head'); K.cand.push({ c: { type: 'ellipsoid', c: new V3(c.x, 195, c.z), r: new V3(52, 72, 60), yaw: Math.atan2(-F.Rh.x, -F.Rh.z) }, kind: 'head', extra: { bust: true } }); }
  // lejos: formas enormes en el horizonte
  for (let k = 0; k < 40; k++) { const a = R() * Math.PI * 2, d = rr(1200, 2200), c = new V3(380 + Math.cos(a) * d, rr(80, 400), -100 + Math.sin(a) * d); K.cand.push({ c: { type: 'ellipsoid', c, r: new V3(rr(80, 220), rr(80, 300), rr(80, 220)), yaw: rr(0, 6) }, kind: 'far', extra: { tex: Math.floor(R() * 4) } }); }
  for (const p of K.commit(MIN).kept) D.push({ kind: p.kind, col: p.c, ...(p.extra || {}) });

  // obstáculos suaves: manchas que suben y bajan sobre la línea y bolas rojas que orbitan
  [[2, 0.5], [5, 0.5], [8, 0.5]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), P = F.P, col = T.tag({ type: 'ellipsoid', c: P.clone(), r: new V3(17, 12, 17), yaw: 0 }, 'bob'), period = 9 + k, ph = k * 2;
    T.mover({ kind: 'bob', cols: [col], aiDodge: 'normal', bound: { c: P.clone(), r: 70 }, update(t) { col.c.y = P.y + 42 * Math.sin((2 * Math.PI * t) / period + ph); } });
  });
  [[3, 0.6], [10, 0.4]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), C = F.P.clone().addScaled(F.Rh, 30), col = T.tag({ type: 'sphere', c: C.clone(), r: 10 }, 'ball'), w = (2 * Math.PI) / 13, ph = k * 3;
    T.mover({ kind: 'ball', cols: [col], aiDodge: 'up', aiUp: 26, bound: { c: C.clone(), r: 62 }, update(t) { const a = w * t + ph; col.c.set(C.x + Math.cos(a) * F.Rh.x * 48 + Math.sin(a) * F.Th.x * 48, C.y, C.z + Math.cos(a) * F.Rh.z * 48 + Math.sin(a) * F.Th.z * 48); } });
  });
}

export default {
  id: 'collage', name: 'Collage psicodélico', key: 'collage1', laps: 1, start: 'air', seed: 5,
  blurb: 'Un mundo abierto de formas op-art: discos rojos apilados, manchas de cebra, anillos de colores y un busto gigante. Ancho y fácil.',
  course: COURSE, sections: SECTIONS, build,
  medals: { autor: 28.8, oro: 30.5, plata: 33.5, bronce: 38 },
};
