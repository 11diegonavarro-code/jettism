// Hangar: el jet en una plataforma giratoria con luz de estudio, y la ventana para cambiar piezas, pintura,
// calcomanías y extras. Se dibuja con su propia escena (sin el mundo detrás).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildJet } from './jet-model.js';
import { PIECES, FINISHES, PALETTE, DECAL_SLOTS, DECAL_IDS, DECAL_LABELS, HELMETS, STATS, statsOf, defaultCfg, randomCfg, sanitizeCfg } from './hangar-data.js';
import { decalTexture } from './decals.js';

const $ = id => document.getElementById(id);
const clone = o => JSON.parse(JSON.stringify(o));

export class Hangar {
  constructor(renderer, env) {
    this.renderer = renderer;
    const s = this.scene = new THREE.Scene();
    s.environment = env;
    // fondo degradado de estudio
    const bg = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color('#2a1c5c') }, bottom: { value: new THREE.Color('#0b0818') }, glow: { value: new THREE.Color('#ff7a5c') } },
      vertexShader: 'varying vec3 vP; void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 top, bottom, glow; varying vec3 vP;
        void main() { float h = vP.y; vec3 c = mix(bottom, top, smoothstep(-0.2, 0.7, h)); c += glow * 0.25 * exp(-abs(h - 0.05) * 9.0); gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    }));
    s.add(bg);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x140f26, roughness: 0.35, metalness: 0.2 }));
    floor.receiveShadow = true;
    s.add(floor);
    this.turn = new THREE.Group();
    const table = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.6, 0.8, 72), new THREE.MeshStandardMaterial({ color: 0xece4d8, roughness: 0.3 }));
    table.position.y = 0.4; table.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9.3, 0.08, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#3ee8ff').multiplyScalar(2.5) }));
    ring.position.y = 0.82;
    this.turn.add(table, ring);
    s.add(this.turn);
    const key = new THREE.DirectionalLight(0xffe2c4, 3.2);
    key.position.set(12, 18, 10); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
    key.shadow.bias = -0.0005;
    const rim = new THREE.DirectionalLight(0x8fb4ff, 2.2);
    rim.position.set(-14, 8, -12);
    s.add(key, rim, new THREE.HemisphereLight(0x9a8ee0, 0x1a1030, 0.6));
    this.camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 300);
    this.view = { yaw: 0.9, pitch: 0.24, dist: 33, drag: null, spin: 0.18 };
    // suavizado propio: el hangar se ve de cerca y los dientes de sierra se notan
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(s, this.camera));
    this.composer.addPass(new OutputPass());
    this.active = false;
    const el = renderer.domElement;
    el.addEventListener('pointerdown', e => { if (this.active) { this.view.drag = { x: e.clientX, y: e.clientY }; this.view.spin = 0; } });
    addEventListener('pointerup', () => { this.view.drag = null; });
    addEventListener('pointermove', e => {
      const d = this.view.drag;
      if (!this.active || !d) return;
      this.view.yaw -= (e.clientX - d.x) * 0.008;
      this.view.pitch = Math.max(-0.05, Math.min(1.1, this.view.pitch + (e.clientY - d.y) * 0.006));
      d.x = e.clientX; d.y = e.clientY;
    });
    el.addEventListener('wheel', e => { if (this.active) this.view.dist = Math.max(18, Math.min(46, this.view.dist + e.deltaY * 0.02)); }, { passive: true });
  }

  setCfg(cfg, name) {
    if (this.jet) { this.turn.remove(this.jet.group); this.jet.dispose(); }
    this.jet = buildJet(cfg, { pilotName: name });
    this.jet.group.position.y = 3.2;
    this.jet.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.turn.add(this.jet.group);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
  }

  frame(dt) {
    const v = this.view;
    if (!v.drag) { v.spin = Math.min(0.18, v.spin + dt * 0.05); v.yaw += v.spin * dt; }
    // en pantalla ancha el jet se ve a la izquierda, para dejar sitio a la ventana de ajustes
    const side = innerWidth > 900 ? v.dist * 0.24 : 0;
    const cy = Math.cos(v.pitch), target = new THREE.Vector3(0, 2.6, 0);
    const right = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
    this.camera.position.set(Math.sin(v.yaw) * cy * v.dist, 2.6 + Math.sin(v.pitch) * v.dist, Math.cos(v.yaw) * cy * v.dist).addScaledVector(right, side);
    this.camera.lookAt(target.addScaledVector(right, side));
    this.jet?.update(dt, 0.45 + 0.25 * Math.sin(performance.now() / 700), false);
    this.composer.render();
  }
}

// ---------- Ventana del hangar ----------
export class HangarUI {
  constructor(hangar, { onDone }) {
    this.hangar = hangar; this.onDone = onDone;
    this.tab = 'piezas'; this.slot = 'lados';
    for (const b of document.querySelectorAll('#hangar [data-tab]')) b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    $('hRandom').onclick = () => { this.cfg = randomCfg(); this.cfg.tailName = this.base.tailName; this.changed(); };
    $('hReset').onclick = () => { this.cfg = defaultCfg(this.cfg.paint.c1); this.changed(); };
    $('hDone').onclick = () => this.onDone(sanitizeCfg(this.cfg));
  }
  open(cfg, name) {
    this.cfg = clone(cfg); this.base = clone(cfg); this.name = name;
    this.hangar.setCfg(this.cfg, name);
    this.render();
  }
  // Reconstruye el jet (un poco después del último cambio, para no hacerlo en cada movimiento del deslizador)
  changed(redraw = true) {
    clearTimeout(this.tmr);
    this.tmr = setTimeout(() => this.hangar.setCfg(sanitizeCfg(this.cfg), this.name), 60);
    if (redraw) this.render();
  }
  render() {
    for (const b of document.querySelectorAll('#hangar [data-tab]')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const box = $('hTab');
    box.innerHTML = '';
    const h3 = t => { const e = document.createElement('h3'); e.textContent = t; box.appendChild(e); };
    const opts = (items, cur, set, cls = 'opts') => {
      const d = document.createElement('div'); d.className = cls;
      for (const [id, label] of items) { const b = document.createElement('button'); b.textContent = label; b.className = id === cur ? 'on' : ''; b.onclick = () => { set(id); this.changed(); }; d.appendChild(b); }
      box.appendChild(d);
    };
    const swatches = (cur, set, list = PALETTE) => {
      const d = document.createElement('div'); d.className = 'swatches left';
      for (const c of list) { const b = document.createElement('button'); b.className = 'swatch' + (c === cur ? ' on' : ''); b.style.background = c; b.setAttribute('aria-label', 'Color ' + c); b.onclick = () => { set(c); this.changed(); }; d.appendChild(b); }
      box.appendChild(d);
    };
    const C = this.cfg;
    if (this.tab === 'piezas') {
      for (const [key, P] of Object.entries(PIECES)) {
        h3(P.label);
        opts(Object.entries(P.options).map(([id, o]) => [id, o.label]), C[key], id => { C[key] = id; });
        const p = document.createElement('p'); p.className = 'hint'; p.textContent = P.options[C[key]].desc; box.appendChild(p);
      }
    } else if (this.tab === 'pintura') {
      for (const [k, label] of [['c1', 'Color principal'], ['c2', 'Segundo color (rayas, número)'], ['c3', 'Detalles']]) { h3(label); swatches(C.paint[k], c => { C.paint[k] = c; }); }
      h3('Acabado');
      opts(Object.entries(FINISHES).map(([id, f]) => [id, f.label]), C.paint.finish, id => { C.paint.finish = id; });
    } else if (this.tab === 'calcos') {
      h3('Dónde');
      opts(DECAL_SLOTS.map(([id, l]) => [id, l + (C.decals[id] ? ' •' : '')]), this.slot, id => { this.slot = id; });
      const d = C.decals[this.slot];
      h3('Calcomanía');
      const grid = document.createElement('div'); grid.className = 'decals';
      const none = document.createElement('button'); none.textContent = '✕'; none.title = 'Ninguna'; none.className = d ? '' : 'on';
      none.onclick = () => { delete C.decals[this.slot]; this.changed(); };
      grid.appendChild(none);
      for (const id of DECAL_IDS) {
        const b = document.createElement('button'); b.title = DECAL_LABELS[id]; b.className = d?.id === id ? 'on' : '';
        const img = document.createElement('img'); img.alt = DECAL_LABELS[id]; img.src = decalTexture(id, (C.tailName || this.name || 'J')[0]).image.toDataURL();
        b.appendChild(img);
        b.onclick = () => { C.decals[this.slot] = { color: '#f2b630', size: 1, rot: 0, mirror: false, ...(C.decals[this.slot] || {}), id }; this.changed(); };
        grid.appendChild(b);
      }
      box.appendChild(grid);
      if (d) {
        h3('Color'); swatches(d.color, c => { d.color = c; });
        for (const [k, label, min, max, step] of [['size', 'Tamaño', 0.5, 1.6, 0.05], ['rot', 'Giro', -3.14, 3.14, 0.05]]) {
          const l = document.createElement('label'); l.textContent = label;
          const r = document.createElement('input'); Object.assign(r, { type: 'range', min, max, step, value: d[k] });
          r.oninput = () => { d[k] = +r.value; this.changed(false); };
          l.appendChild(r); box.appendChild(l);
        }
        const l = document.createElement('label'); l.textContent = 'Reflejar';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = d.mirror; cb.onchange = () => { d.mirror = cb.checked; this.changed(false); };
        l.appendChild(cb); box.appendChild(l);
      }
    } else {
      h3('Humo de colores'); swatches(C.smoke, c => { C.smoke = c; });
      h3('Llama del motor'); swatches(C.flame, c => { C.flame = c; }, ['#f97316', '#f2b630', '#3ee8ff', '#2f6fe0', '#8b5cf6', '#ec4899', '#b8f04a', '#ffffff']);
      h3('Casco');
      opts(Object.entries(HELMETS), C.helmet.shape, id => { C.helmet.shape = id; });
      swatches(C.helmet.color, c => { C.helmet.color = c; });
      h3('Visera'); swatches(C.helmet.visor, c => { C.helmet.visor = c; }, ['#7a4a2c', '#111318', '#3ee8ff', '#f2b630', '#ec4899', '#c9c9d1']);
      const row = document.createElement('div'); row.className = 'row';
      const n = document.createElement('label'); n.textContent = 'Número';
      const ni = document.createElement('input'); Object.assign(ni, { type: 'number', min: 0, max: 99, value: C.number }); ni.style.maxWidth = '80px';
      ni.oninput = () => { C.number = Math.max(0, Math.min(99, Math.round(+ni.value || 0))); this.changed(false); };
      n.appendChild(ni);
      const t = document.createElement('label'); t.textContent = 'Nombre en la cola';
      const ti = document.createElement('input'); Object.assign(ti, { maxLength: 10, value: C.tailName, placeholder: this.name || '' });
      ti.oninput = () => { C.tailName = ti.value; this.changed(false); };
      t.appendChild(ti);
      box.append(n, t);
    }
    this.renderStats();
  }
  renderStats() {
    const s = statsOf(sanitizeCfg(this.cfg));
    $('hStats').innerHTML = STATS.map(([k, label]) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${s[k] * 10}%"></i></div><b>${s[k]}</b></div>`).join('');
  }
}
