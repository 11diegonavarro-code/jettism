// Kit de formas abstractas (parte que no dibuja, JS puro): reparte piezas irregulares alrededor del recorrido y les da
// un colisionador aproximado (una esfera algo más pequeña que la pieza). Lo que se dibuja está en art-view.js.
// Tipos: blob (masa deformada), ribbon (cinta retorcida), tendril (tentáculo), vase (jarrón torcido), shard (cristal),
// petal (pétalo o fronda), drip (gota que se derrite), knot (nudo), shell (caracola), coral (coral ramificado).
import { V3 } from '../math.js';

export const ART_KINDS = ['rock', 'blob', 'ribbon', 'tendril', 'vase', 'shard', 'petal', 'drip', 'knot', 'shell', 'coral'];
// cuánto de la pieza ocupa su colisionador (las cintas y los corales son más huecos)
const SOLID = { rock: 0.8, blob: 0.8, ribbon: 0.45, tendril: 0.45, vase: 0.65, shard: 0.7, petal: 0.45, drip: 0.7, knot: 0.55, shell: 0.6, coral: 0.5 };

// Añade candidatas al kit K (se validan con K.commit, que quita las que estorben a la línea).
// o: { n, kinds: { blob: 3, ... } (pesos), lat: [min, max] (distancia lateral a la línea), up: [min, max] (altura sobre
// la línea), size: [min, max] (radio), ground: true (apoyadas en el suelo), colors: nº de colores de la paleta, tag }
export function artScatter(K, o) {
  const { R, rr, at, L } = K, kinds = Object.entries(o.kinds), total = kinds.reduce((a, [, w]) => a + w, 0);
  const pick = () => { let x = R() * total; for (const [k, w] of kinds) if ((x -= w) <= 0) return k; return kinds[0][0]; };
  for (let i = 0; i < o.n; i++) {
    const art = pick(), F = at(R() * L), sd = R() < 0.5 ? -1 : 1, l = rr(o.lat[0], o.lat[1]), s = rr(o.size[0], o.size[1]);
    const x = F.P.x + F.Rh.x * sd * l, z = F.P.z + F.Rh.z * sd * l;
    const y = o.ground ? (o.groundY ? o.groundY(x, z) : 0) + s * rr(0.3, 0.8) : Math.max(s * 0.5, F.P.y + rr(o.up[0], o.up[1]));
    K.sphere(new V3(x, y, z), s * (SOLID[art] || 0.6), o.tag || 'art', { art, v: Math.floor(R() * 6), s, rot: [rr(0, 6.28), rr(0, 6.28), rr(0, 6.28)], ci: Math.floor(R() * (o.colors || 6)), upright: !!o.ground });
  }
}
// Lejos (sin colisionador): un anillo de piezas enormes alrededor de (cx, cz)
export function artFar(D, R, o) {
  const kinds = Object.keys(o.kinds);
  for (let i = 0; i < o.n; i++) {
    const a = (i / o.n) * Math.PI * 2 + (R() - 0.5) * 0.2, d = o.r[0] + R() * (o.r[1] - o.r[0]), s = o.size[0] + R() * (o.size[1] - o.size[0]);
    D.push({ kind: 'art', art: kinds[Math.floor(R() * kinds.length)], v: Math.floor(R() * 6), p: new V3(o.cx + Math.cos(a) * d, s * (0.2 + R() * 0.8) + (o.y || 0), o.cz + Math.sin(a) * d), s, rot: [R() * 6, R() * 6, R() * 6], ci: Math.floor(R() * (o.colors || 6)), upright: true });
  }
}
// Pasa las piezas que han quedado tras K.commit a la decoración
export function artKeep(kept, D, tag = 'art') {
  for (const p of kept) if (p.kind === tag) D.push({ kind: 'art', art: p.extra.art, v: p.extra.v, p: p.c.c, s: p.extra.s, rot: p.extra.rot, ci: p.extra.ci, upright: p.extra.upright });
}
