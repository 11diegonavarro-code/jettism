// Piloto automático: sigue el recorrido (en cualquier sentido), esquiva obstáculos (también los que se mueven),
// usa el turbo en las rectas y hace piruetas. En combate persigue a un rival. Es el cerebro de los bots.
import { V3, clamp } from './math.js';
import { steerToward } from './flight.js';

const _p = new V3();

export class Autopilot {
  // dir: 1 en el sentido normal del recorrido, −1 al revés. trickPool: piruetas que puede hacer
  constructor(track, { skill = 0.9, tricks = true, dir = 1, trickPool = ['tonel'] } = {}) {
    this.track = track; this.skill = skill; this.tricks = tricks; this.dir = dir; this.trickPool = trickPool;
    this.hint = -1; this.avoid = new V3(); this.avoidT = 0; this.trickCd = 2; this.s = 0; this.blocked = false; this.clear = true;
  }

  // Empujón para esquivar: obstáculos fijos en la dirección a la que va, y móviles donde estarán al llegar
  updateAvoid(jet, dir, reach, dt, now) {
    if ((this.avoidT -= dt) > 0) return;
    this.avoidT = 0.08;
    const T = this.track, v = jet.speed || 1, vdir = jet.vel.clone().normalize();
    const hit = T.raycast(jet.pos, dir, Math.min(reach, v * 1.4), 7) || T.raycast(jet.pos, vdir, v * 1.2, 6);
    let push = null;
    if (hit && hit.col) push = T.normal(hit.col, hit.p).scale(45 * clamp(1.4 - hit.t / v, 0.3, 1.2));
    else if (hit && jet.pos.y < 60) push = new V3(0, 40, 0); // el suelo
    for (const tau of [0.5, 1, 1.5, 2]) {
      const pr = T.predictMovers(_p.copy(jet.pos).addScaled(jet.vel, tau), now + tau, now);
      if (pr.col && pr.d < 16) { push = (push || new V3()).addScaled(pr.n, 55 * (1.2 - tau / 2.5)); break; }
    }
    this.blocked = !!push;
    if (push) this.avoid.copy(push); else this.avoid.scale(0.6);
    this.clear = !this.blocked && !T.raycast(jet.pos, vdir, v * 1.6, 9);
  }

  control(jet, dt, out, now = 0) {
    const T = this.track, S = T.spline, D = this.dir;
    const n = S.nearest(jet.pos, this.hint);
    this.hint = n.idx; this.s = n.s;
    const look = clamp(jet.speed * 0.85, 45, 125);
    const target = S.pointAt(n.s + look * D);
    // si se ha alejado del recorrido, vuelve hacia él
    if (n.d > 30) target.lerp(S.pointAt(n.s + 40 * D), clamp((n.d - 30) / 60, 0, 0.7));
    this.updateAvoid(jet, new V3().subVectors(target, jet.pos).normalize(), look + 30, dt, now);
    target.add(this.avoid);
    steerToward(jet, new V3().subVectors(target, jet.pos).normalize(), out);
    const T0 = S.tangentAt(n.s), straight = T0.dot(S.tangentAt(n.s + 320 * D)) > 0.93, sharp = T0.dot(S.tangentAt(n.s + 130 * D)) < 0.6;
    out.throttle = sharp ? -0.4 : straight ? 1 : 0.5;
    out.boost = jet.turbo > 20 && straight && this.clear && jet.speed > 70;
    out.trick = null;
    if (this.tricks && !jet.trick) {
      this.trickCd -= dt;
      if (this.trickCd <= 0 && straight && this.clear && jet.turbo < 75 && Math.random() < this.skill) {
        // las piruetas verticales solo con sitio de sobra
        let name = this.trickPool[Math.floor(Math.random() * this.trickPool.length)];
        if (['looping', 'immelmann', 'splitS', 'barrena', 'campana'].includes(name) && (jet.pos.y < 150 || this.blocked)) name = 'tonel';
        out.trick = { name, side: Math.random() < 0.5 ? -1 : 1 };
        this.trickCd = this.trickPool.length > 1 ? 0.8 + Math.random() * 1.6 : 1.2 + Math.random() * 2.5;
      }
    }
    return out;
  }

  // Combate: perseguir a un rival apuntando adonde va a estar, sin dejar de esquivar
  chase(jet, dt, out, now, tp, tv) {
    const dist = jet.pos.dist(tp), lead = Math.min(1.2, dist / 240);
    const target = new V3(tp.x + tv.x * lead, Math.max(45, tp.y + tv.y * lead), tp.z + tv.z * lead);
    this.updateAvoid(jet, new V3().subVectors(target, jet.pos).normalize(), Math.min(dist, 200), dt, now);
    target.add(this.avoid);
    steerToward(jet, new V3().subVectors(target, jet.pos).normalize(), out);
    out.throttle = dist > 250 ? 1 : 0.2;
    out.boost = dist > 450 && jet.turbo > 30 && this.clear;
    out.trick = null;
    return out;
  }
}
