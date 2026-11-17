// Repetición: graba 20 veces por segundo la pose de todos los jets (y las explosiones, misiles y minas)
// y la vuelve a poner con cámaras de cine: persecución, órbita, a pie de pista, pasada, desde arriba, morro y ala.
import * as THREE from 'three';
import { V3 } from './math.js';

const HZ = 20, MAX_T = 900, STRIDE = 10; // x y z · qx qy qz qw · banderas · gas · s del recorrido
export const REPLAY_CAMS = ['auto', 'persecucion', 'orbita', 'pista', 'pasada', 'arriba', 'morro', 'ala'];
export const CAM_LABEL = { auto: 'Auto', persecucion: 'Persecución', orbita: 'Órbita', pista: 'Pie de pista', pasada: 'Pasada', arriba: 'Desde arriba', morro: 'Morro', ala: 'Ala' };

export class ReplayRecorder {
  constructor() { this.reset([]); }
  reset(racers) {
    this.ids = racers.map(r => r.id);
    this.frames = []; this.events = [];
    this.acc = 1 / HZ; this.t = 0; this.on = racers.length > 0;
  }
  get duration() { return this.frames.length ? this.frames[this.frames.length - 1].t : 0; }
  // racerById(id) → piloto (o nada si se ha ido); items: misiles y minas en vuelo
  sample(dt, clock, racerById, items) {
    if (!this.on || this.t > MAX_T) return;
    this.t += dt; this.acc += dt;
    if (this.acc < 1 / HZ) return;
    this.acc %= 1 / HZ;
    const n = this.ids.length, d = new Float32Array(n * STRIDE);
    this.ids.forEach((id, i) => {
      const r = racerById(id), o = i * STRIDE;
      if (!r) { d[o + 7] = -1; return; }
      const v = r.view;
      d[o] = v.p.x; d[o + 1] = v.p.y; d[o + 2] = v.p.z;
      d[o + 3] = v.q.x; d[o + 4] = v.q.y; d[o + 5] = v.q.z; d[o + 6] = v.q.w;
      d[o + 7] = (v.alive ? 1 : 0) | (v.boost ? 2 : 0) | (r.smokeOn ? 4 : 0) | ((r.owned ? r.shieldT > 0 : v.shield) ? 8 : 0);
      d[o + 8] = v.throttle;
      d[o + 9] = r.owned ? r.race.s : r.s;
    });
    const missiles = items.on ? items.missiles.map(m => [m.p.x, m.p.y, m.p.z, m.dir.x, m.dir.y, m.dir.z]) : [];
    const mines = items.on ? items.mines.map(m => [m.p.x, m.p.y, m.p.z]) : [];
    this.frames.push({ t: this.t, clock, d, missiles, mines });
  }
  event(e) { if (this.on && this.t <= MAX_T) this.events.push({ t: this.t, ...e }); }
}

const _v = new V3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);

export class ReplayPlayer {
  // hooks: boom(p, v, id) para las explosiones; track para no meter la cámara dentro del decorado
  constructor(scene, rec, track, hooks) {
    Object.assign(this, { scene, rec, track, hooks });
    this.t = 0; this.speed = 1; this.playing = true; this.k = 0; this.ev = 0;
    this.camMode = 'auto'; this.shot = 'persecucion'; this.shotT = 0; this.cut = true; this.orbit = Math.random() * 6;
    this.spot = new THREE.Vector3(); this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.fov = 60;
    this.focus = 0;
    // misiles y minas: piezas sencillas reutilizables
    this.group = new THREE.Group();
    scene.add(this.group);
    const mMat = new THREE.MeshStandardMaterial({ color: 0xe8e2d8, metalness: 0.6, roughness: 0.3 });
    const fMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb060').multiplyScalar(5) });
    const nMat = new THREE.MeshStandardMaterial({ color: 0x2a2530, metalness: 0.7, roughness: 0.35 });
    this.mGeo = new THREE.CylinderGeometry(0.3, 0.3, 3.4, 8).rotateX(Math.PI / 2);
    this.fGeo = new THREE.SphereGeometry(0.45, 8, 6).scale(1, 1, 2.6).translate(0, 0, 2.4);
    this.nGeo = new THREE.IcosahedronGeometry(2, 1);
    Object.assign(this, { mMat, fMat, nMat });
    this.mPool = []; this.nPool = [];
  }
  get duration() { return this.rec.duration; }
  dispose() {
    this.scene.remove(this.group);
    this.mGeo.dispose(); this.fGeo.dispose(); this.nGeo.dispose(); this.mMat.dispose(); this.fMat.dispose(); this.nMat.dispose();
  }

  // Fotograma grabado justo antes de t (búsqueda desde el último, porque casi siempre se avanza poco)
  index(t) {
    const F = this.rec.frames;
    let k = Math.min(this.k, F.length - 1);
    while (k > 0 && F[k].t > t) k--;
    while (k < F.length - 2 && F[k + 1].t <= t) k++;
    this.k = k;
    return k;
  }
  seek(t) {
    this.t = Math.max(0, Math.min(this.duration, t));
    this.ev = this.rec.events.findIndex(e => e.t > this.t);
    if (this.ev < 0) this.ev = this.rec.events.length;
    this.cut = true;
  }
  // Pose del jet i en el instante actual: { p, q, flags, throttle, s }; null si no estaba
  pose(i, out) {
    const F = this.rec.frames, k = this.index(this.t), A = F[k], B = F[Math.min(k + 1, F.length - 1)];
    const f = B.t > A.t ? Math.max(0, Math.min(1, (this.t - A.t) / (B.t - A.t))) : 0, o = i * STRIDE;
    if (A.d[o + 7] < 0) return null;
    const a = A.d, b = B.d[o + 7] < 0 ? A.d : B.d;
    // si el jet ha reaparecido entre los dos fotogramas, no se interpola el salto
    const jump = Math.hypot(b[o] - a[o], b[o + 1] - a[o + 1], b[o + 2] - a[o + 2]) > 60;
    const g = jump ? (f < 0.5 ? 0 : 1) : f;
    out.p.set(a[o] + (b[o] - a[o]) * g, a[o + 1] + (b[o + 1] - a[o + 1]) * g, a[o + 2] + (b[o + 2] - a[o + 2]) * g);
    out.q.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]).slerp(_q.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]), g);
    out.flags = g < 0.5 ? a[o + 7] : b[o + 7];
    out.throttle = a[o + 8];
    out.s = a[o + 9];
    out.v = out.v || new THREE.Vector3();
    out.v.set(b[o] - a[o], b[o + 1] - a[o + 1], b[o + 2] - a[o + 2]).divideScalar(Math.max(1e-3, B.t - A.t));
    return out;
  }
  clock() {
    const F = this.rec.frames, k = this.index(this.t), A = F[k], B = F[Math.min(k + 1, F.length - 1)];
    const f = B.t > A.t ? (this.t - A.t) / (B.t - A.t) : 0;
    return A.clock + (B.clock - A.clock) * Math.max(0, Math.min(1, f));
  }

  // Avanza el tiempo y lanza las explosiones que toquen
  advance(dt) {
    if (!this.playing) return;
    const prev = this.t;
    this.t = Math.min(this.duration, this.t + dt * this.speed);
    const E = this.rec.events;
    while (this.ev < E.length && E[this.ev].t <= this.t) {
      const e = E[this.ev++];
      if (e.t >= prev - 0.05) this.hooks.boom(e);
    }
    if (this.t >= this.duration) this.playing = false;
  }

  // Misiles y minas del fotograma actual
  drawItems() {
    const F = this.rec.frames[this.index(this.t)];
    const need = (pool, n, make) => { while (pool.length < n) { const m = make(); this.group.add(m); pool.push(m); } pool.forEach((m, i) => { m.visible = i < n; }); };
    need(this.mPool, F.missiles.length, () => { const g = new THREE.Group(); g.add(new THREE.Mesh(this.mGeo, this.mMat), new THREE.Mesh(this.fGeo, this.fMat)); return g; });
    F.missiles.forEach((m, i) => {
      const g = this.mPool[i];
      g.position.set(m[0], m[1], m[2]);
      g.quaternion.setFromUnitVectors(_a.set(0, 0, -1), _b.set(m[3], m[4], m[5]));
    });
    need(this.nPool, F.mines.length, () => new THREE.Mesh(this.nGeo, this.nMat));
    F.mines.forEach((m, i) => this.nPool[i].position.set(m[0], m[1], m[2]));
  }

  // ---------- Cámaras ----------
  // Elige un plano nuevo (en automático) cada pocos segundos
  pickShot() {
    const all = REPLAY_CAMS.slice(1), w = { persecucion: 3, orbita: 2, pista: 3, pasada: 3, arriba: 1, morro: 1, ala: 1.5 };
    let total = 0;
    for (const c of all) if (c !== this.shot) total += w[c];
    let x = Math.random() * total;
    for (const c of all) { if (c === this.shot) continue; if ((x -= w[c]) <= 0) { this.shot = c; break; } }
    this.shotT = 3.5 + Math.random() * 3.5;
    this.cut = true;
  }
  // Busca un sitio libre para una cámara fija delante del jet
  placeSpot(P, V, ahead, side, up) {
    const dir = _a.copy(V).normalize();
    if (dir.lengthSq() < 0.5) dir.set(0, 0, -1);
    const right = _b.crossVectors(dir, UP).normalize();
    if (right.lengthSq() < 0.5) right.set(1, 0, 0);
    for (const sgn of [Math.random() < 0.5 ? 1 : -1, 0]) {
      for (const k of [1, 1.6, 0.6]) {
        const s = sgn === 0 ? 1 : sgn;
        _c.copy(P).addScaledVector(dir, ahead).addScaledVector(right, side * s * k).addScaledVector(UP, up * k);
        if (_c.y < 8) _c.y = 8;
        if (this.track.nearest(_v.set(_c.x, _c.y, _c.z), 30).d > 6) { this.spot.copy(_c); return; }
      }
    }
    this.spot.copy(P).addScaledVector(UP, 30);
  }
  // Coloca la cámara siguiendo al jet enfocado (pose: { p, q, v })
  camera(dt, camera, pose) {
    if (this.camMode === 'auto') { if ((this.shotT -= dt * Math.max(0.5, this.speed)) <= 0) this.pickShot(); } else if (this.shot !== this.camMode) { this.shot = this.camMode; this.cut = true; }
    const P = pose.p, Q = pose.q, V = pose.v, fwd = _a.set(0, 0, -1).applyQuaternion(Q), up = _b.set(0, 1, 0).applyQuaternion(Q);
    const speed = V.length(), cut = this.cut, k = cut ? 1 : 1 - Math.exp(-dt * 6);
    let fov = 60;
    camera.up.set(0, 1, 0);
    switch (this.shot) {
      case 'persecucion': {
        const want = _c.copy(P).addScaledVector(fwd, -15).addScaledVector(up, 4.5);
        this.camPos.lerp(want, k);
        this.camLook.copy(P).addScaledVector(fwd, 20);
        camera.up.copy(up).lerp(UP, 0.4).normalize();
        fov = 70;
        break;
      }
      case 'orbita': {
        this.orbit += dt * 0.35;
        this.camPos.set(P.x + Math.sin(this.orbit) * 22, P.y + 5 + Math.sin(this.orbit * 0.6) * 4, P.z + Math.cos(this.orbit) * 22);
        this.camLook.copy(P);
        fov = 55;
        break;
      }
      case 'pista': case 'pasada': {
        const close = this.shot === 'pasada';
        // sitio nuevo al empezar el plano o cuando el jet ya ha pasado de largo
        _c.subVectors(P, this.spot);
        if (cut || _c.dot(V) > (close ? 40 : 90) * Math.max(1, speed) || _c.length() > (close ? 260 : 520)) {
          this.placeSpot(P, V.lengthSq() > 1 ? V : fwd, close ? Math.max(70, speed * 1.1) : Math.max(150, speed * 2.2), close ? 9 : 40, close ? 3 : 14);
        }
        this.camPos.copy(this.spot);
        this.camLook.copy(P);
        const d = this.camPos.distanceTo(P);
        fov = close ? 62 : Math.max(10, Math.min(60, (2 * Math.atan(16 / Math.max(d, 1)) * 180) / Math.PI));
        break;
      }
      case 'arriba': {
        const want = _c.copy(P).addScaledVector(fwd, -28);
        want.y += 42;
        this.camPos.lerp(want, k);
        this.camLook.copy(P).addScaledVector(fwd, 10);
        fov = 60;
        break;
      }
      case 'morro': case 'ala': {
        const local = this.shot === 'morro' ? _c.set(0, 0.6, -8.6) : _c.set(5.5, 0.9, 1.5);
        this.camPos.copy(local).applyQuaternion(Q).add(P);
        camera.position.copy(this.camPos);
        camera.quaternion.copy(Q);
        if (this.shot === 'ala') camera.quaternion.multiply(_q2.setFromAxisAngle(UP, 0.18));
        camera.up.copy(up);
        this.cut = false;
        return this.shot === 'morro' ? 78 : 70;
      }
    }
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
    this.cut = false;
    return fov;
  }
}
