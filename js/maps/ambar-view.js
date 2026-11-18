// Pasillo ámbar: lo que se ve. Paredes de azulejo crema abajo y pintura dorada arriba, con barandilla y puertas con ojo
// de buey; suelo de linóleo brillante; fluorescentes cálidos en el techo cada 10 m; niebla dorada que hace el pasillo
// infinito; camas y armarios en las salas; camillas con gotero y puertas batientes con su ventanita.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../math.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
// pared: azulejo crema abajo, barandilla, pintura arriba y una puerta con ojo de buey a un lado (13 m × alto)
function wallTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const g = c.getContext('2d'), R = rng(104);
  g.fillStyle = '#efc56e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(160,100,30,${R() * 0.05})`; g.fillRect(R() * 512, R() * 512, 2, 2); }
  g.fillStyle = '#efe0bc'; g.fillRect(0, 300, 512, 212);
  g.strokeStyle = 'rgba(150,110,60,0.35)'; g.lineWidth = 2;
  for (let x = 0; x <= 512; x += 32) { g.beginPath(); g.moveTo(x, 300); g.lineTo(x, 512); g.stroke(); }
  for (let y = 300; y <= 512; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = '#8a5a24'; g.fillRect(0, 286, 512, 14); // barandilla
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(0, 287, 512, 4);
  // puerta con ojo de buey
  g.fillStyle = '#c98a3a'; g.fillRect(330, 170, 120, 342); g.strokeStyle = '#6a4318'; g.lineWidth = 6; g.strokeRect(330, 170, 120, 342);
  g.fillStyle = '#fff2c8'; g.beginPath(); g.arc(390, 250, 26, 0, 6.28); g.fill(); g.strokeStyle = '#6a4318'; g.lineWidth = 5; g.stroke();
  g.fillStyle = '#6a4318'; g.fillRect(338, 360, 18, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), R = rng(105);
  g.fillStyle = '#c8954a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,230,180' : '90,50,10'},${R() * 0.08})`; g.fillRect(R() * 256, R() * 256, 3, 3); }
  g.strokeStyle = 'rgba(90,50,10,0.3)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
let TEX = null;
const tex = () => TEX || (TEX = { wall: wallTexture(), floor: floorTexture() });

export function atmo() {
  return {
    sky: { zenith: '#c98a2a', mid: '#e8b050', horizon: '#ffd98a', ground: '#8a5a20', sun: '#fff0c0', clouds: 0, sunDisc: 0 },
    sunDir: [0.2, 0.95, 0.2], sunColor: '#ffe0a0', sunIntensity: 0.6,
    hemiSky: '#ffd890', hemiGround: '#a8702a', hemiIntensity: 1.35,
    fog: { color: '#e0a648', density: 0.0045 },
    exposure: 1.0,
    ground: false,
    grade: { sat: 1.0, contrast: 1.06, tint: [1.1, 1.0, 0.76], grain: 0.06, vignette: 0.6 },
  };
}
// Música: soñadora y con prisa, en Mi bemol mayor
export const MUSIC = { chords: [[51, 58, 63, 67, 70], [48, 55, 60, 63, 67], [44, 51, 56, 60, 63], [46, 53, 58, 62, 65]] };
export const CLOUDS = { lit: '#ffe0a0', shade: '#a8702a', layout() {} };

export function buildView(cv) {
  const T = cv.track, root = cv.group, t = tex(), owned = [], geos = [];
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const wallM = mat(new THREE.MeshStandardMaterial({ map: t.wall, roughness: 0.7 }));
  const floorM = mat(new THREE.MeshStandardMaterial({ map: t.floor, roughness: 0.18, metalness: 0.05, envMapIntensity: 1.4 }));
  const ceilM = mat(new THREE.MeshStandardMaterial({ color: '#f2d79a', roughness: 0.85 }));
  const trimM = mat(new THREE.MeshStandardMaterial({ color: '#b07a32', roughness: 0.5 }));
  const lampM = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2cc').multiplyScalar(2.4) }));
  const whiteM = mat(new THREE.MeshStandardMaterial({ color: '#f6f1e6', roughness: 0.4 }));
  const metalM = mat(new THREE.MeshStandardMaterial({ color: '#c9c2b0', roughness: 0.3, metalness: 0.8 }));
  const doorM = mat(new THREE.MeshStandardMaterial({ color: '#c98a3a', roughness: 0.45 }));
  const obox = (c, h, a, b, n) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeBasis(v3(a), v3(b), v3(n)).setPosition(c.x, c.y, c.z));
  const chunks = { wall: new Map(), floor: new Map(), ceil: new Map(), trim: new Map(), lamp: new Map(), white: new Map() };
  const add = (k, g, p) => { const key = `${Math.floor(p.x / 200)},${Math.floor(p.z / 200)}`; const m = chunks[k]; if (!m.has(key)) m.set(key, []); m.get(key).push(g); };
  const th = 3;

  for (const d of T.decor) {
    if (d.kind === 'seg') {
      const { P, t: tg, Rh, U, W, H, gap } = d, C = P.clone().addScaled(tg, 5);
      add('floor', obox(C.clone().addScaled(U, -H - th), new THREE.Vector3(W + th * 2, th, 6.5), Rh, U, tg), C);
      add('ceil', obox(C.clone().addScaled(U, H + th), new THREE.Vector3(W + th * 2, th, 6.5), Rh, U, tg), C);
      if (!gap) for (const sd of [-1, 1]) add('wall', obox(C.clone().addScaled(Rh, sd * (W + th)), new THREE.Vector3(th, H + th * 2, 6.5), Rh, U, tg), C);
      // fluorescente en el techo y rodapié
      add('lamp', obox(C.clone().addScaled(U, H - 0.2), new THREE.Vector3(W * 0.35, 0.25, 1.2), Rh, U, tg), C);
      for (const sd of [-1, 1]) add('trim', obox(C.clone().addScaled(Rh, sd * (W - 0.2)).addScaled(U, -H + 0.5), new THREE.Vector3(0.3, 0.5, 6.5), Rh, U, tg), C);
    } else if (d.kind === 'cross') {
      const { P, t: tg, Rh, U, W, H, len } = d;
      for (const sd of [-1, 1]) {
        const Cc = P.clone().addScaled(Rh, sd * (W + len / 2));
        add('floor', obox(Cc.clone().addScaled(U, -H - th), new THREE.Vector3(len / 2, th, 9 + th), Rh, U, tg), Cc);
        add('ceil', obox(Cc.clone().addScaled(U, H + th), new THREE.Vector3(len / 2, th, 9 + th), Rh, U, tg), Cc);
        for (const fb of [-1, 1]) add('wall', obox(Cc.clone().addScaled(tg, fb * (9 + th)), new THREE.Vector3(len / 2, H + th, th), tg, U, Rh), Cc);
        add('wall', obox(P.clone().addScaled(Rh, sd * (W + len + th)), new THREE.Vector3(th, H + th, 9 + th), Rh, U, tg), Cc);
        for (let k = 0; k < 4; k++) add('lamp', obox(P.clone().addScaled(Rh, sd * (W + 8 + k * 16)).addScaled(U, H - 0.2), new THREE.Vector3(1.2, 0.25, 5), Rh, U, tg), Cc);
      }
    } else if (d.kind === 'bulk') add('trim', obox(d.c, d.h, d.Rh, d.U, d.t), d.c);
    else if (d.kind === 'bed' || d.kind === 'cab') add('white', new THREE.BoxGeometry(d.h.x * 2, d.h.y * 2, d.h.z * 2).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeRotationY(d.yaw)).translate(d.c.x, d.c.y, d.c.z), d.c);
  }
  const mats = { wall: wallM, floor: floorM, ceil: ceilM, trim: trimM, lamp: lampM, white: whiteM };
  for (const [k, m] of Object.entries(chunks)) for (const list of m.values()) { const me = new THREE.Mesh(own(mergeGeometries(list)), mats[k]); me.receiveShadow = true; me.castShadow = k === 'white'; root.add(me); }

  // ---------- camillas y puertas batientes ----------
  const movers = [], unit = own(new THREE.BoxGeometry(2, 2, 2)), basis = new THREE.Matrix4(), sc = new THREE.Matrix4();
  const place = (g, c) => { basis.makeBasis(v3(c.ax), v3(c.ay), v3(c.az)).setPosition(c.c.x, c.c.y, c.c.z); g.matrix.copy(basis).multiply(sc.makeScale(c.h.x, c.h.y, c.h.z)); };
  for (const m of T.movers) {
    if (m.kind === 'gurney') {
      const [bed, pole] = m.cols, g = new THREE.Mesh(unit, whiteM); g.matrixAutoUpdate = false; g.castShadow = true; root.add(g);
      const p = new THREE.Mesh(own(new THREE.CylinderGeometry(0.25, 0.25, 1, 8).translate(0, 0.5, 0)), metalM); root.add(p);
      const bag = new THREE.Mesh(own(new THREE.SphereGeometry(0.9, 12, 8)), mat(new THREE.MeshStandardMaterial({ color: '#fff2c8', transparent: true, opacity: 0.7, roughness: 0.1 }))); root.add(bag);
      movers.push(() => { place(g, bed); p.position.copy(v3(pole.a)); p.scale.set(1, 5.2, 1); bag.position.copy(v3(pole.b)); });
    } else {
      const gs = m.cols.map(() => { const g = new THREE.Group(), leaf = new THREE.Mesh(unit, doorM); g.add(leaf); g.matrixAutoUpdate = false; leaf.castShadow = true; root.add(g); return g; });
      movers.push(() => m.cols.forEach((c, i) => place(gs[i], c)));
    }
  }
  return { update() { for (const f of movers) f(); }, dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
