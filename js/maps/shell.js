// Kit de interiores (JS puro): convierte el recorrido en un edificio que se vuela por dentro, como Luz y sombra.
// Cada tramo entre puertas tiene una sección [media anchura, media altura, tipo]:
//   'c' pasillo (con ventanas a los lados cada cierto trecho), 'h' sala (lucernarios en el techo),
//   'p' pozo (abierto arriba), 'o' al aire libre (sin paredes).
// Entre secciones distintas se pone un muro con la abertura justa. Devuelve el marco de cada tramo para la vista.
import { V3 } from '../math.js';

export function frameAt(S, s) { const P = S.pointAt(s), t = S.tangentAt(s), Rh = new V3(-t.z, 0, t.x).normalize(), U = new V3().crossVectors(Rh, t).normalize(); return { P, t, Rh, U }; }
export function sectAt(cp, SECT, s) { let i = 0; while (i + 1 < cp.length && cp[i + 1] <= s) i++; return SECT[i % SECT.length]; }

// o: { th (grosor), windowEvery (cada cuántos tramos de 10 m hay ventana en los pasillos) }
export function buildShell(T, SECT, o = {}) {
  const S = T.spline, cp = S.cpS, L = S.length, D = T.decor, th = o.th || 3, every = o.windowEvery || 4;
  const wall = (c, h, ax, ay, az, kind) => T.stat({ type: 'obb', c, h, ax, ay, az }, kind);
  let k = 0;
  for (let s = 0; s < L; s += 10, k++) {
    const F = frameAt(S, s + 5), [W, H, type] = sectAt(cp, SECT, s + 5), az = F.t;
    if (type === 'o') continue;
    wall(F.P.clone().addScaled(F.U, -H - th), new V3(W + th * 2, th, 6.5), F.Rh, F.U, az, 'floor');
    if (type !== 'p') wall(F.P.clone().addScaled(F.U, H + th), new V3(W + th * 2, th, 6.5), F.Rh, F.U, az, 'ceil');
    for (const sd of [-1, 1]) wall(F.P.clone().addScaled(F.Rh, sd * (W + th)), new V3(th, H + th * 2, 6.5), F.Rh, F.U, az, 'wall');
    // las ventanas son de cristal: chocan igual (la pared sigue ahí), pero se ve el exterior
    D.push({ kind: 'seg', s, P: F.P, t: F.t, Rh: F.Rh, U: F.U, W, H, type, win: type === 'c' && k % every === 0, sky: type === 'h' && k % 2 === 0 });
  }
  // muros entre secciones distintas (y entre interior y exterior)
  for (let i = 0; i < cp.length; i++) {
    const a = SECT[(i + SECT.length - 1) % SECT.length], b = SECT[i % SECT.length];
    if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
    if (a[2] === 'o' && b[2] === 'o') continue;
    const F = frameAt(S, cp[i]), inA = a[2] !== 'o', inB = b[2] !== 'o';
    // del exterior a un interior: un muro grande alrededor de la entrada (una fachada)
    const W = inA && inB ? Math.max(a[0], b[0]) : (inA ? a[0] : b[0]) + 40, H = inA && inB ? Math.max(a[1], b[1]) : (inA ? a[1] : b[1]) + 30;
    const w = inA && inB ? Math.min(a[0], b[0]) : inA ? a[0] : b[0], h = inA && inB ? Math.min(a[1], b[1]) : inA ? a[1] : b[1];
    const parts = [
      [F.P.clone().addScaled(F.Rh, -(W + w) / 2), new V3((W - w) / 2 + th, H + th, 1.5)], [F.P.clone().addScaled(F.Rh, (W + w) / 2), new V3((W - w) / 2 + th, H + th, 1.5)],
      [F.P.clone().addScaled(F.U, (H + h) / 2), new V3(w, (H - h) / 2, 1.5)], [F.P.clone().addScaled(F.U, -(H + h) / 2), new V3(w, (H - h) / 2, 1.5)],
    ];
    for (const [c, hh] of parts) if (hh.x > 0.5 && hh.y > 0.5) { wall(c, hh, F.Rh, F.U, F.t, 'bulk'); D.push({ kind: 'bulk', c, h: hh, Rh: F.Rh, U: F.U, t: F.t, facade: !(inA && inB) }); }
  }
}

// Piezas del kit de arte DENTRO de las salas y pozos (colgando del techo, saliendo del suelo y de las paredes).
// Se validan con K.commit como las demás.
export function artInside(K, T, SECT, o) {
  const { R, rr, L } = K, S = T.spline, cp = S.cpS, kinds = Object.entries(o.kinds), total = kinds.reduce((a, [, w]) => a + w, 0);
  const pick = () => { let x = R() * total; for (const [k, w] of kinds) if ((x -= w) <= 0) return k; return kinds[0][0]; };
  for (let i = 0; i < o.n; i++) {
    const s = R() * L, [W, H, type] = sectAt(cp, SECT, s);
    if (!(o.types || ['h', 'p', 'c']).includes(type)) continue;
    const F = frameAt(S, s), size = rr(o.size[0], o.size[1]) * (type === 'c' ? 0.6 : 1), where = R();
    let lat, up;
    if (where < 0.35) { lat = rr(-W, W); up = -H + size * 0.4; } // en el suelo
    else if (where < 0.6) { lat = rr(-W, W); up = H - size * 0.4; } // colgando del techo
    else { lat = (R() < 0.5 ? -1 : 1) * (W - size * 0.35); up = rr(-H, H); } // saliendo de la pared
    const p = F.P.clone().addScaled(F.Rh, lat).addScaled(F.U, up);
    K.sphere(p, size * 0.6, 'art', { art: pick(), v: Math.floor(R() * 6), s: size, rot: [rr(0, 6.28), rr(0, 6.28), rr(0, 6.28)], ci: Math.floor(R() * (o.colors || 6)), upright: false });
  }
}
