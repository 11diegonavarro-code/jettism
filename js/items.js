// Objetos: anillos de objeto en el recorrido, misil teledirigido, mina, escudo y bengalas.
// Los misiles y las minas se simulan en todas las pantallas; cada jugador decide si le han dado a sus propios jets
// (el suyo y, el anfitrión, los bots) y lo avisa a los demás.
import * as THREE from 'three';
import { V3 } from './math.js';
import { GATE } from './track.js';

export const ITEMS = {
  misil: { label: 'Misil', icon: '🚀' },
  escudo: { label: 'Escudo', icon: '🛡️' },
  mina: { label: 'Mina', icon: '💣' },
  bengalas: { label: 'Bengalas', icon: '✨', charges: 3 },
};
const MISSILE_SPEED = 230, MISSILE_TURN = 3.4, MISSILE_LIFE = 7, MINE_LIFE = 45, HIT_R = 7, FUSE_R = 9;

// Qué toca según la posición (f: 0 el primero, 1 el último): los de atrás reciben más misiles
export function rollItem(f, R = Math.random) {
  const w = { misil: 5 + 45 * f, escudo: 35 - 15 * f, mina: 25 - 10 * f, bengalas: 35 - 20 * f };
  let x = R() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [k, v] of Object.entries(w)) { if ((x -= v) <= 0) return k; }
  return 'escudo';
}

const _a = new V3(), _b = new V3(), _p0 = new V3(), _s = new V3();
// Distancia mínima de un punto c al tramo a→b (para que un misil rápido no atraviese el jet entre dos fotogramas)
function segDist(a, b, c) {
  _s.subVectors(b, a);
  const L2 = _s.lenSq(), f = L2 > 0 ? Math.max(0, Math.min(1, _a.subVectors(c, a).dot(_s) / L2)) : 0;
  return _a.copy(a).addScaled(_s, f).dist(c);
}
let uid = 1;

export class Items {
  // hooks: racers() lista de pilotos, byId(id), owned(r), onHit(victim, cause, byId), send(msg), me()
  constructor(scene, track, fx, sound, hooks) {
    Object.assign(this, { scene, track, fx, sound, hooks });
    this.missiles = []; this.mines = []; this.rings = []; this.on = false;
    this.group = new THREE.Group();
    scene.add(this.group);
    // anillos de objeto: tres juntos en varios tramos (se recolocan al cambiar de circuito)
    this.ringMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color('#b884ff'), emissiveIntensity: 2.4, roughness: 0.4 });
    this.boxMat = new THREE.MeshStandardMaterial({ color: 0xffcf6b, emissive: new THREE.Color('#ff9a40'), emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.4 });
    this.ringGeo = new THREE.TorusGeometry(6, 0.55, 10, 40); this.boxGeo = new THREE.IcosahedronGeometry(1.8, 0);
    this.layout();
    // piezas reutilizables
    this.mats = {
      missile: new THREE.MeshStandardMaterial({ color: 0xe8e2d8, metalness: 0.6, roughness: 0.3 }),
      tip: new THREE.MeshStandardMaterial({ color: 0xd62839, roughness: 0.4 }),
      flame: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(5) }),
      mine: new THREE.MeshStandardMaterial({ color: 0x2a2530, metalness: 0.7, roughness: 0.35 }),
      blink: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a2a').multiplyScalar(5) }),
    };
    this.shieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true,
      vertexShader: 'varying vec3 vN, vV; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uTime; varying vec3 vN, vV;
        void main() { float f = pow(1.0 - abs(dot(vN, vV)), 2.5); float w = 0.6 + 0.4 * sin(uTime * 6.0 + vN.y * 12.0);
          gl_FragColor = vec4(vec3(0.25, 0.9, 1.0) * (f * 1.6 * w + 0.04), 1.0); }`,
    });
    this.shieldGeo = new THREE.SphereGeometry(7.5, 32, 20);
    this.geo = {
      body: new THREE.CylinderGeometry(0.28, 0.28, 3.2, 10).rotateX(Math.PI / 2),
      tip: new THREE.ConeGeometry(0.28, 0.8, 10).rotateX(-Math.PI / 2).translate(0, 0, -2),
      flame: new THREE.SphereGeometry(0.4, 8, 6).scale(1, 1, 2.4).translate(0, 0, 2.2),
      fin: new THREE.BoxGeometry(0.05, 0.6, 0.6),
      mine: new THREE.IcosahedronGeometry(1.8, 1), spike: new THREE.ConeGeometry(0.25, 1.2, 6), light: new THREE.SphereGeometry(0.45, 8, 6).translate(0, 1.9, 0),
    };
    // un misil, una mina y un escudo bajo el suelo, para que sus materiales se compilen con la cuenta atrás
    this.warm = new THREE.Group();
    this.warm.add(this.missileMesh(), this.mineMesh().g, new THREE.Mesh(this.shieldGeo, this.shieldMat));
    this.warm.position.set(0, -500, 0);
    this.group.add(this.warm);
    this.time = 0;
  }

  // Coloca los anillos de objeto en el circuito actual: en el original, en sus tramos; en uno propio, repartidos
  layout() {
    for (const g of this.rings) this.group.remove(g.g);
    this.rings = [];
    const T = this.track, S = T.spline, cp = S.cpS;
    const spots = T.custom || T.map.id !== 'desierto' ? [0.16, 0.35, 0.54, 0.72, 0.88].map(f => f * T.length)
      : [cp[2] + 120, cp[GATE.contrafuerte] + 230, cp[GATE.pendulos] + 150, cp[GATE.ballena] + 300, cp[GATE.lago] + 150];
    for (const s of spots) {
      const f = S.frame(s);
      for (const off of [-16, 0, 16]) {
        const p = f.P.clone().addScaled(f.R, off), g = new THREE.Group();
        const box = new THREE.Mesh(this.boxGeo, this.boxMat);
        g.add(new THREE.Mesh(this.ringGeo, this.ringMat), box);
        g.position.set(p.x, p.y, p.z);
        g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.T.x, f.T.y, f.T.z));
        this.group.add(g);
        this.rings.push({ p, t: f.T.clone(), r: 8, g, box });
      }
    }
  }

  enable(on) { this.on = on; this.group.visible = on; if (!on) this.clear(); }
  clear() {
    for (const m of this.missiles) this.group.remove(m.mesh);
    for (const m of this.mines) this.group.remove(m.mesh);
    this.missiles = []; this.mines = [];
  }

  // Burbuja del escudo de un piloto (se crea al usarse la primera vez)
  shieldOf(r) {
    if (!r.shieldMesh) { r.shieldMesh = new THREE.Mesh(this.shieldGeo, this.shieldMat); r.shieldMesh.visible = false; r.model.group.add(r.shieldMesh); }
    return r.shieldMesh;
  }

  // ---------- Recoger y usar ----------
  // Comprueba si un jet propio cruza un anillo de objeto (en cualquier sentido)
  pickup(r, prev, place01, combat) {
    if (!this.on || r.item || !r.jet.alive) return null;
    const p = r.jet.pos;
    for (const g of this.rings) {
      if (g.p.dist(p) > 40) continue;
      const d0 = _a.subVectors(prev, g.p).dot(g.t), d1 = _b.subVectors(p, g.p).dot(g.t);
      if (d0 * d1 > 0) continue;
      const f = d0 / (d0 - d1 || 1);
      _a.copy(prev).lerp(p, f);
      if (_a.dist(g.p) > g.r) continue;
      const id = combat ? ['escudo', 'mina', 'bengalas', 'misil'][Math.floor(Math.random() * 4)] : rollItem(typeof place01 === 'function' ? place01() : place01);
      r.item = { id, charges: ITEMS[id].charges || 1 };
      g.flash = 0.6;
      return id;
    }
    return null;
  }

  // Usa el objeto de un jet propio. target: el piloto al que va el misil (o null)
  use(r, id, target) {
    const J = r.jet, now = this.time;
    if (id === 'misil') {
      const p = J.pos.clone().addScaled(J.fwd, 10), v = J.fwd.clone().scale(MISSILE_SPEED);
      const m = this.spawnMissile({ id: `${r.id}-${uid++}`, owner: r.id, target: target?.id || null, p, v });
      this.hooks.send({ t: 'ev', k: 'mfire', id: m.id, owner: r.id, target: m.target, p: [p.x, p.y, p.z], v: [v.x, v.y, v.z] });
      this.sound.sfx('missile');
    } else if (id === 'mina') {
      const p = J.pos.clone().addScaled(J.fwd, -14);
      const m = this.spawnMine({ id: `${r.id}-${uid++}`, owner: r.id, p });
      this.hooks.send({ t: 'ev', k: 'mine', id: m.id, owner: r.id, p: [p.x, p.y, p.z] });
      this.sound.sfx('mine');
    } else if (id === 'escudo') {
      r.shieldT = 8;
      this.sound.sfx('shield');
    } else if (id === 'bengalas') {
      this.flares(r, J.pos.clone().addScaled(J.fwd, -20));
      this.hooks.send({ t: 'ev', k: 'flares', id: r.id, p: [J.pos.x, J.pos.y, J.pos.z] });
    }
    void now;
  }

  // Bengalas: chispas brillantes y los misiles que iban a por este jet se van hacia ellas
  flares(r, at) {
    const p = at instanceof V3 ? at : new V3(at[0], at[1], at[2]);
    for (let k = 0; k < 6; k++) this.fx.ringBurst(p.clone().add(new V3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 20)), new V3(0, 1, 0), 2 + Math.random() * 3, '#fff2b0');
    for (const m of this.missiles) if (m.target === r.id && m.p.dist(p) < 500) { m.decoy = p.clone(); m.lost = true; }
    this.sound.sfx('flares');
  }

  spawnMissile({ id, owner, target, p, v }) {
    const g = this.missileMesh();
    this.group.add(g);
    const m = { id, owner, target, p: new V3(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]), dir: new V3(v.x ?? v[0], v.y ?? v[1], v.z ?? v[2]).normalize(), life: MISSILE_LIFE, age: 0, lost: false, decoy: null, mesh: g, smokeT: 0 };
    this.missiles.push(m);
    return m;
  }
  // Piezas (las geometrías son compartidas)
  missileMesh() {
    const G = this.geo, g = new THREE.Group();
    g.add(new THREE.Mesh(G.body, this.mats.missile), new THREE.Mesh(G.tip, this.mats.tip), new THREE.Mesh(G.flame, this.mats.flame));
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(G.fin, this.mats.tip); f.position.z = 1.2; f.rotation.z = (k * Math.PI) / 2; f.position.x = Math.cos((k * Math.PI) / 2) * 0.3; f.position.y = Math.sin((k * Math.PI) / 2) * 0.3; g.add(f); }
    return g;
  }
  mineMesh() {
    const G = this.geo, g = new THREE.Group();
    g.add(new THREE.Mesh(G.mine, this.mats.mine));
    for (let k = 0; k < 10; k++) { const s = new THREE.Mesh(G.spike, this.mats.mine); const a = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); s.position.copy(a).multiplyScalar(2); s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a); g.add(s); }
    const light = new THREE.Mesh(G.light, this.mats.blink);
    g.add(light);
    return { g, light };
  }
  spawnMine({ id, owner, p }) {
    const { g, light } = this.mineMesh();
    const pp = new V3(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2]);
    g.position.set(pp.x, pp.y, pp.z);
    this.group.add(g);
    const m = { id, owner, p: pp, life: MINE_LIFE, age: 0, mesh: g, light };
    this.mines.push(m);
    return m;
  }
  remove(list, id, boom = true) {
    const i = list.findIndex(x => x.id === id);
    if (i < 0) return;
    const m = list[i];
    if (boom) { this.fx.explosion(m.p, new V3(0, 0, 0)); }
    this.group.remove(m.mesh);
    list.splice(i, 1);
  }

  // Mensajes de la red
  onNet(m) {
    const v = a => new V3(a[0], a[1], a[2]);
    if (m.k === 'mfire' && !this.missiles.some(x => x.id === m.id)) this.spawnMissile({ id: m.id, owner: m.owner, target: m.target, p: v(m.p), v: v(m.v) });
    else if (m.k === 'mine' && !this.mines.some(x => x.id === m.id)) this.spawnMine({ id: m.id, owner: m.owner, p: v(m.p) });
    else if (m.k === 'mhit') this.remove(this.missiles, m.id);
    else if (m.k === 'minehit') this.remove(this.mines, m.id);
    else if (m.k === 'mlost') { const x = this.missiles.find(y => y.id === m.id); if (x) x.lost = true; }
    else if (m.k === 'flares') { const r = this.hooks.byId(m.id); if (r) this.flares(r, m.p); }
  }

  // Misiles que van a por un piloto y siguen enganchados (para el aviso)
  threats(r) { return this.missiles.filter(m => m.target === r.id && !m.lost && !m.decoy); }

  // ---------- Paso ----------
  update(dt) {
    this.time += dt;
    this.shieldMat.uniforms.uTime.value = this.time;
    for (const g of this.rings) { g.box.rotation.x += dt * 1.4; g.box.rotation.y += dt * 2; if (g.flash) { g.flash = Math.max(0, g.flash - dt); g.box.scale.setScalar(1 + g.flash * 1.5); } }
    if (!this.on) return;
    const racers = this.hooks.racers();
    // misiles
    for (const m of [...this.missiles]) {
      m.life -= dt; m.age += dt;
      let aim = m.decoy;
      if (!aim && !m.lost && m.target) {
        const t = this.hooks.byId(m.target);
        // apunta adonde va a estar cuando llegue (el adelanto se acorta al acercarse)
        const lead = t && t.view.alive ? Math.min(0.6, m.p.dist(t.view.p) / MISSILE_SPEED) : 0;
        if (t && t.view.alive) aim = _p0.set(t.view.p.x + t.view.v.x * lead, t.view.p.y + t.view.v.y * lead, t.view.p.z + t.view.v.z * lead);
        else m.lost = true;
      }
      if (aim) {
        const want = _b.subVectors(aim, m.p).normalize(), dot = Math.max(-1, Math.min(1, m.dir.dot(want))), ang = Math.acos(dot), step = MISSILE_TURN * dt;
        if (ang > 1e-4) m.dir.lerp(want, Math.min(1, step / ang)).normalize();
      }
      const from = m.from || (m.from = new V3());
      from.copy(m.p);
      m.p.addScaled(m.dir, MISSILE_SPEED * dt);
      m.mesh.position.set(m.p.x, m.p.y, m.p.z);
      m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), new THREE.Vector3(m.dir.x, m.dir.y, m.dir.z));
      if ((m.smokeT -= dt) <= 0) { m.smokeT = 0.025; this.fx.puff(m.p); }
      // choca contra el decorado, el señuelo o se acaba
      const hitWorld = this.track.nearest(m.p, 20).d < 1 || m.p.y < 1;
      if (hitWorld || m.life <= 0 || (m.decoy && m.p.dist(m.decoy) < 10)) { this.remove(this.missiles, m.id); continue; }
      // a qué jet propio le da
      for (const r of racers) {
        if (!this.hooks.owned(r) || !r.jet.alive || (r.id === m.owner && m.age < 1)) continue;
        if (segDist(from, m.p, r.jet.pos) < (r.id === m.target ? FUSE_R : HIT_R)) {
          this.remove(this.missiles, m.id);
          this.hooks.send({ t: 'ev', k: 'mhit', id: m.id });
          this.hit(r, 'misil', m.owner);
          break;
        }
      }
    }
    // minas
    for (const m of [...this.mines]) {
      m.life -= dt; m.age += dt;
      m.mesh.rotation.y += dt * 0.6;
      m.mesh.position.y = m.p.y + Math.sin(this.time * 2 + m.age) * 0.6;
      m.light.visible = this.time % 0.6 < 0.3;
      if (m.life <= 0) { this.remove(this.mines, m.id, false); continue; }
      for (const r of racers) {
        if (!this.hooks.owned(r) || !r.jet.alive || (r.id === m.owner && m.age < 2)) continue;
        if (r.jet.pos.dist(m.p) < HIT_R) {
          this.remove(this.mines, m.id);
          this.hooks.send({ t: 'ev', k: 'minehit', id: m.id });
          this.hit(r, 'mina', m.owner);
          break;
        }
      }
    }
    // escudos visibles
    for (const r of racers) {
      if (this.hooks.owned(r)) r.shieldT = Math.max(0, (r.shieldT || 0) - dt);
      const on = this.hooks.owned(r) ? r.shieldT > 0 : !!r.view.shield;
      if (on || r.shieldMesh) this.shieldOf(r).visible = on && r.view.alive;
    }
  }

  // Un jet propio recibe un impacto: el escudo lo aguanta; si no, explota
  hit(r, cause, by) {
    if (r.shieldT > 0) {
      r.shieldT = 0;
      this.fx.ringBurst(r.jet.pos, r.jet.fwd, 8, '#3ee8ff');
      this.hooks.onShield?.(r);
      return;
    }
    this.hooks.onHit(r, cause, by);
  }

  // Lo que tiene que hacer un misil enganchado cuando su objetivo (propio) hace la cobra o roza un obstáculo
  evade(r, reason) {
    for (const m of this.missiles) {
      if (m.target !== r.id || m.lost || m.p.dist(r.jet.pos) > (reason === 'cobra' ? 170 : 220)) continue;
      m.lost = true;
      this.hooks.send({ t: 'ev', k: 'mlost', id: m.id });
    }
  }
}
