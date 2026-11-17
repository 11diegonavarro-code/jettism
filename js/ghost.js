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

// ---------- Fantasma compacto, para compartirlo (enlace o tabla mundial) ----------
// 15 muestras por segundo: posición en cuartos de metro (int16) y giro en 8 bits por componente. Unos 150 bytes por segundo.
const b64url = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), c => c.charCodeAt(0));
export function packGhost(f32, hz = 15) {
  const P = new GhostPlayer(f32), dur = P.duration, n = Math.floor(dur * hz) + 1;
  if (P.n < 2) return '';
  const buf = new ArrayBuffer(6 + n * 10), v = new DataView(buf), q8 = x => Math.max(-127, Math.min(127, Math.round(x * 127)));
  v.setUint8(0, 1); v.setUint8(1, hz); v.setUint32(2, n, true);
  for (let i = 0; i < n; i++) {
    P.at(Math.min(i / hz, dur));
    const o = 6 + i * 10, p = P.pos, q = P.q;
    v.setInt16(o, Math.round(p.x * 4), true); v.setInt16(o + 2, Math.round(p.y * 4), true); v.setInt16(o + 4, Math.round(p.z * 4), true);
    v.setInt8(o + 6, q8(q.x)); v.setInt8(o + 7, q8(q.y)); v.setInt8(o + 8, q8(q.z)); v.setInt8(o + 9, q8(q.w));
  }
  return b64url(new Uint8Array(buf));
}
export function unpackGhost(str) {
  const b = unb64url(String(str)), v = new DataView(b.buffer);
  if (v.getUint8(0) !== 1) throw new Error('fantasma desconocido');
  const hz = v.getUint8(1), n = v.getUint32(2, true);
  if (!hz || n < 2 || n > 20000 || b.length < 6 + n * 10) throw new Error('fantasma roto');
  const out = new Float32Array(n * STRIDE);
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 10, k = i * STRIDE;
    let qx = v.getInt8(o + 6) / 127, qy = v.getInt8(o + 7) / 127, qz = v.getInt8(o + 8) / 127, qw = v.getInt8(o + 9) / 127;
    const l = Math.hypot(qx, qy, qz, qw) || 1;
    out[k] = i / hz; out[k + 1] = v.getInt16(o, true) / 4; out[k + 2] = v.getInt16(o + 2, true) / 4; out[k + 3] = v.getInt16(o + 4, true) / 4;
    out[k + 4] = qx / l; out[k + 5] = qy / l; out[k + 6] = qz / l; out[k + 7] = qw / l;
  }
  return out;
}
