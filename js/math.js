// Vectores y cuaterniones mínimos, sin three.js, para que la física se pueda simular en Node.
// Mismos nombres de campos que three (x, y, z, w) para copiarlos directamente a los objetos 3D.

export class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  subVectors(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  crossVectors(a, b) {
    const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
    return this.set(x, y, z);
  }
  len() { return Math.hypot(this.x, this.y, this.z); }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize() { const l = this.len(); return l > 1e-12 ? this.scale(1 / l) : this; }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  applyQuat(q) {
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }
  // Rotación inversa (cuaternión unitario)
  applyQuatInv(q) {
    _q.set(-q.x, -q.y, -q.z, q.w);
    return this.applyQuat(_q);
  }
}

export class Quat {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Quat(this.x, this.y, this.z, this.w); }
  multiplyQuaternions(a, b) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by;
    this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  multiply(q) { return this.multiplyQuaternions(this, q); }
  premultiply(q) { return this.multiplyQuaternions(q, this); }
  normalize() {
    const l = Math.hypot(this.x, this.y, this.z, this.w) || 1;
    this.x /= l; this.y /= l; this.z /= l; this.w /= l;
    return this;
  }
  setAxisAngle(ax, a) {
    const s = Math.sin(a / 2);
    return this.set(ax.x * s, ax.y * s, ax.z * s, Math.cos(a / 2));
  }
  // Gira en ejes locales: this = this * exp(r), con r = vector de rotación (rad) en el marco del jet
  rotateLocal(rx, ry, rz) {
    const a = Math.hypot(rx, ry, rz);
    if (a < 1e-10) return this;
    const s = Math.sin(a / 2) / a;
    _q.set(rx * s, ry * s, rz * s, Math.cos(a / 2));
    return this.multiply(_q).normalize();
  }
  // Gira en ejes del mundo
  rotateWorld(rx, ry, rz) {
    const a = Math.hypot(rx, ry, rz);
    if (a < 1e-10) return this;
    const s = Math.sin(a / 2) / a;
    _q.set(rx * s, ry * s, rz * s, Math.cos(a / 2));
    return this.premultiply(_q).normalize();
  }
  // Orientación con el morro (−Z local) hacia fwd y el techo lo más cerca posible de upHint
  lookAlong(fwd, upHint = UP) {
    const z = _a.copy(fwd).scale(-1).normalize();
    const x = _b.crossVectors(upHint, z);
    if (x.lenSq() < 1e-6) x.crossVectors(Math.abs(z.y) < 0.9 ? UP : _c.set(0, 0, 1), z);
    x.normalize();
    const y = _c.crossVectors(z, x);
    const m11 = x.x, m12 = y.x, m13 = z.x, m21 = x.y, m22 = y.y, m23 = z.y, m31 = x.z, m32 = y.z, m33 = z.z;
    const tr = m11 + m22 + m33;
    if (tr > 0) {
      const s = 0.5 / Math.sqrt(tr + 1);
      this.set((m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s);
    } else if (m11 > m22 && m11 > m33) {
      const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      this.set(0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s);
    } else if (m22 > m33) {
      const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
      this.set((m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s);
    } else {
      const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
      this.set((m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s);
    }
    return this.normalize();
  }
  slerp(qb, t) {
    if (t <= 0) return this;
    if (t >= 1) return this.copy(qb);
    let { x, y, z, w } = this;
    let cos = w * qb.w + x * qb.x + y * qb.y + z * qb.z;
    let bx = qb.x, by = qb.y, bz = qb.z, bw = qb.w;
    if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    if (cos > 0.9995) {
      this.set(x + (bx - x) * t, y + (by - y) * t, z + (bz - z) * t, w + (bw - w) * t);
      return this.normalize();
    }
    const th = Math.acos(cos), sn = Math.sin(th), ra = Math.sin((1 - t) * th) / sn, rb = Math.sin(t * th) / sn;
    return this.set(x * ra + bx * rb, y * ra + by * rb, z * ra + bz * rb, w * ra + bw * rb);
  }
}

export const UP = new V3(0, 1, 0);
const _q = new Quat(), _a = new V3(), _b = new V3(), _c = new V3();

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const damp = (k, dt) => 1 - Math.exp(-k * dt); // factor de suavizado independiente de los fps
export const wrapAngle = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// Generador aleatorio con semilla: el mapa sale igual en todas las pantallas
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
