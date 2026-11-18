// Mapa: Torres turquesa. Pasajes altos de fachadas turquesa con arcos (kit de arquitectura) por una ciudad de torres brutalistas turquesa sobre una bruma rosa, unidas por pasarelas, con
// voladizos, esferas flotando y una pasarela blanca larga abajo del todo. El recorrido atraviesa torres por túneles,
// pasa bajo y sobre las pasarelas y baja en picado hasta la pasarela blanca.
// Obstáculos: esferas que orbitan cruzando la línea, losas que salen de las fachadas y plataformas que suben y bajan.
// JS puro (también se simula en Node); lo que se dibuja está en torres-view.js.
import { clamp } from '../math.js';
import { kit, V3, yawFromRight } from './kit.js';
import { AI_NARROW } from '../ai.js';
import { buildCanyon } from './canyon.js';

const GATES = [
  [0, 140, 0, 'm'], [20, 150, -250, 'm'], [-60, 190, -500, 'm'], [-200, 230, -720, 'm'], [-80, 210, -950, 'm'],
  [200, 170, -1050, 'm'], [450, 130, -930, 'm'], [620, 85, -720, 'm'], [700, 50, -450, 'm'], [680, 50, -200, 'm'],
  [560, 110, 50, 'm'], [380, 170, 220, 'm'], [180, 160, 220, 'm'], [40, 145, 140, 'm'],
];
export const COURSE = { name: 'Torres turquesa', gates: GATES, boosts: [[2, 0.55], [7, 0.55], [11, 0.4]] };
// zona de cada tramo (kit de arquitectura): pasajes altos de fachadas turquesa con arcos, salas abiertas entre torres;
// al aire libre en la pasarela blanca sobre la bruma
const P = { W: 34, top: [120, 260], floor: 50, ceil: 0, arches: 130, archHW: 24, archHH: 30 };
export const ZONES = [P, P, { W: 60, top: [140, 300], floor: 0, ceil: 0 }, { W: 60, top: [140, 300], floor: 0, ceil: 0 }, P, { open: true }, { W: 60, top: [120, 260], floor: 0, ceil: 0 }, { open: true }, { open: true }, { open: true }, { W: 42, top: [120, 240], floor: 0, ceil: 0, arches: 120 }, { W: 42, top: [120, 240], floor: 0, ceil: 0 }, P, P];
export const SECTIONS = [[1, 'El túnel de la torre'], [3, 'Las pasarelas'], [7, 'La pasarela blanca'], [10, 'Las esferas'], [12, 'La última torre']];
// holgura mínima con la línea por tipo de pieza
const MIN = { tower: 30, bridge: 24, cant: 24, roof: 24, sphere: 22, walk: 10, pillar: 12, far: 60, art: 10 };

export function build(T) {
  const K = kit(T), { S, R, rr, sAt, at } = K, D = T.decor;
  buildCanyon(T, ZONES, { sculpt: 0.4 });

  // ---------- torres que el recorrido atraviesa por un túnel ----------
  const portals = [];
  for (const [i, f, H] of [[1, 0, 300], [4, 0, 290], [12, 0, 270]]) {
    const F = at(sAt(i, f)), P = F.P, hw = 19, hh = 19, depth = 22, side = 18;
    const parts = [
      [new V3(P.x - F.Rh.x * (hw + side / 2), H / 2, P.z - F.Rh.z * (hw + side / 2)), new V3(side / 2, H / 2, depth)],
      [new V3(P.x + F.Rh.x * (hw + side / 2), H / 2, P.z + F.Rh.z * (hw + side / 2)), new V3(side / 2, H / 2, depth)],
      [new V3(P.x, (P.y + hh + H) / 2, P.z), new V3(hw, (H - P.y - hh) / 2, depth)],
      [new V3(P.x, (P.y - hh) / 2, P.z), new V3(hw, (P.y - hh) / 2, depth)],
    ];
    for (const [c, h] of parts) T.stat({ type: 'box', c, h, yaw: F.yawR }, 'portal');
    portals.push(P);
    D.push({ kind: 'portal', P, yaw: F.yawR, hw, hh, depth, H, side });
  }
  // torres de las losas que salen de la fachada (la losa se esconde dentro al recogerse)
  const slabs = [];
  [[5, 0.6, 1], [8, 0.4, -1], [9, 0.4, 1]].forEach(([i, f, sd]) => {
    const F = at(sAt(i, f)), P = F.P, H = P.y + 150, c = new V3(P.x + F.Rh.x * sd * 77, H / 2, P.z + F.Rh.z * sd * 77);
    T.stat({ type: 'box', c, h: new V3(30, H / 2, 18), yaw: F.yawR }, 'tower');
    D.push({ kind: 'tower', c, h: new V3(30, H / 2, 18), yaw: F.yawR, H });
    slabs.push({ F, sd });
  });

  // ---------- la ciudad: una cuadrícula de torres (las que estorben a la línea se quitan) ----------
  for (let gx = -680; gx <= 980; gx += 90) for (let gz = -1320; gz <= 680; gz += 90) {
    const x = gx + rr(-26, 26), z = gz + rr(-26, 26), w = rr(24, 60), d = rr(24, 60), H = R() < 0.18 ? rr(45, 120) : rr(150, 540);
    if (portals.some(p => Math.hypot(p.x - x, p.z - z) < 95)) continue;
    K.box(new V3(x, H / 2, z), new V3(w / 2, H / 2, d / 2), R() < 0.75 ? 0 : rr(-0.5, 0.5), 'tower', { H });
  }
  // skyline lejano, más alto
  for (let k = 0; k < 90; k++) {
    const a = R() * Math.PI * 2, r = rr(1500, 2600), x = 150 + Math.cos(a) * r, z = -330 + Math.sin(a) * r, H = rr(250, 900), w = rr(50, 140);
    K.box(new V3(x, H / 2, z), new V3(w / 2, H / 2, rr(40, 120) / 2), rr(-0.6, 0.6), 'far', { H });
  }
  const towers = K.commit(MIN).kept;
  for (const t of towers) D.push({ kind: t.kind === 'far' ? 'far' : 'tower', c: t.c.c, h: t.c.h, yaw: t.c.yaw, H: t.extra.H });

  // ---------- voladizos, remates de tejado y pasarelas entre torres ----------
  const city = towers.filter(t => t.kind === 'tower');
  const local = (t, lx, ly, lz) => { const c = Math.cos(t.c.yaw), s = Math.sin(t.c.yaw); return new V3(t.c.c.x + lx * c + lz * s, t.c.c.y + ly, t.c.c.z - lx * s + lz * c); };
  for (const t of city) {
    const h = t.c.h;
    for (let j = 0, n = 2 + Math.floor(R() * 4); j < n; j++) {
      const face = Math.floor(R() * 4), out = rr(6, 18), wid = rr(8, 22), tall = rr(6, 20), y = rr(-h.y + 25, h.y - tall - 5);
      const along = face < 2, sgn = face % 2 ? 1 : -1;
      const lx = along ? sgn * (h.x + out / 2) : rr(-h.x + wid / 2, h.x - wid / 2), lz = along ? rr(-h.z + wid / 2, h.z - wid / 2) : sgn * (h.z + out / 2);
      K.box(local(t, lx, y, lz), along ? new V3(out / 2, tall / 2, wid / 2) : new V3(wid / 2, tall / 2, out / 2), t.c.yaw, 'cant');
    }
    for (let j = 0, n = Math.floor(R() * 3); j < n; j++) {
      const w = rr(6, Math.min(h.x, 18)), d = rr(6, Math.min(h.z, 18)), hh = rr(4, 16);
      K.box(local(t, rr(-h.x + w, h.x - w), h.y + hh / 2, rr(-h.z + d, h.z - d)), new V3(w / 2, hh / 2, d / 2), t.c.yaw, 'roof');
    }
  }
  for (let i = 0; i < city.length; i++) for (let j = i + 1; j < city.length; j++) {
    const a = city[i].c, b = city[j].c, dx = b.c.x - a.c.x, dz = b.c.z - a.c.z, dist = Math.hypot(dx, dz);
    if (dist < 70 || dist > 175 || R() > 0.22) continue;
    const top = Math.min(a.c.y + a.h.y, b.c.y + b.h.y) - 15;
    if (top < 50) continue;
    const y = rr(35, top), dir = new V3(dx / dist, 0, dz / dist);
    K.box(new V3((a.c.x + b.c.x) / 2, y, (a.c.z + b.c.z) / 2), new V3(dist / 2, rr(2, 3.5), rr(4, 7)), yawFromRight(dir), 'bridge');
  }
  // tramo de las pasarelas: cruzan por encima y por debajo de la línea, una tras otra
  for (let s = sAt(2, 0.55), k = 0; s < sAt(3, 0.7); s += 46, k++) {
    const F = at(s), up = (k % 2 ? 1 : -1) * rr(15, 26);
    K.box(new V3(F.P.x, F.P.y + up, F.P.z), new V3(6, 2.4, 75), F.yaw, 'bridge');
  }
  // la pasarela blanca, larga y baja, con sus pilares
  for (let s = sAt(7, 0.3); s < sAt(9, 0.8); s += 18) {
    const F = at(s);
    K.box(new V3(F.P.x, 30, F.P.z), new V3(9.6, 1, 7), F.yaw, 'walk');
    if (Math.round(s / 18) % 3 === 0) K.box(new V3(F.P.x, 14.5, F.P.z), new V3(1.4, 14.5, 1.4), F.yaw, 'pillar');
  }
  // esferas flotando entre las torres
  for (let k = 0; k < 40; k++) {
    const F = at(R() * S.length), sd = R() < 0.5 ? 1 : -1, l = rr(26, 140), r = rr(7, 26);
    K.sphere(new V3(F.P.x + F.Rh.x * sd * l, F.P.y + rr(-50, 140), F.P.z + F.Rh.z * sd * l), r, 'sphere');
  }
  const extra = K.commit(MIN).kept;
  for (const p of extra) D.push(p.c.type === 'sphere' ? { kind: 'sphere', c: p.c.c, r: p.c.r } : { kind: p.kind, c: p.c.c, h: p.c.h, yaw: p.c.yaw });
  // figuras diminutas en la pasarela blanca (como en el cuadro)
  for (const f of [0.3, 0.55, 0.85]) { const F = at(sAt(8, f)); D.push({ kind: 'figure', p: new V3(F.P.x + F.Rh.x * 3, 31, F.P.z + F.Rh.z * 3) }); }

  // ---------- obstáculos que se mueven ----------
  // esferas que orbitan cruzando la línea
  [[5, 0.4, 1], [10, 0.55, -1], [11, 0.4, 1]].forEach(([i, f, sd]) => {
    const F = at(sAt(i, f)), C = new V3(F.P.x + F.Rh.x * sd * 10, F.P.y, F.P.z + F.Rh.z * sd * 10), Ro = 26, r = 9;
    const w = (2 * Math.PI) / rr(9, 12) * (R() < 0.5 ? 1 : -1), ph = R() * 6.28, col = T.tag({ type: 'sphere', c: C.clone(), r }, 'orb');
    const { Rh, Th } = F;
    T.mover({
      kind: 'orb', cols: [col], C, Ro, r, bound: { c: C.clone(), r: Ro + r + 5 }, aiDodge: 'normal',
      update(t) { const a = w * t + ph; col.c.set(C.x + (Math.cos(a) * Rh.x + Math.sin(a) * Th.x) * Ro, C.y + Math.sin(a * 2) * 3, C.z + (Math.cos(a) * Rh.z + Math.sin(a) * Th.z) * Ro); },
    });
  });
  // losas que salen de la fachada hasta casi el centro del paso
  slabs.forEach(({ F, sd }) => {
    const { P, Rh } = F, emax = 42, period = rr(4.5, 6.5), ph = R() * 6.28, col = T.tag({ type: 'box', c: new V3(), h: new V3(9, 7, 22), yaw: F.yawR }, 'slab');
    T.mover({
      kind: 'slab', cols: [col], e: 0, bound: { c: P.clone(), r: 110 },
      update(t) { this.e = emax * clamp(0.5 + 0.9 * Math.sin((2 * Math.PI * t) / period + ph), 0, 1); const lat = sd * (47 + 22 - this.e); col.c.set(P.x + Rh.x * lat, P.y, P.z + Rh.z * lat); },
    });
  });
  // plataformas que suben y bajan atravesando el paso (se pasa por encima o por debajo)
  [[2, 0.3], [6, 0.5]].forEach(([i, f]) => {
    const F = at(sAt(i, f)), P = F.P, period = rr(6, 7.5), ph = R() * 6.28, col = T.tag({ type: 'box', c: P.clone(), h: new V3(7, 2.5, 46), yaw: F.yaw }, 'lift');
    T.mover({
      kind: 'lift', cols: [col], bound: { c: P.clone(), r: 70 }, aiDodge: 'normal',
      update(t) { col.c.set(P.x, P.y + 34 * Math.sin((2 * Math.PI * t) / period + ph), P.z); },
    });
  });
  // corriente que te sube desde la pasarela blanca
  { const F = at(sAt(9, 0.55)); T.thermals.push({ c: new V3(F.P.x, 0, F.P.z), r: 30, top: F.P.y + 110, k: 15 }); }
}

export default {
  id: 'torres', name: 'Torres turquesa', key: 'torres1', laps: 1, start: 'air', seed: 23,
  blurb: 'Ciudad de torres turquesa sobre una bruma rosa: túneles que atraviesan torres, pasarelas, esferas que orbitan y una pasarela blanca abajo del todo.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 34.4, oro: 36, plata: 39.5, bronce: 44 },
};
