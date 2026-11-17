// Editor de circuitos: cámara libre por el mapa, puertas numeradas (tres tamaños), anillos de turbo y la línea del recorrido
// coloreada (verde libre, naranja justo, rojo atraviesa algo), con flechas que marcan el sentido. Deshacer y rehacer.
// El mapa y sus obstáculos no se tocan: solo se elige por dónde pasa la carrera.
import * as THREE from 'three';
import { V3 } from './math.js';
import { Spline, GATE_SIZES, JET_RADIUS } from './track.js';
import { LIMITS, cleanCourseName } from './course.js';

const SIZES = ['s', 'm', 'l'], SIZE_LABEL = { s: 'pequeña', m: 'normal', l: 'grande' };
const _v = new V3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), ZV = new THREE.Vector3(0, 0, 1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Editor {
  // dom: elementos del panel; hooks: onChange(info), toast(text)
  constructor(scene, camera, track, renderer, hooks) {
    Object.assign(this, { scene, camera, track, renderer, hooks });
    this.group = new THREE.Group(); this.group.visible = false;
    scene.add(this.group);
    this.name = 'Mi circuito'; this.gates = []; this.boosts = []; this.sel = -1; this.grab = false;
    this.dist = 90; this.history = []; this.future = [];
    this.cam = { pos: new THREE.Vector3(0, 90, 160), yaw: 0, pitch: -0.12, vel: new THREE.Vector3() };
    this.cursor = new THREE.Vector3(); this.cursorHit = false; this.mouse = null; this.drag = null;
    this.spline = null; this.info = { n: 0, length: 0, warnings: [], ok: false };
    this.active = false; this.dirtyT = 0; this.keys = null;
    this.raycaster = new THREE.Raycaster();
    // materiales
    const glow = (c, k) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c), emissiveIntensity: k, roughness: 0.4 });
    this.mat = {
      gate: glow('#d9ab52', 1.2), start: glow('#ffffff', 2.4), sel: glow('#3ee8ff', 4.5), boost: glow('#ff8a2a', 4),
      ghost: new THREE.MeshBasicMaterial({ color: new THREE.Color('#3ee8ff').multiplyScalar(1.5), transparent: true, opacity: 0.45, depthWrite: false }),
      path: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, toneMapped: false }),
      arrow: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffffff').multiplyScalar(1.6), toneMapped: false }),
    };
    this.gateGroup = new THREE.Group(); this.boostGroup = new THREE.Group();
    this.group.add(this.gateGroup, this.boostGroup);
    this.pathMesh = null; this.arrows = null;
    this.preview = new THREE.Mesh(new THREE.TorusGeometry(GATE_SIZES.m.ring, 0.8, 10, 56), this.mat.ghost);
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), this.mat.sel);
    this.group.add(this.preview, this.dot);
    this.labels = document.getElementById('edLabels');
    this.bindPointer();
  }

  // ---------- Datos ----------
  plain() { return { name: this.name, gates: this.gates.map(g => [g.p.x, g.p.y, g.p.z, g.size]), boosts: this.boosts.map(b => [b.x, b.y, b.z]) }; }
  restore(d) {
    this.name = cleanCourseName(d.name);
    this.gates = (d.gates || []).map(g => ({ p: new THREE.Vector3(g[0], g[1], g[2]), size: SIZES.includes(g[3]) ? g[3] : 'm' }));
    this.boosts = (d.boosts || []).map(b => new THREE.Vector3(b[0], b[1], b[2]));
    this.sel = Math.min(this.sel, this.gates.length - 1); this.grab = false;
    this.rebuild();
  }
  // Circuito en el formato del juego: puertas [x, y, z, tamaño] y turbo [tramo, fracción]
  course() {
    const gates = this.gates.map(g => [Math.round(g.p.x), Math.round(g.p.y * 2) / 2, Math.round(g.p.z), g.size]);
    const boosts = [];
    if (this.spline) {
      const S = this.spline, cp = S.cpS;
      for (const b of this.boosts) {
        const s = S.nearest(_v.set(b.x, b.y, b.z)).s;
        let i = cp.length - 1;
        while (i > 0 && cp[i] > s) i--;
        const end = i + 1 < cp.length ? cp[i + 1] : S.length;
        boosts.push([i, clamp((s - cp[i]) / (end - cp[i] || 1), 0, 1)]);
      }
    }
    return { name: this.name, gates, boosts };
  }
  load(course) {
    const S = course.gates.length >= 3 ? new Spline(course.gates) : null;
    const boosts = S ? (course.boosts || []).map(([i, f]) => {
      const cp = S.cpS, a = cp[i], b = i + 1 < cp.length ? cp[i + 1] : S.length, p = S.pointAt(a + (b - a) * f);
      return [p.x, p.y, p.z];
    }) : [];
    this.history = []; this.future = []; this.sel = -1;
    this.restore({ name: course.name, gates: course.gates, boosts });
    this.lookAtGate(0);
  }
  snapshot() { this.history.push(JSON.stringify(this.plain())); if (this.history.length > 80) this.history.shift(); this.future = []; }
  undo() { if (!this.history.length) return; this.future.push(JSON.stringify(this.plain())); this.restore(JSON.parse(this.history.pop())); }
  redo() { if (!this.future.length) return; this.history.push(JSON.stringify(this.plain())); this.restore(JSON.parse(this.future.pop())); }

  // ---------- Acciones ----------
  addGate() {
    if (this.gates.length >= LIMITS.maxGates) { this.hooks.toast(`Como mucho ${LIMITS.maxGates} puertas`); return; }
    this.snapshot();
    const at = this.sel >= 0 ? this.sel + 1 : this.gates.length;
    this.gates.splice(at, 0, { p: this.cursor.clone(), size: at === 0 ? 'l' : 'm' });
    this.sel = at; this.grab = false;
    this.rebuild();
  }
  toggleGrab() {
    if (this.sel < 0) { this.hooks.toast('Primero elige una puerta (clic sobre ella)'); return; }
    if (!this.grab) this.snapshot();
    this.grab = !this.grab;
    if (!this.grab) this.rebuild();
  }
  deleteGate() {
    if (this.sel < 0) return;
    this.snapshot();
    this.gates.splice(this.sel, 1);
    this.sel = Math.min(this.sel, this.gates.length - 1); this.grab = false;
    this.rebuild();
  }
  cycleSize() {
    if (this.sel < 0) return;
    this.snapshot();
    const g = this.gates[this.sel];
    g.size = SIZES[(SIZES.indexOf(g.size) + 1) % 3];
    this.hooks.toast(`Puerta ${this.sel === 0 ? 'de salida' : this.sel + 1}: ${SIZE_LABEL[g.size]}`);
    this.rebuild();
  }
  // Anillo de turbo en el punto del recorrido más cercano a la mira; si ya hay uno cerca, lo quita
  toggleBoost() {
    if (!this.spline) { this.hooks.toast('Pon antes al menos 3 puertas'); return; }
    const S = this.spline, s = S.nearest(_v.set(this.cursor.x, this.cursor.y, this.cursor.z)).s;
    const near = this.boosts.findIndex(b => { const d = Math.abs(S.nearest(_v.set(b.x, b.y, b.z)).s - s); return Math.min(d, S.length - d) < 40; });
    this.snapshot();
    if (near >= 0) { this.boosts.splice(near, 1); this.hooks.toast('Anillo de turbo quitado'); } else {
      if (this.boosts.length >= LIMITS.maxBoosts) { this.history.pop(); this.hooks.toast('Ya hay demasiados anillos de turbo'); return; }
      const p = S.pointAt(s);
      this.boosts.push(new THREE.Vector3(p.x, p.y, p.z));
      this.hooks.toast('Anillo de turbo puesto');
    }
    this.rebuild();
  }
  selectNext(d) { if (!this.gates.length) return; this.sel = ((this.sel < 0 ? (d > 0 ? -1 : 0) : this.sel) + d + this.gates.length) % this.gates.length; this.grab = false; this.refreshGates(); }
  // Pone la cámara detrás de una puerta, mirando hacia ella
  lookAtGate(i) {
    const g = this.gates[i];
    if (!g) return;
    const t = this.tangent(i);
    this.cam.pos.copy(g.p).addScaledVector(t, -60).addScaledVector(UP, 14);
    _a.subVectors(g.p, this.cam.pos).normalize();
    this.cam.yaw = Math.atan2(-_a.x, -_a.z); this.cam.pitch = Math.asin(clamp(_a.y, -1, 1));
    this.cam.vel.set(0, 0, 0);
  }
  tangent(i) {
    if (this.spline) { const t = this.spline.tangentAt(this.spline.cpS[i]); return new THREE.Vector3(t.x, t.y, t.z); }
    const n = this.gates.length, a = this.gates[i].p, b = n > 1 ? this.gates[(i + 1) % n].p : a.clone().add(new THREE.Vector3(0, 0, -1));
    return new THREE.Vector3().subVectors(b, a).normalize();
  }

  // ---------- Reconstrucción y análisis ----------
  rebuild() {
    const G = this.gates;
    this.spline = G.length >= 3 ? new Spline(G.map(g => [g.p.x, g.p.y, g.p.z])) : null;
    // los anillos de turbo se pegan al recorrido nuevo
    if (this.spline) for (const b of this.boosts) { const p = this.spline.pointAt(this.spline.nearest(_v.set(b.x, b.y, b.z)).s); b.set(p.x, p.y, p.z); }
    this.buildPath();
    this.refreshGates();
    this.analyze();
    this.hooks.onChange?.(this.info);
    try { localStorage.setItem('jt-editor', JSON.stringify(this.plain())); } catch { /* sin almacenamiento */ }
  }
  refreshGates() {
    for (const m of [...this.gateGroup.children]) { m.geometry.dispose(); this.gateGroup.remove(m); }
    for (const m of [...this.boostGroup.children]) { m.geometry.dispose(); this.boostGroup.remove(m); }
    this.gates.forEach((g, i) => {
      const z = GATE_SIZES[g.size], m = new THREE.Mesh(new THREE.TorusGeometry(z.ring, i === 0 ? 1.6 : 1.1, 12, 64), i === this.sel ? this.mat.sel : i === 0 ? this.mat.start : this.mat.gate);
      m.position.copy(g.p);
      m.quaternion.setFromUnitVectors(ZV, this.tangent(i));
      this.gateGroup.add(m);
    });
    if (this.spline) for (const b of this.boosts) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(7, 0.8, 10, 40), this.mat.boost), S = this.spline, t = S.tangentAt(S.nearest(_v.set(b.x, b.y, b.z)).s);
      m.position.copy(b);
      m.quaternion.setFromUnitVectors(ZV, _a.set(t.x, t.y, t.z));
      this.boostGroup.add(m);
    }
    // números de las puertas
    while (this.labels.childElementCount > this.gates.length) this.labels.lastChild.remove();
    while (this.labels.childElementCount < this.gates.length) this.labels.appendChild(document.createElement('div'));
    [...this.labels.children].forEach((el, i) => { el.textContent = i === 0 ? 'SALIDA' : String(i + 1); el.className = i === this.sel ? 'sel' : ''; });
  }
  // ¿Qué hay en este punto del recorrido? 2: atraviesa algo · 1: pasa muy justo · 0: libre
  classify(p) {
    if (p.y < 10) return 2;
    const d = this.track.nearestStatic(_v.set(p.x, p.y, p.z), 40);
    return d < JET_RADIUS + 0.5 ? 2 : d < 9 || p.y < 20 ? 1 : 0;
  }
  buildPath() {
    if (this.pathMesh) { this.pathMesh.geometry.dispose(); this.group.remove(this.pathMesh); this.pathMesh = null; }
    if (this.arrows) { this.arrows.geometry.dispose(); this.group.remove(this.arrows); this.arrows = null; }
    this.status = [];
    const S = this.spline;
    if (!S) return;
    const step = 4, n = Math.max(2, Math.ceil(S.length / step)), pos = [], col = [], idx = [];
    const C = [new THREE.Color('#58f0a0'), new THREE.Color('#ffb347'), new THREE.Color('#ff3b3b')];
    for (let k = 0; k <= n; k++) {
      const s = (k / n) * S.length, p = S.pointAt(s), t = S.tangentAt(s);
      const st = this.classify(p);
      this.status.push(st);
      const R = _a.set(t.x, t.y, t.z).cross(UP).normalize(), w = st ? 1.8 : 1.0;
      // dos cintas cruzadas (horizontal y vertical) para que se vea desde cualquier lado
      for (const [ox, oy, oz] of [[R.x * w, R.y * w, R.z * w], [0, w, 0]]) {
        pos.push(p.x + ox, p.y + oy, p.z + oz, p.x - ox, p.y - oy, p.z - oz);
        const c = C[st];
        col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
      if (k < n) {
        const b = k * 4;
        for (const o of [0, 2]) idx.push(b + o, b + o + 1, b + o + 4, b + o + 1, b + o + 5, b + o + 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    this.pathMesh = new THREE.Mesh(g, this.mat.path);
    this.pathMesh.frustumCulled = false;
    this.group.add(this.pathMesh);
    // flechas del sentido cada 120 m
    const count = Math.floor(S.length / 120), cone = new THREE.ConeGeometry(2.2, 6, 10).rotateX(-Math.PI / 2);
    this.arrows = new THREE.InstancedMesh(cone, this.mat.arrow, Math.max(1, count));
    const M = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let k = 0; k < count; k++) {
      const s = (k + 0.5) * 120, p = S.pointAt(s), t = S.tangentAt(s);
      q.setFromUnitVectors(_b.set(0, 0, -1), _a.set(t.x, t.y, t.z));
      M.compose(_a.set(p.x, p.y + 4, p.z), q, new THREE.Vector3(1, 1, 1));
      this.arrows.setMatrixAt(k, M);
    }
    this.arrows.count = count;
    this.group.add(this.arrows);
  }
  analyze() {
    const G = this.gates, S = this.spline, w = [];
    const info = { n: G.length, length: S ? S.length : 0, warnings: w, ok: false, blocked: 0, tight: 0 };
    if (G.length < LIMITS.minGates) w.push(`Hacen falta al menos ${LIMITS.minGates} puertas (llevas ${G.length}).`);
    if (S) {
      let run = 0;
      for (const st of this.status) { if (st === 2) { if (!run) info.blocked++; run = 1; } else run = 0; if (st === 1) info.tight++; }
      if (info.blocked) w.push(`${info.blocked} ${info.blocked === 1 ? 'tramo atraviesa' : 'tramos atraviesan'} el decorado o el suelo (en rojo): ahí se choca seguro.`);
      if (S.length < LIMITS.minLen) w.push(`El circuito es muy corto (${Math.round(S.length)} m; mínimo ${LIMITS.minLen} m).`);
      if (S.length > LIMITS.maxLen) w.push(`El circuito es demasiado largo (máximo ${LIMITS.maxLen / 1000} km).`);
      G.forEach((g, i) => { const h = G[(i + 1) % G.length]; if (g.p.distanceTo(h.p) < 45) w.push(`Las puertas ${i === 0 ? 'de salida' : i + 1} y ${(i + 1) % G.length === 0 ? 'de salida' : i + 2} están muy juntas.`); });
    }
    info.ok = G.length >= LIMITS.minGates && S && S.length >= LIMITS.minLen && S.length <= LIMITS.maxLen;
    info.lap = info.length / 98;
    this.info = info;
  }

  // ---------- Cámara, mira y ratón ----------
  bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => {
      if (!this.active) return;
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, button: e.button, type: e.pointerType };
      el.setPointerCapture?.(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!this.active) return;
      this.mouse = { x: e.clientX, y: e.clientY };
      const D = this.drag;
      if (!D) return;
      const dx = e.clientX - D.x, dy = e.clientY - D.y;
      D.moved += Math.abs(dx) + Math.abs(dy);
      if (D.moved > 5 || D.button === 2) {
        this.cam.yaw -= dx * 0.004; this.cam.pitch = clamp(this.cam.pitch - dy * 0.004, -1.5, 1.5);
      }
      D.x = e.clientX; D.y = e.clientY;
    });
    el.addEventListener('pointerup', e => {
      if (!this.active || !this.drag) return;
      const D = this.drag;
      this.drag = null;
      if (D.moved > 6 || D.button !== 0) return;
      // clic sin arrastrar: sobre una puerta la elige; en el vacío pone una (o suelta la que se mueve)
      if (this.grab) { this.grab = false; this.rebuild(); return; }
      const hit = this.pickGate();
      if (hit >= 0) { this.sel = hit; this.refreshGates(); this.hooks.onChange?.(this.info); } else this.addGate();
    });
    el.addEventListener('pointerleave', () => { this.mouse = null; });
    el.addEventListener('wheel', e => { if (!this.active) return; e.preventDefault(); this.dist = clamp(this.dist * (e.deltaY > 0 ? 1.12 : 0.89), 15, 600); this.hooks.onChange?.(this.info); }, { passive: false });
  }
  // Rayo de la cámara por el ratón (o por el centro si el ratón no está sobre el mapa)
  ray() {
    const ndc = this.mouse ? new THREE.Vector2((this.mouse.x / innerWidth) * 2 - 1, -(this.mouse.y / innerHeight) * 2 + 1) : new THREE.Vector2(0, 0);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }
  pickGate() {
    const r = this.ray();
    let best = -1, bd = Infinity;
    this.gates.forEach((g, i) => {
      const t = _a.subVectors(g.p, r.origin).dot(r.direction);
      if (t < 0) return;
      const d = r.distanceToPoint(g.p);
      if (d < GATE_SIZES[g.size].ring * 1.25 && t < bd) { bd = t; best = i; }
    });
    return best;
  }
  update(dt, keys) {
    const C = this.cam, k = c => keys.has(c);
    const fwd = _a.set(-Math.sin(C.yaw) * Math.cos(C.pitch), Math.sin(C.pitch), -Math.cos(C.yaw) * Math.cos(C.pitch));
    const right = _b.set(Math.cos(C.yaw), 0, -Math.sin(C.yaw));
    const speed = (k('ShiftLeft') || k('ShiftRight') ? 260 : 70);
    const want = new THREE.Vector3();
    const t = this.touchMove || {};
    if (k('KeyW') || k('ArrowUp') || t.fwd) want.add(fwd);
    if (k('KeyS') || k('ArrowDown') || t.back) want.sub(fwd);
    if (k('KeyD') || k('ArrowRight')) want.add(right);
    if (k('KeyA') || k('ArrowLeft')) want.sub(right);
    if (k('KeyE') || k('Space') || t.up) want.y += 1;
    if (k('KeyQ') || k('ControlLeft') || t.down) want.y -= 1;
    if (want.lengthSq() > 0) want.normalize().multiplyScalar(speed);
    C.vel.lerp(want, 1 - Math.exp(-dt * 6));
    C.pos.addScaledVector(C.vel, dt);
    C.pos.y = clamp(C.pos.y, 6, 1600);
    this.camera.position.copy(C.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(_b.copy(C.pos).add(fwd));
    // la mira: a la distancia elegida, o justo antes de lo primero que haya en medio
    const r = this.ray();
    this.cursor.copy(r.origin).addScaledVector(r.direction, this.dist);
    this.cursorHit = false;
    const hit = this.track.raycast(_v.set(r.origin.x, r.origin.y, r.origin.z), new V3(r.direction.x, r.direction.y, r.direction.z), this.dist, 0);
    if (hit && hit.t < this.dist) { this.cursor.copy(r.origin).addScaledVector(r.direction, Math.max(5, hit.t - 14)); this.cursorHit = true; }
    if (this.cursor.y < 15) { this.cursor.y = 15; this.cursorHit = true; }
    // la puerta agarrada sigue a la mira
    if (this.grab && this.gates[this.sel]) {
      this.gates[this.sel].p.copy(this.cursor);
      if ((this.dirtyT -= dt) <= 0) { this.dirtyT = 0.12; this.rebuild(); }
    }
    // vista previa de la puerta nueva
    const prevSize = GATE_SIZES[this.gates[this.sel]?.size || 'm'].ring;
    this.preview.visible = !this.grab;
    this.preview.position.copy(this.cursor);
    this.preview.quaternion.setFromUnitVectors(ZV, r.direction);
    this.preview.scale.setScalar(prevSize / GATE_SIZES.m.ring);
    this.dot.position.copy(this.cursor);
    this.drawLabels();
  }
  drawLabels() {
    const v = new THREE.Vector3();
    [...this.labels.children].forEach((el, i) => {
      const g = this.gates[i];
      if (!g) return;
      v.copy(g.p); v.y += GATE_SIZES[g.size].ring + 4;
      const d = v.distanceTo(this.camera.position);
      v.project(this.camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && d < 2500;
      el.hidden = !on;
      if (on) el.style.transform = `translate(${(v.x * 0.5 + 0.5) * innerWidth}px, ${(-v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%) scale(${clamp(300 / d, 0.6, 1.2)})`;
    });
  }

  open() { this.active = true; this.group.visible = true; this.labels.hidden = false; this.rebuild(); }
  close() { this.active = false; this.group.visible = false; this.labels.hidden = true; this.grab = false; this.drag = null; }
}
