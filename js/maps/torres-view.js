// Torres turquesa: lo que se ve. Torres de hormigón pintado (pinceladas turquesa, proyección triplanar), miles de
// ventanas magenta (algunas encendidas), aletas y voladizos, pasarelas, la pasarela blanca con sus figuras, esferas
// flotando, planetas turquesa en el cielo rosa y bruma rosa abajo.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';
import { artLayer } from './art-view.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = {
  teal: noiseTexture({ size: 512, kind: 'paint', seed: 21, colors: ['#1d847e', '#2aae9f', '#63dcc4'] }),
  pink: noiseTexture({ size: 512, kind: 'paint', seed: 22, colors: ['#9c4a86', '#c46aa2', '#e898c0'] }),
  white: noiseTexture({ size: 256, kind: 'paint', seed: 23, colors: ['#d9d2d6', '#efe9ea', '#ffffff'] }),
});

export function atmo() {
  return {
    sky: { zenith: '#9b3277', mid: '#de5e9b', horizon: '#ffb4cb', ground: '#7a2f6a', sun: '#ffe2ee', clouds: 0.32, sunDisc: 0.5 },
    sunDir: [-0.45, 0.36, -0.82], sunColor: '#ffd9e6', sunIntensity: 4.3,
    hemiSky: '#ff9fcd', hemiGround: '#2b1f62', hemiIntensity: 0.55,
    fog: { color: '#e690bb', density: 0.0005 },
    exposure: 1.0,
    ground: { color: '#d39abd', map: tex().pink, repeat: 900, roughness: 1 },
    grade: { sat: 1.08, contrast: 1.12, tint: [1.02, 0.98, 1.03], grain: 0.045, vignette: 0.68 },
  };
}
// Música: soñadora, en Mi
export const MUSIC = { bpm: 102, chords: [[40, 52, 56, 59, 63], [37, 49, 52, 56, 59], [45, 52, 57, 61, 64], [47, 54, 59, 63, 66]] };
// Nubes: bruma rosa a ras de la ciudad y nubes pintadas arriba
export const CLOUDS = {
  lit: '#ffd4e6', shade: '#8f4580',
  layout(cluster, R) {
    for (let k = 0; k < 60; k++) cluster(-700 + R() * 1700, 18 + R() * 30, -1350 + R() * 2050, 7, 90, 130, 0.25);
    for (let k = 0; k < 26; k++) { const a = R() * Math.PI * 2, d = 900 + R() * 1600; cluster(150 + Math.cos(a) * d, 520 + R() * 600, -330 + Math.sin(a) * d, 9, 160, 230, 0.35); }
    for (let k = 0; k < 34; k++) { const a = (k / 34) * Math.PI * 2, d = 3200 + R() * 2200; cluster(150 + Math.cos(a) * d, 300 + R() * 700, -330 + Math.sin(a) * d, 8, 320, 460, 0.3); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, Q = cv.quality, R = rng(55), rr = (a, b) => a + R() * (b - a), t = tex(), owned = [];
  const mat = m => { owned.push(m); return m; };
  const teal = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.teal, roughness: 0.86 }), { scale: 1 / 40, dark: [60, 0.35] }));
  const white = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.white, roughness: 0.7 }), { scale: 1 / 12 }));
  const win = mat(new THREE.MeshStandardMaterial({ color: '#4a1846', roughness: 0.6 }));
  const lit = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc6e2').multiplyScalar(2.2) }));
  const trim = mat(new THREE.MeshStandardMaterial({ color: '#7fe8d2', roughness: 0.6, emissive: new THREE.Color('#2a8f82'), emissiveIntensity: 0.35 }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: '#2a1b3a', roughness: 0.9 }));
  const dense = Q.name === 'ultra' ? 1.5 : Q.name === 'baja' ? 0.4 : 1;

  // ---------- piezas fijas unidas por zonas de 400 m ----------
  const M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const boxGeo = (c, h, yaw) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(M.compose(v3(c), Qt.setFromAxisAngle(Y, yaw || 0), one));
  const groups = { teal: new Map(), white: new Map() };
  const add = (g, k, x, z) => { const key = `${Math.floor(x / 200)},${Math.floor(z / 200)}`; if (!groups[k].has(key)) groups[k].set(key, []); groups[k].get(key).push(g); };
  const local = (d, lx, ly, lz) => { const c = Math.cos(d.yaw), s = Math.sin(d.yaw); return new THREE.Vector3(d.c.x + lx * c + lz * s, d.c.y + ly, d.c.z - lx * s + lz * c); };
  for (const d of T.decor) {
    if (['tower', 'far', 'cant', 'roof', 'bridge'].includes(d.kind)) add(boxGeo(d.c, d.h, d.yaw), 'teal', d.c.x, d.c.z);
    else if (d.kind === 'walk' || d.kind === 'pillar') add(boxGeo(d.c, d.h, d.yaw), 'white', d.c.x, d.c.z);
    else if (d.kind === 'portal') {
      const P = d.P, side = d.side, hw = d.hw, hh = d.hh, H = d.H, dep = d.depth, base = { c: P, yaw: d.yaw };
      const parts = [
        [local(base, -(hw + side / 2), 0, 0), new THREE.Vector3(side / 2, H / 2, dep)], [local(base, hw + side / 2, 0, 0), new THREE.Vector3(side / 2, H / 2, dep)],
        [local(base, 0, 0, 0), new THREE.Vector3(hw, (H - P.y - hh) / 2, dep)], [local(base, 0, 0, 0), new THREE.Vector3(hw, (P.y - hh) / 2, dep)],
      ];
      parts[0][0].y = parts[1][0].y = H / 2; parts[2][0].y = (P.y + hh + H) / 2; parts[3][0].y = (P.y - hh) / 2;
      for (const [c, h] of parts) add(boxGeo(c, h, d.yaw), 'teal', c.x, c.z);
      // marco claro alrededor del túnel, por las dos bocas
      for (const sz of [-1, 1]) for (const [lx, ly, w, h2] of [[-hw, 0, 1.2, hh], [hw, 0, 1.2, hh], [0, hh, hw + 1.2, 1.2], [0, -hh, hw + 1.2, 1.2]]) {
        const c = local(base, lx, 0, sz * (dep + 0.6)); c.y = P.y + ly;
        add(boxGeo(c, new THREE.Vector3(w, h2, 0.7), d.yaw), 'teal', c.x, c.z);
      }
    }
  }
  for (const [k, m] of [['teal', teal], ['white', white]]) for (const geos of groups[k].values()) {
    const me = new THREE.Mesh(mergeGeometries(geos), m);
    me.castShadow = me.receiveShadow = true;
    root.add(me);
    geos.forEach(g => g.dispose());
  }

  // ---------- ventanas (y alguna encendida) y aletas verticales en las torres cercanas ----------
  const S = T.spline, towers = T.decor.filter(d => d.kind === 'tower').map(d => ({ d, dist: S.nearest(new THREE.Vector3(d.c.x, Math.min(d.H, 200), d.c.z)).d })).sort((a, b) => a.dist - b.dist);
  const maxWin = Math.floor(42000 * dense), o = new THREE.Object3D();
  const winInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), win, maxWin), litInst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), lit, Math.floor(maxWin * 0.12));
  let nw = 0, nl = 0;
  const finInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), teal, Math.floor(towers.length * 6));
  let nf = 0;
  for (const { d } of towers) {
    const h = d.h;
    // aletas: tiras verticales que sobresalen un poco
    for (let j = 0; j < 4 && nf < finInst.count; j++) {
      const face = Math.floor(R() * 4), along = face < 2, sgn = face % 2 ? 1 : -1, off = rr(-0.8, 0.8);
      o.position.copy(local(d, along ? sgn * (h.x + 0.6) : off * h.x, 0, along ? off * h.z : sgn * (h.z + 0.6)));
      o.rotation.set(0, d.yaw, 0); o.scale.set(along ? 1.2 : rr(1.5, 3), h.y * 2 * rr(0.6, 1), along ? rr(1.5, 3) : 1.2); o.updateMatrix();
      finInst.setMatrixAt(nf++, o.matrix);
    }
    if (nw >= maxWin) continue;
    for (let face = 0; face < 4; face++) {
      const along = face < 2, sgn = face % 2 ? 1 : -1, width = along ? h.z : h.x, cols = Math.max(1, Math.floor((width * 2 - 6) / 7)), rows = Math.floor((h.y * 2 - 14) / 10);
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (R() < 0.38) continue;
        const u = -width + 3 + 3.5 + c * 7, y = -h.y + 10 + r * 10, isLit = R() < 0.07 && nl < litInst.count;
        if (!isLit && nw >= maxWin) continue;
        o.position.copy(local(d, along ? sgn * (h.x + 0.05) : u, y, along ? u : sgn * (h.z + 0.05)));
        o.rotation.set(0, d.yaw + (along ? sgn * Math.PI / 2 : sgn < 0 ? Math.PI : 0), 0); o.scale.set(3, 4.6, 1); o.updateMatrix();
        if (isLit) litInst.setMatrixAt(nl++, o.matrix); else winInst.setMatrixAt(nw++, o.matrix);
      }
    }
  }
  winInst.count = nw; litInst.count = nl; finInst.count = nf;
  finInst.castShadow = finInst.receiveShadow = true;
  root.add(winInst, litInst, finInst);

  // ---------- esferas flotando, planetas en el cielo y figuras en la pasarela ----------
  const spheres = T.decor.filter(d => d.kind === 'sphere');
  const sph = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 40, 24), teal, Math.max(1, spheres.length));
  spheres.forEach((d, i) => { o.position.copy(v3(d.c)); o.rotation.set(0, 0, 0); o.scale.setScalar(d.r); o.updateMatrix(); sph.setMatrixAt(i, o.matrix); });
  sph.count = spheres.length; sph.castShadow = sph.receiveShadow = true;
  root.add(sph);
  const planetMat = mat(new THREE.MeshStandardMaterial({ map: t.teal, color: '#9ee0d6', roughness: 1, fog: false }));
  for (const [x, y, z, r] of [[-1900, 1300, -2600, 380], [1400, 900, -2900, 210], [2600, 1600, -600, 300], [-2400, 700, 900, 160], [300, 2100, -3200, 520], [-900, 520, -2000, 70], [900, 640, -1700, 95]]) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 28), planetMat);
    p.position.set(x, y, z);
    root.add(p);
  }
  for (const d of T.decor.filter(x => x.kind === 'figure')) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.1, 4, 8), dark);
    f.position.set(d.p.x, d.p.y + 0.9, d.p.z);
    root.add(f);
  }
  // barandillas de la pasarela blanca
  const walks = T.decor.filter(d => d.kind === 'walk'), railGeos = [];
  for (const d of walks) for (const sd of [-1, 1]) railGeos.push(boxGeo(local(d, 0, 1.6, sd * (d.h.z - 0.2)), new THREE.Vector3(d.h.x, 0.08, 0.08), d.yaw));
  if (railGeos.length) { const m = new THREE.Mesh(mergeGeometries(railGeos), white); root.add(m); railGeos.forEach(g => g.dispose()); }

  // ---------- obstáculos que se mueven ----------
  const movers = [];
  for (const m of T.movers) {
    if (m.kind === 'orb') {
      const me = new THREE.Mesh(new THREE.SphereGeometry(m.r, 40, 24), teal);
      me.castShadow = me.receiveShadow = true;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(m.r * 1.5, 0.6, 8, 64), trim);
      ring.rotation.x = Math.PI / 2.4;
      me.add(ring);
      root.add(me);
      movers.push(() => me.position.copy(v3(m.cols[0].c)));
    } else if (m.kind === 'slab' || m.kind === 'lift') {
      const c = m.cols[0], me = new THREE.Mesh(new THREE.BoxGeometry(c.h.x * 2, c.h.y * 2, c.h.z * 2), teal);
      me.rotation.y = c.yaw; me.castShadow = me.receiveShadow = true;
      // canto claro para que se lea bien en movimiento
      const edge = new THREE.Mesh(new THREE.BoxGeometry(c.h.x * 2 + 0.4, 0.6, c.h.z * 2 + 0.4), trim);
      edge.position.y = c.h.y;
      me.add(edge);
      root.add(me);
      movers.push(() => me.position.copy(v3(c.c)));
    }
  }
  // las grutas y lo de dentro: turquesas, rosas, magenta y blanco
  const art = artLayer(cv, ['#1d847e', '#2aae9f', '#63dcc4', '#c46aa2', '#e898c0', '#f4eef0'], { rough: 0.6 });
  return {
    update() { for (const f of movers) f(); },
    dispose() { art.dispose(); for (const m of owned) m.dispose(); },
  };
}
