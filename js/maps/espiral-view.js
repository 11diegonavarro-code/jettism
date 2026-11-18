// Espiral áurea: lo que se ve. Un dibujo de geometría al atardecer: suelo de papel con cuadrícula y arcos a tinta,
// cuadrados de Fibonacci levantados como muros de papel, arcos y doble hélice de latón, una columna con anillos
// grabados, poliedros de latón y papel con las aristas dibujadas a tinta, obeliscos, marcos dorados, anillos de
// latón que se atraviesan y, a lo lejos, poliedros enormes dibujados solo con líneas sobre el cielo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { diagramTexture, noiseTexture, opTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = {
  ground: diagramTexture({ size: 1024, seed: 31 }),
  paper: diagramTexture({ size: 512, paper: '#f3e9d2', seed: 32 }),
  brass: noiseTexture({ size: 256, kind: 'paint', seed: 33, colors: ['#a8823a', '#c99b45', '#dcb662'] }),
  column: opTexture({ kind: 'rainbow', colors: ['#c99b45', '#e8c878', '#2a1c12', '#c99b45', '#f3e9d2'], bands: 10, seed: 34 }),
});

export function atmo() {
  return {
    sky: { zenith: '#2a2c5a', mid: '#b0664a', horizon: '#f6c27a', ground: '#6b4a35', sun: '#ffd9a0', clouds: 0.3, sunDisc: 1 },
    sunDir: [0.62, 0.17, -0.77], sunColor: '#ffbf80', sunIntensity: 3.8,
    hemiSky: '#ffcf9a', hemiGround: '#3a2a40', hemiIntensity: 0.6,
    fog: { color: '#e3a877', density: 0.00042 },
    exposure: 0.98,
    ground: { color: '#f1e3c4', map: tex().ground, repeat: 150, roughness: 0.95 },
    grade: { sat: 1.0, contrast: 1.1, tint: [1.05, 1.0, 0.93], grain: 0.03, vignette: 0.74 },
  };
}
// Música: misteriosa, en Re dórico
export const MUSIC = { chords: [[50, 57, 62, 65, 69], [48, 55, 60, 64, 67], [46, 53, 58, 62, 65], [45, 52, 57, 61, 64]] };
export const CLOUDS = {
  lit: '#ffd2a0', shade: '#7a4a5a',
  layout(cluster, R) {
    for (let k = 0; k < 22; k++) { const a = R() * Math.PI * 2, d = 900 + R() * 1500; cluster(Math.cos(a) * d, 480 + R() * 500, -620 + Math.sin(a) * d, 8, 130, 190, 0.3); }
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 3200 + R() * 2200; cluster(Math.cos(a) * d, 250 + R() * 500, -620 + Math.sin(a) * d, 8, 300, 440, 0.28); }
  },
};

const SHAPES = [r => new THREE.TetrahedronGeometry(r), r => new THREE.OctahedronGeometry(r), r => new THREE.DodecahedronGeometry(r), r => new THREE.IcosahedronGeometry(r)];

export function buildView(cv) {
  const T = cv.track, root = cv.group, R = rng(37), t = tex(), owned = [], geos = [];
  const mat = m => { owned.push(m); return m; };
  const brass = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.brass, color: '#ffffff', metalness: 0.75, roughness: 0.38 }), { scale: 1 / 10 }));
  const paper = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.paper, roughness: 0.92 }), { scale: 1 / 60 }));
  const column = mat(new THREE.MeshStandardMaterial({ map: t.column, metalness: 0.5, roughness: 0.45 }));
  const inkLine = mat(new THREE.LineBasicMaterial({ color: '#2a1c12' }));
  const skyLine = mat(new THREE.LineBasicMaterial({ color: '#3a2440', transparent: true, opacity: 0.75, fog: false }));
  const Y = new THREE.Vector3(0, 1, 0), M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const own = g => { geos.push(g); return g; };
  const mesh = (g, m, shadow = true) => { const me = new THREE.Mesh(g, m); me.castShadow = shadow; me.receiveShadow = true; root.add(me); return me; };
  // cilindro de a a b
  const rod = (a, b, r, seg = 10) => { const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length(); return new THREE.CylinderGeometry(r, r, len, seg, 1, false).applyMatrix4(M.compose(A.add(B).multiplyScalar(0.5), Qt.setFromUnitVectors(Y, d.normalize()), one)); };
  const box = (c, h, yaw) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).applyMatrix4(M.compose(v3(c), Qt.setFromAxisAngle(Y, yaw || 0), one));
  const D = T.decor, gold = [], walls = [], edges = [];

  for (const d of D) {
    if (d.kind === 'arc' || d.kind === 'strand' || d.kind === 'rung' || d.kind === 'frame') gold.push(rod(d.a, d.b, d.r, d.kind === 'arc' ? 8 : 10));
    else if (d.kind === 'wall' || d.kind === 'obelisk') {
      const g = box(d.c, d.h, d.yaw); walls.push(g); edges.push(new THREE.EdgesGeometry(g));
      if (d.kind === 'obelisk') { const tip = new THREE.ConeGeometry(d.h.x * 1.42, d.h.x * 3, 4).applyMatrix4(M.compose(new THREE.Vector3(d.c.x, d.c.y + d.h.y + d.h.x * 1.5, d.c.z), Qt.setFromAxisAngle(Y, (d.yaw || 0) + Math.PI / 4), one)); gold.push(tip); }
    }
  }
  // la columna central con anillos grabados
  for (const d of D.filter(x => x.kind === 'core')) {
    const h = d.b.y - d.a.y, g = new THREE.CylinderGeometry(d.r, d.r * 1.1, h, 48, 1).translate(d.a.x, (d.a.y + d.b.y) / 2, d.a.z);
    mesh(own(g), column);
    mesh(own(new THREE.SphereGeometry(d.r * 1.25, 32, 16).translate(d.b.x, d.b.y + 6, d.b.z)), brass);
  }
  // unir por tipo (las piezas con y sin índice no se mezclan)
  const merge = list => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)), false);
  if (gold.length) mesh(own(merge(gold)), brass);
  if (walls.length) mesh(own(merge(walls)), paper);
  if (edges.length) root.add(new THREE.LineSegments(own(mergeGeometries(edges)), inkLine));

  // poliedros: latón o papel, con las aristas dibujadas
  const solidGeo = SHAPES.map(f => own(f(1))), solidEdges = [];
  const solids = D.filter(d => d.kind === 'solid');
  for (let s = 0; s < 4; s++) for (const m of [0, 1]) {
    const list = solids.filter((d, i) => d.shape === s && i % 2 === m);
    if (!list.length) continue;
    const I = new THREE.InstancedMesh(solidGeo[s], m ? paper : brass, list.length), o = new THREE.Object3D();
    list.forEach((d, i) => { o.position.copy(v3(d.c)); o.rotation.set(R() * 6, R() * 6, R() * 6); o.scale.setScalar(d.r); o.updateMatrix(); I.setMatrixAt(i, o.matrix); solidEdges.push(new THREE.EdgesGeometry(solidGeo[s]).applyMatrix4(o.matrix)); });
    I.castShadow = I.receiveShadow = true; root.add(I);
  }
  if (solidEdges.length) root.add(new THREE.LineSegments(own(mergeGeometries(solidEdges)), inkLine));
  // a lo lejos: poliedros enormes dibujados solo con líneas sobre el cielo
  const farEdges = D.filter(d => d.kind === 'far').map(d => new THREE.EdgesGeometry(SHAPES[d.shape](d.r)).applyMatrix4(M.compose(v3(d.c), Qt.setFromEuler(new THREE.Euler(R() * 6, R() * 6, R() * 6)), one)));
  if (farEdges.length) root.add(new THREE.LineSegments(own(mergeGeometries(farEdges)), skyLine));
  // anillos de latón del tramo de vuelta
  const rings = D.filter(d => d.kind === 'ring').map(d => new THREE.TorusGeometry(d.r, 1.8, 10, 48).toNonIndexed().applyMatrix4(M.compose(v3(d.c), Qt.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v3(d.t).normalize()), one)));
  if (rings.length) mesh(own(mergeGeometries(rings)), brass);

  // ---------- obstáculos que se mueven ----------
  const movers = [];
  const legGeo = own(new THREE.CylinderGeometry(1, 0.55, 1, 12).translate(0, -0.5, 0)), hingeGeo = own(new THREE.SphereGeometry(1, 20, 12));
  const barGeo = own(new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0).rotateZ(-Math.PI / 2));
  for (const m of T.movers) {
    if (m.kind === 'compass') {
      // bisagra, la pata fija (inclinada hacia delante) y la pata que barre con su punta
      const pivot = v3(m.pivot), g = new THREE.Group(); root.add(g);
      const hinge = new THREE.Mesh(hingeGeo, brass); hinge.scale.setScalar(7); hinge.position.copy(pivot); g.add(hinge);
      const fixed = new THREE.Mesh(legGeo, brass), dirF = v3(m.fixed).multiplyScalar(Math.sin(0.4)).add(new THREE.Vector3(0, -Math.cos(0.4), 0)).normalize();
      fixed.position.copy(pivot); fixed.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirF); fixed.scale.set(3, m.L, 3); fixed.castShadow = true; g.add(fixed);
      const leg = new THREE.Mesh(legGeo, brass); leg.position.copy(pivot); leg.scale.set(3, m.L, 3); leg.castShadow = true; g.add(leg);
      const lat = v3(m.lat), dv = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
      movers.push(() => { dv.copy(lat).multiplyScalar(Math.sin(m.angle)).addScaledVector(Y, -Math.cos(m.angle)); leg.quaternion.setFromUnitVectors(down, dv); });
    } else if (m.kind === 'orb') {
      const c = m.cols[0], me = new THREE.Mesh(solidGeo[m.shape], brass), ed = new THREE.LineSegments(own(new THREE.EdgesGeometry(solidGeo[m.shape])), inkLine);
      me.scale.setScalar(c.r * 1.15); me.castShadow = true; me.add(ed); root.add(me);
      let a = 0; movers.push(() => { me.position.set(c.c.x, c.c.y, c.c.z); a += 0.02; me.rotation.set(a, a * 0.7, 0); });
    } else if (m.kind === 'spoke') {
      const bar = m.cols[0], me = new THREE.Mesh(barGeo, brass); me.castShadow = true; root.add(me);
      const tipM = new THREE.Mesh(solidGeo[1], brass); tipM.scale.setScalar(7); root.add(tipM);
      movers.push(() => { me.position.set(bar.a.x, bar.a.y, bar.a.z); me.rotation.set(0, -m.angle, 0); me.scale.set(Math.hypot(bar.b.x - bar.a.x, bar.b.z - bar.a.z), bar.r, bar.r); tipM.position.set(bar.b.x, bar.b.y, bar.b.z); tipM.rotation.y = m.angle * 2; });
    }
  }
  return { update() { for (const f of movers) f(); }, dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
