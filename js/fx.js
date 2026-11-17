// Efectos: partículas (fuego, humo, chispas), estelas de condensación, líneas de velocidad,
// cono de vapor del estampido sónico y el piloto que sale en paracaídas.
import * as THREE from 'three';
import { dotTexture } from './textures.js';
import { buildPilot } from './jet-model.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const _c = new THREE.Color();

// Muchas partículas en una sola llamada de dibujo
class Particles {
  constructor(scene, max, additive, tex) {
    this.max = max; this.i = 0;
    this.p = new Float32Array(max * 3); this.c = new Float32Array(max * 3); this.s = new Float32Array(max); this.a = new Float32Array(max);
    this.v = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.grow = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.a, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float uScale;
        void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(-mv.z, 0.5); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main() { float t = texture2D(map, gl_PointCoord).a; if (t * vA < 0.004) discard; gl_FragColor = vec4(vC, t * vA); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, { life = 1, size = 1, grow = 0, drag = 0, grav = 0, alpha = 1, color = 0xffffff }) {
    const i = this.i = (this.i + 1) % this.max, k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    _c.set(color);
    this.c[k] = _c.r; this.c[k + 1] = _c.g; this.c[k + 2] = _c.b;
    if (color.isColor) { this.c[k] = color.r; this.c[k + 1] = color.g; this.c[k + 2] = color.b; }
    this.life[i] = this.maxLife[i] = life; this.s0[i] = size; this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav; this.a0[i] = alpha;
    this.s[i] = size; this.a[i] = alpha;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.a[i]) { this.a[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = i * 3, f = Math.exp(-this.drag[i] * dt), u = 1 - this.life[i] / this.maxLife[i];
      this.v[k] *= f; this.v[k + 1] = this.v[k + 1] * f - this.grav[i] * dt; this.v[k + 2] *= f;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      this.s[i] = this.s0[i] + this.grow[i] * u;
      this.a[i] = this.a0[i] * Math.min(1, (1 - u) * 2.5) * Math.min(1, u * 12 + 0.25);
      if (this.life[i] <= 0) this.a[i] = 0;
    }
    for (const n of ['position', 'color', 'size', 'alpha']) this.geo.attributes[n].needsUpdate = true;
  }
}

// Estela que se ensancha y se desvanece (condensación en las puntas de las alas)
class Trail {
  constructor(scene, n = 48, width = 0.25) {
    this.n = n; this.width = width; this.pts = []; this.acc = 0;
    this.pos = new Float32Array(n * 2 * 3); this.alpha = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = g;
    // se desvanece cerca de la cámara para que no tape la pantalla al pasar por detrás del jet
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float alpha; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * smoothstep(9.0, 30.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(vec3(1.0, 0.97, 0.94) * 1.1, vA); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  clear() { this.pts.length = 0; }
  push(p, k, dt) {
    this.acc += dt;
    if (this.acc < 1 / 30 && this.pts.length) { this.pts[0].p.copy(p); this.pts[0].k = Math.max(this.pts[0].k, k); return; }
    this.acc = 0;
    this.pts.unshift({ p: p.clone(), k, age: 0 });
    if (this.pts.length > this.n) this.pts.pop();
  }
  update(dt, cam) {
    const P = this.pts, tan = new THREE.Vector3(), side = new THREE.Vector3(), to = new THREE.Vector3();
    for (const q of P) q.age += dt;
    for (let i = 0; i < this.n; i++) {
      const q = P[Math.min(i, P.length - 1)];
      if (!q) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      const j = Math.min(i, P.length - 1), a = P[Math.max(0, j - 1)], b = P[Math.min(P.length - 1, j + 1)];
      tan.subVectors(a.p, b.p);
      to.subVectors(cam, q.p);
      side.crossVectors(tan, to).normalize().multiplyScalar(this.width * (1 + q.age * 3));
      const k = i * 6;
      this.pos[k] = q.p.x + side.x; this.pos[k + 1] = q.p.y + side.y; this.pos[k + 2] = q.p.z + side.z;
      this.pos[k + 3] = q.p.x - side.x; this.pos[k + 4] = q.p.y - side.y; this.pos[k + 5] = q.p.z - side.z;
      const al = i >= P.length ? 0 : q.k * Math.max(0, 1 - q.age / 1.5) * Math.min(1, i / 2) * 0.55;
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = al;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

// Humo de colores para escribir en el cielo: dura 20 s y se va ensanchando
export class SkySmoke {
  constructor(scene, color, n = 260) {
    this.n = n; this.pts = []; this.acc = 0; this.life = 20;
    this.pos = new Float32Array(n * 2 * 3); this.alpha = new Float32Array(n * 2);
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) } },
      vertexShader: `attribute float alpha; varying float vA;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = alpha * smoothstep(4.0, 22.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform vec3 uColor; varying float vA; void main() { gl_FragColor = vec4(uColor, vA); }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  setColor(c) { this.mat.uniforms.uColor.value.set(c); }
  clear() { this.pts.length = 0; this.mesh.visible = false; }
  // on: si está echando humo; los huecos cortan la cinta
  push(p, on, now, dt) {
    this.acc += dt;
    if (this.acc < 0.07) return;
    this.acc = 0;
    const last = this.pts[0];
    if (!on && (!last || !last.on)) return;
    this.pts.unshift({ x: p.x, y: p.y, z: p.z, t: now, on });
    if (this.pts.length > this.n) this.pts.pop();
  }
  update(now, cam) {
    const P = this.pts;
    while (P.length && now - P[P.length - 1].t > this.life) P.pop();
    this.mesh.visible = P.length > 1;
    if (!this.mesh.visible) return;
    const tx = new THREE.Vector3(), side = new THREE.Vector3(), to = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const k = i * 6, j = Math.min(i, P.length - 1), q = P[j];
      const a = P[Math.max(0, j - 1)], b = P[Math.min(P.length - 1, j + 1)];
      tx.set(a.x - b.x, a.y - b.y, a.z - b.z);
      to.set(cam.x - q.x, cam.y - q.y, cam.z - q.z);
      const age = now - q.t;
      side.crossVectors(tx, to).normalize().multiplyScalar(1 + age * 0.35);
      this.pos[k] = q.x + side.x; this.pos[k + 1] = q.y + side.y; this.pos[k + 2] = q.z + side.z;
      this.pos[k + 3] = q.x - side.x; this.pos[k + 4] = q.y - side.y; this.pos[k + 5] = q.z - side.z;
      const al = i >= P.length || !q.on ? 0 : 0.85 * (1 - age / this.life) * Math.min(1, i / 2);
      this.alpha[i * 2] = this.alpha[i * 2 + 1] = al;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, camera, quality) {
    const tex = dotTexture();
    this.scene = scene; this.camera = camera;
    this.glow = new Particles(scene, Math.round(quality.particles * 0.55), true, tex);
    this.smoke = new Particles(scene, Math.round(quality.particles * 0.45), false, tex);
    this.trails = [new Trail(scene), new Trail(scene)];
    this.flash = new THREE.PointLight(0xffa860, 0, 400, 1.6);
    scene.add(this.flash);
    this.chutes = [];

    // Líneas de velocidad alrededor de la cámara
    const N = 140, lp = new Float32Array(N * 6);
    this.lines = { N, data: Array.from({ length: N }, () => this.newLine({})), pos: lp };
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.lineMesh = new THREE.LineSegments(lg, this.lineMat);
    this.lineMesh.frustumCulled = false;
    scene.add(this.lineMesh);

    // Cono de vapor del estampido sónico
    const cone = new THREE.ConeGeometry(6.5, 12, 40, 1, true);
    cone.rotateX(-Math.PI / 2);
    this.coneMat = new THREE.ShaderMaterial({
      uniforms: { uLife: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uLife, uTime; varying vec2 vUv;
        void main() {
          float ring = 0.6 + 0.4 * sin(vUv.y * 40.0 - uTime * 20.0);
          float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
          float n = 0.75 + 0.25 * sin(vUv.x * 60.0 + uTime * 7.0);
          gl_FragColor = vec4(vec3(1.0), edge * ring * n * (1.0 - uLife) * 0.55);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.cone = new THREE.Mesh(cone, this.coneMat);
    this.cone.visible = false;
    this.coneT = 1;
  }

  setPointScale(renderer, camera) {
    const h = renderer.domElement.height;
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.glow.mat.uniforms.uScale.value = this.smoke.mat.uniforms.uScale.value = s;
  }

  newLine(l) {
    const a = Math.random() * Math.PI * 2, r = rnd(5, 26);
    l.x = Math.cos(a) * r; l.y = Math.sin(a) * r * 0.7; l.z = -rnd(20, 260);
    return l;
  }

  // --- Efectos concretos ---
  explosion(p, v) {
    const G = this.glow, S = this.smoke;
    for (let i = 0; i < 46; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(10, 38));
      G.emit(p.x, p.y, p.z, d.x + v.x * 0.25, d.y + v.y * 0.25, d.z + v.z * 0.25, { life: rnd(0.5, 1.0), size: rnd(4, 8), grow: rnd(10, 22), drag: 2.2, color: new THREE.Color().setHSL(rnd(0.03, 0.11), 1, 0.55).multiplyScalar(3) });
    }
    for (let i = 0; i < 34; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(4, 14));
      S.emit(p.x, p.y, p.z, d.x + v.x * 0.15, d.y + v.y * 0.15 + 3, d.z + v.z * 0.15, { life: rnd(2.2, 3.8), size: rnd(8, 14), grow: rnd(30, 55), drag: 1.2, grav: -2, alpha: 0.75, color: new THREE.Color().setHSL(0.06, 0.15, rnd(0.08, 0.2)) });
    }
    for (let i = 0; i < 40; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(35, 85));
      G.emit(p.x, p.y, p.z, d.x + v.x * 0.4, d.y + v.y * 0.4, d.z + v.z * 0.4, { life: rnd(0.6, 1.4), size: rnd(0.6, 1.3), drag: 0.6, grav: 14, color: new THREE.Color(1, 0.75, 0.4).multiplyScalar(4) });
    }
    for (let i = 0; i < 26; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(0, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(25, 55));
      S.emit(p.x, p.y, p.z, d.x + v.x * 0.35, d.y + v.y * 0.35, d.z + v.z * 0.35, { life: rnd(1.5, 2.5), size: rnd(1, 2.2), drag: 0.3, grav: 16, color: 0x2a2420 });
    }
    this.flash.position.copy(p);
    this.flash.intensity = 6e4;
  }
  sparks(p, n = 14) {
    for (let i = 0; i < n; i++) this.glow.emit(p.x, p.y, p.z, rnd(-30, 30), rnd(-10, 30), rnd(-30, 30), { life: rnd(0.3, 0.7), size: rnd(0.4, 0.9), grav: 20, drag: 1, color: new THREE.Color(1, 0.8, 0.45).multiplyScalar(4) });
  }
  ringBurst(p, t, r, color = '#3ee8ff') {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(t.x, t.y, t.z).normalize());
    const col = new THREE.Color(color).multiplyScalar(3);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).applyQuaternion(q);
      this.glow.emit(p.x + d.x * r, p.y + d.y * r, p.z + d.z * r, d.x * 8, d.y * 8, d.z * 8, { life: 0.7, size: 1.4, drag: 2, color: col });
    }
  }
  // vapor de la locomotora
  steam(p) { this.smoke.emit(p.x, p.y, p.z, rnd(6, 11), rnd(6, 10), rnd(-2, 2), { life: rnd(2, 3.2), size: 3, grow: rnd(14, 24), drag: 0.6, grav: -1.5, alpha: 0.55, color: 0xf2efe9 }); }
  // humo del motor al chocar de refilón
  puff(p) { this.smoke.emit(p.x, p.y, p.z, rnd(-3, 3), rnd(0, 3), rnd(-3, 3), { life: 1.2, size: 2, grow: 10, drag: 1, alpha: 0.5, color: 0x666060 }); }

  sonic(jetGroup) {
    jetGroup.add(this.cone);
    this.cone.position.set(0, 0, -0.5);
    this.cone.visible = true;
    this.coneT = 0;
  }

  // cfg: configuración del jet (casco del piloto y colores del paracaídas)
  eject(p, v, cfg) {
    const g = new THREE.Group(), look = { c1: cfg.paint.c1, c2: cfg.paint.c2 };
    const pilot = buildPilot(cfg);
    const canopyGeo = new THREE.SphereGeometry(4.2, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42);
    const cols = [];
    const pos = canopyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const stripe = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 8) % 2;
      _c.set(stripe ? look.c1 : look.c2);
      cols.push(_c.r, _c.g, _c.b);
    }
    canopyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
    canopy.position.y = 6;
    const lp = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; lp.push(0, 0, 0, Math.cos(a) * 3.7, 6.8, Math.sin(a) * 3.7); }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)), new THREE.LineBasicMaterial({ color: 0xeeeeee }));
    g.add(pilot, canopy, lines);
    canopy.scale.setScalar(0.01); lines.visible = false;
    g.position.copy(p);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.chutes.push({ g, canopy, lines, v: new THREE.Vector3(v.x * 0.12, 28 + Math.max(0, v.y * 0.1), v.z * 0.12), t: 0, spin: rnd(-3, 3) });
  }

  // intensity 0..1 de las estelas; tips = posiciones de las puntas de las alas en el mundo
  trailsUpdate(dt, tips, k, camPos) {
    this.trails.forEach((tr, i) => { if (tips) tr.push(tips[i], k, dt); tr.update(dt, camPos); });
  }
  clearTrails() { this.trails.forEach(t => t.clear()); }

  update(dt, { speed = 0, cam }) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.flash.intensity *= Math.exp(-dt * 7);
    // líneas de velocidad en el espacio de la cámara
    const L = this.lines, vis = Math.max(0, Math.min(1, (speed - 95) / 45));
    this.lineMat.opacity = vis * 0.22;
    this.lineMesh.visible = vis > 0.01;
    if (this.lineMesh.visible) {
      this.lineMesh.position.copy(cam.position); this.lineMesh.quaternion.copy(cam.quaternion);
      const len = speed * 0.06;
      L.data.forEach((l, i) => {
        l.z += speed * 1.3 * dt;
        if (l.z > 5) this.newLine(l), (l.z = -260 + Math.random() * 40);
        const k = i * 6;
        L.pos[k] = l.x; L.pos[k + 1] = l.y; L.pos[k + 2] = l.z; L.pos[k + 3] = l.x; L.pos[k + 4] = l.y; L.pos[k + 5] = l.z - len;
      });
      this.lineMesh.geometry.attributes.position.needsUpdate = true;
    }
    // cono sónico
    if (this.cone.visible) {
      this.coneT += dt / 0.7;
      this.coneMat.uniforms.uLife.value = this.coneT;
      this.coneMat.uniforms.uTime.value += dt;
      this.cone.scale.setScalar(0.7 + this.coneT * 0.6);
      if (this.coneT >= 1) { this.cone.visible = false; this.cone.removeFromParent(); }
    }
    // paracaídas
    for (const c of this.chutes) {
      c.t += dt;
      if (c.t > 0.9) {
        c.canopy.scale.setScalar(Math.min(1, (c.t - 0.9) * 2.5));
        c.lines.visible = true;
        c.v.x *= Math.exp(-dt * 1.5); c.v.z *= Math.exp(-dt * 1.5);
        c.v.y += (-4 - c.v.y) * (1 - Math.exp(-dt * 2));
        c.g.rotation.z = Math.sin(c.t * 1.7) * 0.12;
      } else {
        c.v.y -= 20 * dt;
        c.g.rotation.x += c.spin * dt;
      }
      if (c.t > 0.9) c.g.rotation.x *= Math.exp(-dt * 4);
      c.g.position.addScaledVector(c.v, dt);
    }
    this.chutes = this.chutes.filter(c => {
      if (c.t < 9) return true;
      c.g.removeFromParent();
      return false;
    });
  }
}
