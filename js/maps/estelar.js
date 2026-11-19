// Nivel 15 (el último, Demonio): Mapa estelar. El espacio negro: el recorrido va dentro de una jaula de filamentos rojos
// y dorados que giran en hélice alrededor de la línea; cada cierto trecho los filamentos se juntan en un nudo estrecho
// que hay que enhebrar. Planetas que orbitan cruzando el paso, aspas de luz que barren media jaula, lunas y, a lo lejos,
// marcos de viñeta enormes como los de un cómic.
// (Idea tomada de una ilustración de un mapa del espacio: solo la idea, no la imagen.)
// JS puro (también se simula en Node); lo que se dibuja está en estelar-view.js.
import { V3 } from '../math.js';
import { kit } from './kit.js';
import { frameAt } from './shell.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [-150, 200, -200, 'm'], [0, 230, -330, 'm'], [180, 290, -460, 'm'], [380, 320, -480, 'm'], [540, 260, -360, 'm'], [580, 180, -160, 'm'],
  [470, 120, 10, 'm'], [280, 150, 130, 'm'], [80, 230, 190, 'm'], [-110, 300, 160, 'm'], [-240, 270, 40, 'm'], [-260, 230, -90, 'm'],
];
export const COURSE = { name: 'Mapa estelar', gates: GATES, boosts: [[1, 0.5], [5, 0.5], [9, 0.5]] };
export const SECTIONS = [[1, 'La jaula'], [3, 'Los nudos'], [6, 'Los planetas'], [9, 'El último nudo']];
export const CAGE = { R: 21, strands: 9, twist: 0.012, pinch: 9 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at } = K, D = T.decor, S = T.spline, L = S.length, cp = S.cpS;
  // nudos: donde los filamentos se juntan (lejos de las puertas y de la salida)
  const knots = [];
  for (let i = 1; i < cp.length - 1; i++) knots.push(sAt(i, 0.5));
  const radius = s => { let r = CAGE.R; for (const k of knots) { const d = Math.min(Math.abs(s - k), L - Math.abs(s - k)); r -= CAGE.pinch * Math.exp(-((d / 26) ** 2)); } return r; };
  // la jaula: tramos de 16 m de cada filamento
  const step = 16, strands = [];
  for (let k = 0; k < CAGE.strands; k++) {
    let prev = null;
    for (let s = 0; s <= L + 0.1; s += step) {
      const ss = s % L, F = frameAt(S, ss), th = (k / CAGE.strands) * Math.PI * 2 + s * CAGE.twist * (k % 2 ? 1 : -1) * 0.5 + s * CAGE.twist, r = radius(ss);
      const p = F.P.clone().addScaled(F.Rh, Math.cos(th) * r).addScaled(F.U, Math.sin(th) * r);
      if (prev) { T.stat({ type: 'capsule', a: prev, b: p, r: 0.8 }, 'strand'); strands.push({ a: prev, b: p, gold: k % 3 === 0 }); }
      prev = p;
    }
  }
  D.push({ kind: 'strands', list: strands });
  for (const k of knots) D.push({ kind: 'knot', p: S.pointAt(k) });
  // planetas grandes fuera de la jaula, lunas y marcos de viñeta lejanos (solo se dibujan)
  for (let k = 0; k < 14; k++) { const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(120, 420); D.push({ kind: 'planet', c: new V3(F.P.x + F.Rh.x * sd * l, F.P.y + rr(-150, 150), F.P.z + F.Rh.z * sd * l), r: rr(25, 90), ring: R() < 0.4, tex: k % 4 }); }
  for (let k = 0; k < 10; k++) { const a = R() * Math.PI * 2, d = rr(1400, 2200); D.push({ kind: 'panel', c: new V3(170 + Math.cos(a) * d, rr(-300, 700), -150 + Math.sin(a) * d), w: rr(500, 1200), h: rr(300, 800), yaw: a + Math.PI / 2 }); }

  // ---------- obstáculos que se mueven ----------
  // planetas pequeños que orbitan cruzando el paso
  [[2, 0.2], [4, 0.75], [6, 0.3], [7, 0.75], [9, 0.25]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), C = F.P.clone().addScaled(F.Rh, 6), Ro = 16, r = 6, w = ((2 * Math.PI) / (5 + k * 0.6)) * (k % 2 ? -1 : 1), ph = k * 1.9;
    const col = T.tag({ type: 'sphere', c: C.clone(), r }, 'moon'), U = new V3(0, 1, 0);
    T.mover({ kind: 'moon', tex: k % 4, cols: [col], bound: { c: C.clone(), r: Ro + r + 4 }, aiDodge: 'normal', update(t) { const a = w * t + ph; col.c.set(C.x + Math.cos(a) * F.Rh.x * Ro, C.y + Math.sin(a) * Ro * U.y, C.z + Math.cos(a) * F.Rh.z * Ro); } });
  });
  // aspas de luz: media barra que gira alrededor de la línea, de la jaula hasta 7,5 m del centro
  [[1, 0.25], [3, 0.2], [5, 0.25], [8, 0.2], [10, 0.25]].forEach(([i, f], k) => {
    const s = sAt(i, f), F = frameAt(S, s), r0 = radius(s), w = ((2 * Math.PI) / (3.4 + k * 0.4)) * (k % 2 ? 1 : -1), ph = k * 1.1;
    const col = T.tag({ type: 'capsule', a: new V3(), b: new V3(), r: 1.2 }, 'blade');
    T.mover({ kind: 'blade', cols: [col], angle: 0, bound: { c: F.P.clone(), r: r0 + 4 }, aiDodge: 'center', update(t) { this.angle = w * t + ph; const c = Math.cos(this.angle), si = Math.sin(this.angle); col.a.set(F.P.x + (F.Rh.x * c + F.U.x * si) * 7.5, F.P.y + (F.Rh.y * c + F.U.y * si) * 7.5, F.P.z + (F.Rh.z * c + F.U.z * si) * 7.5); col.b.set(F.P.x + (F.Rh.x * c + F.U.x * si) * r0, F.P.y + (F.Rh.y * c + F.U.y * si) * r0, F.P.z + (F.Rh.z * c + F.U.z * si) * r0); } });
  });
}

export default {
  id: 'estelar', name: 'Mapa estelar', key: 'estelar1', laps: 1, start: 'air', seed: 181,
  blurb: 'El último nivel: el espacio negro, dentro de una jaula de filamentos rojos y dorados que se juntan en nudos estrechos, con planetas que orbitan y aspas de luz.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW, groundY: -10000,
  medals: { autor: 24, oro: 25.4, plata: 28, bronce: 31.5 },
};
