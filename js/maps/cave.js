// Kit de cuevas (JS puro): el recorrido queda encerrado por objetos (rocas, corales, masas irregulares) apilados en
// anillos alrededor de la línea, como una galería de montaña o un río subacuático. La sección no es redonda: el radio
// cambia con el ángulo y a lo largo del camino, y entre tramos se ensancha o se estrecha poco a poco (cavernas y
// gargantas). Cada pieza es una esfera de colisión algo más pequeña que la figura que se dibuja (art-view.js).
// SECT de cada tramo: [radio, tipo]: 'n' garganta, 'w' caverna, 'o' al aire libre (sin cueva).
import { V3 } from '../math.js';
import { frameAt } from './shell.js';

// radio base suavizado entre tramos (60 m de transición); 0 en los tramos al aire libre
export function caveRadius(S, SECT, s) {
  const cp = S.cpS, L = S.length, n = cp.length, rOf = i => (SECT[(i + n) % n][1] === 'o' ? 0 : SECT[(i + n) % n][0]);
  let i = 0; while (i + 1 < n && cp[i + 1] <= s) i++;
  const a = cp[i], b = i + 1 < n ? cp[i + 1] : L, r = rOf(i);
  if (!r) return 0;
  if (s - a < 30) { const p = rOf(i - 1); if (p) return p + (r - p) * (0.5 + (s - a) / 60); }
  else if (b - s < 30) { const q = rOf(i + 1); if (q) return r + (q - r) * (0.5 - (b - s) / 60); }
  return r;
}
// o: { kinds: { rock: 6, coral: 2, ... }, perRing (piezas por anillo), step (fracción del radio entre anillos), colors, tag }
export function buildCave(K, T, SECT, o = {}) {
  const { R, rr } = K, S = T.spline, L = S.length, D = T.decor, kinds = Object.entries(o.kinds || { rock: 1 }), total = kinds.reduce((a, [, w]) => a + w, 0);
  const pick = () => { let x = R() * total; for (const [k, w] of kinds) if ((x -= w) <= 0) return k; return kinds[0][0]; };
  const n = o.perRing || 9, ph0 = R() * 6.28;
  let count = 0;
  for (let s = 0; s < L;) {
    const Rb = caveRadius(S, SECT, s);
    if (!Rb) { s += 10; continue; }
    const F = frameAt(S, s);
    for (let j = 0; j < n; j++) {
      const th = ((j + R() * 0.6) / n) * Math.PI * 2 + ph0 + s * 0.013;
      const Rr = Rb * (1 + 0.22 * Math.sin(th * 3 + s * 0.021) + 0.14 * Math.sin(th * 5 - s * 0.047) + 0.08 * Math.sin(s * 0.09 + j));
      const size = Rb * rr(0.6, 1.05), dir = F.Rh.clone().scale(Math.cos(th)).addScaled(F.U, Math.sin(th));
      const c = F.P.clone().addScaled(dir, Rr + size * 0.55);
      if (c.y < -size) continue; // muy bajo tierra: no hace falta
      T.stat({ type: 'sphere', c, r: size * 0.75 }, o.tag || 'rock');
      D.push({ kind: 'art', art: pick(), v: Math.floor(R() * 6), p: c, s: size, rot: [rr(0, 6.28), rr(0, 6.28), rr(0, 6.28)], ci: Math.floor(R() * (o.colors || 6)), upright: false, cave: true });
      count++;
    }
    s += Math.max(8, Rb * (o.step || 0.75));
  }
  return count;
}
// Detalles dentro de la cueva (estalactitas, flores, cintas…), pequeños, contra las paredes; se validan con K.commit
export function caveInside(K, T, SECT, o) {
  const { R, rr, L } = K, S = T.spline, kinds = Object.entries(o.kinds), total = kinds.reduce((a, [, w]) => a + w, 0);
  const pick = () => { let x = R() * total; for (const [k, w] of kinds) if ((x -= w) <= 0) return k; return kinds[0][0]; };
  for (let i = 0; i < o.n; i++) {
    const s = R() * L, Rb = caveRadius(S, SECT, s);
    if (!Rb) continue;
    const F = frameAt(S, s), th = R() * 6.28, r = Rb * rr(0.72, 0.92), size = Rb * rr(o.size[0], o.size[1]);
    const p = F.P.clone().addScaled(F.Rh, Math.cos(th) * r).addScaled(F.U, Math.sin(th) * r);
    K.sphere(p, size * 0.6, 'art', { art: pick(), v: Math.floor(R() * 6), s: size, rot: [rr(0, 6.28), rr(0, 6.28), rr(0, 6.28)], ci: Math.floor(R() * (o.colors || 6)), upright: false });
  }
}
export { V3 };
