// Nivel 10: Luz y sombra. El último y el más oscuro: un edificio brutalista de hormigón, casi negro y en blanco y
// negro, que se recorre por dentro. Pasillos con techo de lamas (la luz entra a franjas), salas enormes con
// lucernarios y pilares, y un pozo alto por el que se sube. Entre una sección y otra, muros con la abertura justa.
// Obstáculos: compuertas que salen de las paredes y dejan libre solo el centro, bloques que caen del techo en las
// salas y losas que se balancean en el pozo.
// JS puro (también se simula en Node); lo que se dibuja está en luz-view.js.
import { kit, V3 } from './kit.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 40, 0, 's'], [0, 40, -250, 's'], [120, 45, -450, 's'], [350, 60, -500, 's'], [560, 60, -420, 's'], [640, 42, -220, 's'],
  [600, 90, -20, 's'], [420, 120, 80, 's'], [200, 90, 120, 's'], [60, 50, 220, 's'], [-100, 40, 180, 's'], [-60, 40, 60, 's'],
];
export const COURSE = { name: 'Luz y sombra', gates: GATES, boosts: [[0, 0.4], [4, 0.5], [9, 0.5]] };
export const SECTIONS = [[1, 'El pasillo de lamas'], [3, 'La primera sala'], [5, 'El pozo'], [7, 'La sala grande'], [9, 'La salida']];
// sección de cada tramo (puerta i → i+1): media anchura, media altura y tipo
export const SECT = [[15, 13, 'c'], [15, 13, 'c'], [15, 13, 'c'], [48, 32, 'h'], [15, 13, 'c'], [26, 40, 'p'], [26, 40, 'p'], [55, 34, 'h'], [15, 13, 'c'], [15, 13, 'c'], [20, 15, 'c'], [15, 13, 'c']];
const MIN = { pillar: 12, block: 12 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L, S, cp } = K, D = T.decor, UP = new V3(0, 1, 0);
  const sect = s => { let i = 0; while (i + 1 < cp.length && cp[i + 1] <= s) i++; return SECT[i]; };
  // marco sin alabeo: avance T, lateral horizontal Rh y arriba U (perpendicular a los dos)
  const frame = s => { const P = S.pointAt(s), t = S.tangentAt(s), Rh = new V3(-t.z, 0, t.x).normalize(), U = new V3().crossVectors(Rh, t).normalize(); return { P, t, Rh, U }; };
  const th = 3, wall = (c, h, ax, ay, az, kind) => T.stat({ type: 'obb', c, h, ax, ay, az }, kind);

  // ---------- la cáscara: suelo, techo y paredes cada 10 m, con la sección de su tramo ----------
  for (let s = 0; s < L; s += 10) {
    const F = frame(s + 5), [W, H, kind] = sect(s + 5), az = F.t;
    wall(F.P.clone().addScaled(F.U, -H - th), new V3(W + th * 2, th, 6.5), F.Rh, F.U, az, 'floor');
    wall(F.P.clone().addScaled(F.U, H + th), new V3(W + th * 2, th, 6.5), F.Rh, F.U, az, 'ceil');
    for (const sd of [-1, 1]) wall(F.P.clone().addScaled(F.Rh, sd * (W + th)), new V3(th, H + th * 2, 6.5), F.Rh, F.U, az, 'wall');
    D.push({ kind: 'seg', s, P: F.P, t: F.t, Rh: F.Rh, U: F.U, W, H, type: kind });
  }
  // muros entre secciones distintas: la sección grande menos la abertura de la pequeña
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

  // ---------- dentro de las salas y del pozo: pilares y bloques ----------
  for (let s = 0; s < L; s += 14) {
    const [W, H, kind] = sect(s);
    if (kind !== 'h') continue; // en los pasillos y en el pozo, nada (en el pozo están las losas)
    const F = frame(s);
    for (let k = 0; k < (kind === 'h' ? 2 : 1); k++) {
      const sd = R() < 0.5 ? -1 : 1, l = rr(30, W - 6), base = F.P.clone().addScaled(F.Rh, sd * l);
      if (R() < 0.6) K.capsule(base.clone().addScaled(F.U, -H), base.clone().addScaled(F.U, H), rr(2.5, 4.5), 'pillar');
      else { const hh = new V3(rr(3, 8), rr(4, H * 0.6), rr(3, 8)); K.box(new V3(base.x, F.P.y - H + hh.y, base.z), hh, Math.atan2(F.t.x, F.t.z), 'block'); }
    }
  }
  for (const p of K.commit(MIN).kept) D.push(p.c.type === 'capsule' ? { kind: 'pillar', a: p.c.a, b: p.c.b, r: p.c.r } : { kind: 'block', c: p.c.c, h: p.c.h, yaw: p.c.yaw });

  // ---------- obstáculos que se mueven ----------
  // compuertas: dos hojas salen de las paredes del pasillo y dejan libre solo el centro (8 m a cada lado)
  [[0, 0.8], [1, 0.6], [4, 0.5], [9, 0.45], [10, 0.6]].forEach(([i, f], k) => {
    const s = sAt(i, f), F = frame(s), [W, H] = sect(s), period = 2.6 + (k % 3) * 0.4, ph = k * 0.8, d0 = 8;
    const hh = new V3(0, H, 1.2), cols = [-1, 1].map(() => T.tag({ type: 'obb', c: new V3(), h: hh.clone(), ax: F.Rh, ay: F.U, az: F.t }, 'door'));
    T.mover({
      kind: 'door', cols, e: 0, F, W, H, aiDodge: 'center', bound: { c: F.P.clone(), r: W + H },
      update(t) {
        this.e = (W - d0) * Math.max(0, Math.sin((2 * Math.PI * t) / period + ph)); // cuánto salen las hojas
        cols.forEach((c, j) => { const sd = j ? 1 : -1, half = Math.max(0.3, this.e / 2); c.h.x = half; c.c.copy(F.P).addScaled(F.Rh, sd * (W - half)); });
      },
    });
  });
  // bloques que caen del techo en las salas, a un lado de la línea (el centro queda libre)
  [[3, 0.35, -1], [3, 0.7, 1], [7, 0.3, 1], [7, 0.62, -1]].forEach(([i, f, sd], k) => {
    const s = sAt(i, f), F = frame(s), [W, H] = sect(s), P = F.P.clone().addScaled(F.Rh, sd * 15.5), hh = new V3(9, H * 0.55, 9), period = 4.5 + k * 0.4, ph = k * 1.3;
    const col = T.tag({ type: 'box', c: P.clone(), h: hh, yaw: Math.atan2(F.t.x, F.t.z) }, 'crusher');
    T.mover({
      kind: 'crusher', cols: [col], drop: 0, bound: { c: P.clone(), r: H + 20 }, aiDodge: 'center',
      update(t) { const u = (((t + ph) / period) % 1 + 1) % 1; this.drop = u < 0.15 ? u / 0.15 : u < 0.55 ? 1 : u < 0.9 ? 1 - (u - 0.55) / 0.35 : 0; const top = P.y + H, bottom = P.y - H; col.c.set(P.x, top - hh.y + (bottom + hh.y - (top - hh.y)) * this.drop * this.drop, P.z); },
    });
  });
  // losas que se balancean colgadas en el pozo, de lado a lado
  [[5, 0.4], [6, 0.45]].forEach(([i, f], k) => {
    const s = sAt(i, f), F = frame(s), [W, H] = sect(s), pivot = F.P.clone().addScaled(F.U, H - 1), Lp = H + 6, amp = 0.55, period = 4.2 + k * 0.6, ph = k * 2;
    const col = T.tag({ type: 'obb', c: new V3(), h: new V3(7, 9, 2), ax: new V3(), ay: new V3(), az: F.t }, 'swing');
    T.mover({
      kind: 'swing', cols: [col], pivot, Lp, angle: 0, F, bound: { c: F.P.clone(), r: Lp + 12 }, aiDodge: 'normal',
      update(t) {
        this.angle = amp * Math.sin((2 * Math.PI * t) / period + ph);
        const dn = F.U.clone().scale(-Math.cos(this.angle)).addScaled(F.Rh, Math.sin(this.angle));
        col.ay.copy(dn).scale(-1); col.ax.crossVectors(col.ay, F.t).normalize();
        col.c.copy(pivot).addScaled(dn, Lp);
      },
    });
  });
  void UP; void at;
}

export default {
  id: 'luz', name: 'Luz y sombra', key: 'luz1', laps: 1, start: 'air', seed: 71,
  blurb: 'El último nivel: un edificio brutalista casi negro, en blanco y negro. Pasillos de lamas, salas con lucernarios, un pozo, compuertas que se cierran y bloques que caen.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 25.6, oro: 27, plata: 30, bronce: 33.5 },
};
