// Escaleras rojas: lo que se ve. Bloques de muro rojo (algunos rosas, azules o violeta), con remates de otro color en
// los bordes de arriba, ventanas y huecos oscuros; tramos de escalera con peldaños y barandilla; pasarelas; muros con
// puertas; cielo azul intenso y un sol fuerte que deja sombras duras, como en la foto.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { rng } from '../math.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
let TEX = null;
const tex = () => TEX || (TEX = { paint: noiseTexture({ size: 512, kind: 'paint', seed: 152, colors: ['#d8d8d8', '#ececec', '#ffffff'] }) });

export function atmo() {
  return {
    sky: { zenith: '#143e94', mid: '#4f86d8', horizon: '#c6d8f2', ground: '#7a2028', sun: '#fff6e0', clouds: 0.12, sunDisc: 1 },
    sunDir: [0.45, 0.62, 0.64], sunColor: '#fff2dc', sunIntensity: 5.2,
    hemiSky: '#b8d0ff', hemiGround: '#5a141a', hemiIntensity: 0.4,
    fog: { color: '#b8c8e8', density: 0.0006 },
    exposure: 0.95,
    ground: { color: '#a8323a', repeat: 400, roughness: 0.9 },
    grade: { sat: 1.18, contrast: 1.26, tint: [1.02, 0.99, 1.0], grain: 0.03, vignette: 0.6 },
  };
}
export const MUSIC = { chords: [[40, 47, 52, 55, 59], [36, 43, 48, 52, 55], [38, 45, 50, 53, 57], [35, 42, 47, 51, 54]] };
export const CLOUDS = { lit: '#ffffff', shade: '#9ab0d8', layout(cluster, R) { for (let k = 0; k < 20; k++) { const a = (k / 20) * Math.PI * 2, d = 2800 + R() * 2000; cluster(150 + Math.cos(a) * d, 300 + R() * 500, -200 + Math.sin(a) * d, 8, 260, 380, 0.3); } } };

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], R = rng(153);
  const mat = m => { owned.push(m); return m; };
  const paint = c => mat(triplanar(new THREE.MeshStandardMaterial({ map: t.paint, color: c, roughness: 0.85 }), { scale: 1 / 18 }));
  const colors = { red: paint('#c4303a'), rose: paint('#d8566a'), blue: paint('#3d6fb3'), violet: paint('#6a4a9a'), dark: mat(new THREE.MeshStandardMaterial({ color: '#2a0a10', roughness: 1 })) };
  const pick = () => { const x = R(); return x < 0.62 ? 'red' : x < 0.8 ? 'rose' : x < 0.92 ? 'blue' : 'violet'; };
  const groups = {}, add = (k, g) => (groups[k] ||= []).push(g);
  const M = new THREE.Matrix4();
  const obox = (c, h, a, b, n) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeBasis(v3(a), v3(b), v3(n)).setPosition(c.x, c.y, c.z));
  const boxY = (c, h, yaw) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(M.makeRotationY(yaw || 0).setPosition(c.x, c.y, c.z));
  const wins = [], o = new THREE.Object3D();
  for (const d of T.decor) {
    if (d.kind === 'block' || d.kind === 'far') {
      const k = d.kind === 'far' ? 'rose' : pick(), acc = k === 'red' ? (R() < 0.5 ? 'blue' : 'violet') : 'red';
      add(k, boxY(d.c, d.h, d.yaw));
      // remate de otro color en el borde de arriba
      add(acc, boxY({ x: d.c.x, y: d.c.y + d.h.y + 0.8, z: d.c.z }, { x: d.h.x + 0.6, y: 0.8, z: d.h.z + 0.6 }, d.yaw));
      // ventanas y huecos oscuros en las caras
      if (d.kind === 'block') for (let j = 0, n = Math.min(8, Math.floor(d.h.y / 8)); j < n; j++) {
        const face = Math.floor(R() * 4), sx = face < 2 ? (face ? 1 : -1) * (d.h.x + 0.05) : (R() - 0.5) * d.h.x * 1.4, sz = face >= 2 ? (face === 3 ? 1 : -1) * (d.h.z + 0.05) : (R() - 0.5) * d.h.z * 1.4;
        wins.push({ p: new THREE.Vector3(d.c.x + sx, d.c.y - d.h.y + 4 + R() * (d.h.y * 2 - 8), d.c.z + sz), ry: face < 2 ? Math.PI / 2 : 0, w: 2 + R() * 3, h: 3 + R() * 4 });
      }
    } else if (d.kind === 'stair') {
      add('red', obox(d.c, d.h, d.ax, d.ay, d.az));
      // peldaños y barandilla
      const n = Math.floor(d.h.x / 1.4), ax = v3(d.ax), ay = v3(d.ay), az = v3(d.az), base = v3(d.c).addScaledVector(ax, -d.h.x).addScaledVector(ay, d.h.y);
      for (let k = 0; k < n; k++) add('rose', obox(base.clone().addScaledVector(ax, (k + 0.5) * (d.h.x * 2 / n)).addScaledVector(ay, 0.5), { x: d.h.x / n * 0.55, y: 0.5, z: d.h.z }, ax, ay, az));
      for (const sd of [-1, 1]) add('blue', obox(v3(d.c).addScaledVector(az, sd * d.h.z).addScaledVector(ay, d.h.y + 1.6), { x: d.h.x, y: 1.6, z: 0.3 }, ax, ay, az));
    } else if (d.kind === 'bridge') { add('violet', boxY(d.c, d.h, d.yaw)); }
    else if (d.kind === 'arch') {
      const s = new THREE.Shape(); s.moveTo(-d.h.x, -d.h.y); s.lineTo(d.h.x, -d.h.y); s.lineTo(d.h.x, d.h.y); s.lineTo(-d.h.x, d.h.y); s.lineTo(-d.h.x, -d.h.y);
      const H = d.hole, hole = new THREE.Path(); hole.moveTo(-H.hw, H.y); hole.lineTo(-H.hw, H.y + H.hh); hole.absarc(0, H.y + H.hh, H.hw, Math.PI, 0, true); hole.lineTo(H.hw, H.y); hole.lineTo(-H.hw, H.y); s.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(s, { depth: d.h.z * 2, bevelEnabled: false, curveSegments: 20 }).translate(0, 0, -d.h.z).applyMatrix4(M.makeRotationY(d.yaw).setPosition(d.c.x, d.c.y, d.c.z));
      g.deleteAttribute('uv'); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      add(R() < 0.5 ? 'red' : 'rose', g.index ? g.toNonIndexed() : g);
    }
  }
  for (const [k, list] of Object.entries(groups)) for (let i = 0; i < list.length; i += 400) { const me = new THREE.Mesh(mergeGeometries(list.slice(i, i + 400)), colors[k]); me.castShadow = me.receiveShadow = true; root.add(me); }
  for (const list of Object.values(groups)) list.forEach(g => g.dispose());
  if (wins.length) { const I = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), colors.dark, wins.length); wins.forEach((w, i) => { o.position.copy(w.p); o.rotation.set(0, w.ry, 0); o.scale.set(w.w, w.h, 1); o.updateMatrix(); I.setMatrixAt(i, o.matrix); }); I.material.side = THREE.DoubleSide; root.add(I); }
  // hojas de puerta y plataformas
  const movers = [], unit = new THREE.BoxGeometry(2, 2, 2);
  for (const m of T.movers) for (const c of m.cols) { const me = new THREE.Mesh(unit, m.kind === 'leaf' ? colors.blue : colors.violet); me.castShadow = true; me.rotation.y = c.yaw; me.scale.set(c.h.x, c.h.y, c.h.z); root.add(me); movers.push(() => me.position.set(c.c.x, c.c.y, c.c.z)); }
  return { update() { for (const f of movers) f(); }, dispose() { unit.dispose(); for (const m of owned) m.dispose(); } };
}
