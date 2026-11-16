// Piruetas: los programas de los combos, el lector de combos, el detector de piruetas a mano y la puntuación de estilo.
import { clamp } from './math.js';

const TAU = Math.PI * 2, PI = Math.PI;

// Velocidad de giro con perfil trapezoidal que suma exactamente A radianes en T segundos
function trap(A, T, t) {
  if (t < 0 || t > T) return 0;
  const r = Math.min(0.25, T * 0.25), h = A / (T - r);
  return t < r ? (h * t) / r : t > T - r ? (h * (T - t)) / r : h;
}

// o.pitch / o.roll en rad/s (cabeceo +arriba, alabeo +derecha); grip = cuánto sigue la velocidad al morro
export const TRICKS = {
  tonel: { label: 'Tonel', turbo: 10, pts: 100, dur: 0.75, prog(t, s, o) { o.roll = trap(TAU * s, 0.75, t); } },
  derrape: { label: 'Tonel en derrape', turbo: 15, pts: 150, dur: 0.8, prog(t, s, o) { o.roll = trap(TAU * s, 0.8, t); o.grip = 0.5; o.latAcc = s * 24 * Math.sin((PI * t) / 0.8); } },
  looping: { label: 'Looping', turbo: 20, pts: 200, dur: 2.7, prog(t, s, o) { o.pitch = trap(TAU, 2.7, t); o.grip = 9; } },
  campana: { label: 'Vuelta de campana', turbo: 20, pts: 200, dur: 0.9, prog(t, s, o) { o.pitch = trap(-TAU, 0.9, t); o.grip = 0; } },
  immelmann: { label: 'Immelmann', turbo: 25, pts: 250, dur: 2.05, prog(t, s, o) { o.pitch = trap(PI, 1.5, t); o.roll = trap(PI * s, 0.55, t - 1.5); o.grip = 9; } },
  splitS: { label: 'Split-S', turbo: 25, pts: 250, dur: 2.05, prog(t, s, o) { o.roll = trap(PI * s, 0.55, t); o.pitch = trap(PI, 1.5, t - 0.55); o.grip = 9; } },
  barrena: { label: 'Barrena', turbo: 30, pts: 300, dur: 1.8, prog(t, s, o) { o.roll = trap(2 * TAU * s, 1.8, t); o.grip = 0.4; o.sink = 11; } },
  cobra: { label: 'Cobra', turbo: 15, pts: 150, dur: 1.3, prog(t, s, o) { o.pitch = trap(1.45, 0.45, t) + trap(-1.45, 0.45, t - 0.85); o.grip = 0; o.drag = 0.5; } },
  cuchillo: { label: 'Vuelo de cuchillo', turbo: 5, pts: 50, perSecond: true },
  invertido: { label: 'Vuelo invertido', turbo: 4, pts: 40, perSecond: true },
};

// Lista para la ayuda de controles
export const COMBO_HELP = [
  ['Tonel', 'lado'], ['Tonel en derrape', 'lado mientras derrapas (Q/E)'], ['Looping', 'tirar'], ['Vuelta de campana', 'empujar'],
  ['Immelmann', 'tirar → lado'], ['Split-S', 'lado → tirar'], ['Barrena', 'empujar → lado'], ['Cobra', 'tirar → tirar'],
  ['Vuelo de cuchillo', 'a mano: de lado'], ['Vuelo invertido', 'a mano: boca abajo'],
];

// Lee «botón de pirueta + direcciones». Las direcciones llegan como eventos: 'pull' (tirar), 'push' (empujar), 'left', 'right'.
export class ComboParser {
  constructor() { this.state = 'idle'; this.first = this.second = null; this.t = 0; }
  busy() { return this.state !== 'idle'; }
  update(dt, { pDown, pHeld, dirs, current, drifting }) {
    // si la dirección se pulsó en el mismo fotograma que el botón, llega también como evento: no la contamos dos veces
    if (pDown) { this.state = 'armed'; this.t = 0; this.first = this.second = null; if (current && !dirs.includes(current)) this.push(current); }
    if (this.state === 'idle') return null;
    for (const d of dirs) this.push(d);
    this.t += dt;
    if (this.state === 'armed') {
      if ((!pHeld && this.t > 0.35) || this.t > 2) this.state = 'idle';
      return null;
    }
    if (this.second || this.t >= 0.28) {
      const r = this.resolve(drifting);
      this.state = pHeld ? 'armed' : 'idle'; // con el botón mantenido se pueden encadenar más
      this.t = 0; this.first = this.second = null;
      return r;
    }
    return null;
  }
  push(d) {
    if (this.state === 'armed') { this.first = d; this.state = 'first'; this.t = 0; } else if (this.state === 'first' && !this.second) this.second = d;
  }
  resolve(drifting) {
    const f = this.first, s = this.second, isSide = d => d === 'left' || d === 'right', side = d => (d === 'left' ? -1 : 1);
    if (f === 'pull' && isSide(s)) return { name: 'immelmann', side: side(s) };
    if (f === 'pull' && s === 'pull') return { name: 'cobra', side: 1 };
    if (isSide(f) && s === 'pull') return { name: 'splitS', side: side(f) };
    if (f === 'push' && isSide(s)) return { name: 'barrena', side: side(s) };
    if (f === 'pull') return { name: 'looping', side: 1 };
    if (f === 'push') return { name: 'campana', side: 1 };
    return { name: drifting ? 'derrape' : 'tonel', side: side(f) };
  }
}

// Reconoce las piruetas hechas a mano a partir de los giros reales del jet
export class ManualDetector {
  constructor() { this.reset(); }
  reset() {
    this.P = { acc: 0, idle: 0 }; this.R = { acc: 0, idle: 0 };
    this.halves = []; this.knife = 0; this.inv = 0; this.cobra = false;
  }
  step(dt, now, jet, out) {
    const vd = jet.speed > 1 ? jet.vel.y / jet.speed : 0, y = jet.pos.y;
    this.seg(this.P, jet.w.x, dt, now, y, vd, () => this.closePitch(now, y, out));
    this.seg(this.R, jet.w.z, dt, now, y, vd, () => this.closeRoll(now, y, out));
    // vuelo de cuchillo (alas en vertical) y vuelo invertido: puntos por segundo
    const fast = jet.speed > 45;
    if (fast && Math.abs(jet.right.y) > 0.88) this.knife += dt; else this.knife = this.flush('cuchillo', this.knife, now, out);
    if (fast && jet.up.y < -0.85) this.inv += dt; else this.inv = this.flush('invertido', this.inv, now, out);
    // cobra: el morro muy levantado respecto a la dirección del vuelo
    const ang = jet.speed > 30 ? Math.acos(clamp(jet.vel.dot(jet.fwd) / jet.speed, -1, 1)) : 0;
    if (!this.cobra && ang > 1.0) { this.cobra = true; out.push({ name: 'cobra', manual: true, start: now }); } else if (this.cobra && ang < 0.3) this.cobra = false;
    this.halves = this.halves.filter(h => now - h.t < 3);
  }
  flush(name, secs, now, out) {
    if (secs >= 0.8) out.push({ name, manual: true, start: now - secs, seconds: secs });
    return 0;
  }
  seg(S, w, dt, now, y, vd, close) {
    if (Math.abs(w) > 0.7 && (S.acc === 0 || Math.sign(w) === Math.sign(S.acc))) {
      if (S.acc === 0) { S.t0 = now; S.y0 = y; S.vmin = S.vmax = vd; }
      S.acc += w * dt; S.idle = 0;
      S.vmin = Math.min(S.vmin, vd); S.vmax = Math.max(S.vmax, vd);
    } else if (S.acc !== 0) {
      S.idle += dt;
      if (S.idle > 0.18 || (Math.abs(w) > 0.7 && Math.sign(w) !== Math.sign(S.acc))) { close(); S.acc = 0; S.idle = 0; }
    }
  }
  closePitch(now, y, out) {
    const P = this.P, a = Math.abs(P.acc), dy = y - P.y0;
    if (a > TAU * 0.9 && P.vmax > 0.7 && P.vmin < -0.7) out.push({ name: 'looping', manual: true, start: P.t0 });
    else if (a > PI * 0.75 && a < PI * 1.5 && P.acc > 0) {
      if (P.vmax > 0.7 && dy > 20) this.half('up', P.t0, now, out);
      else if (P.vmin < -0.7 && dy < -20) this.half('down', P.t0, now, out);
    }
  }
  closeRoll(now, y, out) {
    const R = this.R, a = Math.abs(R.acc);
    if (a > TAU * 0.85) {
      const n = Math.round(a / TAU);
      if (n >= 2 && R.y0 - y > 20) out.push({ name: 'barrena', manual: true, start: R.t0 });
      else for (let k = 0; k < n; k++) out.push({ name: 'tonel', manual: true, start: R.t0 });
    } else if (a > PI * 0.75 && a < PI * 1.4) this.half('roll', R.t0, now, out);
  }
  half(type, start, now, out) {
    const h = { type, start, t: now };
    const roll = type === 'roll' ? h : this.halves.find(x => x.type === 'roll');
    const loop = type === 'roll' ? this.halves.find(x => x.type !== 'roll') : h;
    if (roll && loop && Math.abs(roll.start - loop.t) < 1.2 + (loop.t - loop.start)) {
      out.push({ name: loop.type === 'up' ? 'immelmann' : 'splitS', manual: true, start: Math.min(roll.start, loop.start) });
      this.halves = this.halves.filter(x => x !== roll && x !== loop);
      return;
    }
    this.halves.push(h);
  }
}

// Puntos de estilo con cadenas: menos de 2 s entre piruetas multiplica ×1,2, ×1,4… hasta ×2
export class Style {
  constructor() { this.reset(); }
  reset() { this.total = 0; this.chain = 0; this.mult = 1; this.lastEnd = -99; this.lastName = ''; this.repeat = 0; this.count = 0; }
  award(name, { manual = false, start, now, seconds = 0, formation = false, tricksStat = 1 }) {
    const T = TRICKS[name];
    if (start - this.lastEnd < 2) this.chain++; else { this.chain = 0; this.lastName = ''; }
    this.mult = Math.min(2, 1 + 0.2 * this.chain);
    this.repeat = name === this.lastName ? this.repeat + 1 : 0; // repetir la misma da menos turbo
    const base = T.perSecond ? T.pts * seconds : T.pts;
    const pts = Math.round(base * (manual ? 1.5 : 1) * this.mult * (formation ? 2 : 1));
    const turbo = (T.perSecond ? T.turbo * seconds : T.turbo) * 0.5 ** this.repeat * tricksStat;
    this.total += pts; this.lastEnd = now; this.lastName = name; this.count++;
    return { name, label: T.label, pts, mult: this.mult, manual, turbo, formation };
  }
  bonus(pts) { this.total += pts; }
  breakChain() { this.chain = 0; this.mult = 1; this.lastEnd = -99; this.lastName = ''; }
  chainLeft(now) { return Math.max(0, 2 - (now - this.lastEnd)); }
}
