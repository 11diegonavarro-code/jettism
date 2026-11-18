// Nivel: Escaleras rojas. Una alcazaba densa de bloques rojos escalonados (arquitectura mediterránea de muros rojos y
// azules), sin cañón: el recorrido se abre paso entre los bloques como por callejones, sube en zigzag por un patio
// (revueltas apiladas), cae en picado y atraviesa puertas estrechas en muros transversales. Tramos de escalera cruzan
// por encima y por debajo, y pasarelas unen los bloques.
// (Idea tomada de una foto de escaleras rojas: solo la idea, no la imagen.)
// Obstáculos: hojas de puerta que se cierran en algunas puertas (dejan libre el centro) y plataformas que suben y bajan.
// JS puro (también se simula en Node); lo que se dibuja está en escaleras-view.js.
import { V3, UP } from '../math.js';
import { kit } from './kit.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 40, 0, 'm'], [0, 40, -240, 'm'], [90, 85, -350, 'm'], [20, 130, -470, 'm'], [110, 180, -590, 'm'], [240, 200, -530, 'm'],
  [310, 150, -350, 'm'], [230, 100, -240, 'm'], [330, 60, -130, 'm'], [420, 40, 20, 'm'], [300, 45, 170, 'm'], [130, 60, 160, 'm'], [20, 50, 100, 'm'],
];
export const COURSE = { name: 'Escaleras rojas', gates: GATES, boosts: [[0, 0.5], [5, 0.5], [9, 0.5]] };
export const SECTIONS = [[1, 'Los callejones'], [2, 'El patio en zigzag'], [5, 'El picado'], [8, 'Las puertas']];
const MIN = { block: 15, cap: 10, stair: 11, bridge: 11, far: 60 };

export function build(T) {
  const K = kit(T), { R, rr, sAt, at, L, S } = K, D = T.decor;
  // ---------- la alcazaba: rejilla de bloques escalonados (cada celda, 1 a 3 cajas que se van retranqueando) ----------
  const cell = 34;
  for (let gx = -6; gx <= 14; gx++) for (let gz = -20; gz <= 8; gz++) {
    if (R() < 0.12) continue; // patios vacíos
    const x0 = gx * cell + rr(-4, 4), z0 = gz * cell + rr(-4, 4);
    let H = rr(30, 240), w = rr(10, 16), d = rr(10, 16), y = 0;
    for (let k = 0; k < 1 + Math.floor(R() * 3) && H > 10; k++) {
      const h = k ? rr(12, 50) : H;
      K.box(new V3(x0 + rr(-3, 3), y + h / 2, z0 + rr(-3, 3)), new V3(w, h / 2, d), 0, 'block', { lvl: k, top: y + h });
      y += h; w *= rr(0.55, 0.8); d *= rr(0.55, 0.8); H -= h;
    }
  }
  // ---------- tramos de escalera: losas inclinadas con peldaños que cruzan por encima y por debajo de la línea ----------
  for (let s = 60; s < L - 60; s += rr(45, 80)) {
    const F = at(s), up = (R() < 0.5 ? 1 : -1) * rr(12, 30), len = rr(30, 60), rise = rr(15, 30) * (R() < 0.5 ? 1 : -1);
    const ax = F.Rh.clone().scale(len).addScaled(UP, rise).normalize(), az = F.Th.clone(), ay = new V3().crossVectors(az, ax).normalize();
    K.cand.push({ c: { type: 'obb', c: new V3(F.P.x, F.P.y + up, F.P.z), h: new V3(Math.hypot(len, rise) / 2, 1.2, rr(4, 7)), ax, ay, az }, kind: 'stair', extra: { rise, len } });
  }
  // pasarelas entre bloques, por encima y por debajo
  for (let s = 40; s < L - 40; s += rr(70, 120)) { const F = at(s), up = (R() < 0.5 ? 1 : -1) * rr(14, 40); K.box(new V3(F.P.x, F.P.y + up, F.P.z), new V3(rr(2.5, 4), 1.4, rr(40, 70)), F.yaw, 'bridge'); }
  // lejos: bloques grandes alrededor
  for (let k = 0; k < 60; k++) { const a = (k / 60) * Math.PI * 2, d = rr(1200, 2000), H = rr(150, 500), w = rr(40, 100); K.box(new V3(150 + Math.cos(a) * d, H / 2, -200 + Math.sin(a) * d), new V3(w, H / 2, w), rr(0, 1), 'far', { top: H }); }
  for (const p of K.commit(MIN).kept) {
    const c = p.c;
    if (c.type === 'obb') D.push({ kind: p.kind, c: c.c, h: c.h, ax: c.ax, ay: c.ay, az: c.az, ...(p.extra || {}) });
    else D.push({ kind: p.kind, c: c.c, h: c.h, yaw: c.yaw, ...(p.extra || {}) });
  }
  // ---------- muros transversales con una puerta estrecha que hay que atravesar ----------
  const doors = [];
  for (let s = 160, k = 0; s < L - 170; s += rr(130, 190), k++) {
    const F = at(s), top = F.P.y + rr(40, 90), hole = { hw: 13, hh: 14, y: F.P.y - 12 - top / 2 };
    const col = T.stat({ type: 'archwall', c: new V3(F.P.x, top / 2, F.P.z), h: new V3(60, top / 2, 3), yaw: F.yawR, hole }, 'doorwall');
    D.push({ kind: 'arch', c: col.c, h: col.h, yaw: col.yaw, hole });
    doors.push({ F, s, k });
  }
  // ---------- obstáculos que se mueven ----------
  // hojas que se cierran en algunas puertas: dejan 8,5 m libres a cada lado del centro
  doors.filter(d => d.k % 2 === 0).forEach(({ F }, k) => {
    const period = 2.8 + k * 0.4, ph = k * 1.2, base = F.P.y - 12, cols = [-1, 1].map(() => T.tag({ type: 'box', c: new V3(), h: new V3(2, 14, 1.2), yaw: F.yawR }, 'leaf'));
    T.mover({
      kind: 'leaf', cols, bound: { c: F.P.clone(), r: 30 }, aiDodge: 'center',
      update(t) { const close = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period + ph), off = 13 - close * 4.5; cols.forEach((c, j) => { const lat = (j ? 1 : -1) * (off + 2); c.c.set(F.P.x + F.Rh.x * lat - F.Th.x * 4, base + 14, F.P.z + F.Rh.z * lat - F.Th.z * 4); }); },
    });
  });
  // plataformas que suben y bajan cruzando la línea en los callejones
  [[1, 0.5], [7, 0.5], [11, 0.5]].forEach(([i, f], k) => {
    const F = at(sAt(i, f)), P = F.P, period = 4.8 + k * 0.6, ph = k * 2, col = T.tag({ type: 'box', c: P.clone(), h: new V3(6, 2, 16), yaw: F.yaw }, 'lift');
    T.mover({ kind: 'lift', cols: [col], bound: { c: P.clone(), r: 40 }, aiDodge: 'normal', update(t) { col.c.set(P.x, P.y + 20 * Math.sin((2 * Math.PI * t) / period + ph), P.z); } });
  });
  void S;
}

export default {
  id: 'escaleras', name: 'Escaleras rojas', key: 'escaleras1', laps: 1, start: 'air', seed: 151,
  blurb: 'Una alcazaba de bloques rojos escalonados: callejones, un patio que se sube en zigzag, un picado, escaleras y pasarelas que cruzan y puertas estrechas que se cierran.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 25.8, oro: 27.8, plata: 31, bronce: 35 },
};
