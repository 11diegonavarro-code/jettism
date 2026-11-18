// Túnel de azulejos: lo que se ve. Los dos túneles son una sola pieza continua (sección cuadrada que gira a lo largo
// del recorrido) forrada por dentro de azulejos azules y ocres, con lámparas cálidas en las esquinas; por fuera,
// azulejo oscuro. Plaza de baldosas oscuras, columnas, arcos, ruinas y torres de azulejo, y cielo de noche con un
// último resplandor en el horizonte.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { azulejoTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { tunnelFrame } from './tunel.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = {
  blue: azulejoTexture({ size: 512, seed: 41 }),
  dark: azulejoTexture({ size: 512, base: '#3a4a52', ink: '#16303a', accent: '#6b5232', grout: '#0c1012', seed: 42 }),
  floor: azulejoTexture({ size: 512, n: 4, base: '#2b3a40', ink: '#1a2a30', accent: '#4f6f78', grout: '#0a0d10', seed: 43 }),
  ochre: azulejoTexture({ size: 256, n: 2, base: '#d8b07a', ink: '#8a2f1e', accent: '#1f3f8f', grout: '#2a1a12', seed: 44 }),
});

export function atmo() {
  return {
    sky: { zenith: '#0b1624', mid: '#20384c', horizon: '#8a5a3e', ground: '#120f0e', sun: '#ffb070', clouds: 0.35, sunDisc: 0.6 },
    sunDir: [-0.7, 0.1, 0.7], sunColor: '#ffae70', sunIntensity: 1.9,
    hemiSky: '#5f86a8', hemiGround: '#1a1410', hemiIntensity: 0.55,
    fog: { color: '#1c2e3c', density: 0.0008 },
    exposure: 0.95,
    ground: { color: '#ffffff', map: tex().floor, repeat: 2500, roughness: 0.45 },
    grade: { sat: 0.92, contrast: 1.15, tint: [0.95, 1.0, 1.06], grain: 0.05, vignette: 0.62 },
  };
}
// Música: inquieta, en La menor
export const MUSIC = { chords: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 58, 62], [40, 47, 52, 55, 59]] };
export const CLOUDS = {
  lit: '#7d8ea2', shade: '#141c28',
  layout(cluster, R) {
    for (let k = 0; k < 20; k++) { const a = R() * Math.PI * 2, d = 900 + R() * 1400; cluster(300 + Math.cos(a) * d, 520 + R() * 400, -150 + Math.sin(a) * d, 8, 140, 200, 0.3); }
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 3200 + R() * 2200; cluster(300 + Math.cos(a) * d, 260 + R() * 500, -150 + Math.sin(a) * d, 8, 300, 440, 0.28); }
  },
};

export function buildView(cv) {
  const T = cv.track, S = T.spline, root = cv.group, t = tex(), owned = [], geos = [];
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  // un poco de brillo propio para que los azulejos se lean dentro del túnel, donde no llega el sol
  const inner = mat(new THREE.MeshStandardMaterial({ map: t.blue, roughness: 0.28, metalness: 0.05, emissiveMap: t.blue, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.22 }));
  const outer = mat(new THREE.MeshStandardMaterial({ map: t.dark, roughness: 0.4 }));
  const tileTri = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.dark, roughness: 0.35 }), { scale: 1 / 16 }));
  const blueTri = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.blue, roughness: 0.3 }), { scale: 1 / 12 }));
  const ochre = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.ochre, roughness: 0.3 }), { scale: 1 / 8 }));
  const lampM = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf8a').multiplyScalar(2.6) }));
  const mesh = (g, m, cast = true) => { const me = new THREE.Mesh(g, m); me.castShadow = cast; me.receiveShadow = true; root.add(me); return me; };

  // ---------- los túneles ----------
  const lamps = [];
  for (const d of T.decor.filter(x => x.kind === 'tunnel')) {
    const tun = { twist: d.twist }, step = 3, rings = [];
    for (let s = d.s0; s <= d.s1 + 0.01; s += step) rings.push({ s, F: tunnelFrame(S, s, tun, d.s0) });
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const sweep = (W, inward, tileW) => {
      const pos = [], nor = [], uv = [], idx = [];
      for (let k = 0; k < 4; k++) {
        const [a0, b0] = corners[k], [a1, b1] = corners[(k + 1) % 4], base = pos.length / 3;
        rings.forEach(({ s, F }) => {
          // normal de la cara: la media de las dos esquinas (hacia dentro o hacia fuera)
          const n = F.A.clone().scale((a0 + a1) / 2).addScaled(F.B, (b0 + b1) / 2).normalize().scale(inward ? -1 : 1);
          for (const [a, b, u] of [[a0, b0, 0], [a1, b1, (2 * W) / tileW]]) {
            const p = F.P.clone().addScaled(F.A, a * W).addScaled(F.B, b * W);
            pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u, (s - d.s0) / tileW);
          }
        });
        for (let r = 0; r < rings.length - 1; r++) {
          const i0 = base + r * 2, i1 = i0 + 2;
          if (inward) idx.push(i0, i1, i0 + 1, i0 + 1, i1, i1 + 1); else idx.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return own(g);
    };
    mesh(sweep(d.W, true, 12), inner, false);
    mesh(sweep(d.W + 7, false, 16), outer, true);
    // bocas: marco entre la sección de dentro y la de fuera (ocre)
    const caps = [];
    for (const { F } of [rings[0], rings[rings.length - 1]]) {
      for (let k = 0; k < 4; k++) {
        const n = F.A.clone().scale(corners[k][0] + corners[(k + 1) % 4][0]).addScaled(F.B, corners[k][1] + corners[(k + 1) % 4][1]).normalize();
        const side = new THREE.Vector3().crossVectors(v3(n), v3(F.T)).normalize(), c = F.P.clone().addScaled(n, d.W + 3.5);
        const g = new THREE.BoxGeometry(2 * d.W + 16, 7, 3).toNonIndexed();
        g.applyMatrix4(new THREE.Matrix4().makeBasis(side, v3(n), v3(F.T)).setPosition(c.x, c.y, c.z));
        caps.push(g);
      }
    }
    mesh(own(mergeGeometries(caps)), ochre);
    // lámparas en las cuatro esquinas, cada 14 m
    for (let r = 0; r < rings.length; r += 5) {
      const { F } = rings[r];
      for (const [a, b] of corners) lamps.push(F.P.clone().addScaled(F.A, a * (d.W - 1.2)).addScaled(F.B, b * (d.W - 1.2)));
    }
  }
  if (lamps.length) {
    const I = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.8, 10, 6)), lampM, lamps.length), M = new THREE.Matrix4();
    lamps.forEach((p, i) => I.setMatrixAt(i, M.makeTranslation(p.x, p.y, p.z)));
    root.add(I);
  }

  // ---------- columnas, arcos, bloques y torres ----------
  const Y = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), M = new THREE.Matrix4();
  const cols = [], blocks = [], towers = [], arches = [], capitals = [];
  for (const d of T.decor) {
    if (d.kind === 'column') {
      const h = d.b.y - d.a.y;
      cols.push(new THREE.CylinderGeometry(d.r, d.r * 1.08, h, 20).toNonIndexed().translate(d.a.x, (d.a.y + d.b.y) / 2, d.a.z));
      capitals.push(new THREE.BoxGeometry(d.r * 2.8, d.r * 0.9, d.r * 2.8).toNonIndexed().translate(d.b.x, d.b.y + d.r * 0.45, d.b.z));
    } else if (d.kind === 'block' || d.kind === 'tower' || d.kind === 'far') (d.kind === 'block' ? blocks : towers).push(new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2).toNonIndexed().applyMatrix4(M.compose(v3(d.c), Q.setFromAxisAngle(Y, d.yaw || 0), one)));
    else if (d.kind === 'arch') arches.push(new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeBasis(v3(d.ax), v3(d.ay), v3(d.az)).setPosition(d.c.x, d.c.y, d.c.z)));
  }
  if (cols.length) mesh(own(mergeGeometries(cols)), blueTri);
  if (capitals.length) mesh(own(mergeGeometries(capitals)), ochre);
  if (blocks.length) mesh(own(mergeGeometries(blocks)), blueTri);
  if (towers.length) mesh(own(mergeGeometries(towers)), tileTri);
  if (arches.length) mesh(own(mergeGeometries(arches)), ochre);
  // ventanas encendidas en las torres
  {
    const wins = [], R = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    for (const d of T.decor.filter(x => x.kind === 'tower')) {
      const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
      for (let k = 0; k < 14; k++) {
        if (R() < 0.45) continue;
        const face = Math.floor(R() * 4), y = 10 + R() * (d.h.y * 2 - 20), along = (R() - 0.5) * 1.6;
        const [lx, lz] = face === 0 ? [d.h.x + 0.3, along * d.h.z] : face === 1 ? [-d.h.x - 0.3, along * d.h.z] : face === 2 ? [along * d.h.x, d.h.z + 0.3] : [along * d.h.x, -d.h.z - 0.3];
        wins.push(new THREE.Vector3(d.c.x + lx * c + lz * s, y, d.c.z - lx * s + lz * c));
      }
    }
    if (wins.length) { const I = new THREE.InstancedMesh(own(new THREE.BoxGeometry(2.4, 3.2, 2.4)), lampM, wins.length); wins.forEach((p, i) => I.setMatrixAt(i, M.makeTranslation(p.x, p.y, p.z))); root.add(I); }
  }

  // ---------- obstáculos que se mueven ----------
  const movers = [], plateGeo = own(new THREE.BoxGeometry(2, 2, 2)), basis = new THREE.Matrix4(), sc = new THREE.Matrix4();
  const plateM = mat(new THREE.MeshStandardMaterial({ map: t.ochre, roughness: 0.3, emissive: new THREE.Color('#5a1a0c'), emissiveIntensity: 0.6 }));
  for (const m of T.movers) {
    const c = m.cols[0], me = new THREE.Mesh(plateGeo, plateM); me.matrixAutoUpdate = false; me.castShadow = true; root.add(me);
    if (m.kind === 'shutter') {
      // la placa, ensanchada por fuera para que sus esquinas queden metidas en la pared al girar
      movers.push(() => { basis.makeBasis(v3(c.ax), v3(c.ay), v3(c.az)).setPosition(c.c.x, c.c.y, c.c.z); me.matrix.copy(basis).multiply(sc.makeScale(c.h.x, c.h.y, c.h.z)); });
    } else {
      me.material = ochre;
      movers.push(() => { me.matrix.compose(new THREE.Vector3(c.c.x, c.c.y, c.c.z), Q.setFromAxisAngle(Y, c.yaw), new THREE.Vector3(c.h.x, c.h.y, c.h.z)); });
    }
  }
  return { update() { for (const f of movers) f(); }, dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
