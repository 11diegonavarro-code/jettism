// Circuitos propios: el código que se comparte (lleva el circuito dentro, sin servidor) y la lista guardada en el navegador.
// Formato: versión, nombre, puertas [x, y, z, tamaño] y anillos de turbo [puerta, fracción del tramo], en binario y base64url.
const SIZES = ['s', 'm', 'l'];
export const LIMITS = { minGates: 4, maxGates: 60, maxBoosts: 30, minLen: 800, maxLen: 30000, xz: 6000, yMin: 12, yMax: 1200 };
export const cleanCourseName = n => String(n || '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 24) || 'Mi circuito';

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)), c => c.charCodeAt(0));

export function encodeCourse(c) {
  const name = new TextEncoder().encode(cleanCourseName(c.name)).slice(0, 48);
  const gates = c.gates.slice(0, LIMITS.maxGates), boosts = (c.boosts || []).slice(0, LIMITS.maxBoosts);
  const buf = new ArrayBuffer(3 + name.length + 1 + gates.length * 7 + 1 + boosts.length * 2), v = new DataView(buf);
  let o = 0;
  v.setUint8(o++, 1); v.setUint8(o++, name.length);
  new Uint8Array(buf, o, name.length).set(name); o += name.length;
  v.setUint8(o++, gates.length);
  for (const g of gates) {
    v.setInt16(o, Math.round(g[0]), true); v.setUint16(o + 2, Math.round(g[1] * 2), true); v.setInt16(o + 4, Math.round(g[2]), true);
    v.setUint8(o + 6, Math.max(0, SIZES.indexOf(g[3]))); o += 7;
  }
  v.setUint8(o++, boosts.length);
  for (const b of boosts) { v.setUint8(o++, b[0]); v.setUint8(o++, Math.round(Math.max(0, Math.min(1, b[1])) * 255)); }
  v.setUint8(o, 0); // reservado
  return b64url(new Uint8Array(buf));
}

// Lee un código; lanza un error si no es válido
export function decodeCourse(str) {
  const bytes = unb64url(String(str).trim()), v = new DataView(bytes.buffer);
  let o = 0;
  if (v.getUint8(o++) !== 1) throw new Error('versión desconocida');
  const nl = v.getUint8(o++);
  const name = cleanCourseName(new TextDecoder().decode(bytes.slice(o, o + nl))); o += nl;
  const n = v.getUint8(o++);
  if (n < LIMITS.minGates || n > LIMITS.maxGates) throw new Error('número de puertas fuera de rango');
  const gates = [];
  for (let i = 0; i < n; i++, o += 7) {
    const g = [v.getInt16(o, true), v.getUint16(o + 2, true) / 2, v.getInt16(o + 4, true), SIZES[v.getUint8(o + 6)] || 'm'];
    if (Math.abs(g[0]) > LIMITS.xz || Math.abs(g[2]) > LIMITS.xz || g[1] < LIMITS.yMin || g[1] > LIMITS.yMax) throw new Error('puerta fuera del mapa');
    gates.push(g);
  }
  const m = v.getUint8(o++), boosts = [];
  for (let k = 0; k < m; k++, o += 2) { const i = v.getUint8(o), f = v.getUint8(o + 1) / 255; if (i < n) boosts.push([i, f]); }
  return { name, gates, boosts };
}

// Identificador estable de un circuito (para sus récords y su fantasma)
export function courseId(code) {
  let h = 0x811c9dc5;
  for (let i = 0; i < code.length; i++) { h ^= code.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'c' + h.toString(36);
}

// Lista de circuitos guardados en este navegador: [{ code, name, t }]
export class CourseStore {
  constructor(store) { this.store = store; }
  list() { try { const a = JSON.parse(this.store.get('jt-circuitos', '[]')); return Array.isArray(a) ? a.filter(x => x && typeof x.code === 'string') : []; } catch { return []; } }
  save(code) {
    const c = decodeCourse(code), list = this.list().filter(x => x.code !== code && x.name !== c.name);
    list.unshift({ code, name: c.name, t: Date.now() });
    this.store.set('jt-circuitos', JSON.stringify(list.slice(0, 40)));
    return c;
  }
  remove(code) { this.store.set('jt-circuitos', JSON.stringify(this.list().filter(x => x.code !== code))); }
}
