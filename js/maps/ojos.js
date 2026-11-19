// Nivel: Los ojos. Dos cúpulas esféricas enormes forradas de ojos pintados, unidas por dos conductos como nervios.
// Se dan vueltas por dentro de la primera alrededor de un ojo gigante que te sigue con la mirada, se cruza a la segunda
// por el conducto de abajo, se la rodea bajando y subiendo, y se vuelve por el conducto de arriba.
// (Idea tomada de un cuadro de ojos pintados: solo la idea, no la imagen.)
// Obstáculos: iris que se cierran (un anillo cuya pupila encoge y crece: hay que pasar por el centro cuando está
// abierta) y ojos que flotan dando vueltas.
// Colisión: las paredes son un «hueco» (track.js): fuera de las cúpulas y los conductos todo es sólido.
// JS puro (también se simula en Node); lo que se dibuja está en ojos-view.js.
import { V3 } from '../math.js';
import { kit } from './kit.js';
import { AI_NARROW } from '../ai.js';

export const DOMES = [{ c: new V3(0, 200, -300), r: 240, eye: 60 }, { c: new V3(600, 190, -200), r: 210, eye: 50 }];
export const TUBES = [{ a: new V3(200, 200, -300), b: new V3(440, 190, -230), r: 36 }, { a: new V3(470, 240, -105), b: new V3(150, 268, -190), r: 36 }];
const GATES = [
  [-150, 190, -300, 'm'], [-75, 210, -430, 'm'], [75, 230, -430, 'm'], [145, 210, -339, 'm'], [330, 195, -268, 's'],
  [469, 180, -248, 'm'], [576, 170, -338, 'm'], [707, 160, -290, 'm'], [731, 160, -152, 'm'], [624, 180, -62, 'm'], [493, 222, -110, 'm'],
  [310, 254, -150, 's'], [60, 250, -180, 'm'], [-100, 215, -200, 'm'],
];
export const COURSE = { name: 'Los ojos', gates: GATES, boosts: [[1, 0.5], [6, 0.5], [12, 0.5]] };
export const SECTIONS = [[1, 'La primera cúpula'], [4, 'El nervio'], [6, 'La segunda cúpula'], [11, 'El regreso']];

export function build(T) {
  const K = kit(T), { R, rr, sAt, at } = K, D = T.decor;
  // el hueco: cúpulas y conductos
  T.stat({ type: 'void', shapes: [...DOMES.map(d => ({ t: 's', c: d.c, r: d.r })), ...TUBES.map(t => ({ t: 'c', a: t.a, b: t.b, r: t.r }))] }, 'wall');
  // los ojos gigantes del centro de cada cúpula
  for (const d of DOMES) T.stat({ type: 'sphere', c: d.c.clone(), r: d.eye }, 'bigeye');
  // ojos pegados a las paredes (solo se dibujan; están en la pared)
  for (const [k, d] of DOMES.entries()) for (let j = 0; j < 260; j++) {
    const u = R() * 2 - 1, a = R() * Math.PI * 2, v = new V3(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a));
    D.push({ kind: 'walleye', dome: k, n: v, s: rr(5, 26) });
  }
  // ---------- obstáculos que se mueven ----------
  // iris que se cierran, dentro de los conductos (sellan el tubo: solo se pasa por la pupila, de 10 a 24 m de radio)
  [[3, 0.8], [4, 0.4], [10, 0.6], [11, 0.25]].forEach(([i, f], k) => {
    const s = sAt(i, f), P = T.spline.pointAt(s), n = T.spline.tangentAt(s), period = 2.6 + (k % 3) * 0.5, ph = k * 1.3;
    const col = T.tag({ type: 'iris', c: P.clone(), n: n.clone(), rin: 20, rout: 44, th: 1.5 }, 'iris');
    T.mover({ kind: 'iris', cols: [col], open: 1, bound: { c: P.clone(), r: 48 }, aiDodge: 'center', update(t) { this.open = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period + ph); col.rin = 10 + 14 * this.open; } });
  });
  // ojos que flotan dando vueltas cerca de la línea
  [[1, 0.5, 1], [3, 0.5, -1], [6, 0.5, 1], [8, 0.5, -1], [10, 0.5, 1], [13, 0.5, -1]].forEach(([i, f, sd], k) => {
    const F = at(sAt(i, f)), C = new V3(F.P.x + F.Rh.x * sd * 12, F.P.y, F.P.z + F.Rh.z * sd * 12), Ro = 26, r = 8, w = ((2 * Math.PI) / (9 + k)) * (k % 2 ? -1 : 1), ph = k * 1.7;
    const col = T.tag({ type: 'sphere', c: C.clone(), r }, 'floater'), { Rh } = F;
    T.mover({ kind: 'floater', cols: [col], bound: { c: C.clone(), r: Ro + r + 5 }, aiDodge: 'normal', update(t) { const a = w * t + ph; col.c.set(C.x + Math.cos(a) * Rh.x * Ro, C.y + Math.sin(a) * Ro, C.z + Math.cos(a) * Rh.z * Ro); } });
  });
  void rr;
}

export default {
  id: 'ojos', name: 'Los ojos', key: 'ojos1', laps: 1, start: 'air', seed: 167,
  blurb: 'Dos cúpulas enormes forradas de ojos, unidas por conductos como nervios: un ojo gigante te sigue con la mirada, los iris se cierran y los ojos flotan a tu alrededor.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 28.4, oro: 29.8, plata: 32.4, bronce: 35.8 },
};
