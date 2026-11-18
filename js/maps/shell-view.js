// Kit de interiores (lo que se ve): suelo, techo, paredes, ventanas de cristal, lucernarios y fachadas de los tramos
// que crea buildShell (shell.js), unidos por zonas de 200 m. Cada mapa pasa sus materiales.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
// m: { wall, floor, ceil, trim, glass, lamp (opcional), facade (opcional) }
export function shellLayer(cv, m, o = {}) {
  const T = cv.track, root = cv.group, geos = [], th = o.th || 3;
  const obox = (c, h, a, b, n) => new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2).toNonIndexed().applyMatrix4(new THREE.Matrix4().makeBasis(v3(a), v3(b), v3(n)).setPosition(c.x, c.y, c.z));
  const chunks = {}, add = (k, g, p) => { const key = `${Math.floor(p.x / 200)},${Math.floor(p.z / 200)}`; (chunks[k] ||= new Map()); if (!chunks[k].has(key)) chunks[k].set(key, []); chunks[k].get(key).push(g); };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  for (const d of T.decor) {
    if (d.kind === 'seg') {
      const { P, t, Rh, U, W, H, type, win, sky } = d, C = P.clone().addScaled(t, 5);
      add('floor', obox(C.clone().addScaled(U, -H - th), V(W + th * 2, th, 6.5), Rh, U, t), C);
      if (type !== 'p') {
        if (sky) { // lucernario: el techo a los lados y cristal en el centro
          for (const sd of [-1, 1]) add('ceil', obox(C.clone().addScaled(U, H + th).addScaled(Rh, sd * (W * 0.75 + th)), V(W * 0.25 + th, th, 6.5), Rh, U, t), C);
          add('glass', obox(C.clone().addScaled(U, H + 0.5), V(W * 0.5, 0.3, 6.5), Rh, U, t), C);
        } else add('ceil', obox(C.clone().addScaled(U, H + th), V(W + th * 2, th, 6.5), Rh, U, t), C);
      }
      for (const sd of [-1, 1]) {
        const wc = C.clone().addScaled(Rh, sd * (W + th));
        if (win) { // ventana: antepecho, dintel y cristal
          const wh = H * 0.55;
          const E = H + th * 2, half = (E - wh) / 2;
          add('wall', obox(wc.clone().addScaled(U, -(E + wh) / 2), V(th, half, 6.5), Rh, U, t), C);
          add('wall', obox(wc.clone().addScaled(U, (E + wh) / 2), V(th, half, 6.5), Rh, U, t), C);
          add('glass', obox(wc.clone().addScaled(Rh, -sd * (th - 0.4)), V(0.3, wh, 6.5), Rh, U, t), C);
        } else add('wall', obox(wc, V(th, H + th * 2, 6.5), Rh, U, t), C);
        // zócalo
        add('trim', obox(C.clone().addScaled(Rh, sd * (W - 0.3)).addScaled(U, -H + 0.6), V(0.35, 0.6, 6.5), Rh, U, t), C);
      }
      if (m.lamp && type !== 'p' && !sky) add('lamp', obox(C.clone().addScaled(U, H - 0.25), V(W * 0.3, 0.25, 1.2), Rh, U, t), C);
    } else if (d.kind === 'bulk') add(d.facade && m.facade ? 'facade' : m.bulk ? 'bulk' : 'wall', obox(d.c, d.h, d.Rh, d.U, d.t), d.c);
  }
  for (const [k, map] of Object.entries(chunks)) {
    const mat = m[k] || m.wall;
    for (const list of map.values()) { const me = new THREE.Mesh(mergeGeometries(list), mat); geos.push(me.geometry); me.receiveShadow = true; me.castShadow = k !== 'glass' && k !== 'lamp'; if (k === 'glass') me.renderOrder = 3; root.add(me); }
  }
  return { dispose() { for (const g of geos) g.dispose(); } };
}
