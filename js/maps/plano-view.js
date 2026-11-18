// Plano anotado: lo que se ve. Ciudad gris de hormigón con fachadas de ventanas, cielo cubierto y mucho grano; la
// corrección de color deja en gris todo menos el rojo. Las anotaciones del plano son rojas: cotas con sus remates
// que cruzan las calles, líneas de fuga hacia un punto del cielo, cajas de anotación y los obstáculos (cajas que se
// llenan y parpadean, láseres y el barrido de la plaza).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';
import { VP } from './plano.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
// fachada: 4 plantas × 4 ventanas; la esquina (0,0) es pared lisa (ahí caen los tejados)
function facadeTexture(seed) {
  const c = document.createElement('canvas'), N = 256, cell = N / 4, R = rng(seed);
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.fillStyle = '#8c8b87'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 3000; i++) { const k = 110 + R() * 60; g.fillStyle = `rgba(${k},${k},${k - 4},0.25)`; g.fillRect(R() * N, R() * N, 2, 2); }
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * cell, y = j * cell, lit = R() < 0.15;
    g.fillStyle = '#5e5d5a'; g.fillRect(x + 8, y + cell - 12, cell - 16, 4); // alféizar
    g.fillStyle = lit ? '#d8d6cc' : '#25282b'; g.fillRect(x + 12, y + 12, cell - 24, cell - 26);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 12, y + 12, (cell - 24) * 0.45, cell - 26);
    g.fillStyle = '#6d6c68'; g.fillRect(x + cell / 2 - 1, y + 12, 2, cell - 26); // parteluz
  }
  g.fillStyle = '#8c8b87'; g.fillRect(0, 0, 8, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let TEX = null;
const tex = () => TEX || (TEX = {
  facade: facadeTexture(61),
  ground: noiseTexture({ size: 512, kind: 'concrete', seed: 62 }),
  roof: noiseTexture({ size: 256, kind: 'concrete', seed: 63 }),
});

export function atmo() {
  return {
    sky: { zenith: '#6e7276', mid: '#9a9da0', horizon: '#c4c4c0', ground: '#4a4a4a', sun: '#e8e8e4', clouds: 0.8, sunDisc: 0 },
    sunDir: [0.35, 0.8, 0.45], sunColor: '#e6e6e2', sunIntensity: 1.5,
    hemiSky: '#c8cacc', hemiGround: '#3a3a3a', hemiIntensity: 0.85,
    fog: { color: '#9a9c9e', density: 0.0012 },
    exposure: 0.84,
    ground: { color: '#8a8a88', map: tex().ground, repeat: 900, roughness: 0.95 },
    grade: { sat: 0.04, contrast: 1.28, tint: [1, 1, 1], grain: 0.11, keepRed: 1, vignette: 0.58 },
  };
}
// Música: fría y mecánica, en Fa sostenido menor
export const MUSIC = { chords: [[42, 49, 54, 57, 61], [38, 45, 50, 54, 57], [40, 47, 52, 55, 59], [37, 44, 49, 52, 56]] };
export const CLOUDS = {
  lit: '#b8b8b6', shade: '#5a5c5e',
  layout(cluster, R) {
    for (let k = 0; k < 40; k++) { const a = R() * Math.PI * 2, d = 400 + R() * 1800; cluster(240 + Math.cos(a) * d, 380 + R() * 200, -180 + Math.sin(a) * d, 8, 180, 240, 0.4); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], geos = [], R = rng(64);
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const facade = mat(new THREE.MeshStandardMaterial({ map: t.facade, roughness: 0.85 }));
  const roof = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.roof, color: '#9a9a96', roughness: 0.9 }), { scale: 1 / 20 }));
  const red = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff1a12').multiplyScalar(1.6) }));
  const redLine = mat(new THREE.LineBasicMaterial({ color: '#ff2418' }));
  const redFar = mat(new THREE.LineBasicMaterial({ color: '#ff2418', transparent: true, opacity: 0.55, fog: false }));
  const fill = mat(new THREE.MeshBasicMaterial({ color: '#ff1a12', transparent: true, opacity: 0.55, depthWrite: false }));
  const gray = mat(new THREE.MeshStandardMaterial({ color: '#77777a', roughness: 0.6, metalness: 0.4 }));

  // ---------- edificios: cajas con la fachada repetida por plantas (4 m) y ventanas (7 m), unidas por zonas ----------
  const chunks = new Map(), add = (g, x, z) => { const k = `${Math.floor(x / 200)},${Math.floor(z / 200)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(g); };
  const bldg = d => {
    const w = d.h.x * 2, h = d.h.y * 2, dz = d.h.z * 2, g = new THREE.BoxGeometry(w, h, dz), uv = g.attributes.uv;
    // caras: +x, −x, +y, −y, +z, −z (4 vértices cada una)
    const rep = [[dz / 28, h / 16], [dz / 28, h / 16], [0, 0], [0, 0], [w / 28, h / 16], [w / 28, h / 16]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * rep[f][0], uv.getY(i) * rep[f][1]); }
    return g.translate(d.c.x, d.c.y, d.c.z);
  };
  const roofs = [];
  for (const d of T.decor) {
    if (d.kind === 'bldg' || d.kind === 'far') add(bldg(d), d.c.x, d.c.z);
    else if (d.kind === 'roof') roofs.push(new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2).translate(d.c.x, d.c.y, d.c.z));
  }
  for (const list of chunks.values()) { const m = new THREE.Mesh(own(mergeGeometries(list)), facade); m.castShadow = m.receiveShadow = true; root.add(m); }
  if (roofs.length) { const m = new THREE.Mesh(own(mergeGeometries(roofs)), roof); m.castShadow = m.receiveShadow = true; root.add(m); }

  // ---------- anotaciones rojas ----------
  const Y = new THREE.Vector3(0, 1, 0), Qt = new THREE.Quaternion(), M = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  const rod = (a, b, r) => { const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length(); return new THREE.CylinderGeometry(r, r, len, 6, 1).toNonIndexed().applyMatrix4(M.compose(A.add(B).multiplyScalar(0.5), Qt.setFromUnitVectors(Y, d.normalize()), one)); };
  const reds = [], lines = [], far = [];
  for (const d of T.decor) {
    if (d.kind === 'cota') {
      reds.push(rod(d.a, d.b, 0.5));
      // remates: barritas verticales y flechas en los extremos
      for (const [p, q] of [[d.a, d.b], [d.b, d.a]]) {
        reds.push(rod({ x: p.x, y: p.y - 4, z: p.z }, { x: p.x, y: p.y + 4, z: p.z }, 0.35));
        const dir = v3(q).sub(v3(p)).normalize(), tip = new THREE.ConeGeometry(1.4, 4, 8).toNonIndexed();
        tip.applyMatrix4(M.compose(v3(p).addScaledVector(dir, 2), Qt.setFromUnitVectors(Y, dir.clone().negate()), one)); reds.push(tip);
      }
      // marcas cada 4 m
      const len = v3(d.a).distanceTo(v3(d.b));
      for (let k = 4; k < len - 2; k += 4) { const p = v3(d.a).lerp(v3(d.b), k / len); lines.push(p.x, p.y - 1, p.z, p.x, p.y + 1, p.z); }
    } else if (d.kind === 'vanish') far.push(d.a.x, d.a.y, d.a.z, VP.x, VP.y, VP.z);
    else if (d.kind === 'note') {
      const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2)).translate(d.c.x, d.c.y, d.c.z), p = e.attributes.position.array;
      for (let i = 0; i < p.length; i++) lines.push(p[i]);
      e.dispose();
    } else if (d.kind === 'mast') { const m = new THREE.Mesh(own(rod(d.a, d.b, 3)), gray); m.castShadow = true; root.add(m); }
  }
  if (reds.length) root.add(new THREE.Mesh(own(mergeGeometries(reds)), red));
  const seg = (arr, m) => { if (!arr.length) return; const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); root.add(new THREE.LineSegments(g, m)); };
  seg(lines, redLine); seg(far, redFar);
  // el punto de fuga: un aro rojo en el cielo
  { const ring = new THREE.Mesh(own(new THREE.TorusGeometry(40, 3, 8, 48)), mat(new THREE.MeshBasicMaterial({ color: '#ff2418', fog: false }))); ring.position.set(VP.x, VP.y, VP.z); ring.lookAt(240, 60, -180); root.add(ring); }
  void R;

  // ---------- obstáculos que se mueven ----------
  const movers = [], boxGeo = own(new THREE.BoxGeometry(2, 2, 2)), boxEdges = own(new THREE.EdgesGeometry(boxGeo));
  const beamGeo = own(new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0));
  for (const m of T.movers) {
    const c = m.cols[0];
    if (m.kind === 'note') {
      const g = new THREE.Group(), body = new THREE.Mesh(boxGeo, fill), edge = new THREE.LineSegments(boxEdges, redLine);
      g.add(body, edge); g.position.copy(v3(m.c0)); g.rotation.y = c.yaw; g.scale.set(c.h.x, c.h.y, c.h.z); root.add(g);
      let k = 0;
      movers.push(() => { k++; body.visible = m.solid && !(m.blink && (k >> 2) % 2); });
    } else {
      const beam = new THREE.Mesh(beamGeo, red); root.add(beam);
      const d = new THREE.Vector3();
      movers.push(() => { d.set(c.b.x - c.a.x, c.b.y - c.a.y, c.b.z - c.a.z); const len = d.length(); beam.position.set(c.a.x, c.a.y, c.a.z); beam.quaternion.setFromUnitVectors(Y, d.normalize()); beam.scale.set(c.r * 0.7, len, c.r * 0.7); });
    }
  }
  return { update() { for (const f of movers) f(); }, dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
