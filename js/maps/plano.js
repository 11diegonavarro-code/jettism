// Nivel: Plano anotado. Una ciudad gris con grano de foto en la que solo el rojo tiene color: manzanas de edificios
// en cuadrícula, calles estrechas, y encima las anotaciones de un plano en rojo: cotas que cruzan las calles (se pasa
// por encima o por debajo), líneas de fuga que van todas a un punto en el cielo, y cajas de anotación.
// Obstáculos: cajas rojas que se vuelven sólidas y parpadean (sólo chocan cuando están llenas), láseres que barren
// la calle subiendo y bajando, y un barrido de radar que gira en la plaza.
// JS puro (también se simula en Node); lo que se dibuja está en plano-view.js.
import { kit, V3 } from './kit.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 70, 0, 'm'], [0, 45, -240, 'm'], [30, 40, -410, 'm'], [130, 40, -480, 'm'], [350, 42, -480, 'm'], [455, 50, -430, 'm'],
  [480, 60, -290, 'm'], [480, 115, -110, 'm'], [430, 135, 45, 'm'], [300, 95, 120, 'm'], [360, 70, 300, 'm'], [240, 50, 480, 'm'],
  [0, 45, 480, 'm'], [-120, 50, 360, 'm'], [-120, 55, 200, 'm'], [-60, 60, 90, 'm'],
];
export const COURSE = { name: 'Plano anotado', gates: GATES, boosts: [[0, 0.5], [3, 0.5], [9, 0.5]] };
export const SECTIONS = [[1, 'La calle'], [4, 'Las cotas'], [7, 'La plaza'], [10, 'El sur'], [13, 'La vuelta']];
export const VP = { x: 260, y: 1400, z: -2600 }; // punto de fuga en el cielo
const PITCH = 120, STREET = 40;
const MIN = { bldg: 12, roof: 10, cota: 11, far: 60, mast: 14 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L, S } = K, D = T.decor;

  // ---------- la ciudad: manzanas en cuadrícula, partidas en 1 a 4 edificios ----------
  for (let i = -8; i <= 10; i++) for (let j = -9; j <= 8; j++) {
    const cx = i * PITCH + PITCH / 2, cz = j * PITCH + PITCH / 2, half = (PITCH - STREET) / 2;
    const far = Math.hypot(cx - 200, cz) > 820;
    const split = R() < 0.5 ? 1 : 2, gap = 6;
    for (let a = 0; a < split; a++) for (let b = 0; b < split; b++) {
      const w = (half * 2 - gap * (split - 1)) / split, x = cx - half + w / 2 + a * (w + gap), z = cz - half + w / 2 + b * (w + gap);
      const H = far ? rr(80, 320) : R() < 0.15 ? rr(12, 30) : rr(70, 230);
      K.box(new V3(x, H / 2, z), new V3(w / 2, H / 2, w / 2), 0, far ? 'far' : 'bldg', { H });
    }
  }
  const city = K.commit(MIN).kept;
  for (const p of city) D.push({ kind: p.kind, c: p.c.c, h: p.c.h, H: p.extra.H });
  // casetas y depósitos en los tejados
  for (const p of city.filter(q => q.kind === 'bldg' && q.extra.H > 40)) {
    for (let k = 0, n = Math.floor(R() * 3); k < n; k++) {
      const h = new V3(rr(3, 9), rr(2, 7), rr(3, 9)), top = p.c.c.y + p.c.h.y;
      K.box(new V3(p.c.c.x + rr(-p.c.h.x + h.x, p.c.h.x - h.x), top + h.y, p.c.c.z + rr(-p.c.h.z + h.z, p.c.h.z - h.z)), h, 0, 'roof');
    }
  }
  for (const p of K.commit(MIN).kept) D.push({ kind: 'roof', c: p.c.c, h: p.c.h });

  // ---------- cotas: líneas rojas que cruzan la calle por encima o por debajo de la línea ----------
  for (let s = 140, k = 0; s < L - 120; s += rr(55, 90), k++) {
    const F = at(s), up = (k % 2 ? 1 : -1) * rr(13, 22), y = F.P.y + up;
    if (y < 6 || Math.abs(s - sAt(7, 0.5)) < 130) continue; // no encima del barrido de la plaza (se esquiva por arriba)
    const a = new V3(F.P.x - F.Rh.x * 34, y, F.P.z - F.Rh.z * 34), b = new V3(F.P.x + F.Rh.x * 34, y, F.P.z + F.Rh.z * 34);
    K.capsule(a, b, 0.7, 'cota');
  }
  for (const p of K.commit(MIN).kept) D.push({ kind: 'cota', a: p.c.a, b: p.c.b });
  // líneas de fuga (solo se dibujan): de las esquinas de los tejados al punto de fuga
  for (const p of city.filter(q => q.kind === 'bldg')) if (R() < 0.18) {
    const c = p.c.c, h = p.c.h, sx = R() < 0.5 ? -1 : 1, sz = R() < 0.5 ? -1 : 1;
    D.push({ kind: 'vanish', a: new V3(c.x + sx * h.x, c.y + h.y, c.z + sz * h.z) });
  }
  // cajas de anotación vacías (solo se dibujan) alrededor de algunos edificios
  for (const p of city.filter(q => q.kind === 'bldg')) if (R() < 0.1) D.push({ kind: 'note', c: p.c.c, h: p.c.h.clone().scale(1.06) });

  // ---------- obstáculos que se mueven ----------
  // cajas que se vuelven sólidas y parpadean, tapando un lado de la calle (vacías no chocan; el centro queda libre)
  [[1, 0.55, 1], [3, 0.35, -1], [4, 0.6, 1], [10, 0.4, -1], [6, 0.5, -1], [12, 0.5, 1]].forEach(([i, f, sd], k) => {
    const F = at(sAt(i, f)), c0 = new V3(F.P.x + F.Rh.x * sd * 14, F.P.y, F.P.z + F.Rh.z * sd * 14), period = 3.2 + k * 0.3, ph = k * 0.9;
    const col = T.tag({ type: 'box', c: c0.clone(), h: new V3(8, 9, 6), yaw: F.yawR }, 'note');
    T.mover({
      kind: 'note', cols: [col], solid: true, blink: 0, c0, aiDodge: 'center', bound: { c: c0.clone(), r: 30 },
      update(t) {
        const u = (((t + ph) / period) % 1 + 1) % 1;
        this.solid = u < 0.5; this.blink = u > 0.38 && u < 0.5 ? 1 : 0; // parpadea justo antes de vaciarse
        col.c.copy(c0); if (!this.solid) col.c.y = -500;
      },
    });
  });
  // láseres que barren la calle subiendo y bajando
  [[2, 0.25], [5, 0.7], [11, 0.5]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), P = F.P, period = 6.5 + k, ph = k * 1.7;
    const col = T.tag({ type: 'capsule', a: new V3(), b: new V3(), r: 1.2 }, 'laser');
    T.mover({
      kind: 'laser', cols: [col], bound: { c: P.clone(), r: 50 }, aiDodge: 'normal',
      update(t) { const y = P.y + 20 * Math.sin((2 * Math.PI * t) / period + ph); col.a.set(P.x - F.Rh.x * 30, y, P.z - F.Rh.z * 30); col.b.set(P.x + F.Rh.x * 30, y, P.z + F.Rh.z * 30); },
    });
  });
  // barrido de radar en la plaza: un láser que gira desde un mástil al lado de la línea
  {
    const F = at(sAt(7, 0.5)), mast = new V3(F.P.x + F.Rh.x * 55, 0, F.P.z + F.Rh.z * 55), y = F.P.y, len = 95, w = (2 * Math.PI) / 6.5;
    T.stat({ type: 'capsule', a: mast.clone(), b: new V3(mast.x, y + 12, mast.z), r: 3 }, 'mast');
    D.push({ kind: 'mast', a: mast.clone(), b: new V3(mast.x, y + 12, mast.z) });
    const col = T.tag({ type: 'capsule', a: new V3(mast.x, y, mast.z), b: new V3(), r: 1.2 }, 'laser');
    T.mover({
      kind: 'radar', cols: [col], angle: 0, bound: { c: new V3(mast.x, y, mast.z), r: len + 5 }, aiDodge: 'up', aiUp: 20,
      update(t) { this.angle = w * t; col.b.set(mast.x + Math.cos(this.angle) * len, y, mast.z + Math.sin(this.angle) * len); },
    });
  }
  void S;
}

export default {
  id: 'plano', name: 'Plano anotado', key: 'plano1', laps: 1, start: 'air', seed: 53,
  blurb: 'Una ciudad gris con grano de foto donde solo el rojo tiene color: cotas que cruzan las calles, líneas de fuga, cajas que se vuelven sólidas y láseres que barren.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 28.2, oro: 29.6, plata: 32.5, bronce: 36 },
};
