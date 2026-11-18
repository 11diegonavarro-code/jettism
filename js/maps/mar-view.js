// Mar rojo: lo que se ve. Piedra arenisca rojiza (galerías, terrazas, garganta), un mar rojo brillante como un espejo,
// cielo de atardecer azul oscuro y naranja, la cabeza dormida (cara de piel, pelo de cintas y tentáculos cobrizos),
// torres petrolíferas de celosía, barcos hundidos, rocas, figuritas en la orilla y bombas de petróleo que cabecean.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { canyonLayer } from './canyon-view.js';
import { artGeometry, brushMaterial } from './art-view.js';
import { rng } from '../math.js';
import { HEAD } from './mar.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = {
  stone: noiseTexture({ size: 512, kind: 'paint', seed: 131, colors: ['#8a4a32', '#b0684a', '#d49470'] }),
  dark: noiseTexture({ size: 256, kind: 'paint', seed: 132, colors: ['#4a2418', '#6a3424', '#8a4a32'] }),
  sea: noiseTexture({ size: 512, kind: 'paint', seed: 133, colors: ['#9a140c', '#c41e12', '#e2402a'] }),
});

export function atmo() {
  return {
    sky: { zenith: '#16223c', mid: '#52425a', horizon: '#e07a46', ground: '#7a1208', sun: '#ffb070', clouds: 0.45, sunDisc: 0.8 },
    sunDir: [-0.6, 0.18, -0.78], sunColor: '#ffa064', sunIntensity: 3.2,
    hemiSky: '#8a8aa8', hemiGround: '#6a140c', hemiIntensity: 0.6,
    fog: { color: '#6e3c38', density: 0.0011 },
    exposure: 0.95,
    ground: { color: '#ffffff', map: tex().sea, repeat: 600, roughness: 0.18 },
    grade: { sat: 1.05, contrast: 1.12, tint: [1.05, 0.98, 0.95], grain: 0.05, vignette: 0.6 },
  };
}
export const MUSIC = { chords: [[45, 52, 57, 60, 64], [43, 50, 55, 58, 62], [41, 48, 53, 57, 60], [40, 47, 52, 56, 59]] };
export const CLOUDS = {
  lit: '#ffa878', shade: '#2a2440',
  layout(cluster, R) {
    for (let k = 0; k < 22; k++) { const a = R() * Math.PI * 2, d = 900 + R() * 1400; cluster(320 + Math.cos(a) * d, 420 + R() * 400, -150 + Math.sin(a) * d, 8, 150, 210, 0.3); }
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2, d = 3000 + R() * 2200; cluster(320 + Math.cos(a) * d, 220 + R() * 500, -150 + Math.sin(a) * d, 8, 300, 440, 0.28); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], geos = [], R = rng(134);
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const stone = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.stone, roughness: 0.9 }), { scale: 1 / 24 }));
  const darkStone = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.dark, roughness: 0.95 }), { scale: 1 / 14 }));
  const arch = canyonLayer(cv, { wall: stone, relief: darkStone, niche: '#1a0a06', lamp: '#ff9a50', shaft: '#ffc890', dust: '#ffd8b8', sculpt: ['#c9b08a', '#8a4a32', '#e2c8a0', '#4a2418'], sculptKinds: ['drip', 'blob', 'shell', 'vase'], seed: 61 });
  const metal = mat(new THREE.MeshStandardMaterial({ color: '#2a2220', roughness: 0.6, metalness: 0.6 }));
  const rust = mat(new THREE.MeshStandardMaterial({ color: '#7a3a22', roughness: 0.75, metalness: 0.3 }));
  const skin = mat(new THREE.MeshStandardMaterial({ color: '#e0b090', roughness: 0.55 }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const rod = (a, b, r) => { const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length(); return new THREE.CylinderGeometry(r, r, len, 5).toNonIndexed().applyMatrix4(M.compose(A.add(B).multiplyScalar(0.5), Q.setFromUnitVectors(Y, d.normalize()), one)); };
  const mesh = (g, m) => { const me = new THREE.Mesh(own(g), m); me.castShadow = me.receiveShadow = true; root.add(me); return me; };
  // torres petrolíferas: cuatro patas que se juntan arriba, con travesaños
  const rig = [];
  for (const d of T.decor.filter(x => x.kind === 'rig')) {
    const H = d.b.y, w = 8, top = 1.5, c = d.a;
    const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [new THREE.Vector3(c.x + x * w, 0, c.z + z * w), new THREE.Vector3(c.x + x * top, H, c.z + z * top)]);
    for (const [a, b] of legs) rig.push(rod(a, b, 0.6));
    for (let y = 8; y < H; y += 12) { const f = y / H, pts = legs.map(([a, b]) => a.clone().lerp(b, f)); for (let j = 0; j < 4; j++) rig.push(rod(pts[j], pts[(j + 1) % 4], 0.35)); }
    rig.push(new THREE.BoxGeometry(5, 4, 5).toNonIndexed().translate(c.x, H + 2, c.z));
  }
  if (rig.length) mesh(mergeGeometries(rig), metal);
  // barcos hundidos, rocas y lejanías
  for (const d of T.decor.filter(x => x.kind === 'boat')) { const g = new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2).applyMatrix4(new THREE.Matrix4().makeBasis(v3(d.ax), v3(d.ay), v3(d.az)).setPosition(d.c.x, d.c.y, d.c.z)); mesh(g, rust); }
  const sph = own(new THREE.SphereGeometry(1, 28, 18));
  for (const d of T.decor.filter(x => x.kind === 'rock' || x.kind === 'far')) { const me = new THREE.Mesh(sph, d.kind === 'far' ? darkStone : stone); me.position.copy(v3(d.c)); me.scale.set(d.rr.x, d.rr.y, d.rr.z); me.rotation.y = d.yaw; me.receiveShadow = true; root.add(me); }
  // la cabeza dormida: cara mirando al cielo, nariz, labios y pelo de cintas cobrizas extendido sobre el agua
  for (const d of T.decor.filter(x => x.kind === 'head')) {
    const g = new THREE.Group(); g.position.copy(v3(d.c)); g.rotation.y = d.yaw; root.add(g);
    const face = new THREE.Mesh(sph, skin); face.scale.set(d.rr.x, d.rr.y, d.rr.z); face.castShadow = true; g.add(face);
    const nose = new THREE.Mesh(sph, skin); nose.scale.set(14, 22, 30); nose.position.set(0, d.rr.y * 0.95, -d.rr.z * 0.15); g.add(nose);
    const lip = mat(new THREE.MeshStandardMaterial({ color: '#b04a4a', roughness: 0.5 }));
    const lips = new THREE.Mesh(own(new THREE.TorusGeometry(18, 5, 10, 32)), lip); lips.rotation.x = Math.PI / 2; lips.scale.set(1, 0.5, 1); lips.position.set(0, d.rr.y * 0.86, -d.rr.z * 0.5); g.add(lips);
    const lid = mat(new THREE.MeshStandardMaterial({ color: '#c08a70', roughness: 0.6 }));
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(sph, lid); e.scale.set(22, 6, 12); e.position.set(sx * 42, d.rr.y * 0.9, d.rr.z * 0.18); g.add(e); }
    const hairM = brushMaterial(0.5); hairM.color.set('#a8502a'); owned.push(hairM);
    for (let k = 0; k < 40; k++) { const kind = k % 2 ? 'tendril' : 'ribbon', me = new THREE.Mesh(artGeometry(kind, k % 6), hairM), a = (k / 40) * Math.PI * 1.4 - 0.2; me.position.set(Math.cos(a) * d.rr.x * 1.05, R() * 20, d.rr.z * 0.6 + Math.sin(a) * d.rr.z * 0.9); me.scale.setScalar(30 + R() * 30); me.rotation.set(R() * 6, R() * 6, R() * 6); me.castShadow = true; g.add(me); }
  }
  // figuritas en la orilla
  for (const d of T.decor.filter(x => x.kind === 'figure')) { const me = new THREE.Mesh(sph, metal); me.position.set(d.p.x, d.p.y + 1.8, d.p.z); me.scale.set(0.6, 1.8, 0.6); root.add(me); }
  // bombas de petróleo: caballete y balancín
  const movers = [];
  for (const m of T.movers) {
    const c = m.cols[0], post = new THREE.Mesh(own(new THREE.CylinderGeometry(1.6, 3, m.pivot.y, 8)), metal); post.position.set(m.pivot.x, m.pivot.y / 2, m.pivot.z); root.add(post);
    const beam = new THREE.Mesh(own(new THREE.BoxGeometry(1, 1, 1)), rust), headM = new THREE.Mesh(own(new THREE.BoxGeometry(5, 8, 4)), rust); beam.castShadow = headM.castShadow = true; root.add(beam, headM);
    const d = new THREE.Vector3();
    movers.push(() => { d.set(c.b.x - c.a.x, c.b.y - c.a.y, c.b.z - c.a.z); const len = d.length(); beam.position.set((c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2, (c.a.z + c.b.z) / 2); beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()); beam.scale.set(len, 2.6, 2.6); headM.position.set(c.b.x, c.b.y, c.b.z); headM.quaternion.copy(beam.quaternion); });
  }
  return { update(time) { for (const f of movers) f(); arch.update(time); }, dispose() { arch.dispose(); for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
