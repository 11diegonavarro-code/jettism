// Piloto automático: sigue el recorrido, esquiva obstáculos (también los que se mueven), usa el turbo
// en las rectas y hace toneles. Sirve para probar el juego y será la base de los bots.
import { V3, clamp } from './math.js';
import { steerToward } from './flight.js';

const _p = new V3();

export class Autopilot {
  constructor(track, { skill = 0.9, tricks = true } = {}) {
    this.track = track; this.skill = skill; this.tricks = tricks;
    this.hint = -1; this.avoid = new V3(); this.avoidT = 0; this.trickCd = 2; this.s = 0; this.blocked = false; this.clear = true;
  }
  control(jet, dt, out, now = 0) {
    const T = this.track, S = T.spline;
    const n = S.nearest(jet.pos, this.hint);
    this.hint = n.idx; this.s = n.s;
    const look = clamp(jet.speed * 0.85, 45, 125);
    const target = S.pointAt(n.s + look);
    // si se ha alejado del recorrido, vuelve hacia él
    if (n.d > 30) target.lerp(S.pointAt(n.s + 40), clamp((n.d - 30) / 60, 0, 0.7));
    if ((this.avoidT -= dt) <= 0) {
      this.avoidT = 0.08;
      const v = jet.speed || 1, vdir = jet.vel.clone().normalize();
      const dir = new V3().subVectors(target, jet.pos).normalize();
      const hit = T.raycast(jet.pos, dir, Math.min(look + 30, v * 1.4), 7) || T.raycast(jet.pos, vdir, v * 1.2, 6);
      let push = null;
      if (hit && hit.col) push = T.normal(hit.col, hit.p).scale(45 * clamp(1.4 - hit.t / v, 0.3, 1.2));
      // obstáculos móviles: ¿dónde estarán cuando lleguemos?
      for (const tau of [0.5, 1, 1.5, 2]) {
        const pr = T.predictMovers(_p.copy(jet.pos).addScaled(jet.vel, tau), now + tau, now);
        if (pr.col && pr.d < 16) { push = (push || new V3()).addScaled(pr.n, 55 * (1.2 - tau / 2.5)); break; }
      }
      this.blocked = !!push;
      if (push) this.avoid.copy(push); else this.avoid.scale(0.6);
      this.clear = !this.blocked && !T.raycast(jet.pos, vdir, v * 1.6, 9);
    }
    target.add(this.avoid);
    steerToward(jet, new V3().subVectors(target, jet.pos).normalize(), out);
    const T0 = S.tangentAt(n.s), straight = T0.dot(S.tangentAt(n.s + 320)) > 0.93, sharp = T0.dot(S.tangentAt(n.s + 130)) < 0.6;
    out.throttle = sharp ? -0.4 : straight ? 1 : 0.5;
    out.boost = jet.turbo > 20 && straight && this.clear && jet.speed > 70;
    out.trick = null;
    if (this.tricks && !jet.trick) {
      this.trickCd -= dt;
      if (this.trickCd <= 0 && straight && this.clear && jet.turbo < 75 && Math.random() < this.skill) {
        out.trick = { name: 'tonel', side: Math.random() < 0.5 ? -1 : 1 };
        this.trickCd = 1.2 + Math.random() * 2.5;
      }
    }
    return out;
  }
}
