// Kit de arquitectura (lo que se ve), sacado del Laberinto: bloques unidos por zonas, arcos extruidos con su hueco
// real, miles de relieves, hornacinas y ventanas instanciados, haces de luz por los huecos del techo, polvo flotando,
// farolillos en los pilares y esculturas de formas abstractas (kit de arte) sobre algunos voladizos.
// m: { wall (material de los muros), relief (material de los relieves; por defecto el de los muros), niche (color de
// hornacinas y ventanas), lamp (color de los farolillos), shaft (color de los haces), dust (color del polvo),
// sculpt (paleta de las esculturas) }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { dotTexture } from '../textures.js';
import { rng } from '../math.js';
import { artGeometry, brushMaterial } from './art-view.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
function shaftTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}
function archShape(w = 1, h = 1.6) { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false); s.lineTo(-w / 2, 0); return s; }

export function canyonLayer(cv, m) {
  const T = cv.track, root = cv.group, Q = cv.quality, R = rng(m.seed || 77), rr = (a, b) => a + R() * (b - a), owned = [];
  const mat = x => { owned.push(x); return x; };
  const wall = m.wall, relief = m.relief || m.wall;
  const dark = mat(new THREE.MeshStandardMaterial({ color: m.niche || '#232220', roughness: 1 }));
  const lamp = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color(m.lamp || '#ffcf8a').multiplyScalar(3.2) }));
  const shaftTex = shaftTexture(); owned.push(shaftTex);
  const shaftMat = mat(new THREE.MeshBasicMaterial({ map: shaftTex, color: m.shaft || '#fff3df', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  const chunks = new Map(), add = (geo, x, z) => { const k = `${Math.floor(x / 200)},${Math.floor(z / 200)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(geo); };
  const M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const boxGeo = (c, h, yaw) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(M.compose(v3(c), Qt.setFromAxisAngle(Y, yaw || 0), one));
  for (const d of T.decor) {
    if (d.kind === 'block') add(boxGeo(d.c, d.h, d.yaw), d.c.x, d.c.z);
    else if (d.kind === 'arch') {
      const s = new THREE.Shape(); s.moveTo(-d.h.x, -d.h.y); s.lineTo(d.h.x, -d.h.y); s.lineTo(d.h.x, d.h.y); s.lineTo(-d.h.x, d.h.y); s.lineTo(-d.h.x, -d.h.y);
      const H = d.hole, hole = new THREE.Path(); hole.moveTo(-H.hw, H.y); hole.lineTo(-H.hw, H.y + H.hh); hole.absarc(0, H.y + H.hh, H.hw, Math.PI, 0, true); hole.lineTo(H.hw, H.y); hole.lineTo(-H.hw, H.y);
      s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: d.h.z * 2, bevelEnabled: false, curveSegments: 28 }).translate(0, 0, -d.h.z);
      g.applyMatrix4(M.compose(v3(d.c), Qt.setFromAxisAngle(Y, d.yaw), one));
      g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      add(g.index ? g.toNonIndexed() : g, d.c.x, d.c.z);
    }
  }
  for (const geos of chunks.values()) { const me = new THREE.Mesh(mergeGeometries(geos), wall); me.castShadow = me.receiveShadow = true; root.add(me); geos.forEach(g => g.dispose()); }

  const walls = T.decor.filter(d => d.kind === 'block' && d.tag === 'wall' && d.side), bgs = T.decor.filter(d => d.kind === 'block' && d.tag === 'bg'), pillars = T.decor.filter(d => d.kind === 'block' && d.tag === 'pillar');
  const dense = Q.name === 'ultra' ? 1.4 : Q.name === 'baja' ? 0.5 : 1, o = new THREE.Object3D(), tmp = new THREE.Vector3();
  const place = (d, lx, ly, lz) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return tmp.set(d.c.x + lx * c + lz * s, d.c.y + ly, d.c.z - lx * s + lz * c); };
  // relieves
  {
    const n = Math.floor(walls.length * 9 * dense), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), relief, Math.max(1, n));
    let k = 0;
    for (const d of walls) for (let j = 0; j < 9 * dense && k < n; j++) { const w = rr(2, 9), h = rr(2, 14), dep = rr(0.4, 1.5); o.position.copy(place(d, rr(-d.h.x + w / 2, d.h.x - w / 2), rr(-d.h.y + h, d.h.y - h), -d.side * (d.h.z + dep / 2))); o.rotation.set(0, d.yaw, 0); o.scale.set(w, h, dep); o.updateMatrix(); inst.setMatrixAt(k++, o.matrix); }
    inst.count = k; inst.castShadow = inst.receiveShadow = true; root.add(inst);
  }
  // hornacinas y ventanas
  {
    const geo = new THREE.ShapeGeometry(archShape(1, 1.6), 10), n = Math.floor(walls.length * 3 * dense) + Math.floor(bgs.length * 40 * dense), inst = new THREE.InstancedMesh(geo, dark, Math.max(1, n));
    let k = 0;
    for (const d of walls) for (let j = 0; j < 3 * dense && k < n; j++) { const w = rr(4, 11); o.position.copy(place(d, rr(-d.h.x + w, d.h.x - w), rr(-d.h.y + 4, d.h.y - w * 1.8), -d.side * (d.h.z + 0.06))); o.rotation.set(0, d.yaw + (d.side > 0 ? Math.PI : 0), 0); o.scale.set(w, w, 1); o.updateMatrix(); inst.setMatrixAt(k++, o.matrix); }
    for (const d of bgs) { const face = R() < 0.5 ? 1 : -1, rows = Math.min(14, Math.floor((d.h.y * 2) / 11)), cols = Math.max(1, Math.floor((d.h.x * 2) / 9)); for (let r = 0; r < rows; r++) for (let c = 0; c < cols && k < n; c++) { if (R() < 0.25) continue; o.position.copy(place(d, -d.h.x + 4.5 + c * 9, -d.h.y + 6 + r * 11, face * (d.h.z + 0.06))); o.rotation.set(0, d.yaw + (face < 0 ? Math.PI : 0), 0); o.scale.set(3.2, 3.2, 1); o.updateMatrix(); inst.setMatrixAt(k++, o.matrix); } }
    inst.count = k; root.add(inst);
  }
  if (pillars.length) { const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.4, 0.5), lamp, pillars.length * 2); let k = 0; for (const d of pillars) for (const sd of [-1, 1]) { o.position.copy(place(d, 0, d.h.y - 8, sd * (d.h.z + 0.3))); o.rotation.set(0, d.yaw, 0); o.scale.set(1, 1, 1); o.updateMatrix(); inst.setMatrixAt(k++, o.matrix); } root.add(inst); }
  // esculturas sobre los voladizos (formas del kit de arte, sin colisión: son pequeñas y quedan del lado de la pared)
  if (m.sculpt) {
    const ledges = T.decor.filter(d => d.kind === 'block' && d.tag === 'ledge' && d.sculpt), kinds = m.sculptKinds || ['blob', 'knot', 'vase', 'shell', 'coral', 'drip'], cols = m.sculpt.map(c => new THREE.Color(c)), groups = new Map();
    for (const d of ledges) { const k = kinds[Math.floor(R() * kinds.length)] + '|' + Math.floor(R() * 6); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(d); }
    for (const [key, list] of groups) {
      const [art, v] = key.split('|'), I = new THREE.InstancedMesh(artGeometry(art, +v), brushMaterial(m.sculptRough ?? 0.45), list.length);
      list.forEach((d, i) => { const s = Math.min(d.h.x, d.h.z * 2, 6) * rr(0.8, 1.2); o.position.set(d.c.x, d.c.y + d.h.y + s * 0.8, d.c.z); o.rotation.set(rr(-0.3, 0.3), rr(0, 6.28), rr(-0.3, 0.3)); o.scale.setScalar(s); o.updateMatrix(); I.setMatrixAt(i, o.matrix); I.setColorAt(i, cols[Math.floor(R() * cols.length)]); });
      I.castShadow = I.receiveShadow = true; root.add(I);
    }
  }
  // haces de luz
  const shaftGeo = new THREE.PlaneGeometry(1, 1);
  for (const d of T.decor.filter(x => x.kind === 'light')) for (const a of [0, Math.PI / 2]) { const me = new THREE.Mesh(shaftGeo, shaftMat); me.scale.set(d.w * 0.9, d.h, 1); me.position.set(d.p.x, d.p.y - d.h / 2, d.p.z); me.rotation.set(0, d.yaw + a, 0); me.renderOrder = 5; root.add(me); }
  // polvo
  const S = T.spline, nd = Math.floor(3200 * dense), pos = new Float32Array(nd * 3);
  for (let k = 0; k < nd; k++) { const p = S.pointAt(R() * S.length); pos[k * 3] = p.x + rr(-30, 30); pos[k * 3 + 1] = p.y + rr(-25, 30); pos[k * 3 + 2] = p.z + rr(-30, 30); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = dotTexture(); owned.push(dot);
  const dust = new THREE.Points(dg, mat(new THREE.PointsMaterial({ color: m.dust || '#fffaf0', size: 0.28, map: dot, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
  root.add(dust);
  return { update(time) { dust.rotation.y = Math.sin(time * 0.02) * 0.004; }, dispose() { for (const x of owned) x.dispose(); } };
}
