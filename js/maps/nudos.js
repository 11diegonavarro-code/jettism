// Mapa: Nudos de autopista. Hormigón gris, cielo de lluvia y carreteras imposibles: tres bucles verticales que el
// recorrido atraviesa por dentro, un nudo en hélice por el que se baja en espiral, un bosque de pilares bajo un tablero
// enorme y una autopista elevada por encima del tráfico. Los coches y camiones circulan de verdad (chocan).
// JS puro (también se simula en Node); lo que se dibuja está en nudos-view.js.
import { V3, UP } from '../math.js';
import { kit, yawFromRight } from './kit.js';
import { AI_NARROW } from '../ai.js';

const GATES = [
  [0, 70, 0, 'm'], [0, 80, -260, 'm'], [60, 100, -500, 'm'], [200, 110, -680, 'm'], [400, 120, -760, 'm'],
  [548, 185, -522, 'm'], [736, 165, -454, 'm'], [826, 135, -496, 'm'], [784, 105, -586, 'm'], [694, 75, -544, 'm'],
  [619, 45, -337, 'm'], [430, 38, -170, 'm'], [230, 40, -20, 'm'], [80, 58, 60, 'm'],
];
export const COURSE = { name: 'Nudos de autopista', gates: GATES, boosts: [[0, 0.5], [5, 0.4], [11, 0.5]] };
export const SECTIONS = [[2, 'Los bucles'], [6, 'La espiral'], [10, 'Bosque de pilares']];
const MIN = { road: 10, pillar: 13.5, gantry: 9, ceil: 10, core: 20, bg: 40, crossing: 8 };
const HELIX = { x: 760, z: -520, r: 125 };
const CAR = { h: new V3(2.3, 0.75, 1.0) }, TRUCK = { h: new V3(6, 2.1, 1.25) };

// Curva abierta (Catmull-Rom) por puntos de control, muestreada cada ~step metros
function curve(ctrl, step = 8) {
  const out = [], P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2], n = Math.max(1, Math.ceil(p1.dist(p2) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(new V3(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y), f(p0.z, p1.z, p2.z, p3.z)));
    }
  }
  out.push(ctrl[ctrl.length - 1].clone());
  return out;
}

export function build(T) {
  const K = kit(T), { S, R, rr, sAt, at, L } = K, D = T.decor, roads = [];

  // Una carretera: puntos, eje de lado de cada punto (az; por defecto horizontal) y ancho. Tablero como cajas orientadas.
  const road = (pts, width, opts = {}) => {
    const n = pts.length, az = [], ny = [], cum = [0];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], t = new V3().subVectors(b, a).normalize();
      const side = opts.across ? opts.across(i, t) : new V3().crossVectors(t, UP).normalize();
      az.push(side); ny.push(new V3().crossVectors(side, t).normalize());
      if (i) cum.push(cum[i - 1] + pts[i].dist(pts[i - 1]));
    }
    // que la normal del tablero mire hacia arriba (o hacia dentro en los bucles)
    for (let i = 0; i < n; i++) if ((!opts.across && ny[i].y < 0) || opts.flip) { ny[i].scale(-1); az[i].scale(-1); }
    const r = { pts, az, ny, cum, L: cum[n - 1], width, kind: opts.kind || 'road', cars: opts.cars ?? Math.floor(cum[n - 1] / 45), trucks: opts.trucks ?? 0.25, speed: opts.speed ?? 26, segs: [] };
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1], ax = new V3().subVectors(b, a), len = ax.len();
      if (len < 0.5) continue;
      ax.scale(1 / len);
      const azv = az[i].clone().addScaled(ax, -az[i].dot(ax)).normalize(), ayv = new V3().crossVectors(azv, ax).normalize();
      K.obb(a.clone().lerp(b, 0.5), new V3(len / 2 + 0.5, 1.2, width / 2), ax, ayv, azv, r.kind, { road: r, i });
    }
    roads.push(r);
    return r;
  };
  // pilares bajo una carretera (cada «every» puntos), de suelo a tablero
  const pillars = (r, every = 5, w = 3.2) => {
    for (let i = 0; i < r.pts.length; i += every) {
      const p = r.pts[i];
      if (p.y < 8 || r.ny[i].y < 0.7) continue;
      const top = p.y - 1.2;
      K.box(new V3(p.x, top / 2, p.z), new V3(w, top / 2, w * 0.8), yawFromRight(r.az[i]), 'pillar');
    }
  };

  // ---------- autopista elevada bajo la salida: se vuela por encima del tráfico ----------
  {
    const ctrl = [];
    for (let s = L - 330; s < L + sAt(1, 0.85); s += 60) { const p = S.pointAt(s); ctrl.push(new V3(p.x, p.y - 13, p.z)); }
    const r = road(curve(ctrl), 26, { kind: 'highway', cars: 22, trucks: 0.3 });
    pillars(r, 5, 4);
  }
  // pasos superiores que cruzan por encima y pórticos de señales
  for (const [i, f, ups] of [[0, 0.35, [17, 33]], [0, 0.75, [18]], [1, 0.35, [16, 31]]]) {
    const F = at(sAt(i, f));
    for (const up of ups) {
      const y = F.P.y + up, ctrl = [-320, -120, 0, 120, 320].map(l => new V3(F.P.x + F.Rh.x * l + F.Th.x * (l * l) / 4000, y + Math.abs(l) * 0.05, F.P.z + F.Rh.z * l + F.Th.z * (l * l) / 4000));
      const r = road(curve(ctrl), 16, { cars: 8 });
      pillars(r, 6, 3);
    }
  }
  for (const [i, f] of [[0, 0.55], [1, 0.6]]) {
    const F = at(sAt(i, f)), top = F.P.y + 12;
    for (const sd of [-1, 1]) K.box(new V3(F.P.x + F.Rh.x * sd * 17, top / 2, F.P.z + F.Rh.z * sd * 17), new V3(0.8, top / 2, 0.8), F.yaw, 'gantry');
    K.box(new V3(F.P.x, top + 2, F.P.z), new V3(1.2, 2, 18), F.yaw, 'gantry');
    D.push({ kind: 'sign', P: new V3(F.P.x, top, F.P.z), yaw: F.yaw, Rh: F.Rh });
  }

  // ---------- los bucles: carreteras que dan la vuelta completa; el recorrido pasa por dentro ----------
  for (const i of [2, 3, 4]) {
    const F = at(sAt(i, 0)), P = F.P, Rl = 55, Th = F.Th, Rh = F.Rh, pts = [], bottom = P.y - Rl;
    for (let l = -320; l < 0; l += 10) pts.push(new V3(P.x + Rh.x * l - Th.x * 9, bottom, P.z + Rh.z * l - Th.z * 9));
    for (let k = 0; k <= 72; k++) {
      const ph = (k / 72) * Math.PI * 2, sh = -9 + 18 * (k / 72);
      pts.push(new V3(P.x + Rh.x * Rl * Math.sin(ph) + Th.x * sh, P.y - Rl * Math.cos(ph), P.z + Rh.z * Rl * Math.sin(ph) + Th.z * sh));
    }
    for (let l = 10; l <= 320; l += 10) pts.push(new V3(P.x + Rh.x * l + Th.x * 9, bottom, P.z + Rh.z * l + Th.z * 9));
    // el eje de lado del tablero es el avance del recorrido: el tablero mira al centro del bucle
    const r = road(pts, 14, { kind: 'loop', across: () => new V3(Th.x, 0, Th.z), flip: true, cars: 9, trucks: 0.1, speed: 24 });
    for (let k = 0; k < pts.length; k += 4) if (pts[k].y <= bottom + 0.5) { const p = pts[k]; K.box(new V3(p.x, (p.y - 1.2) / 2, p.z), new V3(2.8, (p.y - 1.2) / 2, 2.4), F.yawR, 'pillar'); }
    D.push({ kind: 'loopInfo', P, Rl });
  }

  // ---------- la espiral: nudo en hélice; el recorrido baja por dentro y entra y sale por el hueco entre dos vueltas ----------
  {
    const rad = p => Math.hypot(p.x - HELIX.x, p.z - HELIX.z), ang = p => Math.atan2(p.z - HELIX.z, p.x - HELIX.x);
    const cross = (s0, s1) => { for (let s = s0; s < s1; s += 1) { const a = S.pointAt(s), b = S.pointAt(s + 1); if ((rad(a) - HELIX.r) * (rad(b) - HELIX.r) <= 0) return a; } return null; };
    const pin = cross(sAt(4, 0.5), sAt(6, 0.5)), pout = cross(sAt(8, 0.5), sAt(10, 0.5));
    // la hélice sube en sentido antihorario: altura = y0 + paso · (ángulo / 2π + vuelta); se elige el paso y la fase
    // para que las dos travesías caigan a media altura entre dos vueltas
    const tin = ang(pin), tout = ang(pout);
    let best = null;
    for (let nTurn = -8; nTurn <= 8; nTurn++) {
      let d = ((tout - tin) / (2 * Math.PI)) % 1; if (d < 0) d += 1;
      const turns = d + nTurn;
      if (Math.abs(turns) < 0.3) continue;
      const pitch = (pout.y - pin.y) / turns;
      if (pitch >= 34 && pitch <= 52 && (!best || Math.abs(pitch - 42) < Math.abs(best - 42))) best = pitch;
    }
    const pitch = best || 42, y0 = pin.y - pitch * (tin / (2 * Math.PI) + 0.5), pts = [];
    const turns = 5.6, a0 = Math.ceil((14 - y0) / pitch) * 2 * Math.PI;
    for (let a = a0; a <= a0 + turns * 2 * Math.PI; a += 0.06) pts.push(new V3(HELIX.x + Math.cos(a) * HELIX.r, y0 + (pitch * a) / (2 * Math.PI), HELIX.z + Math.sin(a) * HELIX.r));
    const r = road(pts, 14, { kind: 'helix', cars: 26, trucks: 0.2, speed: 22 });
    for (let k = 0; k < pts.length; k += 7) {
      const p = pts[k];
      if (p.y < 70) { const o = new V3(p.x - HELIX.x, 0, p.z - HELIX.z).normalize(); K.box(new V3(p.x + o.x * 9, (p.y - 1.2) / 2, p.z + o.z * 9), new V3(2.6, (p.y - 1.2) / 2, 2.6), 0, 'pillar'); }
    }
    K.capsule(new V3(HELIX.x, -10, HELIX.z), new V3(HELIX.x, y0 + pitch * (a0 / (2 * Math.PI) + turns) + 20, HELIX.z), 18, 'core');
    D.push({ kind: 'helixInfo', r: HELIX.r, pitch, y0 });
  }

  // ---------- cruces con camiones justo por debajo de la línea (hay que no bajar) ----------
  for (const [i, f] of [[9, 0.55], [11, 0.5]]) {
    const F = at(sAt(i, f)), y = F.P.y - 10.5;
    const ctrl = [-300, -100, 0, 100, 300].map(l => new V3(F.P.x + F.Rh.x * l, y, F.P.z + F.Rh.z * l));
    const r = road(curve(ctrl), 16, { kind: 'crossing', cars: 7, trucks: 0.85, speed: 20 });
    r.aiDodge = 'up';
    pillars(r, 5, 3);
  }

  // ---------- bosque de pilares: un tablero enorme por encima (con tráfico) y columnas por todas partes ----------
  {
    const s0 = sAt(10, 0.12), s1 = sAt(12, 0.8), lanes = [];
    for (let s = s0; s < s1; s += 20) {
      const F = at(s);
      K.box(new V3(F.P.x, F.P.y + 25.5, F.P.z), new V3(10.6, 1.5, 62), F.yaw, 'ceil');
      const k = Math.round((s - s0) / 20);
      for (const l of k % 2 ? [-46, -17, 17, 46] : [-31, 0.001, 31]) {
        if (Math.abs(l) < 1) continue;
        const lat = l + rr(-3, 3), top = F.P.y + 24;
        K.box(new V3(F.P.x + F.Rh.x * lat, top / 2, F.P.z + F.Rh.z * lat), new V3(2.4, top / 2, 2.4), F.yaw, 'pillar');
      }
      lanes.push(new V3(F.P.x, F.P.y + 25.8, F.P.z));
    }
    // el tráfico va por encima del tablero (carretera sin colisión propia: el tablero ya la tiene)
    roads.push(Object.assign(roadOnly(lanes, 30), { cars: 16, trucks: 0.3, speed: 24, kind: 'deck' }));
  }

  // ---------- edificios brutalistas alrededor ----------
  for (let k = 0, tries = 0; k < 110 && tries < 2000; tries++) {
    const x = rr(-900, 1500), z = rr(-1500, 700), w = rr(30, 110), d = rr(30, 110), H = rr(40, 260);
    if (S.nearest(new V3(x, Math.min(H, 120), z)).d < 90 + Math.max(w, d) || Math.hypot(x - HELIX.x, z - HELIX.z) < HELIX.r + 60 + Math.max(w, d)) continue;
    K.box(new V3(x, H / 2, z), new V3(w / 2, H / 2, d / 2), R() < 0.6 ? 0 : rr(-0.6, 0.6), 'bg', { H });
    k++;
  }

  // ---------- se añade lo que deja pasar; las carreteras se quedan solo con los tramos que han pasado ----------
  const { kept, dropped } = K.commit(MIN, 5, ['highway', 'pillar']);
  for (const p of kept) {
    if (p.extra?.road) p.extra.road.segs.push(p.extra.i);
    else if (p.c.type === 'capsule') D.push({ kind: 'core', a: p.c.a, b: p.c.b, r: p.c.r });
    else D.push({ kind: p.kind, c: p.c.c, h: p.c.h, yaw: p.c.yaw });
  }
  for (const r of roads) D.push({ kind: 'road', road: r });
  D.push({ kind: 'info', dropped, total: kept.length + dropped });

  // ---------- tráfico: coches y camiones por cada carretera (un obstáculo móvil por carretera) ----------
  for (const r of roads) {
    if (!r.cars || r.L < 60) continue;
    const cars = [];
    for (let k = 0; k < r.cars; k++) {
      const truck = R() < r.trucks, dir = k % 2 ? 1 : -1, h = (truck ? TRUCK : CAR).h;
      const col = T.tag({ type: 'obb', c: new V3(), h: h.clone(), ax: new V3(1, 0, 0), ay: new V3(0, 1, 0), az: new V3(0, 0, 1) }, truck ? 'truck' : 'car');
      cars.push({ col, truck, dir, u0: R() * r.L, v: r.speed * rr(0.85, 1.15), lane: dir * r.width * (truck ? 0.2 : 0.27), color: Math.floor(R() * 8) });
    }
    const box = r.pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x), y0: Math.min(b.y0, p.y), y1: Math.max(b.y1, p.y), z0: Math.min(b.z0, p.z), z1: Math.max(b.z1, p.z) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 });
    const bc = new V3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
    const _p = new V3(), _t = new V3();
    T.mover({
      // los bots solo esquivan los camiones de los cruces; el resto del tráfico va por su carretera, lejos de la línea
      kind: 'traffic', road: r, cars, cols: cars.map(c => c.col), aiDodge: r.aiDodge, aiUp: 18, aiIgnore: !r.aiDodge,
      bound: { c: bc, r: Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) / 2 + 8 },
      update(t) {
        for (const c of cars) {
          let u = (c.u0 + c.dir * c.v * t) % r.L;
          if (u < 0) u += r.L;
          // tramo de la carretera en el que va (búsqueda binaria)
          let lo = 0, hi = r.cum.length - 2;
          while (lo < hi) { const m = (lo + hi + 1) >> 1; if (r.cum[m] <= u) lo = m; else hi = m - 1; }
          const f = (u - r.cum[lo]) / (r.cum[lo + 1] - r.cum[lo] || 1), a = r.pts[lo], b = r.pts[lo + 1];
          _p.copy(a).lerp(b, f); _t.subVectors(b, a).normalize();
          const ny = r.ny[lo], az = r.az[lo], h = c.col.h;
          c.col.c.copy(_p).addScaled(az, c.lane).addScaled(ny, 1.2 + h.y);
          c.col.ax.copy(_t).scale(c.dir); c.col.ay.copy(ny); c.col.az.crossVectors(c.col.ax, ny).normalize();
        }
      },
    });
  }
}

// Carretera solo para el tráfico (sin tablero propio)
function roadOnly(pts, width) {
  const n = pts.length, az = [], ny = [], cum = [0];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], t = new V3().subVectors(b, a).normalize();
    const side = new V3().crossVectors(t, UP).normalize();
    az.push(side); ny.push(new V3().crossVectors(side, t).normalize());
    if (i) cum.push(cum[i - 1] + pts[i].dist(pts[i - 1]));
  }
  for (let i = 0; i < n; i++) if (ny[i].y < 0) { ny[i].scale(-1); az[i].scale(-1); }
  return { pts, az, ny, cum, L: cum[n - 1], width, segs: [], noDeck: true };
}

export default {
  id: 'nudos', name: 'Nudos de autopista', key: 'nudos1', laps: 1, start: 'air', seed: 31,
  blurb: 'Bucles de autopista que se atraviesan por dentro, un nudo en espiral, un bosque de pilares y tráfico de verdad bajo la lluvia.',
  course: COURSE, sections: SECTIONS, build, ai: AI_NARROW,
  medals: { autor: 27.6, oro: 29, plata: 32, bronce: 36 },
};
