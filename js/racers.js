// Pilotos de una partida: el jugador, sus amigos (por la red) y los bots.
// Cada uno tiene su jet, su vuelta, su estilo, su humo de colores y su modelo 3D.
import * as THREE from 'three';
import { Jet } from './flight.js';
import { Race } from './race.js';
import { Autopilot } from './ai.js';
import { Style, ManualDetector } from './tricks.js';
import { buildJet } from './jet-model.js';
import { SkySmoke } from './fx.js';
import { V3, Quat } from './math.js';
import { sanitizeCfg, statMultipliers } from './hangar-data.js';

export const COLORS = ['#d62839', '#2f6fe0', '#21b573', '#f2b630', '#8b5cf6', '#f97316', '#0fb5c4', '#ec4899', '#f3efe6', '#2d3142'];
export const BOT_NAMES = ['Pincel', 'Ocre', 'Bermellón', 'Lienzo', 'Acuarela', 'Carboncillo', 'Óleo', 'Sepia', 'Cobalto', 'Índigo', 'Gouache', 'Témpera'];
export const DIFFICULTY = {
  facil: { label: 'Fácil', speed: 0.92, skill: 0.45 },
  normal: { label: 'Normal', speed: 0.98, skill: 0.8 },
  dificil: { label: 'Difícil', speed: 1.03, skill: 0.95 },
};

export class Racer {
  // cfg: configuración del hangar (piezas, pintura, calcomanías…); las piezas cambian las estadísticas del jet
  constructor(scene, track, { id, name, cfg, bot = false, owned = false, me = false, laps = 3, diff = 'normal', dir = 1 }) {
    Object.assign(this, { id, name, bot, owned, me, scene, dir, L: track.length });
    const D = DIFFICULTY[diff] || DIFFICULTY.normal;
    this.cfg = sanitizeCfg(cfg);
    this.color = this.cfg.paint.c1;
    const stats = statMultipliers(this.cfg);
    if (bot) stats.speed *= D.speed;
    this.jet = new Jet(stats);
    this.race = new Race(track, laps, dir);
    this.ap = bot ? new Autopilot(track, { skill: D.skill, dir }) : null;
    this.style = new Style();
    this.manual = new ManualDetector();
    this.ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, draft: 0, aimed: false, trick: null };
    this.model = buildJet(this.cfg, { lite: !me, pilotName: name });
    scene.add(this.model.group);
    this.smoke = new SkySmoke(scene, this.cfg.smoke);
    this.prevPos = new V3(); this.prevQ = new Quat();
    // pose para dibujar (la propia interpolada o la recibida por la red)
    // los de la red no se ven hasta que llega su primer estado (o se les coloca en la parrilla)
    this.view = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), boost: false, alive: owned, smoke: false, throttle: 0.5 };
    this.buf = []; this.finishTime = null; this.lap = 0; this.s = 0;
    this.tricks = []; this.draftT = 0; this.voice = null; this.smokeOn = false; this.bumpT = 0;
    // objetos y combate
    this.item = null; this.shieldT = 0; this.kills = 0; this.deaths = 0; this.ammo = 0; this.reloadT = 0; this.lock = null; this.lockT = 0;
  }

  // Para la clasificación: los que han terminado van primero, por tiempo
  progress() {
    if (this.finishTime != null) return 1e9 - this.finishTime;
    if (this.owned) return this.race.progress();
    const L = this.L;
    return this.lap * L + (this.dir > 0 ? this.s : (L - this.s) % L);
  }

  // Coloca el jet aparcado (o volando) y deja la pose de dibujo al día
  place(pos, fwd, speed, shield = 99) {
    this.jet.spawn(pos, fwd, speed, shield);
    this.prevPos.copy(this.jet.pos); this.prevQ.copy(this.jet.q);
    this.race.teleport(this.jet.pos);
    this.view.p.set(pos.x, pos.y, pos.z);
    this.view.q.set(this.jet.q.x, this.jet.q.y, this.jet.q.z, this.jet.q.w);
    this.view.alive = true;
    if (this.ap) this.ap.hint = -1;
  }

  // Estado compacto para la red: [id, pos, quat, vel, banderas, vuelta, s, gas, estilo, derribos, caídas]
  pack() {
    const j = this.jet, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
    const flags = (j.alive ? 1 : 0) | (j.boosting ? 2 : 0) | (this.smokeOn ? 4 : 0) | (this.shieldT > 0 ? 8 : 0);
    return [this.id, r2(j.pos.x), r2(j.pos.y), r2(j.pos.z), r3(j.q.x), r3(j.q.y), r3(j.q.z), r3(j.q.w), r2(j.vel.x), r2(j.vel.y), r2(j.vel.z), flags, this.race.lap, Math.round(this.race.s), r2(this.view.throttle), this.style.total, this.kills, this.deaths];
  }
  receive(e, now) {
    this.buf.push({ t: now, p: new THREE.Vector3(e[1], e[2], e[3]), q: new THREE.Quaternion(e[4], e[5], e[6], e[7]), v: new THREE.Vector3(e[8], e[9], e[10]), flags: e[11], lap: e[12], s: e[13], throttle: e[14] ?? 0.5 });
    if (this.buf.length > 14) this.buf.shift();
    this.lap = e[12]; this.s = e[13];
    if (e[15] != null) { this.styleTotal = e[15]; this.kills = e[16] || 0; this.deaths = e[17] || 0; }
  }
  // Dibuja a los demás con 120 ms de retraso, interpolando entre los dos estados que lo rodean
  interpolate(now) {
    const buf = this.buf;
    if (!buf.length) return;
    const rt = now - 120;
    while (buf.length > 2 && buf[1].t <= rt) buf.shift();
    const a = buf[0], b = buf[1] && rt >= a.t ? buf[1] : null, l = buf[buf.length - 1], v = this.view;
    if (b) {
      const f = Math.min(1, (rt - a.t) / Math.max(1, b.t - a.t));
      v.p.copy(a.p).lerp(b.p, f);
      v.q.copy(a.q).slerp(b.q, f);
    } else {
      const e = Math.max(0, Math.min(0.25, (rt - l.t) / 1000));
      v.p.copy(l.p).addScaledVector(l.v, e);
      v.q.copy(l.q);
    }
    v.v.copy(l.v);
    const wasAlive = v.alive;
    v.alive = !!(l.flags & 1); v.boost = !!(l.flags & 2); v.smoke = !!(l.flags & 4); v.shield = !!(l.flags & 8); v.throttle = l.throttle;
    if (!wasAlive && v.alive) this.buf = [l];
  }

  dispose() {
    this.scene.remove(this.model.group);
    this.model.dispose?.();
    this.scene.remove(this.smoke.mesh);
    this.voice?.dispose();
  }
}
