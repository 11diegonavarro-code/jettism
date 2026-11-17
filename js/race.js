// Vueltas, puertas, anillos de turbo y punto de reaparición, en los dos sentidos del recorrido. JS puro.
import { V3 } from './math.js';

const _d = new V3(), _x = new V3(), _n = new V3();

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
  // dir: 1 en el sentido normal, −1 al revés (las puertas se recorren en orden inverso y se cruzan del otro lado)
  constructor(track, laps = 3, dir = 1) {
    this.track = track; this.laps = laps; this.dir = dir;
    const n = track.gates.length;
    this.order = dir > 0 ? [...Array(n).keys()] : [0, ...Array.from({ length: n - 1 }, (_, i) => n - 1 - i)];
    this.reset();
  }
  reset(startTime = 0) {
    this.k = 0; this.next = 0; this.lap = 0; this.lapStart = startTime; this.lapTimes = [];
    this.finished = false; this.finishTime = null; this.lastGate = 0; this.has = false;
    this.prev = new V3(); this.s = 0; this.hint = -1; this.missed = false;
  }
  teleport(pos) { this.prev.copy(pos); this.has = true; }
  get best() { return this.lapTimes.length ? Math.min(...this.lapTimes) : null; }

  update(jet, now, ev) {
    if (!this.has) { this.teleport(jet.pos); return; }
    const gates = this.track.gates, g = gates[this.next];
    const dist = cross(this.prev, jet.pos, g.p, _n.copy(g.t).scale(this.dir), g.cp);
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
      this.k = (this.k + 1) % this.order.length;
      this.next = this.order[this.k];
    }
    for (const r of this.track.boostRings) {
      if (r.p.dist(jet.pos) > 200) continue;
      if (cross(this.prev, jet.pos, r.p, _n.copy(r.t).scale(this.dir), r.r) >= 0) ev.push({ type: 'boostRing' });
    }
    const n = this.track.spline.nearest(jet.pos, this.hint);
    this.hint = n.idx; this.s = n.s; this.off = n.d;
    // ¿se ha dejado atrás la siguiente puerta sin cruzarla? (más de 200 m por delante de ella, en el sentido de la carrera)
    const L = this.track.length;
    let ahead = ((this.s - this.track.gates[this.next].s) * this.dir) % L;
    if (ahead > L / 2) ahead -= L; else if (ahead < -L / 2) ahead += L;
    this.missed = !this.finished && ahead > 200;
    this.prev.copy(jet.pos);
  }

  // Dónde reaparecer: un poco por delante de la última puerta (evitando las verticales)
  respawnPoint() {
    const gates = this.track.gates, n = this.order.length;
    let k = this.order.indexOf(this.lastGate);
    if (Math.abs(gates[this.order[k]].t.y) > 0.6) k = (k - 1 + n) % n;
    const g = gates[this.order[k]], S = this.track.spline;
    const s = g.s + 8 * this.dir;
    return { pos: S.pointAt(s), fwd: S.tangentAt(s).scale(this.dir), gate: g.i };
  }
  // Para la clasificación: vueltas y metros recorridos en el sentido de la carrera
  progress() { const L = this.track.length; return this.lap * L + (this.dir > 0 ? this.s : (L - this.s) % L); }
}
