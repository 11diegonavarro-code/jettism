// Jardín de las delicias: lo que se ve. Prado verde pintado, estanque azul con borde rosa, fuente rosa de pináculos
// con una esfera azul, torres orgánicas rosas y azules al fondo, frutas gigantes (fresas con pepitas, cerezas, racimos
// de uvas), esferas de cristal, árboles redondos, colinas azules y la cabalgata de criaturas pálidas y de colores.
// Luz de día clara y un poco cálida, como un barniz antiguo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';
import { shellLayer } from './shell-view.js';
import { artLayer } from './art-view.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
function seedsTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = rng(91);
  const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, '#e8343a'); grd.addColorStop(1, '#b8141e');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) { const x = (i % 14) * 18.3 + ((Math.floor(i / 14) % 2) * 9) + R() * 3, y = Math.floor(i / 14) * 25.6 + R() * 3; g.fillStyle = '#ffe07a'; g.beginPath(); g.ellipse(x, y, 2.2, 3.4, 0, 0, 6.28); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let TEX = null;
const tex = () => TEX || (TEX = {
  grass: noiseTexture({ size: 512, kind: 'paint', seed: 84, colors: ['#5f8f3a', '#7fae4a', '#a3c45c'] }),
  pink: noiseTexture({ size: 256, kind: 'paint', seed: 85, colors: ['#e48aa6', '#f2b2c4', '#ffd6e0'] }),
  blue: noiseTexture({ size: 256, kind: 'paint', seed: 86, colors: ['#3d6fb5', '#5e93d6', '#9cc4ef'] }),
  seeds: seedsTexture(),
});

export function atmo() {
  return {
    sky: { zenith: '#4f9be0', mid: '#a6d2f2', horizon: '#f2efd6', ground: '#7fae4a', sun: '#fffbe8', clouds: 0.25, sunDisc: 1 },
    sunDir: [-0.35, 0.72, -0.6], sunColor: '#fff2d8', sunIntensity: 3.6,
    hemiSky: '#d6ecff', hemiGround: '#6f8f3a', hemiIntensity: 0.85,
    fog: { color: '#dfe9e0', density: 0.00035 },
    exposure: 1.02,
    ground: { color: '#ffffff', map: tex().grass, repeat: 700, roughness: 0.95 },
    grade: { sat: 1.14, contrast: 1.06, tint: [1.03, 1.01, 0.95], grain: 0.02, vignette: 0.8 },
  };
}
// Música: pastoral, en Fa mayor
export const MUSIC = { chords: [[53, 60, 65, 69, 72], [50, 57, 62, 65, 69], [48, 55, 60, 64, 67], [46, 53, 58, 62, 65]] };
export const CLOUDS = {
  lit: '#ffffff', shade: '#c9d8ea',
  layout(cluster, R) {
    for (let k = 0; k < 26; k++) { const a = R() * Math.PI * 2, d = 800 + R() * 1500; cluster(380 + Math.cos(a) * d, 450 + R() * 450, -100 + Math.sin(a) * d, 8, 120, 170, 0.35); }
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 3000 + R() * 2000; cluster(380 + Math.cos(a) * d, 300 + R() * 600, -100 + Math.sin(a) * d, 8, 300, 420, 0.3); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], geos = [], R = rng(87);
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const pink = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.pink, roughness: 0.6 }), { scale: 1 / 18 }));
  const blue = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.blue, roughness: 0.55 }), { scale: 1 / 18 }));
  const glass = mat(new THREE.MeshStandardMaterial({ color: '#6fa8ff', roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.55, envMapIntensity: 1.8 }));
  const glassTints = [glass, mat(new THREE.MeshStandardMaterial({ color: '#b8e2ff', roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.5 })), mat(new THREE.MeshStandardMaterial({ color: '#ff9ec4', roughness: 0.04, metalness: 0.15, transparent: true, opacity: 0.5 }))];
  const fresa = mat(new THREE.MeshStandardMaterial({ map: t.seeds, roughness: 0.4 }));
  const cereza = mat(new THREE.MeshStandardMaterial({ color: '#8f0f1c', roughness: 0.25 }));
  const uva = mat(new THREE.MeshStandardMaterial({ color: '#5b2a7a', roughness: 0.3 }));
  const leaf = mat(new THREE.MeshStandardMaterial({ color: '#3f7a2c', roughness: 0.8 }));
  const bark = mat(new THREE.MeshStandardMaterial({ color: '#6b4a2c', roughness: 0.9 }));
  const water = mat(new THREE.MeshStandardMaterial({ color: '#3f7fc4', roughness: 0.08, metalness: 0.4, envMapIntensity: 1.5 }));
  const hill = mat(new THREE.MeshStandardMaterial({ color: '#7fa6c8', roughness: 1 }));
  const Y = new THREE.Vector3(0, 1, 0), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), o = new THREE.Object3D();
  const rod = (a, b, r, seg = 16) => { const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length(); return new THREE.CylinderGeometry(r * 0.75, r, len, seg).toNonIndexed().applyMatrix4(M.compose(A.add(B).multiplyScalar(0.5), Q.setFromUnitVectors(Y, d.normalize()), one)); };
  const mesh = (g, m) => { const me = new THREE.Mesh(own(g), m); me.castShadow = me.receiveShadow = true; root.add(me); return me; };
  const D = T.decor, pinkG = [], blueG = [];

  // torres orgánicas: un perfil torneado con bultos y una punta
  const towerGeo = (d) => {
    const H = d.b.y - d.a.y, pts = [];
    for (let i = 0; i <= 14; i++) { const f = i / 14; pts.push(new THREE.Vector2(d.r * (1 - f * 0.7) * (0.8 + 0.35 * Math.sin(f * 9 + d.r)), f * H)); }
    pts.push(new THREE.Vector2(0.01, H + d.r * 0.8));
    return new THREE.LatheGeometry(pts, 20).toNonIndexed().translate(d.a.x, d.a.y, d.a.z);
  };
  for (const d of D) {
    if (d.kind === 'tower') (d.pink ? pinkG : blueG).push(towerGeo(d));
    else if (d.kind === 'spire') { pinkG.push(rod(d.a, d.b, d.r)); pinkG.push(new THREE.ConeGeometry(d.r * 1.2, d.r * 3, 12).toNonIndexed().translate(d.b.x, d.b.y + d.r * 1.5, d.b.z)); if (d.part === 'trunk') for (let k = 1; k < 4; k++) pinkG.push(new THREE.TorusGeometry(d.r * 1.25, d.r * 0.22, 10, 32).toNonIndexed().rotateX(Math.PI / 2).translate(d.a.x, d.a.y + (d.b.y - d.a.y) * k / 4, d.a.z)); }
  }
  if (pinkG.length) mesh(mergeGeometries(pinkG), pink);
  if (blueG.length) mesh(mergeGeometries(blueG), blue);
  // estanque y su borde
  for (const d of D.filter(x => x.kind === 'pond')) {
    const w = new THREE.Mesh(own(new THREE.CircleGeometry(d.r, 72).rotateX(-Math.PI / 2)), water); w.position.set(d.x, 0.4, d.z); w.receiveShadow = true; root.add(w);
    mesh(new THREE.TorusGeometry(d.r, 3, 10, 96).rotateX(Math.PI / 2).translate(d.x, 0.8, d.z), pink);
  }
  // frutas, esferas, árboles y colinas (con instancias)
  const sph = own(new THREE.SphereGeometry(1, 32, 20));
  const inst = (geo, m, list, set) => { if (!list.length) return null; const I = new THREE.InstancedMesh(geo, m, list.length); list.forEach((d, i) => { set(d); o.updateMatrix(); I.setMatrixAt(i, o.matrix); }); I.castShadow = I.receiveShadow = true; root.add(I); return I; };
  inst(sph, fresa, D.filter(d => d.fruit === 'fresa'), d => { o.position.copy(v3(d.c)); o.scale.set(d.rr.x, d.rr.y, d.rr.z); o.rotation.set(0, R() * 6, Math.PI); });
  inst(sph, cereza, D.filter(d => d.fruit === 'cereza'), d => { o.position.copy(v3(d.c)); o.scale.setScalar(d.r); o.rotation.set(0, 0, 0); });
  inst(sph, uva, D.filter(d => d.fruit === 'uva'), d => { o.position.copy(v3(d.c)); o.scale.setScalar(d.r); });
  for (let k = 0; k < 3; k++) inst(sph, glassTints[k], D.filter(d => d.kind === 'globe' && d.tint === k), d => { o.position.copy(v3(d.c)); o.scale.setScalar(d.r); });
  inst(sph, hill, D.filter(d => d.kind === 'far'), d => { o.position.copy(v3(d.c)); o.scale.setScalar(d.r); });
  const trees = D.filter(d => d.kind === 'tree');
  if (trees.length) { mesh(mergeGeometries(trees.map(d => rod(d.a, d.b, d.r, 8))), bark); inst(sph, leaf, trees, d => { o.position.set(d.b.x, d.b.y + d.crown * 0.6, d.b.z); o.scale.set(d.crown, d.crown * 0.9, d.crown); }); }
  // hojas de las fresas (estrella verde arriba) y rabos de las cerezas
  const tops = [];
  for (const d of D.filter(x => x.fruit === 'fresa')) tops.push(new THREE.ConeGeometry(d.rr.x * 0.6, d.rr.y * 0.3, 6).toNonIndexed().rotateX(Math.PI).translate(d.c.x, d.c.y + d.rr.y * 0.95, d.c.z));
  for (const d of D.filter(x => x.fruit === 'cereza')) tops.push(rod(d.c, { x: d.c.x + d.r * 0.3, y: d.c.y + d.r * 2.2, z: d.c.z }, d.r * 0.08, 6));
  if (tops.length) mesh(mergeGeometries(tops), leaf);

  // ---------- la cabalgata y las fresas que suben y bajan ----------
  const movers = [];
  const bodyCols = ['#f2e6d8', '#c8a07a', '#e8a0b8', '#6a8fc4', '#3a3a3a', '#d8c070'].map(c => mat(new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 })));
  const skin = mat(new THREE.MeshStandardMaterial({ color: '#f6d9c8', roughness: 0.6 }));
  for (const m of T.movers) {
    const c = m.cols[0];
    if (m.kind === 'rider') {
      const g = new THREE.Group(), body = new THREE.Mesh(sph, bodyCols[m.k % bodyCols.length]); body.scale.set(9, 6, 5); body.castShadow = true;
      const head = new THREE.Mesh(sph, bodyCols[m.k % bodyCols.length]); head.scale.setScalar(3.4); head.position.set(9, 4, 0);
      const rider = new THREE.Mesh(sph, skin); rider.scale.set(2.6, 5, 2.6); rider.position.set(-1, 8, 0);
      const legs = [[-5, -1], [5, -1], [-5, 1], [5, 1]].map(([x, z]) => { const l = new THREE.Mesh(sph, bodyCols[m.k % bodyCols.length]); l.scale.set(1, 5, 1); l.position.set(x, -6, z * 2.5); return l; });
      g.add(body, head, rider, ...legs); root.add(g);
      movers.push(() => { g.position.set(c.c.x, c.c.y, c.c.z); g.rotation.y = -m.angle - Math.PI / 2; });
    } else {
      const me = new THREE.Mesh(sph, fresa); me.scale.set(c.r.x, c.r.y, c.r.z); me.rotation.z = Math.PI; me.castShadow = true; root.add(me);
      movers.push(() => me.position.set(c.c.x, c.c.y, c.c.z));
    }
  }
  // ---------- invernaderos y pabellones: paredes rosas pintadas, suelo de mosaico azul, techo crema y mucho cristal ----------
  const shell = shellLayer(cv, {
    wall: pink, floor: blue, ceil: mat(new THREE.MeshStandardMaterial({ color: '#f6efe0', roughness: 0.8 })), trim: leaf,
    facade: pink, glass: mat(new THREE.MeshStandardMaterial({ color: '#d8f0ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, depthWrite: false })),
  });
  // pilotes rosas bajo los tramos que van por el aire
  const st = [];
  for (const d of D.filter(x => x.kind === 'seg' && x.s % 40 === 0)) { const bottom = d.P.y - d.H - 6; if (bottom < 4) continue; for (const sd of [-1, 1]) st.push(new THREE.CylinderGeometry(3.5, 5, bottom, 12).toNonIndexed().translate(d.P.x + d.Rh.x * sd * d.W * 0.8, bottom / 2, d.P.z + d.Rh.z * sd * d.W * 0.8)); }
  if (st.length) mesh(mergeGeometries(st), pink);
  const art = artLayer(cv, ['#e48aa6', '#f2b2c4', '#5e93d6', '#9cc4ef', '#7fae4a', '#3f7a2c', '#e8343a', '#f6efe0', '#c9a0dc'], { rough: 0.5 });
  return { update() { for (const f of movers) f(); }, dispose() { shell.dispose(); art.dispose(); for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
