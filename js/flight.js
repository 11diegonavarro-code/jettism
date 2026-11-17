// Física del jet: arcade creíble, con derrape aéreo, inercia, pérdida suave y choques contra el mapa.
// JS puro: se puede simular en Node.
import { V3, Quat, UP, clamp, smoothstep, damp, wrapAngle } from './math.js';
import { TRICKS } from './tricks.js';
import { JET_RADIUS } from './track.js';

export const F = {
  cruise: 80, max: 110, boost: 150, min: 40, stall: 34,
  pitch: 1.9, roll: 4.2, yaw: 0.75, driftYaw: 1.15, resp: 7,
  grip: 5, driftGrip: 1.0, boostDrain: 22, sonic: 140,
};

const _lat = new V3(), _v = new V3(), _ax = new V3(), _n = new V3(), _l = new V3(), _u = new V3(), _wind = new V3();
const _o = { pitch: 0, roll: 0, grip: null, drag: 0, sink: 0, latAcc: 0 };

export class Jet {
  constructor(stats = {}) {
    this.pos = new V3(); this.vel = new V3(); this.q = new Quat();
    this.w = new V3(); // x: cabeceo (+arriba), y: guiñada (+derecha), z: alabeo (+derecha), en rad/s
    this.fwd = new V3(0, 0, -1); this.up = new V3(0, 1, 0); this.right = new V3(1, 0, 0);
    this.stats = { speed: 1, accel: 1, turn: 1, turbo: 1, tricks: 1, ...stats };
    this.turbo = 30; this.speed = 0; this.vf = 0; this.gload = 0;
    this.alive = true; this.crashT = 0; this.shield = 0; this.boosting = false; this.drift = false;
    this.trick = null; this.queued = null; this.boomArmed = true; this.nearCd = new Map();
  }

  spawn(pos, fwd, speed, shield = 1.5) {
    this.pos.copy(pos);
    this.q.lookAlong(fwd, UP);
    this.axes();
    this.vel.copy(this.fwd).scale(speed);
    this.speed = this.vf = speed;
    this.w.set(0, 0, 0);
    this.alive = true; this.crashT = 0; this.shield = shield; this.trick = null; this.queued = null; this.boosting = false;
  }

  axes() {
    this.fwd.set(0, 0, -1).applyQuat(this.q);
    this.up.set(0, 1, 0).applyQuat(this.q);
    this.right.set(1, 0, 0).applyQuat(this.q);
  }

  startTrick(name, side, now) {
    if (!this.alive || !TRICKS[name]?.prog) return false;
    if (this.trick) { this.queued = { name, side }; return true; }
    if (this.speed < 42) return false;
    this.trick = { name, side, t: 0, start: now, def: TRICKS[name] };
    return true;
  }

  crash(ev, kind) {
    this.alive = false; this.crashT = 2.5; this.trick = null; this.queued = null; this.boosting = false;
    ev.push({ type: 'crash', p: this.pos.clone(), v: this.vel.clone(), kind });
  }

  // ctl: { pitch, roll, yaw, throttle (−1 freno … 1 gas), boost }
  step(dt, ctl, track, now, ev) {
    if (!this.alive) { this.crashT -= dt; return; }
    this.shield = Math.max(0, this.shield - dt);
    const st = this.stats, o = _o;
    o.pitch = o.roll = o.drag = o.sink = o.latAcc = 0; o.grip = null;
    let grip = F.grip;

    // --- Giro ---
    if (this.trick) {
      const tr = this.trick, sp = st.tricks;
      tr.t += dt * sp;
      tr.def.prog(tr.t, tr.side, o);
      this.w.set(o.pitch * sp, 0, o.roll * sp);
      if (o.grip != null) grip = o.grip;
      this.drift = false;
      if (tr.t >= tr.def.dur) {
        ev.push({ type: 'trickEnd', name: tr.name, start: tr.start });
        this.trick = null;
        if (this.queued) { const q = this.queued; this.queued = null; this.startTrick(q.name, q.side, now); }
      }
    } else {
      const sf = clamp(1.15 - (this.speed - 80) / 180, 0.78, 1.2) * st.turn;
      this.drift = Math.abs(ctl.yaw) > 0.3;
      const k = damp(F.resp, dt);
      this.w.x += (clamp(ctl.pitch, -1, 1) * F.pitch * sf - this.w.x) * k;
      this.w.y += (clamp(ctl.yaw, -1, 1) * (this.drift ? F.driftYaw : F.yaw) - this.w.y) * k;
      this.w.z += (clamp(ctl.roll, -1, 1) * F.roll * st.turn - this.w.z) * k;
      if (this.drift) grip = F.driftGrip;
    }
    this.q.rotateLocal(this.w.x * dt, -this.w.y * dt, -this.w.z * dt);
    this.axes();

    // --- Velocidad ---
    let vf = this.vel.dot(this.fwd);
    _lat.copy(this.vel).addScaled(this.fwd, -vf);
    const cruise = F.cruise * st.speed, vmax = F.max * st.speed;
    const th = clamp(ctl.throttle || 0, -1, 1);
    let target = th >= 0 ? cruise + th * (vmax - cruise) : cruise + th * (cruise - F.min);
    let rate = target > vf ? 0.55 * st.accel : th < 0 ? 1.3 : 0.35;
    this.boosting = !!ctl.boost && this.turbo > 0;
    if (this.boosting) {
      target = F.boost * st.speed; rate = 1.3 * st.accel;
      this.turbo = Math.max(0, this.turbo - (F.boostDrain / st.turbo) * dt);
    }
    // rebufo: detrás de otro jet el aire empuja menos (0..1)
    if (ctl.draft > 0) { target += 16 * ctl.draft; rate = Math.max(rate, 0.9); }
    vf += (target - vf) * damp(rate, dt);
    vf -= 9.81 * 0.55 * this.fwd.y * dt;     // subir frena y picar acelera
    vf -= Math.abs(this.w.x) * 1.6 * dt;     // tirar fuerte cuesta velocidad
    if (o.drag) vf *= Math.exp(-o.drag * dt);
    const lift = smoothstep(F.stall, F.stall + 22, vf);
    // derrape aéreo: la velocidad lateral se va alineando con el morro (conservando casi toda la energía)
    const lat0 = _lat.lenSq();
    _lat.scale(Math.exp(-grip * lift * dt));
    if (vf > 0) vf = Math.sqrt(vf * vf + (lat0 - _lat.lenSq()) * 0.92);
    this.vel.copy(this.fwd).scale(vf).add(_lat);
    this.vel.y -= 9.81 * (1 - lift) * dt;
    if (o.sink) this.vel.y -= o.sink * dt;
    if (o.latAcc) this.vel.addScaled(this.right, o.latAcc * dt);
    if (this.pos.y > 900) this.vel.y -= 25 * dt;
    // viento: corrientes térmicas (suben y cargan turbo) y viento lateral junto al acantilado
    if (track.windAt) {
      const w = track.windAt(this.pos, now, _wind);
      this.vel.addScaled(_wind, dt);
      this.thermal = w.thermal; this.cross = w.cross;
      if (w.thermal > 0) this.turbo = Math.min(100, this.turbo + 7 * w.thermal * dt);
    }
    // en pérdida el morro cae hacia donde va el jet
    if (lift < 1 && !this.trick && this.vel.lenSq() > 1) {
      _v.copy(this.vel).normalize();
      _ax.crossVectors(this.fwd, _v);
      const s = _ax.len();
      if (s > 1e-4) {
        const ang = Math.atan2(s, this.fwd.dot(_v)) * (1 - lift) * 2.2 * dt;
        _ax.scale(ang / s);
        this.q.rotateWorld(_ax.x, _ax.y, _ax.z);
        this.axes();
      }
    }
    this.vf = vf;
    this.speed = this.vel.len();
    this.gload = Math.abs(this.w.x) * Math.max(vf, 0) / 9.81;
    this.pos.addScaled(this.vel, dt);

    // estampido sónico
    if (this.speed > F.sonic && this.boomArmed) { this.boomArmed = false; ev.push({ type: 'sonic' }); } else if (this.speed < F.sonic - 15) this.boomArmed = true;

    // --- Choques ---
    const gy = track.groundY(this.pos.x, this.pos.z);
    if (this.pos.y - gy < JET_RADIUS) {
      if (this.shield > 0) { this.pos.y = gy + JET_RADIUS; if (this.vel.y < 0) this.vel.y *= -0.3; } else { this.crash(ev, 'ground'); return; }
    }
    const { d, col } = track.nearest(this.pos, 40);
    const pen = d - JET_RADIUS;
    if (col && pen < 0) {
      const n = track.normal(col, this.pos, _n), vn = this.vel.dot(n);
      const impact = -vn, ang = Math.asin(clamp(impact / (this.speed || 1), -1, 1));
      if (this.shield > 0 || (impact < 22 && ang < 0.38)) {
        this.pos.addScaled(n, -pen + 0.05);
        if (vn < 0) this.vel.addScaled(n, -vn * 1.4);
        this.vel.scale(0.85);
        ev.push({ type: 'scrape', p: this.pos.clone(), n: n.clone() });
        if (this.trick) { this.trick = null; this.queued = null; ev.push({ type: 'trickFail' }); }
      } else { this.crash(ev, col.kind); return; }
    } else if (col && pen < 6 && this.speed > 60 && this.shield <= 0) {
      const id = col.grp ?? col.uid, last = this.nearCd.get(id) ?? -9;
      if (now - last > 1.3) { this.nearCd.set(id, now); ev.push({ type: 'near', dist: Math.max(0, pen), kind: col.kind }); }
    }
  }
}

// Convierte «quiero ir hacia dir» en mandos (modo ratón y bots)
export function steerToward(jet, dir, out, aggro = 1) {
  const lt = _l.copy(dir).applyQuatInv(jet.q);
  const ahead = -lt.z, off = Math.acos(clamp(ahead, -1, 1));
  out.pitch = clamp(Math.atan2(lt.y, Math.max(ahead, 0.05)) * 3, -1, 1);
  out.yaw = clamp(Math.atan2(lt.x, Math.max(ahead, 0.05)) * 2, -1, 1) * (1 - smoothstep(0.12, 0.35, off));
  const lu = _u.copy(UP).applyQuatInv(jet.q);
  const levelErr = Math.atan2(lu.x, lu.y) * (1 - smoothstep(0.85, 0.98, Math.abs(jet.fwd.y)));
  let agg = Math.atan2(lt.x, lt.y);
  if (off < 0.8) agg = clamp(agg, -2, 2);
  const w = smoothstep(0.03, 0.25, off) * aggro;
  out.roll = clamp(wrapAngle(levelErr + wrapAngle(agg - levelErr) * w) * 2.2, -1, 1);
  return out;
}

// Ayudas de vuelo: 0 ninguna, 1 media, 2 alta
export function applyAssist(jet, ctl, level, dt, st, warn) {
  if (level <= 0 || jet.trick || !jet.alive) return;
  st.noRoll = Math.abs(ctl.roll) < 0.05 ? (st.noRoll || 0) + dt : 0;
  if (!ctl.aimed && st.noRoll > 0.45) {
    const lu = _u.copy(UP).applyQuatInv(jet.q), err = Math.atan2(lu.x, lu.y);
    if (level >= 2 || Math.abs(err) < 1.3) ctl.roll = clamp(err * (level >= 2 ? 1.6 : 1), -0.6, 0.6) * (1 - smoothstep(0.8, 0.95, Math.abs(jet.fwd.y)));
  }
  if (level >= 2 && warn && warn.t < 0.9) {
    const ln = _l.copy(warn.n).applyQuatInv(jet.q), k = 1 - warn.t / 0.9;
    ctl.pitch = clamp(ctl.pitch + ln.y * 1.5 * k, -1, 1);
    ctl.yaw = clamp(ctl.yaw + ln.x * 1.0 * k, -1, 1);
  }
}

// ¿Vamos a chocar en el próximo segundo?
export function collisionWarning(jet, track, horizon = 1.1) {
  if (!jet.alive || jet.speed < 20) return null;
  const dir = _v.copy(jet.vel).normalize();
  const hit = track.raycast(jet.pos, dir.clone(), jet.speed * horizon);
  if (!hit) return null;
  return { t: hit.t / jet.speed, n: hit.col ? track.normal(hit.col, hit.p, new V3()) : new V3(0, 1, 0) };
}
