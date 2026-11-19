// Combate por equipos: dos equipos (rojo y azul), tres clases de jet con su cañón, balas con física real (salen con la
// velocidad del jet, caen con la gravedad y vuelan hasta chocar), vida, reaparición a los 5 s dentro de la esfera, y
// «la tinta»: una esfera que se va cerrando por etapas; fuera, la tinta negra lo devora todo y te quita vida.
// Como los misiles (items.js): las balas se simulan en todas las pantallas y cada jugador decide si le han dado a sus
// propios jets (el suyo y, el anfitrión, los bots), y lo avisa a los demás.
import * as THREE from 'three';
import { V3 } from './math.js';

export const TEAMS = [{ name: 'Rojo', color: '#ff2a3c' }, { name: 'Azul', color: '#2f8cff' }];
// stats: multiplica las del jet · gun: rate (disparos/s), v (m/s), grav (m/s²), dmg, spread (rad), life (s), r (radio),
// splash (radio de la explosión, 0 = sin explosión), range (hasta dónde dispara la IA), cone (puntería de la IA)
export const CLASSES = {
  caza: { label: 'Caza', icon: '⚡', desc: 'Rápido y ágil. Ráfagas de balas ligeras: mucha cadencia, poco daño. 80 de vida.', hp: 80, stats: { speed: 1.1, accel: 1.12, turn: 1.12 },
    gun: { rate: 11, v: 560, grav: 16, dmg: 7, spread: 0.016, life: 1.5, r: 1.2, splash: 0, range: 520, cone: 0.982, color: '#ffe45c', len: 7 } },
  bombardero: { label: 'Bombardero', icon: '💣', desc: 'Lento y duro: 170 de vida. Proyectiles pesados que caen mucho y explotan haciendo mucho daño.', hp: 170, stats: { speed: 0.88, accel: 0.9, turn: 0.86 },
    gun: { rate: 1.4, v: 300, grav: 55, dmg: 38, spread: 0.004, life: 4.5, r: 2.6, splash: 18, range: 480, cone: 0.98, color: '#ff6a2a', len: 4 } },
  francotirador: { label: 'Francotirador', icon: '🎯', desc: 'Velocidad media. Un disparo lento, casi recto y rapidísimo que hace más daño cuanto más lejos. 90 de vida.', hp: 90, stats: { speed: 1, accel: 1, turn: 0.95 },
    gun: { rate: 0.6, v: 1400, grav: 3, dmg: 44, spread: 0, life: 1.1, r: 1.1, splash: 0, range: 1100, cone: 0.9988, color: '#7ff6ff', len: 26 } },
};
export const CLASS_IDS = Object.keys(CLASSES);
const JET_R = 6, OUT_DPS = 9, RESPAWN = 5, MAX_B = 700;
const _a = new V3(), _s = new V3(), _q = new V3();
function segDist(a, b, c) { _s.subVectors(b, a); const L2 = _s.lenSq(), f = L2 > 0 ? Math.max(0, Math.min(1, _a.subVectors(c, a).dot(_s) / L2)) : 0; return _a.copy(a).addScaled(_s, f).dist(c); }
let uid = 1;

export class Combat {
  // hooks: racers(), byId(id), owned(r), me(), send(msg), kill(victim, byId), hitMarker(dmg), groundY(x, z)
  constructor(scene, track, fx, sound, world, hooks) {
    Object.assign(this, { scene, track, fx, sound, world, hooks });
    this.on = false; this.bullets = []; this.time = 0;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    // trazadoras: una caja alargada por bala, con instancias (el color por bala)
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), MAX_B);
    this.tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_B * 3), 3);
    this.tracers.frustumCulled = false; this.tracers.count = 0; this.group.add(this.tracers);
    this.cols = Object.fromEntries(CLASS_IDS.map(k => [k, new THREE.Color(CLASSES[k].gun.color).multiplyScalar(3)]));
    this.zoneMesh = this.makeZone(); this.group.add(this.zoneMesh);
    this.hudEl = null;
  }
  enable(on) { this.on = on; this.group.visible = on; if (!on) { this.bullets.length = 0; this.tracers.count = 0; this.world.setInk?.(0); } this.hud(on); }

  // ---------- la esfera de tinta ----------
  // centro y radio inicial: los del mapa (todo el recorrido dentro); se cierra en tres etapas hasta 70 m
  setup(duration) {
    const S = this.track.spline, n = 80; let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < n; k++) { const p = S.pointAt((k / n) * S.length); cx += p.x / n; cy += p.y / n; cz += p.z / n; }
    let R = 0; for (let k = 0; k < n; k++) { const p = S.pointAt((k / n) * S.length); R = Math.max(R, Math.hypot(p.x - cx, p.y - cy, p.z - cz)); }
    this.center = new V3(cx, Math.max(cy, 90), cz); this.R0 = R + 220; this.duration = duration;
  }
  // [fracción del tiempo, radio relativo]: espera, se cierra, espera… (al final, 70 m)
  zoneR(t) {
    const K = [[0, 1], [0.22, 1], [0.38, 0.6], [0.52, 0.6], [0.68, 0.33], [0.8, 0.33], [1, 0]], f = Math.max(0, Math.min(1, t / this.duration));
    for (let i = 1; i < K.length; i++) if (f <= K[i][0]) { const [f0, r0] = K[i - 1], [f1, r1] = K[i], u = (f - f0) / (f1 - f0 || 1); return Math.max(70, (r0 + (r1 - r0) * u) * this.R0); }
    return 70;
  }
  // segundos hasta que la tinta empiece a cerrarse otra vez (o 0 si ya se está cerrando)
  nextClose(t) { const f = t / this.duration; for (const [a, b] of [[0.22, 0.38], [0.52, 0.68], [0.8, 1]]) { if (f < a) return (a - f) * this.duration; if (f < b) return 0; } return 0; }
  outside(p, t) { return p.dist(this.center) > this.zoneR(t); }
  // dónde reaparece un equipo: dentro de la esfera, en su lado, mirando al centro
  spawnFor(team, t) {
    const R = this.zoneR(t) * 0.55, a = (team ? 0 : Math.PI) + (Math.random() - 0.5) * 1.2, h = (Math.random() - 0.3) * R * 0.4;
    const pos = new V3(this.center.x + Math.cos(a) * R, Math.max(60, this.center.y + h), this.center.z + Math.sin(a) * R);
    const fwd = new V3(this.center.x - pos.x, 0, this.center.z - pos.z).normalize();
    return { pos, fwd };
  }
  makeZone() {
    this.zoneMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; uniform float uTime; void main() { vec3 p = position * (1.0 + 0.012 * sin(position.y * 9.0 + uTime * 1.3) * sin(position.x * 7.0 - uTime)); vP = position; vec4 mv = modelViewMatrix * vec4(p, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
        float h(vec3 p) { return sin(p.x * 3.1 + sin(p.y * 4.7 + uTime * 0.4) * 1.7) * sin(p.y * 2.3 - sin(p.z * 3.9 - uTime * 0.3) * 1.9) * sin(p.z * 2.7 + sin(p.x * 5.3) * 1.3); }
        void main() {
          vec3 n = normalize(vP);
          float v = abs(h(n * 3.0)) ; float vein = smoothstep(0.06, 0.0, v) ; float vein2 = smoothstep(0.03, 0.0, abs(h(n * 7.0 + 2.0)));
          vec2 g = gl_FragCoord.xy / 6.0; float dotm = step(0.35, length(fract(g) - 0.5));
          float rim = pow(1.0 - abs(dot(vN, vV)), 2.0);
          vec3 ink = vec3(0.012) * (0.6 + 0.4 * dotm);
          vec3 col = ink + vec3(1.0, 0.08, 0.12) * (vein * 1.6 + vein2 * 0.8) + vec3(0.9, 0.85, 0.8) * rim * 0.25;
          gl_FragColor = vec4(col, 0.9 - rim * 0.25);
        }`,
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.zoneMat); m.frustumCulled = false; m.renderOrder = 4;
    return m;
  }

  // ---------- disparar ----------
  // r dispara en la dirección dir (el morro o la mira); las balas salen con la velocidad del jet
  fire(r, dir) {
    const C = CLASSES[r.cls] || CLASSES.caza, G = C.gun, J = r.jet;
    if ((r.gunT || 0) > 0 || !J.alive) return false;
    r.gunT = 1 / G.rate;
    const d = new V3(dir.x + (Math.random() - 0.5) * G.spread * 2, dir.y + (Math.random() - 0.5) * G.spread * 2, dir.z + (Math.random() - 0.5) * G.spread * 2).normalize();
    const p = J.pos.clone().addScaled(J.fwd, 7), v = J.vel.clone().addScaled(d, G.v);
    const b = this.spawn({ id: r.id + ':' + uid++, owner: r.id, team: r.team, cls: r.cls, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
    this.hooks.send({ t: 'ev', k: 'bfire', id: b.id, owner: r.id, team: r.team, cls: r.cls, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
    if (r === this.hooks.me()) this.sound.sfx(r.cls === 'bombardero' ? 'scrape' : 'beep', r.cls === 'francotirador' ? 3 : 2);
    return true;
  }
  spawn({ id, owner, team, cls, p, v }) {
    const G = (CLASSES[cls] || CLASSES.caza).gun, b = { id, owner, team, cls, G, p: new V3(...p), prev: new V3(...p), v: new V3(...v), age: 0 };
    this.bullets.push(b); if (this.bullets.length > MAX_B) this.bullets.shift();
    return b;
  }
  // un jet propio recibe daño: si se queda sin vida, se le derriba (el derribo es de quien disparó)
  damage(r, dmg, by) {
    if (!r.jet.alive || r.jet.shield > 0) return;
    r.hp = Math.max(0, (r.hp ?? 100) - dmg);
    if (r.hp <= 0) this.hooks.kill(r, by);
  }
  remove(id, boom) { const i = this.bullets.findIndex(b => b.id === id); if (i < 0) return null; const b = this.bullets[i]; this.bullets.splice(i, 1); if (boom) this.impact(b); return b; }
  impact(b) { if (b.G.splash) this.fx.explosion(b.p, new V3()); else this.fx.sparks(b.p, 6); }
  onNet(m) {
    if (m.k === 'bfire') { if (!this.hooks.owned(this.hooks.byId(m.owner))) this.spawn(m); }
    else if (m.k === 'bhit') { this.remove(m.id, true); const v = this.hooks.byId(m.victim); if (v && !this.hooks.owned(v)) v.hp = m.hp; const me = this.hooks.me(); if (me && m.by === me.id) this.hooks.hitMarker(m.dmg); }
    else if (m.k === 'bgone') this.remove(m.id, true);
  }

  // ---------- paso ----------
  update(dt, t) {
    if (!this.on) return;
    this.time += dt;
    const racers = this.hooks.racers(), owned = racers.filter(r => this.hooks.owned(r) && r.jet.alive);
    for (const r of racers) if (r.gunT > 0) r.gunT -= dt;
    // fuera de la esfera, la tinta quita vida
    for (const r of owned) if (this.outside(r.jet.pos, t)) this.damage(r, OUT_DPS * dt, null);
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.prev.copy(b.p); b.v.y -= b.G.grav * dt; b.p.addScaled(b.v, dt); b.age += dt;
      let gone = b.age > b.G.life;
      // ¿le da a un jet propio del otro equipo?
      if (!gone) for (const r of owned) {
        if (r.team === b.team || r.id === b.owner) continue;
        if (segDist(b.prev, b.p, r.jet.pos) < JET_R + b.G.r + (b.G.splash ? 3 : 0)) {
          const dist = _q.subVectors(r.jet.pos, b.p).len(), dmg = b.cls === 'francotirador' ? b.G.dmg * Math.min(1.4, 0.7 + b.age * 0.9) : b.G.dmg;
          void dist; this.damage(r, dmg, b.owner);
          this.hooks.send({ t: 'ev', k: 'bhit', id: b.id, victim: r.id, by: b.owner, dmg: Math.round(dmg), hp: Math.round(r.hp) });
          if (this.hooks.me() && b.owner === this.hooks.me().id) this.hooks.hitMarker(dmg);
          this.bullets.splice(i, 1); this.impact(b); gone = null; break;
        }
      }
      if (gone === null) continue;
      // contra el suelo o el decorado
      if (!gone && (b.p.y < this.hooks.groundY(b.p.x, b.p.z) + 0.5 || this.track.nearest(b.p, 12).d < b.G.r)) {
        // la explosión del bombardero alcanza a los jets propios cercanos
        if (b.G.splash) for (const r of owned) { if (r.team === b.team) continue; const d = r.jet.pos.dist(b.p); if (d < b.G.splash) this.damage(r, b.G.dmg * (1 - d / b.G.splash), b.owner); }
        this.bullets.splice(i, 1); this.impact(b); continue;
      }
      if (gone) this.bullets.splice(i, 1);
    }
    this.draw(t);
  }
  draw(t) {
    const M = this.tracers, o = this._o || (this._o = new THREE.Object3D()), dir = this._d || (this._d = new THREE.Vector3());
    let k = 0;
    for (const b of this.bullets) {
      if (k >= MAX_B) break;
      dir.set(b.v.x, b.v.y, b.v.z); const sp = dir.length(); dir.divideScalar(sp || 1);
      o.position.set(b.p.x, b.p.y, b.p.z); o.quaternion.setFromUnitVectors(_Z, dir); o.scale.set(b.G.r * 0.6, b.G.r * 0.6, b.G.len);
      o.updateMatrix(); M.setMatrixAt(k, o.matrix); M.setColorAt(k, this.cols[b.cls] || this.cols.caza); k++;
    }
    M.count = k; M.instanceMatrix.needsUpdate = true; if (M.instanceColor) M.instanceColor.needsUpdate = true;
    const R = this.zoneR(t); this.zoneMesh.position.set(this.center.x, this.center.y, this.center.z); this.zoneMesh.scale.setScalar(R);
    this.zoneMat.uniforms.uTime.value = this.time;
  }

  // ---------- marcador ----------
  hud(on) {
    if (!this.hudEl) {
      const el = document.createElement('div'); el.id = 'teamHud';
      el.innerHTML = '<div class="tscore"><b class="t0">0</b><span>—</span><b class="t1">0</b></div><div class="tzone"></div><div class="thp"><i></i></div><div class="tcls"></div><div class="thit">✕</div>';
      document.body.appendChild(el); this.hudEl = el;
    }
    this.hudEl.hidden = !on;
  }
  updateHud(me, t, score) {
    if (!this.hudEl || this.hudEl.hidden) return;
    const H = this.hudEl, C = CLASSES[me.cls] || CLASSES.caza;
    H.querySelector('.t0').textContent = score[0]; H.querySelector('.t1').textContent = score[1];
    const nc = this.nextClose(t), out = me.jet.alive && this.outside(me.jet.pos, t);
    H.querySelector('.tzone').textContent = out ? '¡FUERA DE LA TINTA! VUELVE DENTRO' : nc > 0 ? `La tinta se cierra en ${Math.ceil(nc)} s` : this.zoneR(t) <= 71 ? 'La tinta ya no se cierra más' : 'LA TINTA SE ESTÁ CERRANDO';
    H.querySelector('.tzone').classList.toggle('bad', out);
    const hp = Math.max(0, me.hp ?? C.hp) / C.hp;
    const bar = H.querySelector('.thp i'); bar.style.width = `${hp * 100}%`; bar.style.background = hp > 0.5 ? '#f1ece2' : hp > 0.25 ? '#ffd400' : '#ff2a3c';
    H.querySelector('.tcls').textContent = me.jet.alive ? `${C.icon} ${C.label} · ${Math.ceil(me.hp ?? C.hp)}` : `Reapareces en ${Math.max(0, Math.ceil(me.jet.crashT))} s`;
    this.world.setInk?.(out ? 1 : 0);
  }
  flashHit() { if (!this.hudEl) return; const x = this.hudEl.querySelector('.thit'); x.classList.remove('on'); void x.offsetWidth; x.classList.add('on'); }
}
const _Z = new THREE.Vector3(0, 0, 1);
export const RESPAWN_TIME = RESPAWN;
