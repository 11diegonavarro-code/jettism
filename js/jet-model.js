// El jet, modelado por código a partir de las piezas del hangar (morro, alas, motor y cola), con su pintura,
// sus calcomanías proyectadas sobre la superficie, el número con el nombre en la cola y el casco del piloto.
// El morro apunta a −Z, como en la física.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { defaultCfg, FINISHES } from './hangar-data.js';
import { decalTexture, numberTexture } from './decals.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GLOW = '#3ee8ff';

// Ala o estabilizador horizontal a partir de su planta [x, z]
function planform(pts, depth = 0.16, bevel = 0.05) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2);
  g.translate(0, depth / 2, 0);
  return g;
}
const mirror = pts => pts.map(([x, z]) => [-x, z]);

// Deriva vertical a partir de su perfil [z, y]
function fin(pts, depth = 0.12) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}

// ---------- Piezas ----------
const REAR = [[0.62, -6.7], [0.86, -6.2], [1.0, -5.0], [1.1, -3.0], [1.14, -1.0], [1.1, 0.8]];
const NOSES = {
  halcon: [[1.0, 2.4], [0.84, 3.8], [0.62, 5.1], [0.38, 6.3], [0.16, 7.2], [0, 7.7]],
  aguja: [[0.98, 2.4], [0.78, 3.8], [0.52, 5.4], [0.3, 6.9], [0.14, 8.4], [0.05, 9.5], [0, 9.9]],
  tiburon: [[1.1, 2.4], [1.02, 3.7], [0.88, 4.9], [0.66, 5.9], [0.38, 6.6], [0, 6.9]],
  cuna: [[1.06, 2.4], [0.98, 3.5], [0.84, 4.5], [0.6, 5.2], [0, 5.5]],
};
// Alas: tramos (planta relativa a su pivote, pivote [x, y], ángulo) y, en el último tramo, raya, punta, luz y luz de navegación
const WINGS = {
  flecha: { parts: [{ pts: [[0.9, -1.6], [5.3, 2.7], [5.6, 4.1], [0.9, 4.3]], pivot: [0, -0.25], angle: 0 }], stripe: [[3.0, 0.75], [5.3, 2.7], [5.42, 3.2], [3.0, 1.35]], tip: [5.5, 4.0], glow: [5.47, 3.45, 1.3], nav: [5.3, 2.75], anchor: [3.4, 2.3] },
  delta: { parts: [{ pts: [[0.9, -2.8], [5.9, 3.9], [5.9, 4.6], [0.9, 4.6]], pivot: [0, -0.25], angle: 0 }], stripe: [[3.0, 0.0], [5.9, 3.9], [5.9, 4.3], [3.0, 0.55]], tip: [5.9, 4.25], glow: [5.87, 4.25, 0.7], nav: [5.75, 3.85], anchor: [3.2, 2.6] },
  recta: { parts: [{ pts: [[0.9, 0.3], [6.4, 1.1], [6.4, 2.7], [0.9, 3.4]], pivot: [0, -0.25], angle: 0 }], stripe: [[5.0, 0.95], [6.4, 1.1], [6.4, 1.65], [5.0, 1.5]], tip: [6.4, 1.9], glow: [6.37, 1.9, 1.6], nav: [6.3, 1.2], anchor: [3.6, 1.9] },
  gaviota: {
    parts: [
      { pts: [[0, -0.6], [2.4, 0.9], [2.4, 3.6], [0, 4.0]], pivot: [0.9, -0.25], angle: 0.3 },
      { pts: [[0, 0.9], [3.0, 2.3], [3.0, 3.3], [0, 3.6]], pivot: [0.9 + 2.4 * Math.cos(0.3), -0.25 + 2.4 * Math.sin(0.3)], angle: -0.18 },
    ],
    stripe: [[1.6, 1.55], [3.0, 2.3], [3.0, 2.7], [1.6, 2.1]], tip: [3.0, 2.8], glow: [2.97, 2.8, 1.0], nav: [2.9, 2.35], anchor: [2.2, 2.0],
  },
};
const ENGINES = {
  doble: { nozzles: [[-0.48, 0], [0.48, 0]], r: 0.47, flame: 0.4 },
  simple: { nozzles: [[0, 0]], r: 0.7, flame: 0.58 },
  anillo: { nozzles: [[0, 0]], r: 0.5, flame: 0.42, ring: true },
  vectorial: { nozzles: [[-0.5, 0], [0.5, 0]], r: 0.46, flame: 0.38, petals: true },
};

const flameVS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const flameFS = `uniform vec3 uColor; uniform float uPower, uTime, uDiamonds; varying vec2 vUv;
  void main() {
    float a = vUv.y;
    float fade = pow(1.0 - a, 1.6);
    float flick = 0.84 + 0.16 * sin(uTime * 53.0 + vUv.x * 40.0) * sin(uTime * 31.0 + a * 9.0);
    float dia = 1.0 + uDiamonds * 1.4 * pow(max(sin(a * 24.0 - uTime * 3.0), 0.0), 8.0) * (1.0 - a);
    gl_FragColor = vec4(uColor * fade * flick * dia * uPower, 1.0);
  }`;
function flameMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: 1 }, uTime: { value: 0 }, uDiamonds: { value: 0 } },
    vertexShader: flameVS, fragmentShader: flameFS,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false,
  });
}
function flameCone(radius, mat) {
  const g = new THREE.ConeGeometry(radius, 1, 20, 1, true);
  g.translate(0, 0.5, 0);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

// Pantalla de la cabina: horizonte artificial y radar, en tonos oscuros con líneas de luz
function screenTexture(glow) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#04121a'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = glow; g.globalAlpha = 0.25; g.lineWidth = 1;
  for (let x = 0; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.globalAlpha = 0.9; g.lineWidth = 3;
  g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(26, 70); g.lineTo(102, 58); g.stroke();
  g.beginPath(); g.arc(192, 64, 42, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(192, 64, 22, 0, Math.PI * 2); g.stroke();
  g.fillStyle = glow;
  g.beginPath(); g.arc(205, 52, 4, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPilot(cfg = defaultCfg()) {
  const p = new THREE.Group(), H = cfg.helmet;
  const shell = new THREE.MeshStandardMaterial({ color: H.color, roughness: 0.25 }), accent = new THREE.MeshStandardMaterial({ color: cfg.paint.c1, roughness: 0.35 });
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), shell);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.255, 20, 12, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: H.visor, metalness: 1, roughness: 0.12 }));
  visor.rotation.y = Math.PI;
  visor.scale.setScalar(1.07);
  helmet.add(visor);
  if (H.shape === 'aleta') { const f = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.36), accent); f.position.set(0, 0.25, 0.04); helmet.add(f); }
  if (H.shape === 'antenas') for (const sd of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6), accent); a.position.set(sd * 0.12, 0.33, 0.02); a.rotation.z = -sd * 0.3;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), accent); b.position.set(sd * 0.155, 0.45, 0.02);
    helmet.add(a, b);
  }
  if (H.shape === 'cresta') for (let k = 0; k < 5; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 6), accent); c.position.set(0, 0.29, -0.16 + k * 0.08); helmet.add(c); }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 12), new THREE.MeshStandardMaterial({ color: cfg.paint.c3, roughness: 0.7 }));
  body.position.y = -0.55;
  p.add(helmet, body);
  return p;
}

// Une todas las piezas que comparten material en una sola malla (para los jets de los demás)
function mergeByMaterial(g, keep) {
  g.updateMatrixWorld(true);
  const groups = new Map();
  g.traverse(o => {
    if (!o.isMesh || keep.has(o)) return;
    // copia a mano: DecalGeometry no se puede clonar con clone() (su constructor necesita argumentos)
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : new THREE.BufferGeometry().copy(o.geometry);
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(geo);
  });
  for (const c of [...g.children]) g.remove(c);
  for (const [mat, geos] of groups) {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    g.add(m);
  }
  for (const k of keep) g.add(k);
}

// Proyecta una textura sobre la superficie de una malla (buscando el punto con un rayo desde fuera)
const _ray = new THREE.Raycaster(), _helper = new THREE.Object3D();
function stick(g, targets, origin, dir, size, tex, color, rot = 0, rough = 0.4) {
  _ray.set(origin, dir.clone().normalize());
  const hit = _ray.intersectObjects(targets, false)[0];
  if (!hit) return null;
  const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  _helper.position.copy(hit.point);
  _helper.lookAt(hit.point.clone().add(n));
  _helper.rotateZ(rot);
  const geo = new DecalGeometry(hit.object, hit.point, _helper.rotation.clone(), new THREE.Vector3(size, size, Math.min(0.14, size)));
  if (!geo.attributes.position.count) return null;
  const mat = new THREE.MeshStandardMaterial({ map: tex, color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: rough });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  g.add(m);
  return m;
}

export function buildJet(cfg = defaultCfg(), { ghost = false, ghostColor = 0x7fe9ff, lite = false, pilotName = '' } = {}) {
  const g = new THREE.Group();
  const P = cfg.paint, FIN = FINISHES[P.finish] || FINISHES.brillo;
  const paint = c => new THREE.MeshStandardMaterial({ color: c, metalness: FIN.metal, roughness: FIN.rough, envMapIntensity: FIN.env });
  const M = {
    body: paint(P.c1), trim: paint(P.c2),
    dark: new THREE.MeshStandardMaterial({ color: P.c3, metalness: 0.5, roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a3a, metalness: 0.6, roughness: 0.04, transparent: true, opacity: 0.55, envMapIntensity: 2.2 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(GLOW).multiplyScalar(3.2) }),
    hot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a20').multiplyScalar(1.5) }),
  };
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // Fuselaje (perfil de cola a morro) y lomo detrás de la cabina
  const nose = NOSES[cfg.nose] || NOSES.halcon, noseLen = nose[nose.length - 1][1];
  const fusGeo = new THREE.LatheGeometry(REAR.concat(nose).map(([r, y]) => new THREE.Vector2(r, y)), 32);
  fusGeo.rotateX(-Math.PI / 2);
  fusGeo.scale(1, cfg.nose === 'tiburon' ? 0.74 : 0.84, 1);
  const fus = add(fusGeo, M.body);
  const spine = add(new THREE.SphereGeometry(1, 24, 14).scale(0.46, 0.36, 3.1), M.body, 0, 0.66, 0.6);
  add(new THREE.BoxGeometry(0.16, 0.05, 5.2), M.trim, 0, 0.99, 0.9);
  if (cfg.nose === 'aguja') add(new THREE.CylinderGeometry(0.03, 0.05, 2.2, 8).rotateX(Math.PI / 2), M.metal, 0, 0, -noseLen - 0.9);
  if (cfg.nose === 'tiburon') add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.62, 0.28, 1.5), M.dark, 0, -0.42, -4.8);
  if (cfg.nose === 'cuna') add(new THREE.BoxGeometry(1.5, 0.12, 1.8), M.trim, 0, -0.1, -4.3);

  // Cabina: cristal, panel con pantallas y piloto
  const canopy = add(new THREE.SphereGeometry(1, 28, 18).scale(0.6, 0.5, 1.9), M.glass, 0, 0.72, -3.2);
  canopy.castShadow = false;
  const cockpit = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.42), M.dark);
  panel.position.set(0, 0.6, -3.88);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(GLOW), color: new THREE.Color(1.3, 1.3, 1.3) });
  for (const x of [-0.2, 0.2]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), screenMat);
    s.position.set(x, 0.725, -3.68); s.rotation.x = -0.55;
    cockpit.add(s);
  }
  cockpit.add(panel);
  const pilot = buildPilot(cfg);
  pilot.position.set(0, 0.98, -3.0);
  // en los jets de los demás no se ven ni el panel ni el piloto: se ahorran 6 llamadas de dibujo por jet
  if (!lite) g.add(cockpit, pilot);

  // Tomas de aire laterales
  const intakes = [];
  for (const sd of [-1, 1]) {
    intakes.push(add(new THREE.BoxGeometry(0.5, 0.74, 2.6), M.body, sd * 1.1, -0.12, -0.9));
    add(new THREE.BoxGeometry(0.42, 0.62, 0.06), M.dark, sd * 1.1, -0.12, -2.21);
  }

  // Alas (uno o dos tramos), con raya, luz en la punta y luces de navegación; y canards
  const W = WINGS[cfg.wings] || WINGS.flecha, wingMeshes = { 1: [], '-1': [] }, wingTips = [];
  for (const sd of [1, -1]) {
    let last = null;
    for (const part of W.parts) {
      const pts = part.pts.map(([x, z]) => [x - (W.parts.length > 1 ? 0 : 0), z]);
      const m = add(planform(sd > 0 ? pts : mirror(pts)), M.body, sd * part.pivot[0], part.pivot[1], 0);
      m.rotation.z = sd * part.angle;
      wingMeshes[sd].push(m);
      last = m;
    }
    add(planform(sd > 0 ? W.stripe : mirror(W.stripe), 0.01, 0.01), M.trim, 0, 0.15, 0, last);
    add(new THREE.BoxGeometry(0.07, 0.05, W.glow[2]), M.glow, sd * W.glow[0], 0, W.glow[1], last);
    const nav = add(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: sd > 0 ? new THREE.Color(0x30ff60).multiplyScalar(3) : new THREE.Color(0xff2020).multiplyScalar(3) }), sd * W.nav[0], 0, W.nav[1], last);
    nav.castShadow = false;
    g.updateMatrixWorld(true);
    wingTips.push(V(sd * W.tip[0], 0, W.tip[1]).applyMatrix4(last.matrixWorld));
    add(planform(sd > 0 ? [[0.85, -4.7], [2.1, -3.55], [2.0, -3.15], [0.85, -3.4]] : mirror([[0.85, -4.7], [2.1, -3.55], [2.0, -3.15], [0.85, -3.4]]), 0.08, 0.03), M.trim, 0, 0.05, 0);
    // ala volante: aletas verticales en las puntas
    if (cfg.tail === 'sin') {
      const wl = add(fin([[-0.6, 0], [0.6, 0], [0.9, 1.0], [0.3, 1.05]], 0.08), M.trim, sd * W.tip[0], 0, W.tip[1] - 0.3, last);
      wl.rotation.z = -sd * 0.15;
    }
  }

  // Cola
  const fins = [];
  const stab = cfg.tail === 'doble' || cfg.tail === 'una';
  if (stab) for (const sd of [1, -1]) add(planform(sd > 0 ? [[0.8, 4.6], [2.9, 6.2], [2.9, 6.8], [0.8, 6.6]] : mirror([[0.8, 4.6], [2.9, 6.2], [2.9, 6.8], [0.8, 6.6]]), 0.1, 0.04), M.body, 0, -0.15, 0);
  if (cfg.tail === 'doble' || cfg.tail === 'v') for (const sd of [1, -1]) {
    const v = cfg.tail === 'v';
    const fn = add(fin(v ? [[3.0, 0], [6.0, 0], [6.6, 2.3], [5.5, 2.4]] : [[2.9, 0], [5.9, 0], [6.4, 2.5], [5.4, 2.6]]), M.body, sd * (v ? 0.55 : 0.72), v ? 0.35 : 0.45, 0);
    fn.rotation.z = -sd * (v ? 0.75 : 0.3);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 1.0), M.trim);
    tip.position.set(0, v ? 2.3 : 2.5, v ? 6.0 : 5.9);
    fn.add(tip);
    fins.push({ mesh: fn, sd });
  }
  if (cfg.tail === 'una') {
    const fn = add(fin([[2.6, 0], [6.0, 0], [6.7, 3.1], [5.4, 3.2]], 0.14), M.body, 0, 0.5, 0);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 1.2), M.trim);
    tip.position.set(0, 3.1, 6.0);
    fn.add(tip);
    fins.push({ mesh: fn, sd: 1 }, { mesh: fn, sd: -1 });
  }

  // Motor: toberas, interior caliente, aros de luz y llamas
  const E = ENGINES[cfg.engine] || ENGINES.doble, flames = [], cores = [], nozzles = [];
  const outerMat = flameMat(new THREE.Color(cfg.flame).multiplyScalar(1.6)), coreMat = flameMat(new THREE.Color('#a8dcff').multiplyScalar(2.6));
  for (const [x] of E.nozzles) {
    const noz = add(new THREE.CylinderGeometry(E.r, E.r * 0.85, 1.1, 24, 1, true).rotateX(Math.PI / 2), M.metal, x, 0, 6.9);
    noz.castShadow = false;
    if (cfg.engine === 'vectorial') noz.rotation.x = 0.06;
    add(new THREE.CircleGeometry(E.r * 0.85, 24), M.hot, x, 0, 6.5);
    add(new THREE.TorusGeometry(E.r + 0.03, 0.05, 8, 32), M.glow, x, 0, 7.43);
    if (E.petals) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, pet = add(new THREE.BoxGeometry(0.26, 0.05, 0.7), M.metal, x + Math.cos(a) * E.r * 0.95, Math.sin(a) * E.r * 0.95, 7.6);
      pet.rotation.z = a + Math.PI / 2; pet.rotation.x = 0;
      pet.lookAt(x + Math.cos(a) * E.r * 0.6, Math.sin(a) * E.r * 0.6, 8.3);
    }
    nozzles.push(V(x, 0, 7.4));
    if (!ghost) {
      const o = flameCone(E.flame, outerMat), c = flameCone(E.flame * 0.6, coreMat);
      o.position.set(x, 0, 7.4); c.position.copy(o.position);
      g.add(o, c); flames.push(o); cores.push(c);
    }
  }
  if (E.ring) {
    add(new THREE.TorusGeometry(1.15, 0.1, 10, 48), M.glow, 0, 0, 7.2);
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4, s = add(new THREE.BoxGeometry(0.08, 0.6, 0.3), M.metal, Math.cos(a) * 0.86, Math.sin(a) * 0.86, 7.0); s.rotation.z = a - Math.PI / 2; }
  }
  const strobe = add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(6) }), 0, cfg.tail === 'una' ? 3.75 : 1.2, cfg.tail === 'una' ? 6.0 : 4.6);
  strobe.castShadow = false;

  if (ghost) {
    const gm = new THREE.MeshBasicMaterial({ color: ghostColor, transparent: true, opacity: 0.28, depthWrite: false });
    g.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
  } else {
    // Calcomanías: se buscan con un rayo desde fuera y se proyectan sobre la superficie
    g.updateMatrixWorld(true);
    const letter = (cfg.tailName || pilotName || 'J')[0] || 'J';
    const D = cfg.decals || {};
    const put = (slot, targets, origin, dir, base, mirrorOn) => {
      const d = D[slot];
      if (!d) return;
      const tex = decalTexture(d.id, letter, mirrorOn ? !d.mirror : d.mirror);
      stick(g, targets, origin, dir, base * d.size, tex, d.color, d.rot, FIN.rough);
    };
    const ax = W.anchor;
    for (const sd of [1, -1]) {
      put('lados', [fus], V(sd * 4, 0.3, 2.4), V(-sd, 0, 0), 2.3, sd < 0);
      put('tomas', intakes, V(sd * 4, -0.12, -0.9), V(-sd, 0, 0), 1.3, sd < 0);
      put('alaSup', wingMeshes[sd], V(sd * ax[0], 6, ax[1]), V(0, -1, 0), 2.6, sd < 0);
      put('alaInf', wingMeshes[sd], V(sd * ax[0], -6, ax[1]), V(0, 1, 0), 2.6, sd < 0);
    }
    put('morro', [fus], V(0, 5, -(5.6 + (noseLen - 5.5) * 0.6)), V(0, -1, 0), 1.2, false); // delante de la cabina
    put('lomo', [spine], V(0, 5, 1.6), V(0, -1, 0), 1.0, false);
    // Número y nombre en la cola (o en los costados de atrás si no hay derivas)
    const ntex = numberTexture(cfg.number, cfg.tailName || pilotName, P.c2, P.c3);
    if (fins.length) for (const f of fins) stick(g, [f.mesh], V(f.sd * 4, 1.4, 5.0), V(-f.sd, 0, 0), 1.8, ntex, '#ffffff', 0, FIN.rough);
    else for (const sd of [1, -1]) stick(g, [fus], V(sd * 4, 0.2, 4.6), V(-sd, 0, 0), 1.3, ntex, '#ffffff', 0, FIN.rough);
  }
  if (lite && !ghost) mergeByMaterial(g, new Set([...flames, ...cores, strobe]));

  let time = 0;
  return {
    group: g, pilot, cockpit, canopy, materials: M, engine: cfg.engine,
    wingTips, nozzles,
    eye: V(0, 1.1, -2.95), nose: V(0, 0, -noseLen - 0.3),
    // power 0..1 (gas), boost: postcombustión
    update(dt, power, boost) {
      time += dt;
      strobe.visible = time % 1.3 < 0.07;
      if (ghost) return;
      const len = boost ? 6.8 : 1.3 + 2.2 * power, clen = boost ? 3.2 : 0.7 + 1.1 * power;
      for (const f of flames) f.scale.set(1, 1, len * (0.94 + Math.random() * 0.12));
      for (const c of cores) c.scale.set(1, 1, clen);
      outerMat.uniforms.uPower.value = boost ? 2.6 : 0.5 + 1.1 * power;
      coreMat.uniforms.uPower.value = boost ? 2.2 : 0.6 + 0.9 * power;
      for (const m of [outerMat, coreMat]) { m.uniforms.uTime.value = time; m.uniforms.uDiamonds.value = boost ? 1 : 0; }
      M.hot.color.set('#ff6a20').multiplyScalar(boost ? 4 : 1 + power * 1.5);
    },
    // libera geometrías y materiales (las texturas de las calcomanías se quedan en caché para reutilizarlas)
    dispose() {
      g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => m.dispose()); } });
    },
  };
}
