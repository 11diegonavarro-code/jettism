// Mapa 1, «Desierto de los sueños» (versión en bruto de la parte 1).
// Todo es JS puro: el recorrido, los colisionadores (funciones de distancia) y los obstáculos móviles,
// que dependen solo del reloj de la carrera para que coincidan en todas las pantallas.
import { V3, UP, clamp, rng } from './math.js';

// Puntos de control del recorrido (una puerta en cada uno)
const CP = [
  [0, 60, 0],          // 0 salida y meta
  [0, 66, -420],       // 1 entrada al bosque de torres
  [70, 80, -760],
  [-60, 92, -1080],
  [60, 104, -1400],
  [300, 125, -1720],   // 5 giro hacia el acantilado
  [700, 140, -1880],   // 6 acantilado de cajones
  [1150, 155, -1875],
  [1560, 190, -1800],  // 8 escaleras al cielo
  [1780, 300, -1700],  // 9 horquilla vertical (Immelmann)
  [1520, 380, -1640],
  [1100, 370, -1690],  // 11 péndulos
  [680, 350, -1720],
  [240, 320, -1720],   // 13 la puerta
  [-260, 270, -1560],
  [-560, 215, -1160],  // 15 ballena de nubes
  [-640, 160, -680],
  [-540, 105, -240],   // 17 bajada al lago espejo
  [-280, 70, 120],
  [-90, 62, 150],
];
export const SECTIONS = [[0, 'Salida'], [1, 'Bosque de torres'], [5, 'Acantilado de cajones'], [8, 'Escaleras al cielo'], [10, 'Los péndulos'], [13, 'La puerta'], [14, 'Ballena de nubes'], [17, 'Lago espejo']];
export const JET_RADIUS = 2.5;
export const CLIFF_FACE_Z = -1935;
export const LAKE = { x: -220, z: -60, r: 760 };
const CELL = 128;

// ---------- Curva del recorrido (Catmull-Rom centrípeta cerrada) ----------
class Spline {
  constructor(points, perSeg = 60) {
    const P = points.map(p => new V3(...p)), n = P.length;
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
    // refina sobre los dos tramos vecinos
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
  // Distancia mínima de un punto al recorrido (búsqueda global)
  distTo(p) { return this.nearest(p).d; }
}
const lin = (a, b, ta, tb, t) => {
  const f = (t - ta) / (tb - ta || 1);
  return new V3(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
};
const _t1 = new V3(), _t2 = new V3(), _t3 = new V3();

// ---------- Funciones de distancia con signo ----------
const _p = new V3();
function sdf(c, p) {
  switch (c.type) {
    case 'sphere': return p.dist(c.c) - c.r;
    case 'capsule': {
      const bax = c.b.x - c.a.x, bay = c.b.y - c.a.y, baz = c.b.z - c.a.z;
      const pax = p.x - c.a.x, pay = p.y - c.a.y, paz = p.z - c.a.z;
      const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz || 1), 0, 1);
      return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - c.r;
    }
    case 'box': {
      const dx = p.x - c.c.x, dz = p.z - c.c.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
      const lx = dx * co - dz * si, lz = dx * si + dz * co, ly = p.y - c.c.y;
      const qx = Math.abs(lx) - c.h.x, qy = Math.abs(ly) - c.h.y, qz = Math.abs(lz) - c.h.z;
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return out + Math.min(Math.max(qx, qy, qz), 0);
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
const yawFromForward = T => Math.atan2(-T.x, -T.z) ; // −Z local hacia T

export class Track {
  constructor(seed = 7) {
    this.spline = new Spline(CP);
    this.length = this.spline.length;
    this.statics = []; this.movers = []; this.decor = []; this.grid = new Map();
    this.gates = []; this.boostRings = [];
    this.rand = rng(seed);
    this.build();
    for (const c of this.statics) this.insert(c);
    this.movers.forEach((m, i) => m.cols.forEach(c => { c.grp = 'M' + i; }));
    this.update(0);
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

  build() {
    const S = this.spline, R = this.rand, cp = S.cpS;
    let uid = 1;
    const tag = (c, kind) => { c.kind = kind; c.uid = uid++; return c; };

    // Puertas (anillos) en cada punto de control
    CP.forEach((_, i) => {
      const P = S.pointAt(cp[i]), T = S.tangentAt(cp[i]);
      this.gates.push({ i, s: cp[i], p: P, t: T, ring: i === 0 ? 30 : i === 9 ? 24 : 18, cp: 55 });
    });
    // Anillos de turbo pequeños
    for (const [i, f] of [[0, 0.55], [6, 0.45], [11, 0.4], [17, 0.5]]) {
      const s = cp[i] + (cp[(i + 1) % cp.length] - cp[i] || this.length - cp[i]) * f;
      this.boostRings.push({ s, p: S.pointAt(s), t: S.tangentAt(s), r: 7 });
    }

    // Plataforma de salida
    const plat = tag({ type: 'box', c: new V3(0, 40, 75), h: new V3(32, 4, 60), yaw: 0 }, 'platform');
    this.statics.push(plat);
    this.decor.push({ kind: 'platform', col: plat });

    // Bosque de torres: columnas finísimas que se curvan como velas
    const towers = [];
    const tryTower = (x, z, rad, H, bend, clearance) => {
      for (const t of towers) if (Math.hypot(t.x - x, t.z - z) < t.rad + rad + 18) return false;
      // distancia horizontal al recorrido donde el recorrido está por debajo de la torre
      for (const p of S.pts) if (p.y < H && Math.hypot(p.x - x, p.z - z) < rad + clearance) return false;
      const ang = R() * Math.PI * 2, dir = new V3(Math.cos(ang), 0, Math.sin(ang));
      const pts = [];
      for (let k = 0; k <= 4; k++) {
        const h = (H + 30) * (k / 4), f = (k / 4) ** 2;
        pts.push(new V3(x + dir.x * bend * f, -30 + h, z + dir.z * bend * f));
      }
      for (let k = 0; k < 4; k++) {
        const c = tag({ type: 'capsule', a: pts[k], b: pts[k + 1], r: rad }, 'tower');
        c.grp = 'T' + towers.length;
        this.statics.push(c);
      }
      towers.push({ x, z, rad });
      this.decor.push({ kind: 'tower', pts, r: rad, H });
      return true;
    };
    const s0 = cp[1] - 120, s1 = cp[5] + 60;
    let side = 1;
    for (let s = s0; s < s1; s += 44) {
      const f = S.frame(s);
      side = -side;
      const off = side * (26 + R() * 24), rad = 4 + R() * 3.5;
      const x = f.P.x + f.R.x * off, z = f.P.z + f.R.z * off;
      tryTower(x, z, rad, 190 + R() * 150, R() * 10, 21);
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
    const cliff = tag({ type: 'box', c: new V3(850, 95, CLIFF_FACE_Z - 250), h: new V3(720, 145, 250), yaw: 0 }, 'cliff');
    this.statics.push(cliff);
    this.decor.push({ kind: 'cliff', col: cliff });
    for (let k = 0; k < 10; k++) {
      const x = 420 + k * 108 + (R() - 0.5) * 30;
      const { s } = S.nearest(new V3(x, 150, -1880));
      const y = S.pointAt(s).y + (R() - 0.5) * 50;
      const w = 30 + R() * 12, hh = 15 + R() * 6, depth = 30, maxExt = 22 + R() * 10;
      const period = 5 + R() * 2.5, phase = R() * Math.PI * 2;
      const col = tag({ type: 'box', c: new V3(x, y, CLIFF_FACE_Z - depth), h: new V3(w, hh, depth), yaw: 0 }, 'drawer');
      const m = {
        kind: 'drawer', cols: [col], w, hh, depth, x, y, ext: 0,
        bound: { c: new V3(x, y, CLIFF_FACE_Z), r: Math.hypot(w, hh, depth + maxExt) + 2 },
        update(t) {
          this.ext = maxExt * clamp(0.5 + 0.9 * Math.sin((2 * Math.PI * t) / period + phase), 0, 1);
          col.c.z = CLIFF_FACE_Z - depth + this.ext;
        },
      };
      this.movers.push(m);
    }

    // Escaleras al cielo: tramos flotantes que giran despacio alrededor de la horquilla
    const flights = [[1745, 150, -1555], [1985, 300, -1735], [1690, 500, -1845], [1350, 300, -1480], [1470, 120, -1980]];
    flights.forEach(([x, y, z], k) => {
      const steps = 8, run = 13, rise = 7, cols = [];
      for (let j = 0; j < steps; j++) cols.push(tag({ type: 'box', c: new V3(), h: new V3(run / 2, 2, 15), yaw: 0 }, 'stairs'));
      const speed = (k % 2 ? -1 : 1) * (0.1 + R() * 0.06), yaw0 = R() * 6.28;
      const m = {
        kind: 'stairs', cols, pos: new V3(x, y, z), yaw: 0, steps, run, rise,
        bound: { c: new V3(x, y, z), r: Math.hypot((steps * run) / 2, (steps * rise) / 2, 15) + 4 },
        update(t) {
          this.yaw = yaw0 + speed * t;
          const co = Math.cos(this.yaw), si = Math.sin(this.yaw);
          cols.forEach((c, j) => {
            const d = (j - (steps - 1) / 2) * run, h = (j - (steps - 1) / 2) * rise;
            c.c.set(x + d * co, y + h, z - d * si);
            c.yaw = this.yaw;
          });
        },
      };
      this.movers.push(m);
    });

    // Péndulos gigantes colgados de las nubes, que barren el tramo alto de lado a lado
    const sA = cp[10], sB = cp[13];
    [0.16, 0.4, 0.62, 0.84].forEach((f, k) => {
      const fr = S.frame(sA + (sB - sA) * f), L = 360;
      const pivot = fr.P.clone().addScaled(UP, L), lat = new V3(fr.R.x, 0, fr.R.z).normalize();
      const rod = tag({ type: 'capsule', a: pivot, b: new V3(), r: 1.8 }, 'pendulum');
      const bob = tag({ type: 'sphere', c: rod.b, r: 15 }, 'pendulum');
      const amp = 0.55, period = 9, phase = k * 1.9;
      const m = {
        kind: 'pendulum', cols: [rod, bob], pivot, lat, L, angle: 0, bob: rod.b,
        bound: { c: pivot.clone().addScaled(UP, -L / 2), r: L / 2 + L * Math.sin(amp) + 20 },
        update(t) {
          this.angle = amp * Math.sin((2 * Math.PI * t) / period + phase);
          rod.b.copy(pivot).addScaled(lat, L * Math.sin(this.angle)).addScaled(UP, -L * Math.cos(this.angle));
        },
      };
      this.movers.push(m);
    });

    // La puerta: un marco suspendido en el aire
    {
      const fr = S.frame(cp[13]), yaw = yawFromRight(fr.R), half = 40, tall = 60;
      for (const sd of [-1, 1]) {
        const c = tag({ type: 'box', c: fr.P.clone().addScaled(fr.R, sd * (half + 6)), h: new V3(6, tall + 6, 6), yaw }, 'door');
        this.statics.push(c);
      }
      const top = tag({ type: 'box', c: fr.P.clone().addScaled(UP, tall + 6), h: new V3(half + 12, 6, 6), yaw }, 'door');
      const bot = tag({ type: 'box', c: fr.P.clone().addScaled(UP, -tall - 6), h: new V3(half + 12, 6, 6), yaw }, 'door');
      // la hoja de la puerta, abierta hacia los que llegan, pegada al marco izquierdo
      const leafC = fr.P.clone().addScaled(fr.R, -(half + 8)).addScaled(fr.T, -(half + 2));
      const leaf = tag({ type: 'box', c: leafC, h: new V3(half, tall, 1.5), yaw: yawFromRight(fr.T) }, 'door');
      this.statics.push(top, bot, leaf);
      this.decor.push({ kind: 'door', p: fr.P, yaw, half, tall, leaf });
    }

    // Ballena de nubes: nada despacio a lo largo del recorrido, por encima; se pasa por debajo
    {
      const sW = cp[15], body = tag({ type: 'ellipsoid', c: new V3(), r: new V3(30, 26, 100), yaw: 0 }, 'whale');
      const tail = tag({ type: 'sphere', c: new V3(), r: 16 }, 'whale');
      const S2 = S;
      const m = {
        kind: 'whale', cols: [body, tail], pos: body.c, yaw: 0, sway: 0,
        bound: { c: S.pointAt(sW).addScaled(UP, 60), r: 420 },
        update(t) {
          const s = sW + 130 * Math.sin((2 * Math.PI * t) / 38);
          const P = S2.pointAt(s), T = S2.tangentAt(s);
          this.sway = Math.sin((2 * Math.PI * t) / 4.5);
          body.c.copy(P).addScaled(UP, 62 + 6 * Math.sin((2 * Math.PI * t) / 8));
          this.yaw = Math.atan2(T.x, T.z);
          body.yaw = this.yaw;
          tail.c.set(body.c.x - Math.sin(this.yaw) * 110, body.c.y + 4 + this.sway * 6, body.c.z - Math.cos(this.yaw) * 110);
        },
      };
      this.movers.push(m);
    }
  }

  update(t) { for (const m of this.movers) m.update(t); }

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

  groundY() { return 0; }

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
      if (p.dist(m.bound.c) - m.bound.r > radius) continue;
      m.update(future);
      for (const c of m.cols) {
        const d = sdf(c, p);
        if (d < best.d) best = { d, col: c, n: this.normal(c, p) };
      }
      m.update(now);
    }
    return best;
  }
}

const key = (ix, iz) => (ix + 1000) * 4000 + (iz + 1000);
function bounds(c) {
  let r, x0, x1, z0, z1;
  switch (c.type) {
    case 'sphere': r = c.r; return { x0: c.c.x - r, x1: c.c.x + r, z0: c.c.z - r, z1: c.c.z + r };
    case 'capsule': r = c.r;
      x0 = Math.min(c.a.x, c.b.x) - r; x1 = Math.max(c.a.x, c.b.x) + r; z0 = Math.min(c.a.z, c.b.z) - r; z1 = Math.max(c.a.z, c.b.z) + r;
      return { x0, x1, z0, z1 };
    case 'box': case 'ellipsoid': {
      const h = c.h || c.r, ext = Math.abs(h.x * Math.cos(c.yaw)) + Math.abs(h.z * Math.sin(c.yaw)), ezt = Math.abs(h.x * Math.sin(c.yaw)) + Math.abs(h.z * Math.cos(c.yaw));
      return { x0: c.c.x - ext, x1: c.c.x + ext, z0: c.c.z - ezt, z1: c.c.z + ezt };
    }
  }
}
export { yawFromForward };
