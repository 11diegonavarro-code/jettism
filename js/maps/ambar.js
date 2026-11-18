// Nivel: Pasillo ámbar. Un hospital que no se acaba, bañado en luz dorada: pasillos que se curvan, salas más anchas,
// fluorescentes en el techo, suelo brillante, barandillas y puertas con ojo de buey. Todo desenfocado por la velocidad.
// (Idea tomada de una portada de disco: solo la idea de un pasillo de hospital ámbar con prisa, no la imagen.)
// Obstáculos: camillas con gotero que cruzan por los pasillos laterales (se pasan por encima) y puertas batientes que
// se abren y se cierran dejando libre solo el centro.
// JS puro (también se simula en Node); lo que se dibuja está en ambar-view.js.
import { kit, V3 } from './kit.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 30, 0, 'm'], [0, 30, -300, 'm'], [60, 30, -520, 'm'], [260, 32, -620, 'm'], [520, 30, -600, 'm'], [700, 40, -450, 'm'],
  [720, 60, -200, 'm'], [600, 60, 30, 'm'], [380, 45, 120, 'm'], [150, 30, 200, 'm'], [-60, 30, 220, 'm'], [-50, 30, 110, 'm'],
];
export const COURSE = { name: 'Pasillo ámbar', gates: GATES, boosts: [[0, 0.5], [4, 0.5], [8, 0.5]] };
export const SECTIONS = [[1, 'El pasillo'], [3, 'La sala'], [6, 'La rampa'], [7, 'La sala grande'], [9, 'Urgencias']];
// sección de cada tramo: media anchura, media altura y tipo (c pasillo, h sala)
export const SECT = [[16, 9, 'c'], [16, 9, 'c'], [16, 9, 'c'], [30, 13, 'h'], [16, 9, 'c'], [16, 9, 'c'], [16, 9, 'c'], [30, 13, 'h'], [16, 9, 'c'], [16, 9, 'c'], [16, 9, 'c'], [16, 9, 'c']];
// cruces con pasillos laterales: [tramo, fracción]; ahí las paredes tienen hueco y cruzan camillas
export const CROSS = [[0, 0.55], [2, 0.5], [4, 0.6], [8, 0.5], [9, 0.55], [10, 0.5]];
const MIN = { bed: 10, cab: 10 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, L, S, cp } = K, D = T.decor;
  const sect = s => { let i = 0; while (i + 1 < cp.length && cp[i + 1] <= s) i++; return SECT[i]; };
  const frame = s => { const P = S.pointAt(s), t = S.tangentAt(s), Rh = new V3(-t.z, 0, t.x).normalize(), U = new V3().crossVectors(Rh, t).normalize(); return { P, t, Rh, U }; };
  const th = 3, wall = (c, h, ax, ay, az, kind) => T.stat({ type: 'obb', c, h, ax, ay, az }, kind);
  const crossS = CROSS.map(([i, f]) => sAt(i, f));
  const inCross = s => crossS.some(c => Math.abs(c - s) < 9);

  // ---------- cáscara del hospital ----------
  for (let s = 0; s < L; s += 10) {
    const F = frame(s + 5), [W, H, kind] = sect(s + 5), az = F.t, gap = inCross(s + 5);
    wall(F.P.clone().addScaled(F.U, -H - th), new V3(W + th * 2, th, 6.5), F.Rh, F.U, az, 'floor');
    wall(F.P.clone().addScaled(F.U, H + th), new V3(W + th * 2, th, 6.5), F.Rh, F.U, az, 'ceil');
    if (!gap) for (const sd of [-1, 1]) wall(F.P.clone().addScaled(F.Rh, sd * (W + th)), new V3(th, H + th * 2, 6.5), F.Rh, F.U, az, 'wall');
    D.push({ kind: 'seg', s, P: F.P, t: F.t, Rh: F.Rh, U: F.U, W, H, type: kind, gap });
  }
  // pasillos laterales: paredes de los dos lados del cruce, cortos, con su suelo y techo
  for (const s of crossS) {
    const F = frame(s), [W, H] = sect(s), len = 70;
    for (const sd of [-1, 1]) {
      const C = F.P.clone().addScaled(F.Rh, sd * (W + len / 2));
      wall(C.clone().addScaled(F.U, -H - th), new V3(len / 2, th, 9 + th), F.Rh, F.U, F.t, 'floor');
      wall(C.clone().addScaled(F.U, H + th), new V3(len / 2, th, 9 + th), F.Rh, F.U, F.t, 'ceil');
      for (const fb of [-1, 1]) wall(C.clone().addScaled(F.t, fb * (9 + th)), new V3(len / 2, H + th, th), F.Rh, F.U, F.t, 'wall');
      wall(F.P.clone().addScaled(F.Rh, sd * (W + len + th)), new V3(th, H + th, 9 + th), F.Rh, F.U, F.t, 'wall');
    }
    D.push({ kind: 'cross', s, P: F.P, t: F.t, Rh: F.Rh, U: F.U, W, H, len });
  }
  // marcos entre secciones distintas
  for (let i = 0; i < cp.length; i++) {
    const a = SECT[(i + SECT.length - 1) % SECT.length], b = SECT[i];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const F = frame(cp[i]), W = Math.max(a[0], b[0]), H = Math.max(a[1], b[1]), w = Math.min(a[0], b[0]), h = Math.min(a[1], b[1]);
    const parts = [
      [F.P.clone().addScaled(F.Rh, -(W + w) / 2), new V3((W - w) / 2 + th, H + th, 1.5)], [F.P.clone().addScaled(F.Rh, (W + w) / 2), new V3((W - w) / 2 + th, H + th, 1.5)],
      [F.P.clone().addScaled(F.U, (H + h) / 2), new V3(w, (H - h) / 2, 1.5)], [F.P.clone().addScaled(F.U, -(H + h) / 2), new V3(w, (H - h) / 2, 1.5)],
    ];
    for (const [c, hh] of parts) if (hh.x > 0.5 && hh.y > 0.5) { wall(c, hh, F.Rh, F.U, F.t, 'bulk'); D.push({ kind: 'bulk', c, h: hh, Rh: F.Rh, U: F.U, t: F.t }); }
  }
  // camas y armarios a los lados en las salas
  for (let s = 0; s < L; s += 16) {
    const [W, H, kind] = sect(s);
    if (kind !== 'h') continue;
    const F = frame(s);
    for (const sd of [-1, 1]) {
      const base = F.P.clone().addScaled(F.Rh, sd * (W - 6)).addScaled(F.U, -H);
      if (R() < 0.7) K.box(new V3(base.x, base.y + 2.2, base.z), new V3(4.5, 2.2, 2), Math.atan2(F.t.x, F.t.z) + Math.PI / 2, 'bed');
      else K.box(new V3(base.x, base.y + 5, base.z), new V3(2, 5, 4), Math.atan2(F.t.x, F.t.z), 'cab');
    }
  }
  for (const p of K.commit(MIN).kept) D.push({ kind: p.kind, c: p.c.c, h: p.c.h, yaw: p.c.yaw });

  // ---------- obstáculos que se mueven ----------
  // camillas con gotero que cruzan el pasillo por el lateral (de un lado al otro); se pasan por encima
  crossS.forEach((s, k) => {
    const F = frame(s), [W, H] = sect(s), floor = F.P.clone().addScaled(F.U, -H), period = 5 + (k % 3) * 0.8, ph = k * 1.3, span = W + 30;
    const bed = T.tag({ type: 'obb', c: new V3(), h: new V3(4.5, 1.6, 2), ax: F.Rh, ay: F.U, az: F.t }, 'gurney');
    const pole = T.tag({ type: 'capsule', a: new V3(), b: new V3(), r: 0.6 }, 'gurney');
    T.mover({
      kind: 'gurney', cols: [bed, pole], F, floor, off: 0, bound: { c: F.P.clone(), r: span + 10 }, aiDodge: 'up', aiUp: 7,
      update(t) {
        this.off = span * Math.sin((2 * Math.PI * t) / period + ph);
        bed.c.copy(floor).addScaled(F.Rh, this.off).addScaled(F.U, 2.6);
        pole.a.copy(bed.c).addScaled(F.Rh, 3.5); pole.b.copy(pole.a).addScaled(F.U, 5.2);
      },
    });
  });
  // puertas batientes: dos hojas que giran sobre las paredes; cerradas del todo dejan 13 m libres en el centro
  [[1, 0.6], [5, 0.5], [6, 0.6], [10, 0.35]].forEach(([i, f], k) => {
    const s = sAt(i, f), F = frame(s), [W, H] = sect(s), period = 3.2 + (k % 2) * 0.6, ph = k * 0.9, leaf = W - 6.5;
    const cols = [-1, 1].map(() => T.tag({ type: 'obb', c: new V3(), h: new V3(leaf / 2, H - 0.5, 0.5), ax: new V3(), ay: F.U, az: new V3() }, 'door'));
    T.mover({
      kind: 'swing', cols, F, W, H, leaf, open: 0, aiDodge: 'center', bound: { c: F.P.clone(), r: W + 4 },
      update(t) {
        this.open = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period + ph); // 0 cerrada, 1 abierta (90°)
        const a = this.open * Math.PI / 2;
        cols.forEach((c, j) => {
          const sd = j ? 1 : -1, hinge = F.P.clone().addScaled(F.Rh, sd * W);
          // la hoja va de la bisagra hacia el centro y gira hacia delante
          c.ax.copy(F.Rh).scale(-sd * Math.cos(a)).addScaled(F.t, Math.sin(a)).normalize();
          c.az.crossVectors(c.ax, F.U).normalize();
          c.c.copy(hinge).addScaled(c.ax, leaf / 2);
        });
      },
    });
  });
  void rr;
}

export default {
  id: 'ambar', name: 'Pasillo ámbar', key: 'ambar1', laps: 1, start: 'air', seed: 103,
  blurb: 'Un hospital que no se acaba, en luz dorada: pasillos que se curvan, camillas con gotero que cruzan y puertas batientes que se abren y se cierran.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 27, oro: 28.6, plata: 31.5, bronce: 35 },
};
