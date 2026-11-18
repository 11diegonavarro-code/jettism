// Kit de formas abstractas (lo que se ve): diez tipos de figuras irregulares, seis variantes de cada una (hechas por
// código con ruido, curvas y tornos), dibujadas con instancias (cientos de piezas con pocas llamadas de dibujo) y con el
// color de la paleta de cada mapa. Pinceladas en la superficie para que parezcan pintadas y no de plástico.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { rng } from '../math.js';
import { ART_KINDS } from './art.js';

// ruido suave 3D (suma de senos con fases de la semilla): barato y sin costuras
function noise3(seed) {
  const R = rng(seed), f = Array.from({ length: 6 }, () => [R() * 2 + 0.6, R() * 2 + 0.6, R() * 2 + 0.6, R() * 6.28]);
  return (x, y, z) => f.reduce((a, [p, q, r, ph], i) => a + Math.sin(x * p + y * q + z * r + ph) / (i + 1.5), 0) * 0.5;
}
const curve = (R, n, spread, up = 0) => { const pts = []; let p = new THREE.Vector3(); for (let i = 0; i < n; i++) { pts.push(p.clone()); p = p.add(new THREE.Vector3((R() - 0.5) * spread, up + (R() - 0.3) * spread, (R() - 0.5) * spread)); } return new THREE.CatmullRomCurve3(pts); };
// tubo de radio variable a lo largo de una curva
function tube(cv, r0, r1, seg = 48, rad = 10) {
  const g = new THREE.TubeGeometry(cv, seg, 1, rad, false), p = g.attributes.position, n = g.attributes.normal, pt = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) { const f = i / seg, r = r0 + (r1 - r0) * f; cv.getPointAt(f, pt); for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; p.setXYZ(k, pt.x + n.getX(k) * r, pt.y + n.getY(k) * r, pt.z + n.getZ(k) * r); } }
  return g;
}
// esfera de vértices compartidos (para que la superficie salga suave y no a facetas), con coordenadas de textura esféricas
function smoothSphere() {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, 5).deleteAttribute('normal').deleteAttribute('uv')), p = g.attributes.position, uv = [];
  for (let i = 0; i < p.count; i++) uv.push(Math.atan2(p.getZ(i), p.getX(i)) / (Math.PI * 2) + 0.5, Math.asin(Math.max(-1, Math.min(1, p.getY(i)))) / Math.PI + 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
const MAKERS = {
  // roca de cueva: menos detalle (hay miles) y ruido más fuerte, con estratos
  rock(R, s) { const g = mergeVertices(new THREE.IcosahedronGeometry(1, 3).deleteAttribute('normal').deleteAttribute('uv')), N = noise3(s), p = g.attributes.position, v = new THREE.Vector3(), uv = []; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + N(v.x * 1.3, v.y * 1.3, v.z * 1.3) * 0.7 + Math.sin(v.y * 9 + s) * 0.04; p.setXYZ(i, v.x * k * 1.15, v.y * k * 0.85, v.z * k); uv.push(Math.atan2(v.z, v.x) / 6.28 + 0.5, v.y * 0.5 + 0.5); } g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g; },
  blob(R, s) { const g = smoothSphere(), N = noise3(s), p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + N(v.x * 1.6, v.y * 1.6, v.z * 1.6) * 0.55 + N(v.x * 4, v.y * 4, v.z * 4) * 0.12; p.setXYZ(i, v.x * k, v.y * k * (0.7 + R() * 0.02), v.z * k); } g.computeVertexNormals(); return g; },
  ribbon(R) { const cv = curve(R, 6, 1.4, 0.3), seg = 80, w = 0.35 + R() * 0.3, tw = (R() - 0.5) * 10, pos = [], idx = [], pt = new THREE.Vector3(), tg = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
    for (let i = 0; i <= seg; i++) { const f = i / seg; cv.getPointAt(f, pt); cv.getTangentAt(f, tg); side.crossVectors(tg, up).normalize().applyAxisAngle(tg, tw * f); const ww = w * Math.sin(Math.PI * Math.min(1, f * 1.2 + 0.05)); pos.push(pt.x + side.x * ww, pt.y + side.y * ww, pt.z + side.z * ww, pt.x - side.x * ww, pt.y - side.y * ww, pt.z - side.z * ww); if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g; },
  tendril(R) { return tube(curve(R, 7, 1.2, 0.4), 0.22 + R() * 0.1, 0.02); },
  vase(R, s) { const pts = [], n = 18, N = noise3(s); for (let i = 0; i <= n; i++) { const f = i / n; pts.push(new THREE.Vector2(0.15 + 0.6 * Math.abs(Math.sin(f * Math.PI * (1 + R() * 0.05) + N(f * 3, 0, 0))) + 0.1 * N(0, f * 5, 0), f * 2 - 1)); } const g = new THREE.LatheGeometry(pts, 40), p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); p.setX(i, v.x + Math.sin(v.y * 2.5 + s) * 0.18); } g.computeVertexNormals(); return g; },
  shard(R) { const pts = []; for (let i = 0; i < 14; i++) pts.push(new THREE.Vector3((R() - 0.5) * 0.7, (R() - 0.5) * 2.2, (R() - 0.5) * 0.7)); return new ConvexGeometry(pts); },
  petal(R) { const sh = new THREE.Shape(), w = 0.3 + R() * 0.35; sh.moveTo(0, -1); sh.bezierCurveTo(w * 2, -0.4, w * 1.6, 0.6, 0, 1); sh.bezierCurveTo(-w * 1.6, 0.6, -w * 2, -0.4, 0, -1); const g = new THREE.ShapeGeometry(sh, 16), p = g.attributes.position, bend = 0.6 + R() * 0.8; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.pow(y + 1, 2) * 0.25 * bend - x * x * 0.8); } g.computeVertexNormals(); return g; },
  drip(R, s) { const g = MAKERS.blob(R, s), p = g.attributes.position, v = new THREE.Vector3(), N = noise3(s + 3); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.y < 0) { const d = Math.max(0, N(v.x * 3, 0, v.z * 3)) * 2.2; p.setY(i, v.y - d * -v.y); p.setX(i, v.x * (1 - d * 0.35)); p.setZ(i, v.z * (1 - d * 0.35)); } } g.computeVertexNormals(); return g; },
  knot(R, s) { const g = new THREE.TorusKnotGeometry(0.7, 0.18 + R() * 0.1, 160, 14, 2 + Math.floor(R() * 3), 3 + Math.floor(R() * 4)), N = noise3(s), p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + N(v.x * 2, v.y * 2, v.z * 2) * 0.25; p.setXYZ(i, v.x * k, v.y * k * 1.2, v.z * k); } g.computeVertexNormals(); return g; },
  shell(R) { const pts = [], turns = 2 + R() * 2; for (let i = 0; i <= 60; i++) { const f = i / 60, a = f * turns * Math.PI * 2, r = 0.1 + f * 0.8; pts.push(new THREE.Vector3(Math.cos(a) * r, (1 - f) * 1.2 - 0.6, Math.sin(a) * r)); } return tube(new THREE.CatmullRomCurve3(pts), 0.03, 0.35, 90, 12); },
  coral(R) { const parts = []; const grow = (p, dir, len, r, d) => { if (d > 3 || r < 0.03) return; const end = p.clone().addScaledVector(dir, len), mid = p.clone().lerp(end, 0.5).add(new THREE.Vector3((R() - 0.5) * len * 0.3, 0, (R() - 0.5) * len * 0.3)); parts.push(tube(new THREE.CatmullRomCurve3([p, mid, end]), r, r * 0.65, 10, 7)); for (let k = 0; k < 2 + (R() < 0.4 ? 1 : 0); k++) { const nd = dir.clone().add(new THREE.Vector3((R() - 0.5) * 1.4, R() * 0.5, (R() - 0.5) * 1.4)).normalize(); grow(end, nd, len * 0.7, r * 0.65, d + 1); } }; grow(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 1, 0), 0.9, 0.16, 0); return mergeGeometries(parts.map(g => g.toNonIndexed())); },
};
// deja cada figura centrada y con radio 1
function normalize(g) { g.computeBoundingSphere(); const b = g.boundingSphere; g.translate(-b.center.x, -b.center.y, -b.center.z); g.scale(1 / b.radius, 1 / b.radius, 1 / b.radius); g.computeBoundingSphere(); return g; }
let CACHE = null;
function geometries() {
  if (CACHE) return CACHE;
  CACHE = {};
  for (const k of ART_KINDS) CACHE[k] = Array.from({ length: 6 }, (_, v) => { const g = MAKERS[k](rng(1000 + v * 37 + k.length * 101), v * 7 + k.length); return normalize(g.index ? g : g); });
  return CACHE;
}
// pinceladas en escala de grises (se tiñen con el color de cada pieza)
let BRUSH = null;
function brushTexture() {
  if (BRUSH) return BRUSH;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = rng(77);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) { const v = 150 + R() * 105, a = R() * 6.28, l = 6 + R() * 26; g.strokeStyle = `rgba(${v},${v},${v},0.5)`; g.lineWidth = 2 + R() * 5; g.lineCap = 'round'; const x = R() * 256, y = R() * 256; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.6, y + Math.sin(a + 0.6) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  BRUSH = new THREE.CanvasTexture(c); BRUSH.wrapS = BRUSH.wrapT = THREE.RepeatWrapping; BRUSH.colorSpace = THREE.SRGBColorSpace; BRUSH.anisotropy = 4;
  return BRUSH;
}

// Dibuja las piezas 'art' de la decoración. palette: colores; o: { rough, metal, emissive (0..1), quality }
export function artLayer(cv, palette, o = {}) {
  const T = cv.track, items = T.decor.filter(d => d.kind === 'art'), G = geometries(), owned = [], root = cv.group;
  const keep = cv.quality?.name === 'baja' ? (i => i % 2 === 0) : () => true;
  const cols = palette.map(c => new THREE.Color(c));
  const mats = {};
  const matFor = kind => mats[kind] || (mats[kind] = (() => {
    const m = new THREE.MeshStandardMaterial({ map: brushTexture(), roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.05, side: kind === 'ribbon' || kind === 'petal' ? THREE.DoubleSide : THREE.FrontSide });
    if (o.emissive) { m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = o.emissive; m.emissiveMap = brushTexture(); }
    owned.push(m); return m;
  })());
  const groups = new Map();
  items.forEach((d, i) => { if (!keep(i) && !d.cave) return; const key = d.art + '|' + d.v + (d.cave ? '|c' : ''); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(d); });
  const ob = new THREE.Object3D();
  for (const [key, list] of groups) {
    const [art, v, cave] = key.split('|'), I = new THREE.InstancedMesh(G[art][+v], matFor(art), list.length);
    list.forEach((d, i) => {
      ob.position.set(d.p.x, d.p.y, d.p.z); ob.rotation.set(d.upright ? (d.rot[0] - 3.14) * 0.15 : d.rot[0], d.rot[1], d.upright ? (d.rot[2] - 3.14) * 0.15 : d.rot[2]); ob.scale.setScalar(d.s); ob.updateMatrix();
      I.setMatrixAt(i, ob.matrix); I.setColorAt(i, cols[d.ci % cols.length]);
    });
    I.castShadow = !cave; I.receiveShadow = true; I.computeBoundingSphere(); root.add(I);
  }
  return { dispose() { for (const m of owned) m.dispose(); } };
}
