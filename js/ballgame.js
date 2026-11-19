// Aerobalón: dos equipos y una bola gigante sin gravedad en el Estadio flotante. La bola se empuja embistiéndola (con
// turbo pega más fuerte), rebota en las paredes y entra por los portales igual que los jets; gol si cruza el aro de la
// portería del otro equipo. Los jets no se estrellan (rebotan contra todo).
// En red manda el anfitrión: él mueve la bola, decide los goles y manda su estado; cada jugador avisa de sus golpes y,
// mientras llega la respuesta, ya mueve la bola en su pantalla.
import * as THREE from 'three';
import { V3 } from './math.js';
import { ARENA, GOALS, PORTALS } from './maps/estadio.js';
import { opTexture } from './textures.js';

export const BALL_R = 14;
const DRAG = 0.22, BOUNCE = 0.82, JET_R = 6, PORTAL_CD = 0.8, FREEZE = 2.5;
const _n = new V3(), _d = new V3(), _q = new V3();

export class BallGame {
  // hooks: racers(), owned(r), me(), host() (¿mando yo la bola?), send(m), goal(team, scorerId), reposition()
  constructor(scene, fx, sound, hooks) {
    Object.assign(this, { scene, fx, sound, hooks });
    this.on = false; this.score = [0, 0]; this.ball = { p: new V3(), v: new V3() }; this.freezeT = 0; this.lastTouch = null;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    const tex = opTexture({ kind: 'spiral', colors: ['#f1ece2', '#08070b', '#ff2a3c', '#08070b', '#ffd400', '#08070b'], bands: 7, seed: 201 });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 64, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.25 }));
    this.mesh.castShadow = true; this.group.add(this.mesh);
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.35, 32, 20), new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.halo);
    this.netT = 0; this.hudEl = null;
  }
  enable(on) { this.on = on; this.group.visible = on; this.hud(on); if (on) { this.score = [0, 0]; this.reset(); } }
  reset() { this.ball.p.copy(ARENA.c); this.ball.v.set(0, 0, 0); this.freezeT = FREEZE; this.lastTouch = null; this.target = null; }

  // ---------- portales: si el tramo prev→pos cruza el disco de un portal, sale por el otro con la misma rapidez ----------
  portalOf(prev, pos) {
    for (const P of PORTALS) for (const [inn, out] of [[P.a, P.b], [P.b, P.a]]) {
      const d0 = _d.subVectors(prev, inn.c).dot(inn.n), d1 = _q.subVectors(pos, inn.c).dot(inn.n);
      if (d0 > 0 && d1 <= 0) { const f = d0 / (d0 - d1); _n.copy(prev).lerp(pos, f); if (_n.dist(inn.c) < inn.r) return out; }
    }
    return null;
  }
  // ---------- paso ----------
  update(dt, t) {
    if (!this.on) return;
    const racers = this.hooks.racers(), host = this.hooks.host(), B = this.ball;
    for (const r of racers) {
      if (!this.hooks.owned(r) || !r.jet.alive) continue;
      const J = r.jet;
      J.shield = Math.max(J.shield, 2); // en el estadio nadie se estrella: se rebota
      // portales
      r.portalT = Math.max(0, (r.portalT || 0) - dt);
      if (!r.portalT && r.ballPrev) { const out = this.portalOf(r.ballPrev, J.pos); if (out) { const sp = Math.max(J.speed, 80); J.spawn(out.c.clone().addScaled(out.n, 10), out.n.clone(), sp, Math.max(J.shield, 2)); r.portalT = PORTAL_CD; if (r === this.hooks.me()) this.sound.sfx('boostRing'); } }
      (r.ballPrev ||= new V3()).copy(J.pos);
      // embestir la bola
      if (this.freezeT > 0) continue;
      _d.subVectors(B.p, J.pos); const d = _d.len();
      if (d < BALL_R + JET_R && d > 0.01) {
        _n.copy(_d).scale(1 / d);
        const rel = J.vel.dot(_n) - B.v.dot(_n);
        if (rel > -5) {
          const imp = Math.max(0, rel) * 1.6 + 45 + (J.boosting ? 60 : 0);
          const kick = _n.clone().scale(imp).addScaled(J.vel, 0.12);
          B.v.add(kick); B.p.copy(J.pos).addScaled(_n, BALL_R + JET_R + 0.5);
          J.vel.addScaled(_n, -Math.max(0, rel) * 0.35);
          this.lastTouch = r.id;
          if (!host) this.hooks.send({ t: 'ev', k: 'kick', id: r.id, i: [kick.x, kick.y, kick.z], p: [B.p.x, B.p.y, B.p.z] });
          if (r === this.hooks.me()) { this.sound.sfx('scrape'); this.fx.sparks(B.p.clone().addScaled(_n, -BALL_R), 10); }
        }
      }
    }
    // la bola (todos la mueven; el anfitrión manda y corrige a los demás)
    if (this.freezeT > 0) { this.freezeT -= dt; if (this.freezeT <= 0 && host) this.hooks.send({ t: 'ev', k: 'kickoff' }); }
    else {
      const prev = B.p.clone();
      B.v.scale(Math.exp(-DRAG * dt)); B.p.addScaled(B.v, dt);
      // paredes: la cápsula
      const A = ARENA, z = Math.max(A.c.z - A.half, Math.min(A.c.z + A.half, B.p.z));
      _d.set(B.p.x - A.c.x, B.p.y - A.c.y, B.p.z - z); const rd = _d.len(), lim = A.r - BALL_R;
      if (rd > lim) { _n.copy(_d).scale(1 / rd); B.p.addScaled(_n, lim - rd); const vn = B.v.dot(_n); if (vn > 0) { B.v.addScaled(_n, -vn * (1 + BOUNCE)); if (vn > 60) this.fx.sparks(B.p.clone().addScaled(_n, BALL_R), 8); } }
      // portales
      if ((this.portalT = Math.max(0, (this.portalT || 0) - dt)) === 0) { const out = this.portalOf(prev, B.p); if (out) { const sp = B.v.len(); B.p.copy(out.c).addScaled(out.n, BALL_R + 4); B.v.copy(out.n).scale(Math.max(sp, 60)); this.portalT = PORTAL_CD; } }
      // goles (los decide el anfitrión)
      if (host) for (const g of GOALS) {
        const d0 = _d.subVectors(prev, g.c).dot(g.n), d1 = _q.subVectors(B.p, g.c).dot(g.n);
        if (d0 > 0 && d1 <= 0) { const f = d0 / (d0 - d1); _n.copy(prev).lerp(B.p, f); if (_n.dist(g.c) < g.r) { const team = 1 - g.team; this.score[team]++; this.hooks.send({ t: 'ev', k: 'goal', team, by: this.lastTouch, s: this.score }); this.hooks.goal(team, this.lastTouch); this.reset(); this.hooks.reposition(); break; } }
      }
    }
    // el anfitrión manda la bola 15 veces por segundo; los demás se acercan a ella poco a poco
    if (host && (this.netT -= dt) <= 0) { this.netT = 1 / 15; this.hooks.send({ t: 'ev', k: 'ball', p: [B.p.x, B.p.y, B.p.z], v: [B.v.x, B.v.y, B.v.z], s: this.score, f: this.freezeT }); }
    if (!host && this.target) { B.p.lerp(this.target.p, Math.min(1, dt * 6)); B.v.lerp(this.target.v, Math.min(1, dt * 6)); this.target.p.addScaled(this.target.v, dt); }
    this.draw(t);
  }
  onNet(m) {
    if (m.k === 'ball') { this.target = { p: new V3(...m.p), v: new V3(...m.v) }; if (this.ball.p.dist(this.target.p) > 120) { this.ball.p.copy(this.target.p); this.ball.v.copy(this.target.v); } this.score = m.s; this.freezeT = m.f; }
    else if (m.k === 'kick' && this.hooks.host()) { this.ball.v.add(new V3(...m.i)); this.lastTouch = m.id; }
    else if (m.k === 'goal') { this.score = m.s; this.hooks.goal(m.team, m.by); this.reset(); this.hooks.reposition(); }
  }
  draw(t) {
    this.mesh.position.set(this.ball.p.x, this.ball.p.y, this.ball.p.z); this.halo.position.copy(this.mesh.position);
    const sp = this.ball.v.len(); this.mesh.rotation.x += sp * 0.0006; this.mesh.rotation.y += sp * 0.0004;
    this.halo.material.opacity = this.freezeT > 0 ? 0.25 + 0.15 * Math.sin(t * 10) : 0.08 + Math.min(0.2, sp / 1500);
  }
  // ---------- marcador ----------
  hud(on) {
    if (!this.hudEl) { const el = document.createElement('div'); el.id = 'ballHud'; el.innerHTML = '<div class="tscore"><b class="t0">0</b><span>—</span><b class="t1">0</b></div><div class="tzone"></div>'; document.body.appendChild(el); this.hudEl = el; }
    this.hudEl.hidden = !on;
  }
  updateHud(me) {
    if (!this.hudEl || this.hudEl.hidden) return;
    this.hudEl.querySelector('.t0').textContent = this.score[0]; this.hudEl.querySelector('.t1').textContent = this.score[1];
    const goal = GOALS[1 - (me.team ?? 0)];
    this.hudEl.querySelector('.tzone').textContent = this.freezeT > 0 ? `Saque en ${Math.ceil(this.freezeT)}` : `Ataca la portería ${goal.team ? 'azul' : 'roja'} · tu bola: ${Math.round(this.ball.p.dist(me.jet.pos))} m`;
  }
}
