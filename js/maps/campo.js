// Nivel: Campo de líneas. Un campo negro de rayas violetas que ondulan hasta el horizonte, bajo un crepúsculo violeta.
// Por el campo pasan olas de rayas que se levantan (el suelo sube de verdad: hay que saltarlas) y ruedan despacio
// esferas de cromo que doblan las rayas a su paso. Se vuela a ras de las ondas siguiendo la línea roja y la dorada.
// (Idea tomada de una portada de disco: solo la idea de rayas que fluyen alrededor de esferas, no la imagen.)
// JS puro (también se simula en Node); lo que se dibuja está en campo-view.js, con el mismo relieve en el sombreador.
import { kit, V3 } from './kit.js';

// ---------- el relieve (el sombreador de campo-view.js usa exactamente las mismas cuentas) ----------
export const FIELD = { d1: [0.958, 0.287], s1: 22, p1: 300, a1: 26, w1: 20, d2: [-0.371, 0.928], s2: 17, p2: 410, a2: 24, w2: 22 };
export const fieldStatic = (x, z) => 10 + 6 * Math.sin(0.011 * x + 0.7 * Math.sin(0.005 * z)) + 5 * Math.sin(0.013 * z - 0.004 * x);
const wave = (u, t, sp, per, amp, w) => { const ph = ((((u - sp * t) % per) + per) % per) - per / 2; return amp * Math.exp(-((ph / w) ** 2)); };
export function fieldAt(x, z, t) {
  const F = FIELD;
  return fieldStatic(x, z) + Math.max(wave(F.d1[0] * x + F.d1[1] * z, t, F.s1, F.p1, F.a1, F.w1), wave(F.d2[0] * x + F.d2[1] * z, t, F.s2, F.p2, F.a2, F.w2));
}

const PLAN = [[0, 0], [150, -250], [80, -520], [260, -720], [540, -700], [700, -480], [620, -220], [780, 20], [640, 260], [380, 300], [200, 140], [-60, 220], [-180, 60]];
const GATES = PLAN.map(([x, z]) => [x, Math.round(fieldStatic(x, z) + 24), z, 'm']);
export const COURSE = { name: 'Campo de líneas', gates: GATES, boosts: [[1, 0.5], [5, 0.5], [9, 0.5]] };
export const SECTIONS = [[2, 'Las ondas'], [5, 'Las esferas'], [8, 'Las olas'], [11, 'La vuelta']];
const MIN = { orb: 16, far: 80, pillar: 16 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L } = K, D = T.decor;
  // esferas de cromo medio hundidas en el campo, y otras enormes a lo lejos
  for (let k = 0; k < 60; k++) {
    const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(40, 400), r = rr(8, 34), x = F.P.x + F.Rh.x * sd * l, z = F.P.z + F.Rh.z * sd * l;
    K.sphere(new V3(x, fieldStatic(x, z) + r * rr(0.1, 0.6), z), r, 'orb');
  }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2 + rr(-0.1, 0.1), d = rr(1300, 2200), r = rr(90, 260), x = 300 + Math.cos(a) * d, z = -200 + Math.sin(a) * d; K.sphere(new V3(x, fieldStatic(x, z) + r * rr(0.2, 0.8), z), r, 'far'); }
  // columnas finas de rayas (como hilos que suben del campo)
  for (let k = 0; k < 26; k++) {
    const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(30, 160), x = F.P.x + F.Rh.x * sd * l, z = F.P.z + F.Rh.z * sd * l;
    K.capsule(new V3(x, -5, z), new V3(x, rr(60, 180), z), rr(1.5, 3), 'pillar');
  }
  for (const p of K.commit(MIN).kept) D.push(p.c.type === 'sphere' ? { kind: p.kind, c: p.c.c, r: p.c.r } : { kind: p.kind, a: p.c.a, b: p.c.b, r: p.c.r });

  // esferas de cromo que ruedan despacio cruzando la línea, apoyadas en el campo
  [[1, 0.3], [3, 0.6], [5, 0.4], [6, 0.7], [8, 0.5], [10, 0.4], [11, 0.7]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), r = 14 + (k % 3) * 5, amp = 70 + (k % 2) * 30, period = 16 + k * 1.5, ph = k * 1.9, dir = F.Rh.clone();
    const col = T.tag({ type: 'sphere', c: F.P.clone(), r }, 'chrome');
    T.mover({
      kind: 'chrome', cols: [col], r, roll: 0, dir, bound: { c: F.P.clone(), r: amp + r + 10 }, aiDodge: 'normal',
      update(t) {
        const off = amp * Math.sin((2 * Math.PI * t) / period + ph), x = F.P.x + dir.x * off, z = F.P.z + dir.z * off;
        this.roll = off / r; col.c.set(x, fieldStatic(x, z) + r, z);
      },
    });
  });
}

export default {
  id: 'campo', name: 'Campo de líneas', key: 'campo1', laps: 1, start: 'air', seed: 67,
  blurb: 'Un campo negro de rayas violetas bajo el crepúsculo: olas de rayas que se levantan y hay que saltar, y esferas de cromo que ruedan doblando las líneas.',
  course: COURSE, sections: SECTIONS, build, groundAt: fieldAt,
  medals: { autor: 44.8, oro: 47, plata: 51, bronce: 56 },
};
