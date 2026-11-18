// Nivel: Túnel de azulejos. De noche, sobre una plaza de baldosas oscuras: dos túneles cuadrados forrados de azulejos
// que se retuercen sobre sí mismos (la sección gira a lo largo del túnel) y, entre ellos, una sala abierta de columnas
// y arcos de azulejo. Dentro de los túneles, compuertas que giran tapando más de medio paso (el centro siempre queda
// libre: quien recorta por dentro de la curva se la juega) y, en la sala, muros de azulejo que suben y bajan.
// JS puro (también se simula en Node); lo que se dibuja está en tunel-view.js.
import { kit, V3 } from './kit.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 60, 0, 'm'], [0, 55, -260, 'm'], [90, 50, -500, 'm'], [260, 72, -640, 'm'], [460, 105, -610, 'm'], [610, 115, -430, 'm'],
  [660, 85, -190, 'm'], [570, 55, 40, 'm'], [390, 42, 190, 'm'], [190, 60, 255, 'm'], [30, 85, 215, 'm'], [-110, 78, 150, 'm'], [-95, 64, 60, 'm'],
];
export const COURSE = { name: 'Túnel de azulejos', gates: GATES, boosts: [[0, 0.3], [5, 0.6], [11, 0.5]] };
export const SECTIONS = [[1, 'El primer túnel'], [5, 'La sala de columnas'], [8, 'El segundo túnel'], [11, 'La plaza']];
// los dos túneles: tramo [puerta, fracción] de entrada y salida, media anchura y giro (vueltas por cada 100 m)
export const TUNNELS = [
  { from: [0, 0.62], to: [5, 0.15], W: 18, twist: 0.2 },
  { from: [7, 0.55], to: [10, 0.75], W: 18, twist: -0.22 },
];
const MIN = { column: 16, arch: 14, block: 16, tower: 30, far: 60, ruin: 14 };

// marco girado del túnel en s: centro P, avance T y los dos ejes de la sección (A, B) girados phi
export function tunnelFrame(S, s, tun, s0) {
  const f = S.frame(s), phi = ((s - s0) / 100) * tun.twist * Math.PI * 2, c = Math.cos(phi), si = Math.sin(phi);
  const A = f.R.clone().scale(c).addScaled(f.U, si), B = f.U.clone().scale(c).addScaled(f.R, -si);
  return { P: f.P, T: f.T, A, B, phi };
}

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L, S } = K, D = T.decor;
  const inTunnel = [];

  // ---------- los túneles: cuatro paredes por tramo de 10 m, giradas con la sección ----------
  for (const tun of TUNNELS) {
    const s0 = sAt(...tun.from), s1 = sAt(...tun.to), W = tun.W, th = 3;
    tun.s0 = s0; tun.s1 = s1;
    inTunnel.push([s0 - 30, s1 + 30]);
    for (let s = s0; s < s1; s += 10) {
      const F = tunnelFrame(S, s + 5, tun, s0);
      for (let k = 0; k < 4; k++) {
        const n = k === 0 ? F.A : k === 1 ? F.B : k === 2 ? F.A.clone().scale(-1) : F.B.clone().scale(-1);
        const side = new V3().crossVectors(n, F.T).normalize();
        T.stat({ type: 'obb', c: F.P.clone().addScaled(n, W + th), h: new V3(6.5, th, W + th * 2), ax: F.T.clone(), ay: n, az: side }, 'tile');
      }
    }
    D.push({ kind: 'tunnel', s0, s1, W, twist: tun.twist });
  }
  const covered = s => inTunnel.some(([a, b]) => s > a && s < b);

  // ---------- la sala de columnas: columnas de azulejo y arcos sobre el paso ----------
  for (let s = sAt(5, 0.25); s < sAt(7, 0.45); s += 34) {
    const F = at(s);
    for (const sd of [-1, 1]) { const l = rr(26, 34), p = new V3(F.P.x + F.Rh.x * sd * l, 0, F.P.z + F.Rh.z * sd * l); K.capsule(new V3(p.x, -5, p.z), new V3(p.x, F.P.y + 40, p.z), 5.5, 'column'); }
    // arco por encima del paso (no encima de los muros que suben y bajan)
    if ([sAt(5, 0.55), sAt(6, 0.6)].some(x => Math.abs(x - s) < 45)) continue;
    const top = F.P.y + rr(26, 34);
    K.obb(new V3(F.P.x, top, F.P.z), new V3(2.5, 3, 36), F.Th.clone(), new V3(0, 1, 0), F.Rh.clone(), 'arch');
  }
  // bosque de columnas alrededor de la sala y de la plaza
  for (let k = 0; k < 140; k++) {
    const sLine = R() * L;
    if (covered(sLine)) continue;
    const F = at(sLine), sd = R() < 0.5 ? -1 : 1, l = rr(30, 240), p = new V3(F.P.x + F.Rh.x * sd * l, 0, F.P.z + F.Rh.z * sd * l), H = rr(40, 160);
    K.capsule(new V3(p.x, -5, p.z), new V3(p.x, H, p.z), rr(4, 9), 'column', { H });
  }
  // bloques y ruinas de azulejo por el suelo
  for (let k = 0; k < 90; k++) {
    const F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(30, 300), h = new V3(rr(6, 26), rr(4, 30), rr(6, 26));
    K.box(new V3(F.P.x + F.Rh.x * sd * l, h.y, F.P.z + F.Rh.z * sd * l), h, rr(0, 3.14), 'block');
  }
  // torres de azulejo alrededor
  for (let k = 0; k < 40; k++) {
    const a = R() * Math.PI * 2, d = rr(500, 1100), c = new V3(300 + Math.cos(a) * d, 0, -150 + Math.sin(a) * d), H = rr(120, 380), w = rr(20, 50);
    K.box(new V3(c.x, H / 2, c.z), new V3(w, H / 2, w), rr(0, 1.5), 'tower', { H });
  }
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2, d = rr(1500, 2300), c = new V3(300 + Math.cos(a) * d, 0, -150 + Math.sin(a) * d), H = rr(200, 600), w = rr(40, 110);
    K.box(new V3(c.x, H / 2, c.z), new V3(w, H / 2, w), rr(0, 1.5), 'far', { H });
  }
  for (const p of K.commit(MIN).kept) {
    if (p.c.type === 'capsule') D.push({ kind: p.kind, a: p.c.a, b: p.c.b, r: p.c.r });
    else if (p.c.type === 'obb') D.push({ kind: p.kind, c: p.c.c, h: p.c.h, ax: p.c.ax, ay: p.c.ay, az: p.c.az });
    else D.push({ kind: p.kind, c: p.c.c, h: p.c.h, yaw: p.c.yaw });
  }

  // ---------- obstáculos que se mueven ----------
  // compuertas giratorias dentro de los túneles: una placa que tapa de la pared hasta 7 m del centro
  TUNNELS.forEach((tun, ti) => {
    const n = ti ? 3 : 4;
    for (let j = 0; j < n; j++) {
      const s = tun.s0 + ((j + 0.7) / (n + 0.4)) * (tun.s1 - tun.s0), F = tunnelFrame(S, s, tun, tun.s0), W = tun.W, d0 = 7;
      const w = (2 * Math.PI) / (5 + j * 0.8) * (j % 2 ? -1 : 1), ph = j * 1.3 + ti;
      const col = T.tag({ type: 'obb', c: new V3(), h: new V3(1.2, (W - d0) / 2, W), ax: F.T.clone(), ay: new V3(), az: new V3() }, 'shutter');
      T.mover({
        kind: 'shutter', cols: [col], angle: 0, P: F.P, A: F.A, B: F.B, Tn: F.T, W, d0, aiDodge: 'center', bound: { c: F.P.clone(), r: W * 1.5 },
        update(t) {
          this.angle = w * t + ph; const c = Math.cos(this.angle), si = Math.sin(this.angle);
          col.ay.copy(this.A).scale(c).addScaled(this.B, si);
          col.az.crossVectors(col.ay, this.Tn).normalize();
          col.c.copy(this.P).addScaled(col.ay, (W + d0) / 2);
        },
      });
    }
  });
  // muros de azulejo que suben y bajan en la sala (se pasa por encima o por debajo)
  [[5, 0.55], [6, 0.6]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), P = F.P, period = 6.5 + k, ph = k * 2.4, col = T.tag({ type: 'box', c: P.clone(), h: new V3(3, 9, 32), yaw: F.yaw }, 'lift');
    T.mover({ kind: 'lift', cols: [col], bound: { c: P.clone(), r: 60 }, aiDodge: 'normal', update(t) { col.c.set(P.x, P.y + 30 * Math.sin((2 * Math.PI * t) / period + ph), P.z); } });
  });
}

export default {
  id: 'tunel', name: 'Túnel de azulejos', key: 'tunel1', laps: 1, start: 'air', seed: 41,
  blurb: 'De noche, dos túneles de azulejos que se retuercen sobre sí mismos, con compuertas que giran, y una sala de columnas y arcos entre ellos.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 27.5, oro: 29, plata: 32, bronce: 36 },
};
