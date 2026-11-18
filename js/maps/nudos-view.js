// Nudos de autopista: lo que se ve. Tableros de hormigón con asfalto mojado, quitamiedos y líneas de carril; pilares,
// el núcleo de la hélice, pórticos con señales, edificios brutalistas, farolas encendidas, coches y camiones con sus
// luces, un techo de nubes grises y lluvia alrededor de la cámara.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = { concrete: noiseTexture({ size: 512, kind: 'concrete', seed: 41 }), ground: noiseTexture({ size: 512, kind: 'concrete', seed: 42 }) });

export function atmo() {
  return {
    sky: { zenith: '#5d6873', mid: '#8e98a3', horizon: '#bcc3c9', ground: '#454850', sun: '#e8eef2', clouds: 0.5, sunDisc: 0 },
    sunDir: [0.35, 0.8, 0.45], sunColor: '#dfe6ee', sunIntensity: 1.8,
    hemiSky: '#c2cad3', hemiGround: '#2a2c31', hemiIntensity: 1.0,
    fog: { color: '#a3abb3', density: 0.00115 },
    exposure: 1.0,
    ground: { color: '#45474c', map: tex().ground, repeat: 2500, roughness: 0.45 },
    grade: { sat: 0.8, contrast: 1.1, tint: [0.96, 1.0, 1.05], grain: 0.03, vignette: 0.62 },
  };
}
// Música: La menor, con pulso de autopista
export const MUSIC = { bpm: 92, chords: [[45, 57, 60, 64, 67], [41, 53, 57, 60, 65], [48, 55, 60, 64, 67], [43, 55, 59, 62, 67]] };
// Nubes: un techo gris bajo y nubes lejanas
export const CLOUDS = {
  lit: '#d7dce2', shade: '#59616b',
  layout(cluster, R) {
    for (let k = 0; k < 70; k++) cluster(-800 + R() * 2500, 330 + R() * 120, -1500 + R() * 2200, 8, 150, 210, 0.25);
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 3000 + R() * 2000; cluster(300 + Math.cos(a) * d, 350 + R() * 400, -450 + Math.sin(a) * d, 8, 320, 450, 0.3); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, Q = cv.quality, R = rng(91), rr = (a, b) => a + R() * (b - a), t = tex(), owned = [];
  const mat = m => { owned.push(m); return m; };
  const concrete = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.concrete, color: '#c9c8c4', roughness: 0.9 }), { scale: 1 / 14, dark: [40, 0.35] }));
  const asphalt = mat(new THREE.MeshStandardMaterial({ color: '#25272b', roughness: 0.22, metalness: 0.05, envMapIntensity: 1.3 }));
  const paint = mat(new THREE.MeshStandardMaterial({ color: '#e8e6dc', roughness: 0.5 }));
  const steel = mat(new THREE.MeshStandardMaterial({ color: '#5b6066', roughness: 0.45, metalness: 0.7 }));
  const sign = mat(new THREE.MeshStandardMaterial({ color: '#1f6b3c', roughness: 0.5, emissive: new THREE.Color('#0d3a1e'), emissiveIntensity: 0.6 }));
  const lampMat = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a3').multiplyScalar(3) }));
  const win = mat(new THREE.MeshStandardMaterial({ color: '#202429', roughness: 0.3, metalness: 0.4 }));
  const winLit = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe2b0').multiplyScalar(1.6) }));
  const dense = Q.name === 'ultra' ? 1.4 : Q.name === 'baja' ? 0.5 : 1;

  // ---------- geometría fija unida por zonas ----------
  const groups = new Map();
  const add = (g, m, x, z) => { const k = `${m.uuid}|${Math.floor(x / 200)},${Math.floor(z / 200)}`; if (!groups.has(k)) groups.set(k, { m, geos: [] }); groups.get(k).geos.push(g); };
  const basis = new THREE.Matrix4(), M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const boxAt = (sx, sy, sz, ax, ay, az, c) => new THREE.BoxGeometry(sx, sy, sz).toNonIndexed().applyMatrix4(basis.makeBasis(ax, ay, az).setPosition(c));
  const boxYaw = (c, h, yaw) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(M.compose(v3(c), Qt.setFromAxisAngle(Y, yaw || 0), one));
  const lamps = [];
  for (const d of T.decor) {
    if (d.kind === 'road' && !d.road.noDeck) {
      const r = d.road, segs = new Set(r.segs);
      for (const i of segs) {
        const a = v3(r.pts[i]), b = v3(r.pts[i + 1]), ax = b.clone().sub(a), len = ax.length();
        if (len < 0.5) continue;
        ax.normalize();
        const az0 = v3(r.az[i]), az = az0.clone().addScaledVector(ax, -az0.dot(ax)).normalize(), ay = az.clone().cross(ax).normalize();
        const ny = v3(r.ny[i]), up = ay.dot(ny) < 0 ? ay.clone().negate() : ay, mid = a.clone().lerp(b, 0.5), w = r.width;
        add(boxAt(len + 1, 2.4, w, ax, ay, az, mid), concrete, mid.x, mid.z);
        add(boxAt(len + 1, 0.05, w - 1.2, ax, ay, az, mid.clone().addScaledVector(up, 1.22)), asphalt, mid.x, mid.z);
        for (const sd of [-1, 1]) add(boxAt(len + 1, 1.1, 0.5, ax, ay, az, mid.clone().addScaledVector(up, 1.75).addScaledVector(az, sd * (w / 2 - 0.25))), concrete, mid.x, mid.z);
        // líneas de carril discontinuas
        if (i % 2 === 0) for (const l of w > 20 ? [-w / 4, 0, w / 4] : [0]) add(boxAt(len * 0.55, 0.06, 0.25, ax, ay, az, mid.clone().addScaledVector(up, 1.26).addScaledVector(az, l)), paint, mid.x, mid.z);
        // farolas en las carreteras normales (no en los bucles)
        if (r.kind !== 'loop' && i % 6 === 3 && up.y > 0.8) lamps.push({ p: mid.clone().addScaledVector(az, w / 2 - 0.25).addScaledVector(up, 2.3), az: az.clone() });
      }
    } else if (['pillar', 'ceil', 'bg'].includes(d.kind)) add(boxYaw(d.c, d.h, d.yaw), concrete, d.c.x, d.c.z);
    else if (d.kind === 'gantry') add(boxYaw(d.c, d.h, d.yaw), steel, d.c.x, d.c.z);
    else if (d.kind === 'core') {
      const h = d.b.y - d.a.y, g = new THREE.CylinderGeometry(d.r, d.r * 1.08, h, 48, 1).toNonIndexed();
      g.translate(d.a.x, (d.a.y + d.b.y) / 2, d.a.z);
      add(g, concrete, d.a.x, d.a.z);
      for (let y = d.a.y + 20; y < d.b.y; y += 22) { const ring = new THREE.CylinderGeometry(d.r + 0.6, d.r + 0.6, 1.2, 48, 1).toNonIndexed(); ring.translate(d.a.x, y, d.a.z); add(ring, concrete, d.a.x, d.a.z); }
    } else if (d.kind === 'sign') {
      for (const sd of [-1, 1]) {
        const c = v3(d.P).addScaledVector(v3(d.Rh), sd * 7); c.y -= 2.2;
        const g = new THREE.BoxGeometry(0.2, 4.2, 9).toNonIndexed().applyMatrix4(M.compose(c, Qt.setFromAxisAngle(Y, d.yaw), one));
        add(g, sign, c.x, c.z);
      }
    }
  }
  for (const { m, geos } of groups.values()) {
    const me = new THREE.Mesh(mergeGeometries(geos), m);
    me.castShadow = m !== asphalt && m !== paint; me.receiveShadow = true;
    root.add(me);
    geos.forEach(g => g.dispose());
  }

  // ---------- farolas ----------
  const o = new THREE.Object3D(), nL = Math.floor(lamps.length * dense);
  const poleI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 9, 0.25).translate(0, 4.5, 0), steel, Math.max(1, nL));
  const armI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 3).translate(0, 9, -1.5), steel, Math.max(1, nL));
  const lampI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.25, 1.2).translate(0, 8.85, -2.8), lampMat, Math.max(1, nL));
  for (let k = 0; k < nL; k++) {
    const L = lamps[Math.floor(k / dense)] || lamps[k];
    o.position.copy(L.p); o.rotation.set(0, Math.atan2(L.az.x, L.az.z), 0); o.scale.set(1, 1, 1); o.updateMatrix();
    poleI.setMatrixAt(k, o.matrix); armI.setMatrixAt(k, o.matrix); lampI.setMatrixAt(k, o.matrix);
  }
  poleI.count = armI.count = lampI.count = nL;
  root.add(poleI, armI, lampI);

  // ---------- ventanas de los edificios ----------
  const bgs = T.decor.filter(d => d.kind === 'bg'), maxW = Math.floor(16000 * dense);
  const winI = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), win, maxW), litI = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), winLit, Math.floor(maxW * 0.15));
  let nw = 0, nl = 0;
  const local = (d, lx, ly, lz) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return new THREE.Vector3(d.c.x + lx * c + lz * s, d.c.y + ly, d.c.z - lx * s + lz * c); };
  for (const d of bgs) for (let f = 0; f < 4; f++) {
    const along = f < 2, sg = f % 2 ? 1 : -1, wd = along ? d.h.z : d.h.x, cols = Math.max(1, Math.floor((wd * 2 - 4) / 5)), rows = Math.floor((d.h.y * 2 - 6) / 4.2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (nw >= maxW) break;
      const u = -wd + 2 + 2.5 + c * 5, y = -d.h.y + 4 + r * 4.2, lit = R() < 0.1 && nl < litI.count;
      o.position.copy(local(d, along ? sg * (d.h.x + 0.05) : u, y, along ? u : sg * (d.h.z + 0.05)));
      o.rotation.set(0, d.yaw + (along ? sg * Math.PI / 2 : sg < 0 ? Math.PI : 0), 0); o.scale.set(3.6, 2.6, 1); o.updateMatrix();
      if (lit) litI.setMatrixAt(nl++, o.matrix); else winI.setMatrixAt(nw++, o.matrix);
    }
  }
  winI.count = nw; litI.count = nl;
  root.add(winI, litI);

  // ---------- tráfico: carrocerías, cabinas y luces ----------
  const traffic = T.movers.filter(m => m.kind === 'traffic'), nCars = traffic.reduce((a, m) => a + m.cars.length, 0);
  const bodyMat = mat(new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.6 }));
  const glass = mat(new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.1, metalness: 0.8 }));
  const head = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6dc').multiplyScalar(3) }));
  const tail = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2a1a').multiplyScalar(3) }));
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const bodyI = new THREE.InstancedMesh(unit, bodyMat, Math.max(1, nCars)), cabI = new THREE.InstancedMesh(unit, glass, Math.max(1, nCars));
  const headI = new THREE.InstancedMesh(unit, head, Math.max(1, nCars * 2)), tailI = new THREE.InstancedMesh(unit, tail, Math.max(1, nCars * 2));
  bodyI.castShadow = true;
  const COLORS = ['#e8e8e8', '#1b1d22', '#9aa0a8', '#2c3e66', '#7a1f22', '#f2f2ee', '#3a3f45', '#c9b28a'].map(c => new THREE.Color(c));
  let k = 0;
  for (const m of traffic) for (const c of m.cars) bodyI.setColorAt(k++, c.truck ? new THREE.Color('#d9d6cf') : COLORS[c.color]);
  for (const I of [bodyI, cabI, headI, tailI]) { I.frustumCulled = false; root.add(I); }
  const B = new THREE.Matrix4(), S4 = new THREE.Matrix4(), part = new THREE.Matrix4(), ax = new THREE.Vector3(), ay = new THREE.Vector3(), az = new THREE.Vector3(), cc = new THREE.Vector3();
  const place = (I, i, lx, ly, lz, sx, sy, sz) => { part.makeTranslation(lx, ly, lz).multiply(S4.makeScale(sx, sy, sz)); I.setMatrixAt(i, M.multiplyMatrices(B, part)); };
  function drawTraffic() {
    let i = 0, j = 0;
    for (const m of traffic) for (const c of m.cars) {
      const col = c.col, h = col.h;
      ax.set(col.ax.x, col.ax.y, col.ax.z); ay.set(col.ay.x, col.ay.y, col.ay.z); az.set(col.az.x, col.az.y, col.az.z);
      B.makeBasis(ax, ay, az).setPosition(cc.set(col.c.x, col.c.y, col.c.z));
      if (c.truck) {
        place(bodyI, i, -h.x * 0.15, 0.1, 0, h.x * 1.7, h.y * 1.8, h.z * 2);
        place(cabI, i, h.x * 0.82, -h.y * 0.35, 0, h.x * 0.34, h.y * 1.2, h.z * 1.95);
      } else {
        place(bodyI, i, 0, -h.y * 0.35, 0, h.x * 2, h.y * 1.3, h.z * 2);
        place(cabI, i, -h.x * 0.12, h.y * 0.55, 0, h.x * 1.1, h.y * 0.75, h.z * 1.8);
      }
      for (const sd of [-1, 1]) {
        place(headI, j, h.x + 0.02, -h.y * 0.3, sd * h.z * 0.7, 0.08, 0.22, 0.45);
        place(tailI, j, -h.x - 0.02, -h.y * 0.3, sd * h.z * 0.7, 0.08, 0.22, 0.45);
        j++;
      }
      i++;
    }
    for (const I of [bodyI, cabI, headI, tailI]) I.instanceMatrix.needsUpdate = true;
  }
  drawTraffic();

  // ---------- lluvia alrededor de la cámara ----------
  const nR = Math.floor(2400 * dense), rp = new Float32Array(nR * 6), drops = new Float32Array(nR * 3);
  for (let i = 0; i < nR; i++) { drops[i * 3] = rr(-45, 45); drops[i * 3 + 1] = rr(-30, 30); drops[i * 3 + 2] = rr(-45, 45); }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, mat(new THREE.LineBasicMaterial({ color: '#c9d2dc', transparent: true, opacity: 0.35, depthWrite: false })));
  rain.frustumCulled = false;
  let last = performance.now();
  rain.onBeforeRender = (r, s, cam) => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const cx = cam.position.x, cy = cam.position.y, cz = cam.position.z;
    for (let i = 0; i < nR; i++) {
      let y = drops[i * 3 + 1] - 32 * dt;
      if (y < -30) y += 60;
      drops[i * 3 + 1] = y;
      // la lluvia se queda en una caja alrededor de la cámara (si la cámara se mueve, las gotas «vuelven» por el otro lado)
      const x = ((drops[i * 3] - cx) % 90 + 135) % 90 - 45, z = ((drops[i * 3 + 2] - cz) % 90 + 135) % 90 - 45;
      const px = cx + x, pz = cz + z, py = cy + y;
      rp.set([px, py, pz, px + 0.25, py - 1.5, pz + 0.1], i * 6);
    }
    rg.attributes.position.needsUpdate = true;
  };
  root.add(rain);

  return {
    update() { drawTraffic(); },
    dispose() { for (const m of owned) m.dispose(); unit.dispose(); },
  };
}
