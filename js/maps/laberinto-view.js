// Laberinto de hormigón: lo que se ve. Hormigón visto con proyección triplanar, bloques unidos por zonas
// (pocas llamadas de dibujo), arcos extruidos con su hueco real, rampas con barandilla, miles de relieves, hornacinas
// y ventanas instanciados, haces de luz que entran por los huecos del techo, polvo flotando y farolillos en el sótano.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture, dotTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = { concrete: noiseTexture({ size: 512, kind: 'concrete', seed: 5 }), ground: noiseTexture({ size: 512, kind: 'concrete', seed: 9 }) });

export function atmo() {
  const t = tex();
  return {
    sky: { zenith: '#b9bdc2', mid: '#d6d8da', horizon: '#efeeea', ground: '#8f8c86', sun: '#fff8ec', clouds: 0.32, sunDisc: 0.35 },
    sunDir: [0.34, 0.84, -0.42], sunColor: '#fff6ea', sunIntensity: 4.4,
    hemiSky: '#dfe2e6', hemiGround: '#2c2b29', hemiIntensity: 0.36,
    fog: { color: '#cfcdc7', density: 0.0007 },
    exposure: 0.96,
    ground: { color: '#8a8780', map: t.ground, repeat: 3000, roughness: 0.95 },
    grade: { sat: 0.22, contrast: 1.24, tint: [1.03, 1.0, 0.965], grain: 0.05, vignette: 0.55 },
  };
}
// Música: más lenta y en Do menor
export const MUSIC = { bpm: 84, chords: [[48, 55, 60, 63, 67], [44, 51, 56, 60, 63], [41, 53, 56, 60, 63], [43, 50, 55, 59, 62]] };

// Degradado vertical para los haces de luz (blanco arriba, transparente abajo)
function shaftTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}
// Hueco en arco (ancho 1, alto 1,6 con medio punto) para hornacinas y ventanas
function archShape(w = 1, h = 1.6) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h - w / 2);
  s.absarc(0, h - w / 2, w / 2, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  return s;
}

export function buildView(cv) {
  const T = cv.track, root = cv.group, Q = cv.quality, R = rng(77), rr = (a, b) => a + R() * (b - a);
  const t = tex(), owned = [];
  const mat = m => { owned.push(m); return m; };
  const concrete = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.concrete, color: '#dedad2', roughness: 0.93 }), { scale: 1 / 17, dark: [120, 0.55] }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: '#232220', roughness: 1 }));
  const rail = mat(new THREE.MeshStandardMaterial({ color: '#3d3c39', roughness: 0.55, metalness: 0.6 }));
  const lamp = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8a').multiplyScalar(3.2) }));
  const shaftTex = shaftTexture();
  const shaftMat = mat(new THREE.MeshBasicMaterial({ map: shaftTex, color: '#fff3df', transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true }));
  owned.push(shaftTex);

  // ---------- piezas fijas unidas por zonas de 350 m (así se recortan bien fuera de cámara) ----------
  const chunks = new Map(), railGeos = [];
  const add = (geo, x, z) => { const k = `${Math.floor(x / 200)},${Math.floor(z / 200)}`; if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(geo); };
  const M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const boxGeo = (c, h, yaw) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(M.compose(v3(c), Qt.setFromAxisAngle(Y, yaw || 0), one));
  for (const d of T.decor) {
    if (d.kind === 'block') add(boxGeo(d.c, d.h, d.yaw), d.c.x, d.c.z);
    else if (d.kind === 'drum') { const g = new THREE.CylinderGeometry(d.r, d.r, d.b.y - d.a.y, 40, 1).toNonIndexed(); g.translate(d.a.x, (d.a.y + d.b.y) / 2, d.a.z); add(g, d.a.x, d.a.z); }
    else if (d.kind === 'arch') {
      const s = new THREE.Shape();
      s.moveTo(-d.h.x, -d.h.y); s.lineTo(d.h.x, -d.h.y); s.lineTo(d.h.x, d.h.y); s.lineTo(-d.h.x, d.h.y); s.lineTo(-d.h.x, -d.h.y);
      const H = d.hole, hole = new THREE.Path();
      hole.moveTo(-H.hw, H.y); hole.lineTo(-H.hw, H.y + H.hh); hole.absarc(0, H.y + H.hh, H.hw, Math.PI, 0, true); hole.lineTo(H.hw, H.y); hole.lineTo(-H.hw, H.y);
      s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: d.h.z * 2, bevelEnabled: false, curveSegments: 28 }).translate(0, 0, -d.h.z);
      g.applyMatrix4(M.compose(v3(d.c), Qt.setFromAxisAngle(Y, d.yaw), one));
      g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      add(g.index ? g.toNonIndexed() : g, d.c.x, d.c.z);
    } else if (d.kind === 'ramp') {
      const P = d.pts.map(v3);
      for (let k = 0; k < P.length - 1; k++) {
        const a = P[k], b = P[k + 1], ax = b.clone().sub(a), len = ax.length();
        ax.normalize();
        const az = ax.clone().cross(Y).normalize(), ay = az.clone().cross(ax).normalize(), mid = a.clone().lerp(b, 0.5);
        const basis = new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(mid);
        add(new THREE.BoxGeometry(len + 1.2, 2.4, d.width).toNonIndexed().applyMatrix4(basis), mid.x, mid.z);
        for (const sd of [-1, 1]) {
          const off = az.clone().multiplyScalar(sd * (d.width / 2 - 0.3)).add(ay.clone().multiplyScalar(2.3));
          railGeos.push(new THREE.BoxGeometry(len + 0.4, 0.18, 0.18).applyMatrix4(new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(mid.clone().add(off))));
          railGeos.push(new THREE.BoxGeometry(0.16, 2.2, 0.16).applyMatrix4(new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(a.clone().add(off).addScaledVector(ay, -1.1))));
        }
      }
    }
  }
  for (const geos of chunks.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), concrete);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
    geos.forEach(g => g.dispose());
  }
  if (railGeos.length) { const m = new THREE.Mesh(mergeGeometries(railGeos), rail); m.castShadow = true; root.add(m); railGeos.forEach(g => g.dispose()); }

  // ---------- relieves, hornacinas, ventanas y farolillos (instanciados) ----------
  const walls = T.decor.filter(d => d.kind === 'block' && d.tag === 'wall' && d.side);
  const bgs = T.decor.filter(d => d.kind === 'block' && d.tag === 'bg');
  const pillars = T.decor.filter(d => d.kind === 'block' && d.tag === 'pillar');
  const dense = Q.name === 'ultra' ? 1.4 : Q.name === 'baja' ? 0.5 : 1;
  const o = new THREE.Object3D(), tmp = new THREE.Vector3();
  // posición de un punto local (x, y, z) de una caja girada en Y
  const place = (d, lx, ly, lz) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return tmp.set(d.c.x + lx * c + lz * s, d.c.y + ly, d.c.z - lx * s + lz * c); };
  {
    const n = Math.floor(walls.length * 9 * dense), inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), concrete, n);
    let k = 0;
    for (const d of walls) for (let j = 0; j < 9 * dense && k < n; j++) {
      const w = rr(2, 9), h = rr(2, 14), dep = rr(0.4, 1.5);
      o.position.copy(place(d, rr(-d.h.x + w / 2, d.h.x - w / 2), rr(-d.h.y + h, d.h.y - h), -d.side * (d.h.z + dep / 2)));
      o.rotation.set(0, d.yaw, 0); o.scale.set(w, h, dep); o.updateMatrix();
      inst.setMatrixAt(k++, o.matrix);
    }
    inst.count = k; inst.castShadow = inst.receiveShadow = true;
    root.add(inst);
  }
  {
    const geo = new THREE.ShapeGeometry(archShape(1, 1.6), 10), n = Math.floor(walls.length * 3 * dense) + Math.floor(bgs.length * 40 * dense);
    const inst = new THREE.InstancedMesh(geo, dark, n);
    let k = 0;
    for (const d of walls) for (let j = 0; j < 3 * dense && k < n; j++) {
      const w = rr(4, 11);
      o.position.copy(place(d, rr(-d.h.x + w, d.h.x - w), rr(-d.h.y + 4, d.h.y - w * 1.8), -d.side * (d.h.z + 0.06)));
      o.rotation.set(0, d.yaw + (d.side > 0 ? Math.PI : 0), 0); o.scale.set(w, w, 1); o.updateMatrix();
      inst.setMatrixAt(k++, o.matrix);
    }
    // ventanas en arco en las moles de fondo: filas y columnas
    for (const d of bgs) {
      const face = R() < 0.5 ? 1 : -1, rows = Math.min(14, Math.floor((d.h.y * 2) / 11)), cols = Math.max(1, Math.floor((d.h.x * 2) / 9));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols && k < n; c++) {
        if (R() < 0.25) continue;
        o.position.copy(place(d, -d.h.x + 4.5 + c * 9, -d.h.y + 6 + r * 11, face * (d.h.z + 0.06)));
        o.rotation.set(0, d.yaw + (face < 0 ? Math.PI : 0), 0); o.scale.set(3.2, 3.2, 1); o.updateMatrix();
        inst.setMatrixAt(k++, o.matrix);
      }
    }
    inst.count = k;
    root.add(inst);
  }
  if (pillars.length) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 1.4, 0.5), lamp, pillars.length * 2);
    let k = 0;
    for (const d of pillars) for (const sd of [-1, 1]) {
      o.position.copy(place(d, 0, d.h.y - 8, sd * (d.h.z + 0.3))); o.rotation.set(0, d.yaw, 0); o.scale.set(1, 1, 1); o.updateMatrix();
      inst.setMatrixAt(k++, o.matrix);
    }
    root.add(inst);
  }

  // ---------- haces de luz por los huecos del techo ----------
  const shaftGeo = new THREE.PlaneGeometry(1, 1);
  for (const d of T.decor.filter(x => x.kind === 'light')) for (const a of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(shaftGeo, shaftMat);
    m.scale.set(d.w * 0.9, d.h, 1);
    m.position.set(d.p.x, d.p.y - d.h / 2, d.p.z);
    m.rotation.set(0, d.yaw + a, 0);
    m.renderOrder = 5;
    root.add(m);
  }
  // ---------- polvo flotando a lo largo del recorrido ----------
  const S = T.spline, nd = Math.floor(3200 * dense), pos = new Float32Array(nd * 3);
  for (let k = 0; k < nd; k++) {
    const p = S.pointAt(R() * S.length);
    pos[k * 3] = p.x + rr(-30, 30); pos[k * 3 + 1] = p.y + rr(-25, 30); pos[k * 3 + 2] = p.z + rr(-30, 30);
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = dotTexture(); owned.push(dot);
  const dust = new THREE.Points(dg, mat(new THREE.PointsMaterial({ color: '#fffaf0', size: 0.28, map: dot, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
  root.add(dust);

  // ---------- obstáculos que se mueven ----------
  const movers = [];
  for (const m of T.movers) {
    if (m.kind === 'piston' || m.kind === 'doors') {
      const meshes = m.cols.map(c => { const me = new THREE.Mesh(new THREE.BoxGeometry(c.h.x * 2, c.h.y * 2, c.h.z * 2), concrete); me.castShadow = me.receiveShadow = true; me.rotation.y = c.yaw; root.add(me); return me; });
      movers.push(() => m.cols.forEach((c, i) => meshes[i].position.set(c.c.x, c.c.y, c.c.z)));
    } else if (m.kind === 'spinner') {
      const g = new THREE.Group();
      g.position.copy(v3(m.c));
      for (const a of [0, Math.PI / 2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(104, 7, 5), concrete); b.rotation.y = a; b.castShadow = b.receiveShadow = true; g.add(b); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 9, 24), rail);
      g.add(hub);
      root.add(g);
      movers.push(() => { g.rotation.y = m.yaw; });
    }
  }

  return {
    update(time) { for (const f of movers) f(); dust.rotation.y = Math.sin(time * 0.02) * 0.004; },
    dispose() { for (const m of owned) m.dispose(); },
  };
}
