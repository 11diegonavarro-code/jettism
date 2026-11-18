// Collage psicodélico: lo que se ve. Texturas op-art hechas por código (bandas arcoíris, cebra ondulada, anillos y
// espirales), torres de discos apilados con bordes de colores, manchas blandas, discos de anillos, muros arcoíris y un
// busto gigante de anillos, todo con instancias (pocas llamadas de dibujo). Cielo luminoso y suelo de ondas de colores.
import * as THREE from 'three';
import { opTexture } from '../textures.js';
import { rng } from '../math.js';
import { shellLayer } from './shell-view.js';
import { artLayer } from './art-view.js';
import { triplanar } from '../materials.js';

let TEX = null;
const tex = () => TEX || (TEX = {
  zebra: [
    opTexture({ kind: 'zebra', colors: ['#111111', '#f4f1ea'], bands: 14, seed: 2 }),
    opTexture({ kind: 'zebra', colors: ['#1e7a4a', '#f4f1ea', '#f2c14e'], bands: 12, seed: 3 }),
    opTexture({ kind: 'zebra', colors: ['#2f6fd6', '#e8f2ff', '#89b8ff'], bands: 12, seed: 4 }),
    opTexture({ kind: 'zebra', colors: ['#ff6a1a', '#ffd23f', '#e8432f', '#fff3d6'], bands: 12, seed: 5 }),
  ],
  rings: [
    opTexture({ kind: 'rings', colors: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00b3ff', '#7a3cff', '#ff2d95'], bands: 14, seed: 6 }),
    opTexture({ kind: 'spiral', colors: ['#d81b3a', '#ffd23f', '#ff7a1a', '#fff3d6'], bands: 10, seed: 7 }),
    opTexture({ kind: 'rings', colors: ['#111111', '#f4f1ea'], bands: 18, seed: 8 }),
  ],
  rainbow: [
    opTexture({ kind: 'rainbow', colors: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00b3ff', '#7a3cff', '#ff2d95'], bands: 14, seed: 9 }),
    opTexture({ kind: 'rainbow', colors: ['#ff8fb1', '#ffd3a1', '#fff1b8', '#b8f0d0', '#b8dcff', '#d9c2ff'], bands: 12, seed: 10 }),
    opTexture({ kind: 'rainbow', colors: ['#111111', '#f4f1ea', '#e8432f', '#f4f1ea'], bands: 16, seed: 11 }),
  ],
  ground: opTexture({ kind: 'zebra', colors: ['#ff7a59', '#ffb36b', '#ffd86b', '#ff9ac0', '#c08bff', '#7ec8ff'], bands: 10, seed: 12 }),
});

export function atmo() {
  return {
    sky: { zenith: '#3d9bff', mid: '#8fd0ff', horizon: '#ffe3a6', ground: '#ff9ac0', sun: '#fffbe8', clouds: 0.15, sunDisc: 1 },
    sunDir: [0.4, 0.7, -0.6], sunColor: '#fff6e0', sunIntensity: 3.4,
    hemiSky: '#cfe8ff', hemiGround: '#ffb0c8', hemiIntensity: 0.9,
    fog: { color: '#ffd9c2', density: 0.0003 },
    exposure: 1.05,
    ground: { color: '#ffffff', map: tex().ground, repeat: 260, roughness: 0.9 },
    grade: { sat: 1.22, contrast: 1.05, tint: [1.02, 1.0, 0.99], grain: 0, vignette: 0.85 },
  };
}
// Música del nivel 1: luminosa y tranquila
export const MUSIC = { bpm: 82, chords: [[48, 55, 64, 67, 71], [50, 57, 62, 66, 69], [53, 60, 64, 69, 72], [55, 62, 67, 71, 74]] };
export const CLOUDS = {
  lit: '#ffffff', shade: '#ffc2d8',
  layout(cluster, R) {
    for (let k = 0; k < 24; k++) { const a = R() * Math.PI * 2, d = 700 + R() * 1500; cluster(380 + Math.cos(a) * d, 450 + R() * 500, -100 + Math.sin(a) * d, 8, 120, 170, 0.35); }
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 3000 + R() * 2000; cluster(380 + Math.cos(a) * d, 300 + R() * 600, -100 + Math.sin(a) * d, 8, 300, 420, 0.3); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, R = rng(13), t = tex(), owned = [];
  const mat = m => { owned.push(m); return m; };
  const std = map => mat(new THREE.MeshStandardMaterial({ map, roughness: 0.75 }));
  const zebraM = t.zebra.map(std), ringM = t.rings.map(std), rainM = t.rainbow.map(std);
  const o = new THREE.Object3D(), Y = new THREE.Vector3(0, 1, 0);
  const inst = (geo, m, list, setter) => {
    if (!list.length) return null;
    const I = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((d, i) => { setter(d, o); o.updateMatrix(); I.setMatrixAt(i, o.matrix); });
    I.castShadow = I.receiveShadow = true;
    root.add(I);
    return I;
  };
  const D = T.decor;
  // manchas (y formas lejanas) por textura
  const sphere = new THREE.SphereGeometry(1, 48, 32);
  for (let k = 0; k < 4; k++) inst(sphere, zebraM[k], D.filter(d => (d.kind === 'blob' || d.kind === 'far') && d.tex === k), (d, ob) => { ob.position.set(d.col.c.x, d.col.c.y, d.col.c.z); ob.rotation.set(0, d.col.yaw, 0); ob.scale.set(d.col.r.x, d.col.r.y, d.col.r.z); });
  // discos de anillos: cilindros finos con las caras mirando de lado
  const disc = new THREE.CylinderGeometry(1, 1, 1, 72, 1).rotateX(Math.PI / 2);
  for (let k = 0; k < 3; k++) inst(disc, ringM[k], D.filter(d => d.kind === 'disc' && d.tex === k), (d, ob) => { ob.position.set(d.col.c.x, d.col.c.y, d.col.c.z); ob.rotation.set(0, d.col.yaw, 0); ob.scale.set(d.col.r.x, d.col.r.y, d.col.r.z * 2); });
  // muros arcoíris
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let k = 0; k < 3; k++) inst(box, rainM[k], D.filter(d => d.kind === 'wall' && d.tex === k), (d, ob) => { ob.position.set(d.col.c.x, d.col.c.y, d.col.c.z); ob.rotation.set(0, d.col.yaw, 0); ob.scale.set(d.col.h.x * 2, d.col.h.y * 2, d.col.h.z * 2); });
  // torres de discos apilados: discos rojos con bordes de colores, un poco desplazados
  const stacks = D.filter(d => d.kind === 'stack'), discs = [];
  for (const d of stacks) {
    const n = Math.floor(d.H / 6), lean = R() * Math.PI * 2;
    for (let j = 0; j < n; j++) discs.push({ x: d.col.a.x + Math.cos(lean) * j * 0.25, y: j * 6 + 2, z: d.col.a.z + Math.sin(lean) * j * 0.25, r: d.r * (0.96 + 0.04 * Math.sin(j)), c: j % 3 });
  }
  const discGeo = new THREE.CylinderGeometry(1, 1, 4, 56);
  const discMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.55 }));
  const DI = inst(discGeo, discMat, discs, (d, ob) => { ob.position.set(d.x, d.y, d.z); ob.rotation.set(0, 0, 0); ob.scale.set(d.r, 1, d.r); });
  if (DI) { const cols = ['#e8261d', '#1f8a4c', '#f2c14e'].map(c => new THREE.Color(c)); discs.forEach((d, i) => DI.setColorAt(i, cols[d.c])); }
  // el busto de anillos
  for (const d of D.filter(x => x.kind === 'head')) {
    if (d.bust) { const m = new THREE.Mesh(sphere, ringM[2]); m.position.set(d.col.c.x, d.col.c.y, d.col.c.z); m.scale.set(d.col.r.x, d.col.r.y, d.col.r.z); m.rotation.y = d.col.yaw; m.castShadow = true; root.add(m); }
    else { const h = d.col.b.y - d.col.a.y, m = new THREE.Mesh(new THREE.CylinderGeometry(d.col.r, d.col.r * 1.3, h, 40), zebraM[0]); m.position.set(d.col.a.x, (d.col.a.y + d.col.b.y) / 2, d.col.a.z); m.castShadow = true; root.add(m); }
  }
  // obstáculos que se mueven
  const movers = [];
  for (const m of T.movers) {
    const c = m.cols[0], me = new THREE.Mesh(sphere, m.kind === 'ball' ? mat(new THREE.MeshStandardMaterial({ color: '#e8261d', roughness: 0.35 })) : zebraM[3]);
    if (c.type === 'ellipsoid') me.scale.set(c.r.x, c.r.y, c.r.z); else me.scale.setScalar(c.r);
    me.castShadow = true; root.add(me);
    movers.push(() => me.position.set(c.c.x, c.c.y, c.c.z));
  }
  void Y;
  // ---------- el edificio: paredes arcoíris, suelo de cebra, techo de anillos, cristales y fachadas rojas ----------
  const tri = (map, sc, extra = {}) => mat(triplanar(new THREE.MeshStandardMaterial({ map, roughness: 0.6, ...extra }), { scale: sc }));
  const shell = shellLayer(cv, {
    wall: tri(t.rainbow[1], 1 / 40), floor: tri(t.zebra[3], 1 / 30, { roughness: 0.35 }), ceil: tri(t.rings[0], 1 / 50), trim: mat(new THREE.MeshStandardMaterial({ color: '#e8261d', roughness: 0.4 })),
    facade: tri(t.rainbow[0], 1 / 60), glass: mat(new THREE.MeshStandardMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false })),
  });
  // pilotes bajo los pasillos que van por el aire: pilas de discos de colores
  const stilts = [];
  for (const d of T.decor.filter(x => x.kind === 'seg' && x.s % 30 === 0)) {
    const bottom = d.P.y - d.H - 6;
    if (bottom < 4) continue;
    for (const sd of [-1, 1]) { const x = d.P.x + d.Rh.x * sd * d.W * 0.8, z = d.P.z + d.Rh.z * sd * d.W * 0.8; for (let y = 2; y < bottom; y += 6) stilts.push({ x, y, z, r: 5 + (y % 12 ? 0 : 1), c: Math.floor(y / 6) % 3 }); }
  }
  const SI = inst(discGeo, discMat, stilts, (d, ob) => { ob.position.set(d.x, d.y, d.z); ob.rotation.set(0, 0, 0); ob.scale.set(d.r, 1, d.r); });
  if (SI) { const cols = ['#e8261d', '#1f8a4c', '#f2c14e'].map(c => new THREE.Color(c)); stilts.forEach((d, i) => SI.setColorAt(i, cols[d.c])); }
  // las formas del kit, con la paleta op-art
  const art = artLayer(cv, ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00b3ff', '#7a3cff', '#ff2d95', '#f4f1ea', '#111111'], { rough: 0.5 });
  return { update() { for (const f of movers) f(); }, dispose() { shell.dispose(); art.dispose(); for (const m of owned) m.dispose(); } };
}
