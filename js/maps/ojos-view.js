// Los ojos: lo que se ve. Las cúpulas y los conductos por dentro, pintados a pinceladas espesas (azules, grises y
// ocres) llenas de ojos; cientos de globos oculares en relieve en las paredes, mirando hacia el centro; el ojo gigante
// de cada cúpula, que gira para mirar a la cámara; iris que se cierran (anillos de color con la pupila negra) y ojos que
// flotan. Luz baja y fría, con niebla azul oscura.
import * as THREE from 'three';
import { rng } from '../math.js';
import { DOMES, TUBES } from './ojos.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
// pared pintada: pinceladas curvas y ojos dibujados
function wallTexture() {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d'), R = rng(171);
  g.fillStyle = '#1c2a3a'; g.fillRect(0, 0, 2048, 1024);
  const pal = ['#2c4058', '#3e5a76', '#5a7894', '#1a2230', '#7a6a4a', '#a88a5a', '#334a62'];
  for (let i = 0; i < 2600; i++) { const x = R() * 2048, y = R() * 1024, a = R() * 6.28, l = 20 + R() * 70; g.strokeStyle = pal[Math.floor(R() * pal.length)]; g.lineWidth = 4 + R() * 10; g.lineCap = 'round'; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.8) * l * 0.5, y + Math.sin(a + 0.8) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  g.globalAlpha = 1;
  for (let i = 0; i < 140; i++) {
    const x = R() * 2048, y = R() * 1024, w = 20 + R() * 60, h = w * (0.5 + R() * 0.25);
    g.fillStyle = '#d8d4c8'; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 6.28); g.fill();
    g.fillStyle = ['#3a6a9a', '#4a8ab0', '#2a5070', '#6a8a6a'][Math.floor(R() * 4)]; g.beginPath(); g.arc(x, y, h * 0.75, 0, 6.28); g.fill();
    g.fillStyle = '#0a0e14'; g.beginPath(); g.arc(x, y, h * 0.32, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - h * 0.2, y - h * 0.2, h * 0.1, 0, 6.28); g.fill();
    g.strokeStyle = '#141a22'; g.lineWidth = 5; g.beginPath(); g.ellipse(x, y, w, h, 0, 0, 6.28); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
// iris: anillos de color con estrías y la pupila negra
function irisTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = rng(172);
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128); gr.addColorStop(0, '#d8b860'); gr.addColorStop(0.35, '#4a8ab0'); gr.addColorStop(0.9, '#1a3a5a'); gr.addColorStop(1, '#0a1420');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 160; i++) { const a = R() * 6.28; g.strokeStyle = `rgba(${R() < 0.5 ? '255,240,200' : '10,20,40'},0.35)`; g.lineWidth = 1 + R() * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30); g.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124); g.stroke(); }
  g.fillStyle = '#05070a'; g.beginPath(); g.arc(128, 128, 34, 0, 6.28); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(110, 108, 10, 0, 6.28); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let TEX = null;
const tex = () => TEX || (TEX = { wall: wallTexture(), iris: irisTexture() });

export function atmo() {
  return {
    sky: { zenith: '#05080e', mid: '#0e1624', horizon: '#1c2a3a', ground: '#05080e', sun: '#c8d8ff', clouds: 0, sunDisc: 0 },
    sunDir: [0.2, 0.9, 0.3], sunColor: '#a8c0e8', sunIntensity: 0.8,
    hemiSky: '#8aa8d8', hemiGround: '#2a2014', hemiIntensity: 0.85,
    fog: { color: '#0c1420', density: 0.0028 },
    exposure: 1.0,
    ground: false,
    grade: { sat: 0.9, contrast: 1.2, tint: [0.96, 1.0, 1.08], grain: 0.08, vignette: 0.5 },
  };
}
export const MUSIC = { chords: [[38, 45, 50, 53, 57], [34, 41, 46, 50, 53], [37, 44, 49, 52, 56], [33, 40, 45, 49, 52]] };
export const CLOUDS = { lit: '#334a62', shade: '#05080e', layout() {} };

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], geos = [];
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const wall = mat(new THREE.MeshStandardMaterial({ map: t.wall, roughness: 0.85, side: THREE.BackSide }));
  t.wall.repeat.set(3, 2);
  // distancia de un punto al eje de un conducto
  const tubeDist = (p, tb) => { const a = v3(tb.a), ab = v3(tb.b).sub(a), f = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.addScaledVector(ab, f)); };
  // cúpulas con un agujero de verdad donde entra cada conducto (se quitan los triángulos que caen dentro del tubo)
  for (const d of DOMES) {
    const g = new THREE.SphereGeometry(d.r + 2, 128, 84).toNonIndexed(), pos = g.attributes.position, keep = [], tmp = new THREE.Vector3(), C = v3(d.c);
    for (let i = 0; i < pos.count; i += 3) {
      let hole = false;
      for (let j = 0; j < 3 && !hole; j++) { tmp.fromBufferAttribute(pos, i + j).add(C); if (TUBES.some(tb => tubeDist(tmp, tb) < tb.r + 1)) hole = true; }
      if (!hole) keep.push(i);
    }
    const ng = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv']) { const src = g.attributes[name], arr = new Float32Array(keep.length * 3 * src.itemSize); keep.forEach((i, k) => { for (let j = 0; j < 3; j++) for (let c = 0; c < src.itemSize; c++) arr[(k * 3 + j) * src.itemSize + c] = src.array[(i + j) * src.itemSize + c]; }); ng.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize)); }
    g.dispose();
    const m = new THREE.Mesh(own(ng), wall); m.position.copy(C); m.receiveShadow = true; root.add(m);
  }
  // conductos: solo el trozo que va de una cúpula a la otra, con anillos de luz por dentro y un aro brillante en cada boca
  const glow = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a').multiplyScalar(2.6) })), Yv = new THREE.Vector3(0, 1, 0);
  for (const tb of TUBES) {
    const a = v3(tb.a), b = v3(tb.b), dir = b.clone().sub(a).normalize(), len = a.distanceTo(b);
    // dónde sale el eje de cada cúpula
    const exitOf = (from, sign) => { for (let t = 0; t <= len; t += 1) { const p = from.clone().addScaledVector(dir, sign * t); if (!DOMES.some(d => p.distanceTo(v3(d.c)) < d.r - 1)) return t; } return 0; };
    const t0 = exitOf(a, 1), t1 = len - exitOf(b, -1), mid = a.clone().addScaledVector(dir, (t0 + t1) / 2), q = new THREE.Quaternion().setFromUnitVectors(Yv, dir);
    const m = new THREE.Mesh(own(new THREE.CylinderGeometry(tb.r + 1, tb.r + 1, Math.max(4, t1 - t0) + 8, 48, 8, true)), wall); m.position.copy(mid); m.quaternion.copy(q); root.add(m);
    const torus = own(new THREE.TorusGeometry(tb.r + 2, 1.6, 10, 64));
    for (const t of [t0, t1]) { const r = new THREE.Mesh(torus, glow); r.position.copy(a.clone().addScaledVector(dir, t)); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); root.add(r); }
    const lampRing = own(new THREE.TorusGeometry(tb.r - 0.5, 0.35, 6, 48));
    for (let t = t0 + 12; t < t1 - 6; t += 14) { const r = new THREE.Mesh(lampRing, glow); r.position.copy(a.clone().addScaledVector(dir, t)); r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); root.add(r); }
    // un halo de luz en cada boca (sin luces de verdad: cuestan mucho en la gráfica integrada)
    const haloM = mat(new THREE.MeshBasicMaterial({ color: '#ffcf80', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const t of [t0, t1]) { const h = new THREE.Mesh(own(new THREE.CircleGeometry(tb.r * 1.9, 48)), haloM); h.position.copy(a.clone().addScaledVector(dir, t)); h.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); root.add(h); }
  }
  // globos oculares en las paredes: el blanco y el iris, mirando al centro de su cúpula
  const white = mat(new THREE.MeshStandardMaterial({ color: '#e8e2d4', roughness: 0.35 })), irisM = mat(new THREE.MeshStandardMaterial({ map: t.iris, roughness: 0.25 }));
  const eyes = T.decor.filter(d => d.kind === 'walleye'), sph = own(new THREE.SphereGeometry(1, 24, 16)), disc = own(new THREE.CircleGeometry(1, 32));
  const W = new THREE.InstancedMesh(sph, white, eyes.length), I = new THREE.InstancedMesh(disc, irisM, eyes.length), o = new THREE.Object3D(), Z = new THREE.Vector3(0, 0, 1);
  eyes.forEach((e, i) => {
    const d = DOMES[e.dome], n = v3(e.n), pos = v3(d.c).addScaledVector(n, d.r - e.s * 0.5);
    o.position.copy(pos); o.quaternion.setFromUnitVectors(Z, n.clone().negate()); o.scale.set(e.s, e.s * 0.7, e.s * 0.6); o.updateMatrix(); W.setMatrixAt(i, o.matrix);
    o.position.copy(pos).addScaledVector(n, -e.s * 0.58); o.scale.set(e.s * 0.55, e.s * 0.55, 1); o.updateMatrix(); I.setMatrixAt(i, o.matrix);
  });
  root.add(W, I);
  // los ojos gigantes del centro: giran para mirar a la cámara
  const giants = DOMES.map(d => { const g = new THREE.Group(); g.position.copy(v3(d.c)); const b = new THREE.Mesh(sph, white); b.scale.setScalar(d.eye); b.castShadow = true; const ir = new THREE.Mesh(disc, irisM); ir.position.z = d.eye * 1.001; ir.scale.setScalar(d.eye * 0.62); g.add(b, ir); root.add(g); return g; });
  // iris que se cierran y ojos que flotan
  const movers = [], ringM = mat(new THREE.MeshStandardMaterial({ map: t.iris, roughness: 0.3, side: THREE.DoubleSide }));
  for (const m of T.movers) {
    const c = m.cols[0];
    if (m.kind === 'iris') {
      // un disco del radio de fuera; el sombreador recorta la pupila (radio de dentro) en cada fotograma
      const mm = mat(ringM.clone()), u = { value: c.rin / c.rout };
      mm.onBeforeCompile = sh => { sh.uniforms.uIn = u; sh.fragmentShader = `uniform float uIn;\n${sh.fragmentShader.replace('void main() {', 'void main() {\n  if (length(vMapUv - 0.5) * 2.0 < uIn) discard;')}`; };
      const me = new THREE.Mesh(own(new THREE.CircleGeometry(c.rout, 64)), mm); me.position.copy(v3(c.c)); me.quaternion.setFromUnitVectors(Z, v3(c.n)); root.add(me);
      movers.push(() => { u.value = c.rin / c.rout; });
    } else {
      const g = new THREE.Group(), b = new THREE.Mesh(sph, white), ir = new THREE.Mesh(disc, irisM); b.scale.setScalar(c.r); ir.position.z = c.r * 1.001; ir.scale.setScalar(c.r * 0.6); g.add(b, ir); root.add(g);
      movers.push(() => { g.position.set(c.c.x, c.c.y, c.c.z); if (cv.camera) g.lookAt(cv.camera.position); });
    }
  }
  return {
    update() { for (const f of movers) f(); if (cv.camera) for (const g of giants) g.lookAt(cv.camera.position); },
    dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); },
  };
}
