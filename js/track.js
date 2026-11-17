// Mapa 1, «Desierto de los sueños».
// Todo es JS puro: el recorrido, los colisionadores (funciones de distancia), los obstáculos móviles
// (que dependen solo del reloj de la carrera, para que coincidan en todas las pantallas) y el viento.
import { V3, UP, clamp, rng } from './math.js';

// Puntos de control del recorrido (una puerta en cada uno). El nombre marca el inicio de cada tramo.
const CP = [
  [0, 60, 0, 'salida'],
  [0, 66, -420, 'bosque'],
  [70, 80, -760],
  [-60, 92, -1080],
  [60, 104, -1400],
  [300, 125, -1720, 'acantilado'],
  [700, 140, -1880],
  [930, 150, -1782, 'contrafuerte'], // rodea el contrafuerte; el atajo lo atraviesa por el cajón
  [1150, 155, -1875],
  [1560, 190, -1800, 'escaleras'],
  [1780, 300, -1700, 'horquilla'],   // horquilla vertical (Immelmann)
  [1520, 380, -1640],
  [1100, 370, -1690, 'pendulos'],
  [680, 350, -1720],
  [240, 320, -1720, 'puerta'],
  [-260, 270, -1560],
  [-560, 215, -1160, 'ballena'],
  [-640, 160, -680],
  [-540, 105, -240, 'lago'],
  [-280, 70, 120],
  [-90, 62, 150],
];
// Tamaños de puerta del editor (radio del anillo y del círculo en el que cuenta)
export const GATE_SIZES = { s: { ring: 13, cp: 60 }, m: { ring: 18, cp: 75 }, l: { ring: 25, cp: 95 } };
// El recorrido original en el formato del editor: puertas [x, y, z, tamaño] y anillos de turbo [puerta, fracción del tramo]
export const BASE_COURSE = {
  name: 'Desierto de los sueños',
  gates: CP.map((c, i) => [c[0], c[1], c[2], i === 0 || c[3] === 'horquilla' ? 'l' : 'm']),
  boosts: [[0, 0.55], [7, 0.62], [11, 0.4], [17, 0.5]],
};
export const GATE = Object.fromEntries(CP.map((p, i) => [p[3], i]).filter(([n]) => n));
export const SECTIONS = [['bosque', 'Bosque de torres'], ['acantilado', 'Acantilado de cajones'], ['escaleras', 'Escaleras al cielo'], ['pendulos', 'Los péndulos'], ['puerta', 'La puerta'], ['ballena', 'Ballena de nubes'], ['lago', 'Lago espejo']].map(([k, n]) => [GATE[k], n]);
export const JET_RADIUS = 2.5;
export const CLIFF_FACE_Z = -1935;
export const LAKE = { x: -220, z: -60, r: 760 };
// Contrafuerte del acantilado y el cajón-túnel que lo atraviesa (atajo)
export const BUTTRESS = { x0: 880, x1: 980, zOut: -1835, tunnel: { y0: 127, y1: 167, z0: -1906, z1: -1854 }, wood: 3, over: 25 };
const CELL = 128;

// ---------- Curva del recorrido (Catmull-Rom centrípeta cerrada) ----------
class Spline {
  constructor(points, perSeg = 60) {
    const P = points.map(p => new V3(p[0], p[1], p[2])), n = P.length;
    this.pts = []; this.cum = [0]; this.perSeg = perSeg;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      const t0 = 0, t1 = t0 + Math.sqrt(p1.dist(p0)), t2 = t1 + Math.sqrt(p2.dist(p1)), t3 = t2 + Math.sqrt(p3.dist(p2));
      for (let k = 0; k < perSeg; k++) {
        const t = t1 + (t2 - t1) * (k / perSeg);
        const A1 = lin(p0, p1, t0, t1, t), A2 = lin(p1, p2, t1, t2, t), A3 = lin(p2, p3, t2, t3, t);
        const B1 = lin(A1, A2, t0, t2, t), B2 = lin(A2, A3, t1, t3, t);
        this.pts.push(lin(B1, B2, t1, t2, t));
      }
    }
    for (let i = 1; i <= this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i - 1].dist(this.pts[i % this.pts.length]));
    this.length = this.cum[this.pts.length];
    this.cpS = P.map((_, i) => this.cum[i * perSeg]);
  }
  wrap(s) { s %= this.length; return s < 0 ? s + this.length : s; }
  index(s) {
    s = this.wrap(s);
    let lo = 0, hi = this.pts.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.cum[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  pointAt(s, out = new V3()) {
    s = this.wrap(s);
    const i = this.index(s), a = this.pts[i], b = this.pts[(i + 1) % this.pts.length];
    const f = (s - this.cum[i]) / (this.cum[i + 1] - this.cum[i] || 1);
    return out.copy(a).lerp(b, f);
  }
  tangentAt(s, out = new V3()) {
    const a = this.pointAt(s - 3, _t1), b = this.pointAt(s + 3, _t2);
    return out.subVectors(b, a).normalize();
  }
  // Marco del recorrido: tangente, lateral (derecha) y arriba
  frame(s) {
    const T = this.tangentAt(s), R = new V3().crossVectors(T, UP);
    if (R.lenSq() < 1e-4) R.set(1, 0, 0);
    R.normalize();
    return { P: this.pointAt(s), T, R, U: new V3().crossVectors(R, T).normalize() };
  }
  // Punto del recorrido más cercano; con pista (índice anterior) busca solo alrededor
  nearest(p, hint = -1, win = 90) {
    const n = this.pts.length;
    let best = -1, bd = Infinity;
    const from = hint < 0 ? 0 : hint - win, to = hint < 0 ? n - 1 : hint + win;
    for (let j = from; j <= to; j++) {
      const i = ((j % n) + n) % n, d = this.pts[i].dist(p);
      if (d < bd) { bd = d; best = i; }
    }
    let s = this.cum[best];
    for (const k of [best - 1, best]) {
      const i = ((k % n) + n) % n, a = this.pts[i], b = this.pts[(i + 1) % n];
      _t1.subVectors(b, a);
      const L2 = _t1.lenSq(), f = clamp(_t2.subVectors(p, a).dot(_t1) / (L2 || 1), 0, 1);
      const q = _t3.copy(a).addScaled(_t1, f), d = q.dist(p);
      if (d <= bd + 1e-6) { bd = d; s = this.cum[i] + f * Math.sqrt(L2); }
    }
    return { s: this.wrap(s), idx: best, d: bd };
  }
}
const lin = (a, b, ta, tb, t) => {
  const f = (t - ta) / (tb - ta || 1);
  return new V3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
};
const _t1 = new V3(), _t2 = new V3(), _t3 = new V3(), _d = new V3();

// ---------- Funciones de distancia con signo ----------
const _p = new V3(), _hh = new V3();
const boxD = (lx, ly, lz, h) => {
  const qx = Math.abs(lx) - h.x, qy = Math.abs(ly) - h.y, qz = Math.abs(lz) - h.z;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
};
function sdf(c, p) {
  switch (c.type) {
    case 'sphere': return p.dist(c.c) - c.r;
    case 'capsule': {
      const bax = c.b.x - c.a.x, bay = c.b.y - c.a.y, baz = c.b.z - c.a.z;
      const pax = p.x - c.a.x, pay = p.y - c.a.y, paz = p.z - c.a.z;
      const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz || 1), 0, 1);
      return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - c.r;
    }
    case 'box': { // girada solo en Y
      const dx = p.x - c.c.x, dz = p.z - c.c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
      return boxD(dx * co - dz * si, p.y - c.c.y, dx * si + dz * co, c.h);
    }
    case 'obb': { // orientada en cualquier dirección (ejes ax, ay, az unitarios)
      _d.subVectors(p, c.c);
      return boxD(_d.dot(c.ax), _d.dot(c.ay), _d.dot(c.az), c.h);
    }
    case 'archwall': { // muro (girado en Y) con un hueco: rectángulo de ancho 2·hw y alto hh + medio círculo encima
      const dx = p.x - c.c.x, dz = p.z - c.c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
      const lx = dx * co - dz * si, ly = p.y - c.c.y, lz = dx * si + dz * co;
      const wall = boxD(lx, ly, lz, c.h);
      const hy = ly - c.hole.y; // y del hueco: 0 en la base del hueco
      const rect = boxD(lx, hy - c.hole.hh / 2, 0, _hh.set(c.hole.hw, c.hole.hh / 2, 1e3));
      const circ = Math.hypot(lx, hy - c.hole.hh) - c.hole.hw; // círculo entero: su mitad de abajo cae dentro del rectángulo
      return Math.max(wall, -Math.min(rect, circ));
    }
    case 'ellipsoid': {
      const dx = p.x - c.c.x, dz = p.z - c.c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
      const lx = dx * co - dz * si, lz = dx * si + dz * co, ly = p.y - c.c.y;
      const k0 = Math.hypot(lx / c.r.x, ly / c.r.y, lz / c.r.z), k1 = Math.hypot(lx / (c.r.x * c.r.x), ly / (c.r.y * c.r.y), lz / (c.r.z * c.r.z));
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(c.r.x, c.r.y, c.r.z);
    }
  }
  return Infinity;
}

// Caja girada solo en Y: la dirección X local apunta a «right»
const yawFromRight = R => Math.atan2(-R.z, R.x);
// Caja alineada con los ejes a partir de sus esquinas
const boxFrom = (x0, y0, z0, x1, y1, z1) => ({ type: 'box', c: new V3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), h: new V3(Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, Math.abs(z1 - z0) / 2), yaw: 0 });

export { Spline, sdf, yawFromRight, boxFrom };

// El desierto como mapa por defecto (los demás mapas están en js/maps/)
export const DESIERTO = { id: 'desierto', course: null, build: T => buildDesierto(T), ownGates: true };

export class Track {
  constructor(map = DESIERTO) { this.load(map); }

  // Carga un mapa: su recorrido, sus colisionadores, obstáculos, viento y térmicas
  load(map) {
    this.map = map;
    this.statics = []; this.movers = []; this.decor = []; this.grid = new Map();
    this.gates = []; this.boostRings = []; this.thermals = []; this.windZones = [];
    this.rand = rng(map.seed || 7);
    this.uid = 1;
    const course = map.course || BASE_COURSE;
    this.spline = new Spline(course.gates);
    this.length = this.spline.length;
    if (!map.ownGates) this.makeGates(course);
    map.build(this);
    for (const c of this.statics) this.insert(c);
    this.movers.forEach((m, i) => m.cols.forEach(c => { c.grp = 'M' + i; }));
    this.update(0);
    // el recorrido original, para volver a él después de un circuito propio
    this.base = { spline: this.spline, length: this.length, gates: this.gates, boostRings: this.boostRings };
    this.custom = null;
  }
  // Puertas y anillos de turbo a partir de un circuito [x, y, z, tamaño] y [tramo, fracción]
  makeGates(course, S = this.spline) {
    const cp = S.cpS, L = S.length;
    const gates = course.gates.map((g, i) => {
      const z = GATE_SIZES[g[3]] || GATE_SIZES.m;
      return { i, s: cp[i], p: S.pointAt(cp[i]), t: S.tangentAt(cp[i]), ring: z.ring, cp: z.cp };
    });
    const boostRings = (course.boosts || []).filter(b => b[0] < gates.length).map(([i, f]) => {
      const a = cp[i], b = i + 1 < cp.length ? cp[i + 1] : L, s = a + (b - a) * f;
      return { s, p: S.pointAt(s), t: S.tangentAt(s), r: 7 };
    });
    if (S === this.spline) { this.gates = gates; this.boostRings = boostRings; }
    return { gates, boostRings };
  }
  // Ayudas para construir mapas: etiqueta un colisionador, lo añade como fijo, añade un obstáculo móvil
  tag(c, kind) { c.kind = kind; c.uid = this.uid++; return c; }
  stat(c, kind, grp) { this.tag(c, kind); if (grp) c.grp = grp; this.statics.push(c); return c; }
  mover(m) { this.movers.push(m); return m; }

  // Circuito propio (o null para el original): cambia solo las puertas y los anillos de turbo; el mapa y sus obstáculos no se mueven
  setCourse(course) {
    if (!course) {
      Object.assign(this, { spline: this.base.spline, length: this.base.length, gates: this.base.gates, boostRings: this.base.boostRings, custom: null });
      return;
    }
    const S = new Spline(course.gates.map(g => [g[0], g[1], g[2]]));
    const { gates, boostRings } = this.makeGates(course, S);
    Object.assign(this, { spline: S, length: S.length, gates, boostRings, custom: course });
  }

  insert(c) {
    const b = bounds(c);
    for (let ix = Math.floor(b.x0 / CELL); ix <= Math.floor(b.x1 / CELL); ix++)
      for (let iz = Math.floor(b.z0 / CELL); iz <= Math.floor(b.z1 / CELL); iz++) {
        const k = key(ix, iz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
  }

  // s del principio de un tramo con nombre
  sOf(name, offset = 0) { const S = this.base?.spline || this.spline; return S.wrap(S.cpS[GATE[name]] + offset); }
  // groundY: altura del suelo (el de cada mapa; 0 por defecto)


  update(t) { for (const m of this.movers) m.update(t); }

  // Aceleración del viento en p (m/s²). Devuelve también si está en una térmica y si hay viento lateral.
  windAt(p, t, out) {
    out.set(0, 0, 0);
    let thermal = 0, cross = 0;
    for (const th of this.thermals) {
      const d = Math.hypot(p.x - th.c.x, p.z - th.c.z);
      if (d < th.r && p.y < th.top) { const k = 1 - (d / th.r) ** 2; out.y += th.k * k; thermal = Math.max(thermal, k); }
    }
    for (const z of this.windZones) {
      if (p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1 && p.y < z.y1) {
        const edge = Math.min(p.x - z.x0, z.x1 - p.x, 80) / 80;
        cross = z.k * edge * (0.7 + 0.3 * Math.sin(t * 0.9) + 0.25 * Math.sin(t * 2.3));
        out.addScaled(z.dir, cross);
      }
    }
    return { thermal, cross };
  }

  // Colisionadores cerca de p
  candidates(p, radius, out = []) {
    out.length = 0;
    const ix = Math.floor(p.x / CELL), iz = Math.floor(p.z / CELL), seen = this._seen || (this._seen = new Set());
    seen.clear();
    const reach = Math.ceil(radius / CELL);
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
      const list = this.grid.get(key(ix + a, iz + b));
      if (list) for (const c of list) if (!seen.has(c)) { seen.add(c); out.push(c); }
    }
    for (const m of this.movers) if (p.dist(m.bound.c) - m.bound.r < radius) for (const c of m.cols) out.push(c);
    return out;
  }

  // Distancia a la superficie más cercana (sin contar el suelo)
  // Solo lo fijo (sin obstáculos móviles): para el análisis del editor
  nearestStatic(p, radius = 60) {
    const ix = Math.floor(p.x / CELL), iz = Math.floor(p.z / CELL), reach = Math.ceil(radius / CELL);
    let d = Infinity;
    for (let a = -reach; a <= reach; a++) for (let b = -reach; b <= reach; b++) {
      const list = this.grid.get(key(ix + a, iz + b));
      if (list) for (const c of list) { const v = sdf(c, p); if (v < d) d = v; }
    }
    return d;
  }
  nearest(p, radius = 60) {
    const list = this.candidates(p, radius, this._cand || (this._cand = []));
    let d = Infinity, col = null;
    for (const c of list) { const v = sdf(c, p); if (v < d) { d = v; col = c; } }
    return { d, col };
  }

  normal(col, p, out = new V3()) {
    const e = 0.05;
    const f = (x, y, z) => sdf(col, _p.set(x, y, z));
    out.set(f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z), f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z), f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e));
    return out.lenSq() > 1e-12 ? out.normalize() : out.set(0, 1, 0);
  }

  groundY() { return this.map.groundY ?? 0; }

  // Rayo por «sphere tracing»: devuelve la distancia al primer choque (incluido el suelo).
  // margin = grosor del rayo (el radio del jet, o más para ir con holgura)
  raycast(o, dir, maxD, margin = JET_RADIUS) {
    let t = 0;
    const p = new V3();
    for (let i = 0; i < 48 && t < maxD; i++) {
      p.copy(o).addScaled(dir, t);
      const { d, col } = this.nearest(p, 70);
      const dg = p.y - this.groundY();
      const dm = Math.min(d, dg);
      if (dm < margin) return { t, col: dg < d ? null : col, p: p.clone() };
      t += Math.max(dm - margin * 0.5, 1.5);
    }
    return null;
  }

  // Distancia en el instante «future» a los obstáculos móviles cercanos (para anticiparse a ellos).
  // Después los deja como estaban en «now».
  predictMovers(p, future, now, radius = 300) {
    let best = { d: Infinity, col: null, n: null };
    for (const m of this.movers) {
      if (m.aiIgnore || p.dist(m.bound.c) - m.bound.r > radius) continue;
      m.update(future);
      for (const c of m.cols) {
        const d = sdf(c, p);
        if (d < best.d) best = { d, col: c, n: this.normal(c, p), m };
      }
      m.update(now);
    }
    return best;
  }
}

// ---------- Mapa 1: Desierto de los sueños (colisionadores, obstáculos, viento) ----------
export function buildDesierto(TK) {
  const S = TK.spline, R = TK.rand, cp = S.cpS;
  const tag = (c, kind) => TK.tag(c, kind);
  const stat = (c, kind, grp) => TK.stat(c, kind, grp);
  const segS = (i, f) => cp[i] + ((i + 1 < cp.length ? cp[i + 1] : TK.length) - cp[i]) * f;

  // Puertas (anillos) en cada punto de control. La del contrafuerte acepta también el atajo del cajón.
  CP.forEach((_, i) => {
    const P = S.pointAt(cp[i]), T = S.tangentAt(cp[i]);
    const ring = i === 0 ? 30 : i === GATE.horquilla ? 24 : 18;
    TK.gates.push({ i, s: cp[i], p: P, t: T, ring, cp: i === GATE.contrafuerte ? 125 : 75 });
  });
  // Anillos de turbo pequeños
  for (const [i, f] of [[GATE.salida, 0.55], [GATE.contrafuerte, 0.62], [GATE.horquilla + 1, 0.4], [GATE.lago - 1, 0.5]]) {
    const s = segS(i, f);
    TK.boostRings.push({ s, p: S.pointAt(s), t: S.tangentAt(s), r: 7 });
  }

  // Plataforma de salida, flotando sobre el lago con un peñasco debajo
  const plat = stat({ type: 'box', c: new V3(0, 40, 75), h: new V3(32, 4, 60), yaw: 0 }, 'platform');
  stat({ type: 'capsule', a: new V3(0, 14, 75), b: new V3(0, 30, 75), r: 26 }, 'platform');
  TK.decor.push({ kind: 'platform', col: plat });

  // Bosque de torres: columnas finísimas que se curvan como velas derretidas
  const towers = [];
  const tryTower = (x, z, rad, H, bend, clearance) => {
    for (const t of towers) if (Math.hypot(t.x - x, t.z - z) < t.rad + rad + 18) return false;
    for (const p of S.pts) if (p.y < H + 20 && Math.hypot(p.x - x, p.z - z) < rad + clearance) return false;
    const ang = R() * Math.PI * 2, dir = new V3(Math.cos(ang), 0, Math.sin(ang));
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const h = (H + 30) * (k / 4), f = (k / 4) ** 2;
      pts.push(new V3(x + dir.x * bend * f, -30 + h, z + dir.z * bend * f));
    }
    for (let k = 0; k < 4; k++) stat({ type: 'capsule', a: pts[k], b: pts[k + 1], r: rad }, 'tower', 'T' + towers.length);
    towers.push({ x, z, rad });
    TK.decor.push({ kind: 'tower', pts, r: rad, H, drips: [0, 1, 2].map(() => ({ a: R() * Math.PI * 2, h: 0.72 + R() * 0.2, l: 0.6 + R() * 0.8 })) });
    return true;
  };
  const s0 = cp[GATE.bosque] - 120, s1 = cp[GATE.acantilado] + 60;
  let side = 1;
  for (let s = s0; s < s1; s += 44) {
    const f = S.frame(s);
    side = -side;
    const off = side * (26 + R() * 24), rad = 4 + R() * 3.5;
    tryTower(f.P.x + f.R.x * off, f.P.z + f.R.z * off, rad, 190 + R() * 150, R() * 10, 21);
    if (R() < 0.4) {
      const off2 = -side * (28 + R() * 18), r2 = 4 + R() * 3;
      tryTower(f.P.x + f.R.x * off2, f.P.z + f.R.z * off2, r2, 190 + R() * 150, R() * 10, 21);
    }
  }
  for (let k = 0, tries = 0; k < 70 && tries < 900; tries++) {
    const x = -560 + R() * 1150, z = -1760 + R() * 1500;
    if (tryTower(x, z, 5 + R() * 6, 160 + R() * 200, 10 + R() * 35, 48)) k++;
  }

  // Acantilado (pared de roca) con cajones gigantes que se abren y se cierran
  const cliff = stat({ type: 'box', c: new V3(850, 95, CLIFF_FACE_Z - 250), h: new V3(720, 145, 250), yaw: 0 }, 'cliff');
  TK.decor.push({ kind: 'cliff', col: cliff });
  const B = BUTTRESS, Tn = B.tunnel, w = B.wood;
  for (let k = 0; k < 11; k++) {
    const x = 420 + k * 104 + (R() - 0.5) * 24;
    if (x > B.x0 - 50 && x < B.x1 + 50) continue; // el contrafuerte ocupa ese trozo de pared
    const { s } = S.nearest(new V3(x, 150, -1880));
    const y = S.pointAt(s).y + (R() - 0.5) * 50;
    const ww = 30 + R() * 12, hh = 15 + R() * 6, depth = 30, maxExt = 22 + R() * 10;
    const period = 5 + R() * 2.5, phase = R() * Math.PI * 2;
    const col = tag({ type: 'box', c: new V3(x, y, CLIFF_FACE_Z - depth), h: new V3(ww, hh, depth), yaw: 0 }, 'drawer');
    TK.movers.push({
      kind: 'drawer', cols: [col], w: ww, hh, depth, x, y, ext: 0,
      bound: { c: new V3(x, y, CLIFF_FACE_Z), r: Math.hypot(ww, hh, depth + maxExt) + 2 },
      update(t) {
        this.ext = maxExt * clamp(0.5 + 0.9 * Math.sin((2 * Math.PI * t) / period + phase), 0, 1);
        col.c.z = CLIFF_FACE_Z - depth + this.ext;
      },
    });
  }
  // Contrafuerte con el cajón-túnel: cuatro bloques de roca alrededor del hueco y el cajón de madera que lo forra
  const zIn = CLIFF_FACE_Z - 10;
  const rock = [
    boxFrom(B.x0, -50, zIn, B.x1, Tn.y0 - w, B.zOut),
    boxFrom(B.x0, Tn.y1 + w, zIn, B.x1, 240, B.zOut),
    boxFrom(B.x0, Tn.y0 - w, Tn.z1 + w, B.x1, Tn.y1 + w, B.zOut),
    boxFrom(B.x0, Tn.y0 - w, zIn, B.x1, Tn.y1 + w, Tn.z0 - w),
  ].map(c => stat(c, 'cliff'));
  const X0 = B.x0 - B.over, X1 = B.x1 + B.over;
  const wood = [
    boxFrom(X0, Tn.y0 - w, Tn.z0 - w, X1, Tn.y0, Tn.z1 + w),
    boxFrom(X0, Tn.y1, Tn.z0 - w, X1, Tn.y1 + w, Tn.z1 + w),
    boxFrom(X0, Tn.y0, Tn.z0 - w, X1, Tn.y1, Tn.z0),
    boxFrom(X0, Tn.y0, Tn.z1, X1, Tn.y1, Tn.z1 + w),
  ].map(c => stat(c, 'drawer', 'TUNEL'));
  TK.decor.push({ kind: 'buttress', rock, wood });

  // Escaleras al cielo: tramos flotantes que giran despacio pegados a la horquilla
  const sE = cp[GATE.escaleras], sH = cp[GATE.horquilla];
  [[sE + 60, 88, 6], [sE + 170, -88, 18], [sH - 50, 90, 0], [sH + 70, -92, -8], [sH + 190, 88, 12]].forEach(([s, lat, up], k) => {
    const f = S.frame(s), c0 = f.P.clone().addScaled(f.R, lat).addScaled(f.U, up);
    const steps = 8, run = 13, rise = 7, cols = [];
    for (let j = 0; j < steps; j++) cols.push(tag({ type: 'box', c: new V3(), h: new V3(run / 2, 2, 15), yaw: 0 }, 'stairs'));
    const speed = (k % 2 ? -1 : 1) * (0.1 + R() * 0.06), yaw0 = R() * 6.28;
    TK.movers.push({
      kind: 'stairs', cols, pos: c0, yaw: 0, steps, run, rise,
      bound: { c: c0, r: Math.hypot((steps * run) / 2, (steps * rise) / 2, 15) + 4 },
      update(t) {
        this.yaw = yaw0 + speed * t;
        const co = Math.cos(this.yaw), si = Math.sin(this.yaw);
        cols.forEach((c, j) => {
          const d = (j - (steps - 1) / 2) * run, h = (j - (steps - 1) / 2) * rise;
          c.c.set(c0.x + d * co, c0.y + h, c0.z - d * si);
          c.yaw = this.yaw;
        });
      },
    });
  });

  // Péndulos gigantes colgados de las nubes, que barren el tramo alto de lado a lado
  const sA = cp[GATE.pendulos - 1], sB = cp[GATE.puerta];
  [0.16, 0.4, 0.62, 0.84].forEach((f, k) => {
    const fr = S.frame(sA + (sB - sA) * f), L = 360;
    const pivot = fr.P.clone().addScaled(UP, L), lat = new V3(fr.R.x, 0, fr.R.z).normalize();
    const rod = tag({ type: 'capsule', a: pivot, b: new V3(), r: 1.8 }, 'pendulum');
    const bob = tag({ type: 'sphere', c: rod.b, r: 15 }, 'pendulum');
    const amp = 0.55, period = 9, phase = k * 1.9;
    TK.movers.push({
      kind: 'pendulum', cols: [rod, bob], pivot, lat, L, angle: 0, bob: rod.b,
      bound: { c: pivot.clone().addScaled(UP, -L / 2), r: L / 2 + L * Math.sin(amp) + 20 },
      update(t) {
        this.angle = amp * Math.sin((2 * Math.PI * t) / period + phase);
        rod.b.copy(pivot).addScaled(lat, L * Math.sin(this.angle)).addScaled(UP, -L * Math.cos(this.angle));
      },
    });
  });

  // La puerta: un marco suspendido en el aire. Al cruzarla se hace de noche.
  {
    const fr = S.frame(cp[GATE.puerta]), yaw = yawFromRight(fr.R), half = 40, tall = 60;
    for (const sd of [-1, 1]) stat({ type: 'box', c: fr.P.clone().addScaled(fr.R, sd * (half + 6)), h: new V3(6, tall + 6, 6), yaw }, 'door');
    stat({ type: 'box', c: fr.P.clone().addScaled(UP, tall + 6), h: new V3(half + 12, 6, 6), yaw }, 'door');
    stat({ type: 'box', c: fr.P.clone().addScaled(UP, -tall - 6), h: new V3(half + 12, 6, 6), yaw }, 'door');
    const leafC = fr.P.clone().addScaled(fr.R, -(half + 8)).addScaled(fr.T, -(half + 2));
    const leaf = stat({ type: 'box', c: leafC, h: new V3(half, tall, 1.5), yaw: yawFromRight(fr.T) }, 'door');
    TK.decor.push({ kind: 'door', p: fr.P, yaw, half, tall, leaf });
  }

  // Puentes de papel que se pliegan: dos hojas que suben y bajan sobre el recorrido
  for (const [off, period, phase] of [[200, 7, 0], [390, 8.5, 2.1]]) {
    const fr = S.frame(cp[GATE.puerta] + off), hw = 62, Lf = 60, wide = 13;
    const leaves = [-1, 1].map(sd => tag({ type: 'obb', c: new V3(), h: new V3(Lf / 2, 0.8, wide), ax: new V3(), ay: new V3(), az: fr.T.clone() }, 'bridge'));
    TK.movers.push({
      kind: 'bridge', cols: leaves, fr, hw, Lf, wide, angle: 0,
      bound: { c: fr.P.clone(), r: hw + 20 },
      update(t) {
        // 0: cerrado (plano, cruza el recorrido); 1,25 rad: abierto (las hojas casi verticales a los lados)
        this.angle = 1.25 * clamp(0.5 + 0.75 * Math.sin((2 * Math.PI * t) / period + phase), 0, 1);
        const co = Math.cos(this.angle), si = Math.sin(this.angle);
        leaves.forEach((c, k) => {
          const sd = k ? 1 : -1; // −1 hoja izquierda, +1 derecha
          c.ax.set(-sd * fr.R.x * co + fr.U.x * si, -sd * fr.R.y * co + fr.U.y * si, -sd * fr.R.z * co + fr.U.z * si);
          c.ay.crossVectors(fr.T, c.ax).normalize();
          if (c.ay.dot(fr.U) < 0) c.ay.scale(-1);
          c.c.copy(fr.P).addScaled(fr.R, sd * hw).addScaled(c.ax, Lf / 2);
        });
      },
    });
  }

  // Ballena de nubes: nada despacio a lo largo del recorrido, por encima; se pasa por debajo
  {
    const sW = cp[GATE.ballena], body = tag({ type: 'ellipsoid', c: new V3(), r: new V3(30, 26, 100), yaw: 0 }, 'whale');
    const tail = tag({ type: 'sphere', c: new V3(), r: 16 }, 'whale');
    TK.movers.push({
      kind: 'whale', cols: [body, tail], pos: body.c, yaw: 0, sway: 0,
      bound: { c: S.pointAt(sW).addScaled(UP, 60), r: 420 },
      update(t) {
        const s = sW + 130 * Math.sin((2 * Math.PI * t) / 38);
        const P = S.pointAt(s), T = S.tangentAt(s);
        this.sway = Math.sin((2 * Math.PI * t) / 4.5);
        body.c.copy(P).addScaled(UP, 62 + 6 * Math.sin((2 * Math.PI * t) / 8));
        this.yaw = Math.atan2(T.x, T.z);
        body.yaw = this.yaw;
        tail.c.set(body.c.x - Math.sin(this.yaw) * 110, body.c.y + 4 + this.sway * 6, body.c.z - Math.cos(this.yaw) * 110);
      },
    });
  }

  // Tren de vapor por un raíl suspendido que cruza el lago; aparece y desaparece entre nubes
  {
    let best = null;
    for (let s = cp[GATE.lago]; s < cp[GATE.lago + 1]; s += 4) { const p = S.pointAt(s); if (!best || Math.abs(p.z + 60) < Math.abs(best.z + 60)) best = p; }
    const yR = best.y, zR = -60, xA = -1300, xB = -150, v = 46, cars = 4, gap = 19;
    stat(boxFrom(xA, yR - 6.6, zR - 1.4, xB, yR - 5.4, zR + 1.4), 'rail');
    const cols = [];
    for (let k = 0; k < cars; k++) cols.push(tag({ type: 'box', c: new V3(0, yR - 5 + (k ? 4.5 : 5), zR), h: new V3(8.5, k ? 4.5 : 5, k ? 3.4 : 3.6), yaw: 0 }, 'train'));
    const span = xB - xA + 120;
    TK.movers.push({
      kind: 'train', cols, head: 0, xA, xB, yR, zR, cars, gap,
      bound: { c: new V3((xA + xB) / 2, yR, zR), r: (xB - xA) / 2 + 90 },
      update(t) {
        this.head = xA - 60 + ((t * v) % span + span) % span;
        cols.forEach((c, k) => { c.c.x = this.head - k * gap; });
      },
    });
    TK.decor.push({ kind: 'rail', xA, xB, yR, zR });
  }

  // Peñascos flotantes alrededor de la horquilla y sobre el bosque (con colisión)
  for (let k = 0, tries = 0; k < 14 && tries < 400; tries++) {
    const near = k < 8 ? S.pointAt(sH + (R() - 0.5) * 700) : S.pointAt(cp[GATE.bosque] + R() * 1200);
    const c = new V3(near.x + (R() - 0.5) * 500, near.y + 60 + R() * 220, near.z + (R() - 0.5) * 500);
    const r = 14 + R() * 22;
    if (S.nearest(c).d < r + 70) continue;
    stat({ type: 'sphere', c, r: r * 0.9 }, 'rock');
    TK.decor.push({ kind: 'floatRock', c, r, seed: R() });
    k++;
  }

  // Viento: corrientes térmicas (te elevan y cargan turbo) y viento lateral junto al acantilado
  for (const [i, f, lat] of [[GATE.lago, 0.3, 46], [GATE.lago, 0.72, -44], [GATE.lago + 1, 0.5, 42], [GATE.acantilado - 1, 0.6, -60], [GATE.acantilado - 1, 0.85, 55]]) {
    const fr = S.frame(segS(i, f)), c = fr.P.clone().addScaled(fr.R, lat);
    TK.thermals.push({ c: new V3(c.x, 0, c.z), r: 30, top: fr.P.y + 160, k: 18 });
  }
  TK.windZones.push({ x0: 280, x1: 1600, z0: CLIFF_FACE_Z, z1: -1650, y1: 260, dir: new V3(0, 0, -1), k: 5 });
}

const key = (ix, iz) => (ix + 1000) * 4000 + (iz + 1000);
function bounds(c) {
  if (c.type === 'archwall') c = { ...c, type: 'box' };
  let r, x0, x1, z0, z1;
  switch (c.type) {
    case 'sphere': r = c.r; return { x0: c.c.x - r, x1: c.c.x + r, z0: c.c.z - r, z1: c.c.z + r };
    case 'capsule': r = c.r;
      x0 = Math.min(c.a.x, c.b.x) - r; x1 = Math.max(c.a.x, c.b.x) + r; z0 = Math.min(c.a.z, c.b.z) - r; z1 = Math.max(c.a.z, c.b.z) + r;
      return { x0, x1, z0, z1 };
    case 'obb': {
      const ex = Math.abs(c.ax.x) * c.h.x + Math.abs(c.ay.x) * c.h.y + Math.abs(c.az.x) * c.h.z;
      const ez = Math.abs(c.ax.z) * c.h.x + Math.abs(c.ay.z) * c.h.y + Math.abs(c.az.z) * c.h.z;
      return { x0: c.c.x - ex, x1: c.c.x + ex, z0: c.c.z - ez, z1: c.c.z + ez };
    }
    case 'box': case 'ellipsoid': {
      const h = c.h || c.r, ext = Math.abs(h.x * Math.cos(c.yaw)) + Math.abs(h.z * Math.sin(c.yaw)), ezt = Math.abs(h.x * Math.sin(c.yaw)) + Math.abs(h.z * Math.cos(c.yaw));
      return { x0: c.c.x - ext, x1: c.c.x + ext, z0: c.c.z - ezt, z1: c.c.z + ezt };
    }
  }
}
