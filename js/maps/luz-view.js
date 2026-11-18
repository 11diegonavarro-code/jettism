// Luz y sombra: lo que se ve. Todo en blanco y negro (la corrección de color quita el color): hormigón oscuro, techo
// de lamas en los pasillos (la luz entra a franjas), vigas con grandes lucernarios en las salas y el pozo abierto
// arriba. Por cada hueco baja un haz de luz (caja aditiva inclinada como el sol). Niebla negra cerrada: lo de lejos no
// se ve. Las piezas que se mueven llevan los cantos marcados en blanco para leerlas en la oscuridad.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from '../textures.js';
import { triplanar } from '../materials.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
const SUN = [0.3, 0.92, 0.25];
let TEX = null;
const tex = () => TEX || (TEX = { concrete: noiseTexture({ size: 512, kind: 'concrete', seed: 71 }) });

export function atmo() {
  return {
    sky: { zenith: '#000000', mid: '#0b0b0b', horizon: '#1c1c1c', ground: '#000000', sun: '#ffffff', clouds: 0, sunDisc: 0 },
    sunDir: SUN, sunColor: '#ffffff', sunIntensity: 7,
    hemiSky: '#9a9a9a', hemiGround: '#050505', hemiIntensity: 0.1,
    fog: { color: '#050505', density: 0.0055 },
    exposure: 0.88,
    ground: false,
    grade: { sat: 0, contrast: 1.45, tint: [1, 1, 1], grain: 0.13, vignette: 0.42 },
  };
}
// Música: la más oscura, en Do menor
export const MUSIC = { chords: [[36, 43, 48, 51, 55], [32, 39, 44, 48, 51], [35, 42, 47, 50, 53], [31, 38, 43, 47, 50]] };
export const CLOUDS = { lit: '#333333', shade: '#000000', layout() {} };

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], geos = [];
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const concrete = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.concrete, color: '#5e5e5e', roughness: 0.92 }), { scale: 1 / 14 }));
  const beamM = mat(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false }));
  const edgeM = mat(new THREE.LineBasicMaterial({ color: '#f2f2f2' }));
  const sun = new THREE.Vector3(...SUN).normalize();
  // caja orientada: centro c, medias medidas h y ejes a, b, n (pueden no ser perpendiculares: los haces van inclinados)
  const obox = (c, h, a, b, n) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeBasis(v3(a), v3(b), v3(n)).setPosition(c.x, c.y, c.z));
  const chunks = new Map(), add = (g, p) => { const k = `${Math.floor(p.x / 200)},${Math.floor(p.z / 200)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(g); };
  const beams = [];

  for (const d of T.decor) {
    if (d.kind === 'seg') {
      const { P, t: tg, Rh, U, W, H, type } = d, C = P.clone().addScaled(tg, 5), th = 3;
      add(obox(C.clone().addScaled(U, -H - th), new THREE.Vector3(W + th * 2, th, 6.5), Rh, U, tg), C);
      for (const sd of [-1, 1]) add(obox(C.clone().addScaled(Rh, sd * (W + th)), new THREE.Vector3(th, H + th * 2, 6.5), Rh, U, tg), C);
      // techo: lamas en los pasillos (hueco de 2,5 m), vigas en las salas (hueco de 7 m), nada en el pozo
      const gap = type === 'c' ? 2.5 : type === 'h' ? 7 : 20;
      if (type !== 'p') add(obox(C.clone().addScaled(U, H + th).addScaled(tg, gap / 2), new THREE.Vector3(W + th * 2, th, (10 - gap) / 2 + 0.05), Rh, U, tg), C);
      // vigas longitudinales en las salas (lucernarios en cuadrícula)
      if (type === 'h') for (const l of [-W / 3, W / 3]) add(obox(C.clone().addScaled(U, H + th - 1).addScaled(Rh, l), new THREE.Vector3(1.5, th + 1, 6.5), Rh, U, tg), C);
      // el haz de luz que baja por el hueco
      const top = C.clone().addScaled(U, H).addScaled(tg, -5 + gap / 2), len = (2 * H) / Math.max(0.5, sun.y);
      if (type !== 'p' || d.s % 20 === 0) beams.push(obox(top.clone().addScaled(sun, -len / 2), new THREE.Vector3(W * 0.98, len / 2, gap / 2), Rh, sun, tg));
    } else if (d.kind === 'bulk') add(obox(d.c, d.h, d.Rh, d.U, d.t), d.c);
    else if (d.kind === 'pillar') { const h = d.b.y - d.a.y; add(new THREE.CylinderGeometry(d.r, d.r, h, 16).toNonIndexed().translate(d.a.x, (d.a.y + d.b.y) / 2, d.a.z), d.a); }
    else if (d.kind === 'block') add(new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeRotationY(d.yaw)).translate(d.c.x, d.c.y, d.c.z), d.c);
  }
  for (const list of chunks.values()) { const m = new THREE.Mesh(own(mergeGeometries(list)), concrete); m.castShadow = m.receiveShadow = true; root.add(m); }
  if (beams.length) { const m = new THREE.Mesh(own(mergeGeometries(beams)), beamM); m.renderOrder = 2; root.add(m); }

  // ---------- obstáculos que se mueven ----------
  const movers = [], unit = own(new THREE.BoxGeometry(2, 2, 2)), unitEdges = own(new THREE.EdgesGeometry(unit)), basis = new THREE.Matrix4(), sc = new THREE.Matrix4();
  const piece = () => { const g = new THREE.Group(), m = new THREE.Mesh(unit, concrete), e = new THREE.LineSegments(unitEdges, edgeM); m.castShadow = true; g.add(m, e); g.matrixAutoUpdate = false; root.add(g); return g; };
  const placeObb = (g, c) => { basis.makeBasis(v3(c.ax), v3(c.ay), v3(c.az)).setPosition(c.c.x, c.c.y, c.c.z); g.matrix.copy(basis).multiply(sc.makeScale(c.h.x, c.h.y, c.h.z)); };
  for (const m of T.movers) {
    if (m.kind === 'door' || m.kind === 'swing') {
      const gs = m.cols.map(() => piece());
      movers.push(() => m.cols.forEach((c, i) => placeObb(gs[i], c)));
      if (m.kind === 'swing') {
        const rope = new THREE.Mesh(own(new THREE.CylinderGeometry(0.4, 0.4, 1, 6).translate(0, -0.5, 0)), concrete); root.add(rope);
        const dn = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
        movers.push(() => { const c = m.cols[0]; rope.position.copy(v3(m.pivot)); dn.set(c.c.x - m.pivot.x, c.c.y - m.pivot.y, c.c.z - m.pivot.z); const len = dn.length(); rope.quaternion.setFromUnitVectors(down, dn.normalize()); rope.scale.set(1, len, 1); });
      }
    } else {
      const g = piece(), c = m.cols[0], Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
      movers.push(() => { g.matrix.compose(v3(c.c), Q.setFromAxisAngle(Y, c.yaw), v3(c.h)); });
    }
  }
  return { update() { for (const f of movers) f(); }, dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
