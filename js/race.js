// Vueltas, puertas, anillos de turbo y punto de reaparición. JS puro.
import { V3 } from './math.js';

const _d = new V3(), _x = new V3();

// ¿El segmento a→b cruza el plano (p, n) por delante y dentro del radio r? Devuelve la distancia al centro o -1
function cross(a, b, p, n, r) {
  const d0 = _d.subVectors(a, p).dot(n), d1 = _x.subVectors(b, p).dot(n);
  if (!(d0 < 0 && d1 >= 0)) return -1;
  const f = d0 / (d0 - d1);
  _x.copy(a).lerp(b, f);
  const dist = _x.dist(p);
  return dist <= r ? dist : -1;
}

export class Race {
  constructor(track, laps = 3) {
    this.track = track; this.laps = laps;
    this.reset();
  }
  reset(startTime = 0) {
    this.next = 0; this.lap = 0; this.lapStart = startTime; this.lapTimes = [];
    this.finished = false; this.finishTime = null; this.lastGate = 0; this.has = false;
    this.prev = new V3(); this.s = 0; this.hint = -1;
  }
  teleport(pos) { this.prev.copy(pos); this.has = true; }
  get best() { return this.lapTimes.length ? Math.min(...this.lapTimes) : null; }

  update(jet, now, ev) {
    if (!this.has) { this.teleport(jet.pos); return; }
    const gates = this.track.gates, g = gates[this.next];
    const dist = cross(this.prev, jet.pos, g.p, g.t, g.cp);
    if (dist >= 0 && !this.finished) {
      this.lastGate = this.next;
      ev.push({ type: 'gate', i: this.next, ring: dist < g.ring });
      if (this.next === 0) {
        if (this.lap === 0) this.lap = 1;
        else {
          const t = now - this.lapStart;
          this.lapTimes.push(t);
          ev.push({ type: 'lap', lap: this.lap, time: t });
          this.lapStart = now;
          if (this.lap >= this.laps) { this.finished = true; this.finishTime = now; ev.push({ type: 'finish', time: now }); } else this.lap++;
        }
      }
      this.next = (this.next + 1) % gates.length;
    }
    for (const r of this.track.boostRings) {
      if (r.p.dist(jet.pos) > 200) continue;
      if (cross(this.prev, jet.pos, r.p, r.t, r.r) >= 0) ev.push({ type: 'boostRing' });
    }
    const n = this.track.spline.nearest(jet.pos, this.hint);
    this.hint = n.idx; this.s = n.s; this.off = n.d;
    this.prev.copy(jet.pos);
  }

  // Dónde reaparecer: un poco por delante de la última puerta (evitando las verticales)
  respawnPoint() {
    const gates = this.track.gates;
    let i = this.lastGate;
    if (Math.abs(gates[i].t.y) > 0.6) i = (i - 1 + gates.length) % gates.length;
    const g = gates[i], S = this.track.spline;
    const s = g.s + 8;
    return { pos: S.pointAt(s), fwd: S.tangentAt(s), gate: i };
  }
  // Para la clasificación (parte 3)
  progress() { return this.lap * this.track.length + this.s; }
}
