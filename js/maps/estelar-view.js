// Mapa estelar: lo que se ve. Espacio negro con miles de estrellas, la jaula de filamentos rojos y dorados que brillan,
// nudos de luz donde se juntan, planetas con bandas y anillos, lunas que orbitan, aspas de luz dorada y, a lo lejos,
// marcos de viñeta enormes dibujados con líneas blancas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { opTexture } from '../textures.js';
import { rng } from '../math.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = [
  opTexture({ kind: 'rainbow', colors: ['#c8402a', '#e8a050', '#7a2a1a', '#f0d8a8'], bands: 9, seed: 182 }),
  opTexture({ kind: 'rainbow', colors: ['#3a6a9a', '#a8c8e8', '#1a3050', '#6a8ab0'], bands: 8, seed: 183 }),
  opTexture({ kind: 'rings', colors: ['#d8b060', '#7a5a2a', '#f0e0b0'], bands: 10, seed: 184 }),
  opTexture({ kind: 'zebra', colors: ['#8a3a8a', '#e8a0d0', '#3a1a4a'], bands: 8, seed: 185 }),
]);

export function atmo() {
  return {
    sky: { zenith: '#000000', mid: '#02030a', horizon: '#0a0a1c', ground: '#000000', sun: '#fff0d8', clouds: 0, sunDisc: 0.6 },
    sunDir: [0.5, 0.4, -0.75], sunColor: '#fff0d8', sunIntensity: 2.6,
    hemiSky: '#3a4a7a', hemiGround: '#000000', hemiIntensity: 0.35,
    fog: { color: '#000000', density: 0.0002 },
    exposure: 1.0,
    ground: false,
    grade: { sat: 1.1, contrast: 1.25, tint: [1.03, 1.0, 1.0], grain: 0.06, vignette: 0.5 },
  };
}
export const MUSIC = { chords: [[36, 43, 48, 51, 55], [39, 46, 51, 55, 58], [34, 41, 46, 50, 53], [38, 45, 50, 53, 57]] };
export const CLOUDS = { lit: '#222233', shade: '#000000', layout() {} };

export function buildView(cv) {
  const T = cv.track, root = cv.group, owned = [], geos = [], R = rng(186), t = tex();
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const red = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3020').multiplyScalar(1.8) }));
  const gold = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc040').multiplyScalar(1.8) }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const rod = (a, b, r) => { const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length(); return new THREE.CylinderGeometry(r, r, len, 6, 1, true).toNonIndexed().applyMatrix4(M.compose(A.add(B).multiplyScalar(0.5), Q.setFromUnitVectors(Y, d.normalize()), one)); };
  // la jaula
  for (const d of T.decor.filter(x => x.kind === 'strands')) {
    const reds = [], golds = [];
    for (const s of d.list) (s.gold ? golds : reds).push(rod(s.a, s.b, 0.45));
    for (const [list, m] of [[reds, red], [golds, gold]]) for (let i = 0; i < list.length; i += 500) root.add(new THREE.Mesh(own(mergeGeometries(list.slice(i, i + 500))), m));
  }
  // nudos de luz
  const knotGeo = own(new THREE.SphereGeometry(1.6, 16, 10)), haloM = mat(new THREE.MeshBasicMaterial({ color: '#ffd080', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }));
  for (const d of T.decor.filter(x => x.kind === 'knot')) { const h = new THREE.Mesh(own(new THREE.SphereGeometry(26, 24, 16)), haloM); h.position.copy(v3(d.p)); root.add(h); for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(knotGeo, k % 2 ? red : gold), a = (k / 6) * Math.PI * 2; s.position.set(d.p.x + Math.cos(a) * 14, d.p.y + Math.sin(a) * 14, d.p.z); root.add(s); } }
  // planetas y anillos
  const sph = own(new THREE.SphereGeometry(1, 48, 32)), pm = t.map(m => mat(new THREE.MeshStandardMaterial({ map: m, roughness: 0.8 })));
  const ringM = mat(new THREE.MeshStandardMaterial({ color: '#d8c090', roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  for (const d of T.decor.filter(x => x.kind === 'planet')) {
    const p = new THREE.Mesh(sph, pm[d.tex]); p.position.copy(v3(d.c)); p.scale.setScalar(d.r); p.rotation.set(R() * 0.6, R() * 6, R() * 0.6); root.add(p);
    if (d.ring) { const r = new THREE.Mesh(own(new THREE.RingGeometry(d.r * 1.35, d.r * 2.1, 64)), ringM); r.position.copy(p.position); r.rotation.set(-Math.PI / 2 + (R() - 0.5) * 0.8, 0, (R() - 0.5) * 0.6); root.add(r); }
  }
  // estrellas
  { const n = 5000, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = R() * 2 - 1, a = R() * 6.28, r = 2600 + R() * 600; pos[i * 3] = 170 + Math.sqrt(1 - u * u) * Math.cos(a) * r; pos[i * 3 + 1] = 200 + u * r; pos[i * 3 + 2] = -150 + Math.sqrt(1 - u * u) * Math.sin(a) * r; } const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); root.add(new THREE.Points(g, mat(new THREE.PointsMaterial({ color: '#fff4e0', size: 2.2, sizeAttenuation: false, fog: false })))); }
  // marcos de viñeta lejanos
  { const pts = []; for (const d of T.decor.filter(x => x.kind === 'panel')) { const c = Math.cos(d.yaw), s = Math.sin(d.yaw), w = d.w / 2, h = d.h / 2, P = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => [d.c.x + x * c, d.c.y + y, d.c.z - x * s]); for (let k = 0; k < 4; k++) pts.push(...P[k], ...P[(k + 1) % 4]); } const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); root.add(new THREE.LineSegments(g, mat(new THREE.LineBasicMaterial({ color: '#e8e0d0', fog: false, transparent: true, opacity: 0.55 })))); }
  // lunas y aspas
  const movers = [];
  for (const m of T.movers) {
    const c = m.cols[0];
    if (m.kind === 'moon') { const me = new THREE.Mesh(sph, pm[m.tex]); me.scale.setScalar(c.r); root.add(me); movers.push(() => { me.position.set(c.c.x, c.c.y, c.c.z); me.rotation.y += 0.02; }); }
    else { const me = new THREE.Mesh(own(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0)), gold), d = new THREE.Vector3(); root.add(me); movers.push(() => { d.set(c.b.x - c.a.x, c.b.y - c.a.y, c.b.z - c.a.z); const len = d.length(); me.position.set(c.a.x, c.a.y, c.a.z); me.quaternion.setFromUnitVectors(Y, d.normalize()); me.scale.set(c.r, len, c.r); }); }
  }
  return { update() { for (const f of movers) f(); }, dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
