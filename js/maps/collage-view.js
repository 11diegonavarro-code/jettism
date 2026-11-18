// Collage psicodélico: lo que se ve. Texturas op-art hechas por código (bandas arcoíris, cebra ondulada, anillos y
// espirales), torres de discos apilados con bordes de colores, manchas blandas, discos de anillos, muros arcoíris y un
// busto gigante de anillos, todo con instancias (pocas llamadas de dibujo). Cielo luminoso y suelo de ondas de colores.
import * as THREE from 'three';
import { opTexture } from '../textures.js';
import { rng } from '../math.js';
import { canyonLayer } from './canyon-view.js';
import { artLayer } from './art-view.js';
import { triplanar } from '../materials.js';

let TEX = null;
const tex = () => TEX || (TEX = {
  zebra: [
    opTexture({ kind: 'zebra', colors: ['#111111', '#f4f1ea'], bands: 14, seed: 2 }),
    opTexture({ kind: 'zebra', colors: ['#1e7a4a', '#f4f1ea', '#f2c14e'], bands: 12, seed: 3 }),
    opTexture({ kind: 'zebra', colors: ['#2f6fd6', '#e8f2ff', '#89b8ff'], bands: 12, seed: 4 }),
    opTexture({ kind: 'zebra', colors: ['#ff6a1a', '#ffd23f', '#e8432f', '#fff3d6'], bands: 12, seed: 5 }),
  ],
  rings: [
    opTexture({ kind: 'rings', colors: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00b3ff', '#7a3cff', '#ff2d95'], bands: 14, seed: 6 }),
    opTexture({ kind: 'spiral', colors: ['#d81b3a', '#ffd23f', '#ff7a1a', '#fff3d6'], bands: 10, seed: 7 }),
    opTexture({ kind: 'rings', colors: ['#111111', '#f4f1ea'], bands: 18, seed: 8 }),
  ],
  rainbow: [
    opTexture({ kind: 'rainbow', colors: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00b3ff', '#7a3cff', '#ff2d95'], bands: 14, seed: 9 }),
    opTexture({ kind: 'rainbow', colors: ['#ff8fb1', '#ffd3a1', '#fff1b8', '#b8f0d0', '#b8dcff', '#d9c2ff'], bands: 12, seed: 10 }),
    opTexture({ kind: 'rainbow', colors: ['#111111', '#f4f1ea', '#e8432f', '#f4f1ea'], bands: 16, seed: 11 }),
  ],
  ground: opTexture({ kind: 'zebra', colors: ['#ff7a59', '#ffb36b', '#ffd86b', '#ff9ac0', '#c08bff', '#7ec8ff'], bands: 10, seed: 12 }),
});

export function atmo() {
  return {
    sky: { zenith: '#3d9bff', mid: '#8fd0ff', horizon: '#ffe3a6', ground: '#ff9ac0', sun: '#fffbe8', clouds: 0.15, sunDisc: 1 },
    sunDir: [0.4, 0.7, -0.6], sunColor: '#fff6e0', sunIntensity: 3.4,
    hemiSky: '#cfe8ff', hemiGround: '#ffb0c8', hemiIntensity: 0.9,
    fog: { color: '#ffd9c2', density: 0.0003 },
    exposure: 1.05,
    ground: { color: '#ffffff', map: tex().ground, repeat: 260, roughness: 0.9 },
    grade: { sat: 1.22, contrast: 1.05, tint: [1.02, 1.0, 0.99], grain: 0, vignette: 0.85 },
  };
}
// Música del nivel 1: luminosa y tranquila
export const MUSIC = { bpm: 82, chords: [[48, 55, 64, 67, 71], [50, 57, 62, 66, 69], [53, 60, 64, 69, 72], [55, 62, 67, 71, 74]] };
export const CLOUDS = {
  lit: '#ffffff', shade: '#ffc2d8',
  layout(cluster, R) {
    for (let k = 0; k < 24; k++) { const a = R() * Math.PI * 2, d = 700 + R() * 1500; cluster(380 + Math.cos(a) * d, 450 + R() * 500, -100 + Math.sin(a) * d, 8, 120, 170, 0.35); }
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 3000 + R() * 2000; cluster(380 + Math.cos(a) * d, 300 + R() * 600, -100 + Math.sin(a) * d, 8, 300, 420, 0.3); }
  },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [];
  const mat = m => { owned.push(m); return m; };
  const tri = (map, sc, extra = {}) => mat(triplanar(new THREE.MeshStandardMaterial({ map, roughness: 0.75, ...extra }), { scale: sc }));
  // la arquitectura: hormigón pintado con bandas de colores, relieves de cebra y anillos, hornacinas moradas
  const arch = canyonLayer(cv, {
    wall: tri(t.rainbow[1], 1 / 46), relief: tri(t.zebra[3], 1 / 14), niche: '#3a1a5c', lamp: '#ffd6f0', shaft: '#fff0fa', dust: '#ffe8ff',
    sculpt: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00b3ff', '#7a3cff', '#ff2d95', '#f4f1ea', '#111111'], seed: 13,
  });
  // el busto de anillos
  const sphere = new THREE.SphereGeometry(1, 48, 32), ringsM = mat(new THREE.MeshStandardMaterial({ map: t.rings[2], roughness: 0.6 })), zebraM = mat(new THREE.MeshStandardMaterial({ map: t.zebra[0], roughness: 0.6 }));
  for (const d of T.decor.filter(x => x.kind === 'head')) {
    if (d.bust) { const m = new THREE.Mesh(sphere, ringsM); m.position.set(d.col.c.x, d.col.c.y, d.col.c.z); m.scale.set(d.col.r.x, d.col.r.y, d.col.r.z); m.rotation.y = d.col.yaw; m.castShadow = true; root.add(m); }
    else { const h = d.col.b.y - d.col.a.y, m = new THREE.Mesh(new THREE.CylinderGeometry(d.col.r, d.col.r * 1.3, h, 40), zebraM); m.position.set(d.col.a.x, (d.col.a.y + d.col.b.y) / 2, d.col.a.z); m.castShadow = true; root.add(m); }
  }
  // formas enormes en el horizonte (kit de arte)
  const art = artLayer(cv, ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00b3ff', '#7a3cff', '#ff2d95', '#f4f1ea', '#111111'], { rough: 0.5 });
  // obstáculos: manchas de cebra que suben y bajan y la bola roja
  const movers = [];
  for (const m of T.movers) {
    const c = m.cols[0], me = new THREE.Mesh(sphere, m.kind === 'ball' ? mat(new THREE.MeshStandardMaterial({ color: '#e8261d', roughness: 0.35 })) : mat(new THREE.MeshStandardMaterial({ map: t.zebra[3], roughness: 0.6 })));
    if (c.type === 'ellipsoid') me.scale.set(c.r.x, c.r.y, c.r.z); else me.scale.setScalar(c.r);
    me.castShadow = true; root.add(me);
    movers.push(() => me.position.set(c.c.x, c.c.y, c.c.z));
  }
  return { update(time) { for (const f of movers) f(); arch.update(time); }, dispose() { arch.dispose(); art.dispose(); for (const m of owned) m.dispose(); } };
}
