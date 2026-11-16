// Fantasma de la contrarreloj: graba la mejor vuelta (20 muestras por segundo) y la reproduce.
import { V3, Quat } from './math.js';

const STRIDE = 8; // t, x, y, z, qx, qy, qz, qw

export class GhostRecorder {
  constructor(hz = 20) { this.dt = 1 / hz; this.reset(); }
  reset() { this.buf = []; this.next = 0; }
  sample(t, jet) {
    if (t < this.next) return;
    this.next = t + this.dt;
    const { pos: p, q } = jet;
    this.buf.push(t, p.x, p.y, p.z, q.x, q.y, q.z, q.w);
  }
  data() { return new Float32Array(this.buf); }
}

export class GhostPlayer {
  constructor(data) { this.d = data; this.n = data.length / STRIDE; this.i = 0; this.pos = new V3(); this.q = new Quat(); this._q = new Quat(); }
  get duration() { return this.n ? this.d[(this.n - 1) * STRIDE] : 0; }
  // Coloca el fantasma en el instante t; devuelve false si ya ha terminado
  at(t) {
    const d = this.d;
    if (this.n < 2 || t > this.duration) return false;
    if (this.i >= this.n - 1 || d[this.i * STRIDE] > t) this.i = 0;
    while (this.i < this.n - 2 && d[(this.i + 1) * STRIDE] <= t) this.i++;
    const a = this.i * STRIDE, b = a + STRIDE, f = Math.min(1, Math.max(0, (t - d[a]) / (d[b] - d[a] || 1)));
    this.pos.set(d[a + 1] + (d[b + 1] - d[a + 1]) * f, d[a + 2] + (d[b + 2] - d[a + 2]) * f, d[a + 3] + (d[b + 3] - d[a + 3]) * f);
    this.q.set(d[a + 4], d[a + 5], d[a + 6], d[a + 7]);
    this._q.set(d[b + 4], d[b + 5], d[b + 6], d[b + 7]);
    this.q.slerp(this._q, f);
    return true;
  }
}

export function encodeGhost(f32) {
  const bytes = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function decodeGhost(str) {
  const bin = atob(str), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
