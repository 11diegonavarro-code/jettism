// Herramientas para construir mapas (JS puro): marco del recorrido en cada punto, piezas candidatas y la comprobación
// de holgura (lo que quede más cerca de la línea que el mínimo de su tipo se quita, así el recorrido siempre se puede volar).
import { V3, UP } from '../math.js';
import { sdf, yawFromRight } from '../track.js';

export function kit(T) {
  const S = T.spline, R = T.rand, cp = S.cpS, L = S.length;
  const K = {
    S, R, cp, L, UP,
    rr: (a, b) => a + R() * (b - a),
    // s de un punto entre la puerta i y la siguiente (f de 0 a 1)
    sAt: (i, f = 0) => cp[i] + ((i + 1 < cp.length ? cp[i + 1] : L) - cp[i]) * f,
    // marco horizontal: punto, avance (Th), derecha (Rh), giro de una caja alineada con el avance (yaw) o de lado (yawR)
    at(s) {
      const P = S.pointAt(s), t = S.tangentAt(s), Th = new V3(t.x, 0, t.z).normalize(), Rh = new V3(-Th.z, 0, Th.x);
      return { P, T: t, Th, Rh, yaw: yawFromRight(Th), yawR: yawFromRight(Rh) };
    },
    cand: [],
    // caja candidata (girada en Y): c centro, h medias medidas
    box(c, h, yaw, kind, extra) { K.cand.push({ c: { type: 'box', c, h, yaw }, kind, extra }); },
    sphere(c, r, kind, extra) { K.cand.push({ c: { type: 'sphere', c, r }, kind, extra }); },
    capsule(a, b, r, kind, extra) { K.cand.push({ c: { type: 'capsule', a, b, r }, kind, extra }); },
    obb(c, h, ax, ay, az, kind, extra) { K.cand.push({ c: { type: 'obb', c, h, ax, ay, az }, kind, extra }); },
    // Añade a la pista las piezas que dejan pasar; devuelve las aceptadas. MIN: holgura mínima por tipo
    // cerca de la salida se pide 14 m más (ahí se forma la parrilla de la carrera, a los lados de la línea)
    commit(MIN, step = 5) {
      const samples = [];
      for (let s = 0; s < L; s += step) { const q = S.pointAt(s); q.extra = s > L - 240 || s < 40 ? 14 : 0; samples.push(q); }
      const reach = c => (c.type === 'obb' || c.type === 'box' ? Math.hypot(c.h.x, c.h.y, c.h.z) : c.type === 'capsule' ? c.a.dist(c.b) / 2 + c.r : c.type === 'sphere' ? c.r : 60);
      const center = c => (c.type === 'capsule' ? c.a.clone().lerp(c.b, 0.5) : c.c);
      const kept = [];
      let dropped = 0;
      for (const p of K.cand) {
        const min = MIN[p.kind] ?? 10, cc = center(p.c), r = reach(p.c) + min + 5;
        let ok = true;
        for (const q of samples) if (Math.abs(q.x - cc.x) < r + q.extra && Math.abs(q.z - cc.z) < r + q.extra && Math.abs(q.y - cc.y) < r + q.extra && sdf(p.c, q) < min + q.extra) { ok = false; break; }
        if (!ok) { dropped++; continue; }
        T.stat(p.c, p.kind);
        kept.push(p);
      }
      K.cand = [];
      return { kept, dropped };
    },
  };
  return K;
}
export { V3, UP, yawFromRight };
