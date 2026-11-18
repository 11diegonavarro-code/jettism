// Rostro: lo que se ve. La cara es un plano pintado por código (piel con remiendos de estampados: anillos, cuadros,
// rayas, triángulos y puntos, cejas, mejillas y sombras) con los agujeros de la boca y los ojos recortados; por detrás,
// las cajas de la máscara con estampado. Dientes blancos, labios rojos, nariz, ojos con blanco, iris y venas, pelo de
// bolas estampadas. El campo: cubos isométricos de tres tonos, planetas con anillos, engranajes, setas de lunares,
// pilares de ajedrez y esferas estampadas. Cielo azul intenso y luz de mediodía.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { opTexture, checkerTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';
import { FACE } from './rostro.js';
import { artLayer } from './art-view.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
const PAL = ['#e8432f', '#ffcf3a', '#2f6fe0', '#21b573', '#ff6fb5', '#1a1a1a', '#f4f1ea', '#7a3cff', '#ff8a1a'];
// la cara: 1024 de ancho por la proporción de la máscara, con los agujeros transparentes
function faceTexture() {
  const W = 1024, Hh = Math.round((1024 * FACE.H) / (FACE.x1 - FACE.x0)), c = document.createElement('canvas'), R = rng(98);
  c.width = W; c.height = Hh;
  const g = c.getContext('2d'), sx = W / (FACE.x1 - FACE.x0), X = x => (x - FACE.x0) * sx, Yy = y => Hh - y * sx;
  const grd = g.createRadialGradient(W / 2, Hh * 0.5, 50, W / 2, Hh * 0.5, W * 0.75); grd.addColorStop(0, '#f2c39c'); grd.addColorStop(1, '#c98a62');
  g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
  // remiendos de estampados
  const pattern = (x, y, w, h, kind, a, b) => {
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = a; g.fillRect(x, y, w, h); g.fillStyle = b; g.strokeStyle = b;
    if (kind === 0) for (let r = Math.max(w, h); r > 0; r -= 10) { g.lineWidth = 5; g.beginPath(); g.arc(x + w / 2, y + h / 2, r, 0, 6.28); g.stroke(); }
    else if (kind === 1) for (let i = 0; i < w; i += 14) for (let j = 0; j < h; j += 14) { if (((i + j) / 14) % 2 === 0) g.fillRect(x + i, y + j, 14, 14); }
    else if (kind === 2) for (let i = -h; i < w; i += 16) { g.lineWidth = 7; g.beginPath(); g.moveTo(x + i, y); g.lineTo(x + i + h, y + h); g.stroke(); }
    else if (kind === 3) for (let i = 0; i < w; i += 20) for (let j = 0; j < h; j += 20) { g.beginPath(); g.moveTo(x + i, y + j + 18); g.lineTo(x + i + 10, y + j); g.lineTo(x + i + 20, y + j + 18); g.fill(); }
    else for (let i = 6; i < w; i += 16) for (let j = 6; j < h; j += 16) { g.beginPath(); g.arc(x + i, y + j, 4, 0, 6.28); g.fill(); }
    g.restore(); g.lineWidth = 4; g.strokeStyle = '#1a1a1a'; g.strokeRect(x, y, w, h);
  };
  for (let k = 0; k < 70; k++) { const w = 30 + R() * 120, h = 30 + R() * 120; pattern(R() * (W - w), R() * (Hh - h), w, h, Math.floor(R() * 5), PAL[Math.floor(R() * PAL.length)], PAL[Math.floor(R() * PAL.length)]); }
  // mejillas, cejas y sombras de la cara
  g.fillStyle = 'rgba(255,90,120,0.35)'; for (const x of [-150, 150]) { g.beginPath(); g.ellipse(X(x), Yy(200), 70, 45, 0, 0, 6.28); g.fill(); }
  g.strokeStyle = '#2a1a10'; g.lineWidth = 26; g.lineCap = 'round';
  for (const e of FACE.eyes) { g.beginPath(); g.arc(X(e.x), Yy(e.y - 40), 95, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
  // los blancos de los ojos con venas, alrededor del agujero
  for (const e of FACE.eyes) {
    g.fillStyle = '#fbf6ee'; g.beginPath(); g.ellipse(X(e.x), Yy(e.y), e.h * 2.1 * sx, e.h * 1.5 * sx, 0, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(200,30,40,0.6)'; g.lineWidth = 2;
    for (let k = 0; k < 18; k++) { const a = R() * 6.28, r0 = e.h * 2.0 * sx; g.beginPath(); g.moveTo(X(e.x) + Math.cos(a) * r0, Yy(e.y) + Math.sin(a) * r0 * 0.7); for (let j = 0; j < 4; j++) g.lineTo(X(e.x) + Math.cos(a + (R() - 0.5) * 0.3) * r0 * (0.9 - j * 0.1), Yy(e.y) + Math.sin(a + (R() - 0.5) * 0.3) * r0 * 0.7 * (0.9 - j * 0.1)); g.stroke(); }
    g.fillStyle = '#3f8f6a'; g.beginPath(); g.arc(X(e.x), Yy(e.y), e.h * 1.35 * sx, 0, 6.28); g.fill();
    g.fillStyle = '#d9a640'; g.beginPath(); g.arc(X(e.x), Yy(e.y), e.h * 1.15 * sx, 0, 6.28); g.fill();
  }
  // la boca: oscuro alrededor del agujero
  g.fillStyle = '#5a0f18'; g.beginPath(); g.ellipse(X(FACE.mouth.x), Yy(FACE.mouth.y), (FACE.mouth.hw + 6) * sx, (FACE.mouth.hh + 6) * sx, 0, 0, 6.28); g.fill();
  // agujeros transparentes
  g.globalCompositeOperation = 'destination-out';
  const M = FACE.mouth; g.fillRect(X(M.x - M.hw), Yy(M.y + M.hh), M.hw * 2 * sx, M.hh * 2 * sx);
  for (const e of FACE.eyes) { g.beginPath(); g.arc(X(e.x), Yy(e.y), e.h * sx, 0, 6.28); g.fill(); }
  // contorno de la cara: lo de fuera del óvalo también es transparente
  g.beginPath(); g.rect(0, 0, W, Hh); g.ellipse(W / 2, Hh * 0.52, W * 0.5, Hh * 0.5, 0, 0, Math.PI * 2); g.fill('evenodd');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
let TEX = null;
const tex = () => TEX || (TEX = {
  face: faceTexture(),
  pats: [
    opTexture({ kind: 'rings', colors: ['#e8432f', '#ffcf3a', '#2f6fe0', '#f4f1ea'], bands: 12, seed: 101 }),
    opTexture({ kind: 'zebra', colors: ['#1a1a1a', '#f4f1ea', '#ff6fb5'], bands: 12, seed: 102 }),
    opTexture({ kind: 'rainbow', colors: ['#21b573', '#ffcf3a', '#ff8a1a', '#e8432f', '#7a3cff'], bands: 14, seed: 103 }),
    opTexture({ kind: 'spiral', colors: ['#2f6fe0', '#f4f1ea', '#e8432f'], bands: 9, seed: 104 }),
  ],
  check: checkerTexture(8),
});

export function atmo() {
  return {
    sky: { zenith: '#1f6fd6', mid: '#69b4f2', horizon: '#ffe9b0', ground: '#ff9a3a', sun: '#fffbe8', clouds: 0.2, sunDisc: 1 },
    sunDir: [0.3, 0.75, 0.6], sunColor: '#fff3dc', sunIntensity: 3.6,
    hemiSky: '#cfe6ff', hemiGround: '#ffb07a', hemiIntensity: 0.85,
    fog: { color: '#ffe2bd', density: 0.0003 },
    exposure: 1.02,
    ground: { color: '#ffffff', map: opTexture({ kind: 'zebra', colors: ['#ff8a1a', '#ffcf3a', '#e8432f', '#ffcf3a'], bands: 10, seed: 105 }), repeat: 300, roughness: 0.9 },
    grade: { sat: 1.2, contrast: 1.1, tint: [1.02, 1.0, 0.98], grain: 0.015, vignette: 0.8 },
  };
}
// Música: alegre y loca, en Re mayor
export const MUSIC = { chords: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]] };
export const CLOUDS = {
  lit: '#ffffff', shade: '#ffc7a0',
  layout(cluster, R) {
    for (let k = 0; k < 24; k++) { const a = R() * Math.PI * 2, d = 900 + R() * 1400; cluster(Math.cos(a) * d, 520 + R() * 400, -100 + Math.sin(a) * d, 8, 130, 180, 0.35); }
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 3000 + R() * 2000; cluster(Math.cos(a) * d, 300 + R() * 600, -100 + Math.sin(a) * d, 8, 300, 420, 0.3); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], geos = [], R = rng(99), F = FACE;
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const patM = t.pats.map(m => mat(triplanar(new THREE.MeshStandardMaterial({ map: m, roughness: 0.55 }), { scale: 1 / 30 })));
  const patS = t.pats.map(m => mat(new THREE.MeshStandardMaterial({ map: m, roughness: 0.45 })));
  const white = mat(new THREE.MeshStandardMaterial({ color: '#fbf8f0', roughness: 0.25 }));
  const lipM = mat(new THREE.MeshStandardMaterial({ color: '#d0202e', roughness: 0.35 }));
  const skin = mat(new THREE.MeshStandardMaterial({ color: '#e7ad84', roughness: 0.6 }));
  const checkM = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.check, roughness: 0.5 }), { scale: 1 / 12 }));
  const Y = new THREE.Vector3(0, 1, 0), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), o = new THREE.Object3D();
  const mesh = (g, m) => { const me = new THREE.Mesh(own(g), m); me.castShadow = me.receiveShadow = true; root.add(me); return me; };
  const D = T.decor;

  // ---------- la cara ----------
  // la cara en relieve: cejas, pómulos, mentón, frente y cuencas de los ojos, más bultos de collage
  {
    const W = F.x1 - F.x0, g = new THREE.PlaneGeometry(W, F.H, 200, 240), pos = g.attributes.position, cx = (F.x0 + F.x1) / 2;
    const bump = (x, y, bx, by, rx, ry, h) => h * Math.exp(-(((x - bx) / rx) ** 2) - (((y - by) / ry) ** 2));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, y = pos.getY(i) + F.H / 2;
      let z = bump(x, y, 0, F.H * 0.88, 230, 120, 16) + bump(x, y, -150, 210, 70, 60, 14) + bump(x, y, 150, 210, 70, 60, 14) + bump(x, y, 0, 18, 110, 60, 18);
      for (const e of F.eyes) { z += bump(x, y, e.x, e.y + 70, 90, 22, 12) - bump(x, y, e.x, e.y, 75, 65, 10); }
      z += Math.sin(x * 0.09) * Math.sin(y * 0.07) * 2.2 + Math.sin(x * 0.031 + y * 0.02) * 3;
      // los bordes de los agujeros quedan pegados a la máscara
      const near = Math.min(...F.eyes.map(e => Math.hypot(x - e.x, y - e.y) - e.h), Math.max(Math.abs(x - F.mouth.x) - F.mouth.hw, Math.abs(y - F.mouth.y) - F.mouth.hh));
      pos.setZ(i, Math.max(0, z) * Math.min(1, Math.max(0, near) / 25));
    }
    g.computeVertexNormals();
    const face = new THREE.Mesh(own(g), mat(new THREE.MeshStandardMaterial({ map: t.face, alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide })));
    face.position.set(cx, F.H / 2, F.z + 0.5); face.castShadow = face.receiveShadow = true; root.add(face);
  }
  mesh(mergeGeometries(D.filter(d => d.kind === 'mask').map(d => new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2 - 1.2).translate(d.c.x, d.c.y, d.c.z - 0.6))), patM[2]);
  mesh(mergeGeometries(D.filter(d => d.kind === 'tooth').map(d => new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2).translate(d.c.x, d.c.y, d.c.z))), white);
  for (const d of D.filter(x => x.kind === 'nose')) { const m = new THREE.Mesh(own(new THREE.SphereGeometry(1, 40, 28)), skin); m.position.copy(v3(d.c)); m.scale.set(d.r.x, d.r.y, d.r.z); m.castShadow = true; root.add(m); }
  for (const d of D.filter(x => x.kind === 'lips')) { const m = new THREE.Mesh(own(new THREE.TorusGeometry(1, 0.2, 16, 64)), lipM); m.position.set(d.x, d.y, d.z); m.scale.set(d.rx, d.ry, d.ry * 0.9); m.castShadow = true; root.add(m); }
  // iris: aro verde y dorado dentro de cada agujero del ojo
  for (const e of F.eyes) { const m = new THREE.Mesh(own(new THREE.TorusGeometry(e.h + 2, 4, 12, 64)), mat(new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.3 }))); m.position.set(e.x, e.y, F.z + 2); root.add(m); }

  // ---------- el campo: el kit de formas irregulares con la paleta del collage ----------
  const art = artLayer(cv, PAL.filter(c => c !== '#1a1a1a').concat(['#ff3b6f', '#00c2b8']), { rough: 0.5 });
  const sph = own(new THREE.SphereGeometry(1, 32, 20));
  const inst = (geo, m, list, set) => { if (!list.length) return null; const I = new THREE.InstancedMesh(geo, m, list.length); list.forEach((d, i) => { set(d); o.updateMatrix(); I.setMatrixAt(i, o.matrix); }); I.castShadow = I.receiveShadow = true; root.add(I); return I; };
  // setas de lunares y pilares de ajedrez
  const stems = [], pillars = [];
  for (const d of D) {
    if (d.kind === 'mush') stems.push(new THREE.CylinderGeometry(d.r, d.r * 1.2, d.b.y - d.a.y, 12).toNonIndexed().translate(d.a.x, (d.a.y + d.b.y) / 2, d.a.z));
    else if (d.kind === 'pillar') pillars.push(new THREE.CylinderGeometry(d.r, d.r, d.b.y - d.a.y, 16).toNonIndexed().translate(d.a.x, (d.a.y + d.b.y) / 2, d.a.z));
  }
  if (stems.length) mesh(mergeGeometries(stems), white);
  if (pillars.length) mesh(mergeGeometries(pillars), checkM);
  const capGeo = own(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2));
  for (let k = 0; k < 4; k++) inst(capGeo, patS[k], D.filter(d => d.kind === 'mush' && d.tex === k), d => { o.position.set(d.b.x, d.b.y - 1, d.b.z); o.scale.set(d.cap, d.cap * 0.7, d.cap); o.rotation.set(0, 0, 0); });

  // ---------- la mandíbula y los planetas que orbitan ----------
  const movers = [];
  for (const m of T.movers) {
    const c = m.cols[0];
    if (m.kind === 'jaw') {
      const g = new THREE.Group();
      for (let k = 0; k < 8; k++) { const tooth = new THREE.Mesh(own(new THREE.BoxGeometry(18, 22, 16)), white); tooth.position.x = -c.h.x + 9 + k * (c.h.x * 2 - 18) / 7; tooth.castShadow = true; g.add(tooth); }
      root.add(g);
      movers.push(() => g.position.set(c.c.x, c.c.y, c.c.z));
    } else {
      const me = new THREE.Mesh(sph, patS[m.tex % 4]); me.scale.setScalar(c.r); me.castShadow = true; root.add(me);
      const ring = new THREE.Mesh(own(new THREE.RingGeometry(1.3, 2, 40).rotateX(-Math.PI / 2.4)), mat(new THREE.MeshStandardMaterial({ color: '#ff6fb5', side: THREE.DoubleSide }))); me.add(ring); // el planeta ya está escalado
      movers.push(() => { me.position.set(c.c.x, c.c.y, c.c.z); me.rotation.y += 0.01; });
    }
  }
  return { update() { for (const f of movers) f(); }, dispose() { art.dispose(); for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
