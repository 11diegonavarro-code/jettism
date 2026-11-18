// Líquido: lo que se ve. Muros de líquido jaspeado (bandas onduladas naranja, verde azulado, crema y casi negro),
// relieves de cromo iridiscente, hornacinas oscuras, farolillos naranjas, esculturas de gotas y masas de metal líquido,
// burbujas de cristal tornasolado (las que laten, las que suben) y émbolos de cromo.
import * as THREE from 'three';
import { opTexture } from '../textures.js';
import { triplanar } from '../materials.js';
import { canyonLayer } from './canyon-view.js';
import { artLayer } from './art-view.js';

let TEX = null;
const tex = () => TEX || (TEX = {
  liquid: opTexture({ kind: 'zebra', colors: ['#e8823a', '#1f6f6a', '#0b1416', '#f2d3a6', '#3fb8a8', '#c4501e'], bands: 9, seed: 121 }),
  swirl: opTexture({ kind: 'spiral', colors: ['#3fb8a8', '#0b1416', '#e8823a'], bands: 7, seed: 122 }),
});
const PAL = ['#e8823a', '#3fb8a8', '#1f6f6a', '#f2d3a6', '#c4501e', '#8fe3d6'];

export function atmo() {
  return {
    sky: { zenith: '#0b2a2a', mid: '#1f5a54', horizon: '#e8823a', ground: '#0b1416', sun: '#ffc08a', clouds: 0.25, sunDisc: 0.7 },
    sunDir: [0.5, 0.55, -0.66], sunColor: '#ffb070', sunIntensity: 3.4,
    hemiSky: '#8fe3d6', hemiGround: '#3a1a0a', hemiIntensity: 0.55,
    fog: { color: '#1f3e3a', density: 0.0018 },
    exposure: 0.95,
    ground: false,
    grade: { sat: 1.12, contrast: 1.14, tint: [1.04, 1.0, 0.98], grain: 0.04, vignette: 0.62 },
  };
}
// Música: el estilo del tramo lo pone index.js; aquí solo los acordes (Sol menor)
export const MUSIC = { chords: [[43, 50, 55, 58, 62], [39, 46, 51, 55, 58], [41, 48, 53, 57, 60], [38, 45, 50, 54, 57]] };
export const CLOUDS = {
  lit: '#ffb27a', shade: '#123433',
  layout(cluster, R) { for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2, d = 3000 + R() * 2200; cluster(300 + Math.cos(a) * d, 250 + R() * 500, -150 + Math.sin(a) * d, 8, 300, 440, 0.28); } },
};

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [];
  const mat = m => { owned.push(m); return m; };
  const wall = mat(triplanar(new THREE.MeshStandardMaterial({ map: t.liquid, roughness: 0.35, metalness: 0.1 }), { scale: 1 / 60 }));
  const chrome = mat(new THREE.MeshStandardMaterial({ color: '#9fe6dc', metalness: 0.95, roughness: 0.12, envMapIntensity: 1.6 }));
  const arch = canyonLayer(cv, { wall, relief: chrome, niche: '#081012', lamp: '#ff9a4a', shaft: '#ffd2a8', dust: '#bff5ee', sculpt: PAL, sculptKinds: ['drip', 'blob', 'knot', 'shell'], sculptRough: 0.2, seed: 51 });
  const art = artLayer(cv, PAL, { rough: 0.25, metal: 0.6 });
  // burbujas de cristal tornasolado y émbolos de cromo
  const sph = new THREE.SphereGeometry(1, 40, 28), tints = ['#ffb27a', '#8fe3d6', '#f2d3a6', '#3fb8a8'].map(c => mat(new THREE.MeshStandardMaterial({ color: c, metalness: 0.7, roughness: 0.05, transparent: true, opacity: 0.75, envMapIntensity: 2 })));
  const movers = [], box = new THREE.BoxGeometry(2, 2, 2), swirl = mat(new THREE.MeshStandardMaterial({ map: t.swirl, metalness: 0.6, roughness: 0.25 }));
  for (const m of T.movers) {
    const c = m.cols[0];
    if (m.kind === 'piston') { const me = new THREE.Mesh(box, swirl); me.scale.set(c.h.x, c.h.y, c.h.z); me.rotation.y = c.yaw; me.castShadow = true; root.add(me); movers.push(() => me.position.set(c.c.x, c.c.y, c.c.z)); }
    else { const me = new THREE.Mesh(sph, tints[m.tint]); me.castShadow = true; root.add(me); movers.push(() => { me.position.set(c.c.x, c.c.y, c.c.z); me.scale.setScalar(c.r); }); }
  }
  return { update(time) { for (const f of movers) f(); arch.update(time); }, dispose() { arch.dispose(); art.dispose(); for (const m of owned) m.dispose(); sph.dispose(); box.dispose(); } };
}
