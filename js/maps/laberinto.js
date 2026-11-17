// Mapa: Laberinto de hormigón. Un cañón de hormigón visto: muros enormes con arcos, losas en voladizo, rampas curvas
// que cruzan por encima y por debajo, una escalinata gigante, un sótano de pilares y un pozo de luz.
// Obstáculos: pistones que salen de las paredes, compuertas que se abren y se cierran en un arco y unas aspas giratorias.
// JS puro (también se simula en Node); lo que se dibuja está en laberinto-view.js.
import { V3, UP, clamp } from '../math.js';
import { sdf, yawFromRight } from '../track.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 110, 0, 'm'], [0, 112, -240, 'm'], [10, 118, -480, 'm'], [90, 140, -690, 'm'], [300, 160, -800, 'm'],
  [520, 150, -740, 'm'], [660, 125, -560, 'm'], [700, 85, -330, 'm'], [690, 55, -100, 'm'], [600, 50, 120, 'm'],
  [430, 65, 260, 'm'], [240, 120, 290, 'm'], [130, 170, 230, 'm'], [20, 140, 150, 'm'],
];
export const COURSE = { name: 'Laberinto de hormigón', gates: GATES, boosts: [[1, 0.55], [6, 0.5], [11, 0.5]] };
export const SECTIONS = [[3, 'Sala de las rampas'], [6, 'La escalinata'], [8, 'El sótano'], [10, 'Pozo de luz']];

// Ancho (medio pasillo), altura de los muros, suelo y techo de cada tramo
const ZONES = {
  galeria: { W: 27, top: [85, 160], floor: 46, ceil: 40, ceilP: 0.5 },
  rampas: { W: 80, top: [130, 200], floor: 72, ceil: 0, ceilP: 0 },
  escalinata: { W: 32, top: [95, 150], floor: 0, ceil: 0, ceilP: 0 },
  sotano: { W: 58, top: [30, 30], floor: 22, ceil: 24, ceilP: 0.86 },
  pozo: { W: 31, top: [210, 280], floor: 0, ceil: 0, ceilP: 0 },
};
// Holgura mínima con la línea del recorrido según la pieza (lo que quede más cerca se quita)
const MIN = { wall: 9, floor: 10, ceil: 10, ledge: 10, pillar: 12, step: 14, beam: 11, ramp: 12, bg: 40, drum: 20 };

export function build(T) {
  const S = T.spline, R = T.rand, cp = S.cpS, L = S.length;
  const sAt = (i, f = 0) => cp[i] + ((i + 1 < cp.length ? cp[i + 1] : L) - cp[i]) * f;
  const B = { r0: sAt(3, 0), e0: sAt(5, 0.5), s0: sAt(7, 0.45), p0: sAt(10, 0.3), g0: sAt(12, 0.55) };
  const zoneOf = s => { s = S.wrap(s); return s >= B.g0 || s < B.r0 ? 'galeria' : s < B.e0 ? 'rampas' : s < B.s0 ? 'escalinata' : s < B.p0 ? 'sotano' : 'pozo'; };
  const rr = (a, b) => a + R() * (b - a);
  // marco horizontal del recorrido en s: punto, avance (Th) y lado derecho (Rh) en horizontal
  const at = s => {
    const P = S.pointAt(s), t = S.tangentAt(s), Th = new V3(t.x, 0, t.z).normalize();
    return { P, Th, Rh: new V3(-Th.z, 0, Th.x), yaw: yawFromRight(Th), yawR: yawFromRight(new V3(-Th.z, 0, Th.x)) };
  };
  const cand = []; // piezas candidatas: se comprueba su holgura antes de añadirlas
  const box = (c, h, yaw, kind, vis) => cand.push({ c: { type: 'box', c, h, yaw }, kind, vis });

  // ---------- muros, suelos, techos y repisas a lo largo del recorrido ----------
  const SEG = 20, lights = [];
  for (let s = 0; s < L; s += SEG) {
    const z = ZONES[zoneOf(s)], f = at(s);
    for (const sd of [-1, 1]) {
      const inner = z.W + rr(0, 3), depth = rr(12, 30), top = f.P.y + rr(z.top[0], z.top[1]);
      const lat = inner + depth / 2;
      const c = new V3(f.P.x + f.Rh.x * sd * lat, top / 2, f.P.z + f.Rh.z * sd * lat);
      // el colisionador sobresale 1,5 m más que la pared, para cubrir los relieves que se dibujan en ella
      const cc = new V3(f.P.x + f.Rh.x * sd * (lat - 0.75), top / 2, f.P.z + f.Rh.z * sd * (lat - 0.75));
      box(cc, new V3(SEG / 2 + 0.6, top / 2, depth / 2 + 0.75), f.yaw, 'wall', { c, h: new V3(SEG / 2 + 0.6, top / 2, depth / 2), yaw: f.yaw, side: sd, inner, s });
      // capa de fuera, más alta y más irregular (se ve por los huecos)
      if (R() < 0.55) {
        const d2 = rr(20, 60), l2 = inner + depth + rr(4, 30) + d2 / 2, t2 = top + rr(-40, 120);
        box(new V3(f.P.x + f.Rh.x * sd * l2, t2 / 2, f.P.z + f.Rh.z * sd * l2), new V3(SEG / 2 + rr(2, 14), t2 / 2, d2 / 2), f.yaw + rr(-0.08, 0.08), 'wall', null);
      }
      // voladizos grandes por encima y por debajo de la franja de vuelo (con colisión; los que estorben se quitan)
      for (let j = 0, nj = 1 + Math.floor(R() * 3); j < nj; j++) {
        const up = (R() < 0.5 ? 1 : -1) * rr(24, 70), out = rr(4, 13), hy = rr(3, 12), l4 = inner - out / 2;
        if (f.P.y + up - hy < 2) continue;
        box(new V3(f.P.x + f.Rh.x * sd * l4, f.P.y + up, f.P.z + f.Rh.z * sd * l4), new V3(rr(3, 10), hy, out / 2 + 0.5), f.yaw, 'ledge', null);
      }
      // repisas y voladizos que salen de la pared por encima o por debajo de la línea
      if (R() < 0.3 && z.W < 40) {
        const up = (R() < 0.5 ? 1 : -1) * rr(19, 34), dep = rr(5, 10), l3 = inner - dep / 2;
        box(new V3(f.P.x + f.Rh.x * sd * l3, f.P.y + up, f.P.z + f.Rh.z * sd * l3), new V3(rr(5, 11), rr(1, 2.5), dep / 2), f.yaw, 'ledge', null);
      }
    }
    if (z.floor) box(new V3(f.P.x, f.P.y - z.floor - 2.5, f.P.z), new V3(SEG / 2 + 0.6, 2.5, z.W + 2), f.yaw, 'floor', null);
    if (z.ceil) {
      if (R() < z.ceilP) box(new V3(f.P.x, f.P.y + z.ceil + 3, f.P.z), new V3(SEG / 2 + 0.6, 3, z.W + 2), f.yaw, 'ceil', null);
      else lights.push({ p: new V3(f.P.x, f.P.y + z.ceil, f.P.z), w: z.W, h: z.ceil + (z.floor || 40), yaw: f.yaw });
    }
  }

  // ---------- galería: muros transversales con un arco que hay que atravesar ----------
  const arches = [];
  const gateNear = s => cp.some(g => Math.min(Math.abs(S.wrap(s - g)), Math.abs(S.wrap(g - s))) < 30);
  for (let s = B.g0 + 40; s < B.g0 + 40 + (L - B.g0 + B.r0) - 60; s += 86) {
    if (gateNear(s)) s += 34;
    const f = at(S.wrap(s)), top = f.P.y + 130, W = ZONES.galeria.W;
    const hole = { hw: 24, hh: 32, y: f.P.y - 20 - top / 2 };
    const col = T.stat({ type: 'archwall', c: new V3(f.P.x, top / 2, f.P.z), h: new V3(W + 28, top / 2, 4), yaw: f.yawR, hole }, 'arch');
    arches.push({ col, f, s: S.wrap(s), hole, top });
  }
  // compuertas en uno de los arcos: dos hojas que se abren y se cierran (se puede pasar por el arco de arriba)
  {
    const a = arches.reduce((b, x) => (Math.abs(x.s - sAt(1, 0.5)) < Math.abs(b.s - sAt(1, 0.5)) ? x : b), arches[0]);
    a.doors = true;
    const base = a.f.P.y - 20, hw = 15, cols = [-1, 1].map(() => T.tag({ type: 'box', c: new V3(), h: new V3(hw, 13, 1.2), yaw: a.f.yawR }, 'door'));
    const { P, Rh, Th } = a.f;
    T.mover({
      kind: 'doors', cols, P, Rh, Th, base, hw, gap: 0, bound: { c: P.clone(), r: 60 }, aiIgnore: true, // siempre dejan 20 m en el centro: los bots pasan por ahí
      update(t) {
        this.gap = 20 + 26 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 5.5));
        cols.forEach((c, k) => {
          const lat = (k ? 1 : -1) * (this.gap / 2 + hw);
          c.c.set(P.x + Rh.x * lat - Th.x * 5.6, base + 15, P.z + Rh.z * lat - Th.z * 5.6);
        });
      },
    });
  }

  // ---------- pistones que salen de las paredes (galería y escalinata) ----------
  const pistonAt = [];
  // ninguno en los 150 m antes de la meta: la salida lanzada pasa por ahí
  for (const a of arches) if (!a.doors && S.wrap(a.s + 43) < L - 150 && S.wrap(a.s + 43) > 60) pistonAt.push(S.wrap(a.s + 43));
  for (const f of [0.45, 0.72]) pistonAt.push(B.e0 + (B.s0 - B.e0) * f);
  pistonAt.forEach((s, k) => {
    const f = at(s), W = ZONES[zoneOf(s)].W, sd = k % 2 ? 1 : -1, emax = W * (0.5 + R() * 0.15), period = 3.8 + R() * 2.2, phase = R() * 6.28, dy = rr(-4, 4);
    const col = T.tag({ type: 'box', c: new V3(), h: new V3(8, 10, 20), yaw: f.yaw }, 'piston');
    const { P, Rh } = f;
    T.mover({
      kind: 'piston', cols: [col], P, Rh, sd, W, e: 0, yaw: f.yaw, bound: { c: P.clone(), r: W + 50 },
      update(t) {
        this.e = emax * clamp(0.5 + 0.9 * Math.sin((2 * Math.PI * t) / period + phase), 0, 1);
        const lat = sd * (W + 20 - this.e);
        col.c.set(P.x + Rh.x * lat, P.y + dy, P.z + Rh.z * lat);
      },
    });
  });

  // ---------- sala de las rampas: rampas curvas por encima y por debajo, un tambor con rampa en espiral y unas aspas ----------
  const ramps = [];
  const ramp = (pts, width) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1], ax = new V3().subVectors(b, a), len = ax.len();
      ax.scale(1 / len);
      const az = new V3().crossVectors(ax, UP).normalize(), ay = new V3().crossVectors(az, ax).normalize();
      cand.push({ c: { type: 'obb', c: a.clone().lerp(b, 0.5), h: new V3(len / 2 + 0.6, 1.2, width / 2), ax, ay, az }, kind: 'ramp', vis: null, keep: true });
    }
    ramps.push({ pts, width });
  };
  {
    const f = at(sAt(3, 0.62));
    ramp(Array.from({ length: 19 }, (_, k) => { const u = k / 18, lat = -90 + 180 * u; return new V3(f.P.x + f.Rh.x * lat + f.Th.x * 18 * Math.sin(Math.PI * u), f.P.y + 27 + 14 * (u - 0.5), f.P.z + f.Rh.z * lat + f.Th.z * 18 * Math.sin(Math.PI * u)); }), 13);
    const g = at(sAt(4, 0.55));
    ramp(Array.from({ length: 19 }, (_, k) => { const u = k / 18, lat = -90 + 180 * u; return new V3(g.P.x + g.Rh.x * lat - g.Th.x * 22 * Math.sin(Math.PI * u), g.P.y - 25 - 10 * (u - 0.5), g.P.z + g.Rh.z * lat - g.Th.z * 22 * Math.sin(Math.PI * u)); }), 13);
    // tambor con rampa en espiral, a la derecha del recorrido
    const h = at(sAt(4, 0)), dc = new V3(h.P.x + h.Rh.x * 62, 0, h.P.z + h.Rh.z * 62), y0 = h.P.y - 75, y1 = h.P.y + 75;
    cand.push({ c: { type: 'capsule', a: new V3(dc.x, -20, dc.z), b: new V3(dc.x, y1 + 30, dc.z), r: 13 }, kind: 'drum', vis: { a: new V3(dc.x, 0, dc.z), b: new V3(dc.x, y1 + 30, dc.z), r: 13 } });
    ramp(Array.from({ length: 49 }, (_, k) => { const u = k / 48, an = u * Math.PI * 4; return new V3(dc.x + Math.cos(an) * 25, y0 + (y1 - y0) * u, dc.z + Math.sin(an) * 25); }), 11);
    // aspas giratorias a la izquierda, que barren el paso de la puerta 5
    const sp = at(sAt(4, 0.12)), c0 = new V3(sp.P.x - sp.Rh.x * 26, sp.P.y, sp.P.z - sp.Rh.z * 26);
    const blades = [0, 1].map(() => T.tag({ type: 'box', c: c0.clone(), h: new V3(52, 3.5, 2.5), yaw: 0 }, 'spinner'));
    T.mover({
      kind: 'spinner', cols: blades, c: c0, yaw: 0, bound: { c: c0.clone(), r: 60 }, aiDodge: 'up',
      update(t) { this.yaw = 0.42 * t; blades[0].yaw = this.yaw; blades[1].yaw = this.yaw + Math.PI / 2; },
    });
  }

  // ---------- escalinata: escalones gigantes bajo el recorrido ----------
  for (let s = B.e0 + 30; s < B.s0 - 10; s += 7) {
    const f = at(s), top = Math.max(4, f.P.y - 26);
    box(new V3(f.P.x, top / 2, f.P.z), new V3(3.7, top / 2, ZONES.escalinata.W + 3), f.yaw, 'step', null);
  }
  // ---------- sótano: bosque de pilares ----------
  for (let s = B.s0 + 10; s < B.p0 - 10; s += 30) {
    const f = at(s), top = f.P.y + 24;
    for (const lat of [-49, -25, 25, 49]) {
      const l = lat + rr(-4, 4), p = new V3(f.P.x + f.Rh.x * l + f.Th.x * rr(-6, 6), top / 2, f.P.z + f.Rh.z * l + f.Th.z * rr(-6, 6));
      box(p, new V3(3.6, top / 2, 3.6), f.yaw, 'pillar', null);
    }
  }
  // ---------- pozo de luz: vigas que cruzan el pozo y una corriente que te sube ----------
  for (let s = B.p0; s < B.g0; s += 24) {
    if (R() < 0.5) continue;
    const f = at(s), up = (R() < 0.65 ? 1 : -1) * rr(16, 90);
    box(new V3(f.P.x, f.P.y + up, f.P.z), new V3(rr(2, 4), rr(1.5, 3), ZONES.pozo.W + 6), f.yaw, 'beam', null);
  }
  { const f = at(sAt(11, 0.15)); T.thermals.push({ c: new V3(f.P.x, 0, f.P.z), r: 28, top: f.P.y + 110, k: 15 }); }

  // ---------- mole de fondo: bloques enormes alrededor de todo (con colisión) ----------
  for (let k = 0, tries = 0; k < 230 && tries < 3000; tries++) {
    const x = rr(-650, 1350), zz = rr(-1250, 750), w = rr(25, 90), d = rr(25, 90), top = rr(60, 340);
    const n = S.nearest(new V3(x, Math.min(top, 150), zz));
    if (n.d < 70 + Math.max(w, d)) continue;
    box(new V3(x, top / 2, zz), new V3(w / 2, top / 2, d / 2), R() < 0.7 ? 0 : rr(-0.4, 0.4), 'bg', null);
    k++;
  }

  // ---------- comprobación de holgura: se queda solo lo que deja pasar ----------
  const samples = [];
  for (let s = 0; s < L; s += 5) samples.push(S.pointAt(s));
  const reach = c => (c.type === 'obb' || c.type === 'box' ? Math.hypot(c.h.x, c.h.y, c.h.z) : c.type === 'capsule' ? c.a.dist(c.b) / 2 + c.r : 50);
  const center = c => (c.type === 'capsule' ? c.a.clone().lerp(c.b, 0.5) : c.c);
  let dropped = 0;
  for (const p of cand) {
    const cc = center(p.c), r = reach(p.c) + MIN[p.kind] + 5;
    let ok = true;
    for (const q of samples) if (Math.abs(q.x - cc.x) < r && Math.abs(q.z - cc.z) < r && Math.abs(q.y - cc.y) < r && sdf(p.c, q) < MIN[p.kind]) { ok = false; break; }
    if (!ok) { dropped++; continue; }
    T.stat(p.c, p.kind === 'drum' ? 'drum' : p.kind);
    if (p.kind !== 'ramp') T.decor.push({ kind: p.kind === 'drum' ? 'drum' : 'block', tag: p.kind, c: p.c.c, h: p.c.h, yaw: p.c.yaw, ...(p.vis || {}) });
  }
  for (const a of arches) T.decor.push({ kind: 'arch', c: a.col.c, h: a.col.h, yaw: a.col.yaw, hole: a.hole, doors: !!a.doors });
  for (const rp of ramps) T.decor.push({ kind: 'ramp', pts: rp.pts, width: rp.width });
  for (const l of lights) T.decor.push({ kind: 'light', ...l });
  T.decor.push({ kind: 'info', dropped, total: cand.length });
}

export default {
  id: 'laberinto', name: 'Laberinto de hormigón', key: 'laberinto1', laps: 1, start: 'air', seed: 11,
  blurb: 'Cañón de hormigón con arcos, rampas, escalinata, sótano de pilares y pozo de luz. Pistones, compuertas y aspas.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 26.8, oro: 28.6, plata: 31.5, bronce: 35 },
};
