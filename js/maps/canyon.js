// Kit de arquitectura (JS puro), sacado del Laberinto de hormigón: el recorrido va por un cañón de muros altos de
// profundidad irregular, con voladizos y repisas, suelo y techo a ratos (por los huecos del techo entra la luz), muros
// transversales con un arco que hay que atravesar, bosques de pilares, escalones gigantes, vigas y moles de fondo.
// Cada tramo entre puertas tiene su zona: { W (medio ancho), top: [min, max] (altura de los muros sobre la línea),
// floor (profundidad del suelo bajo la línea; 0 = sin suelo), ceil (altura del techo; 0 = sin techo), ceilP (cuánto
// techo hay: 0..1), arches (arco cada tantos metros; 0 = sin arcos), pillars, steps, beams }.
// Lo que se dibuja está en canyon-view.js. Devuelve la función de zona y los arcos (para poner obstáculos).
import { V3 } from '../math.js';
import { sdf, yawFromRight } from '../track.js';

const MIN = { wall: 9, floor: 10, ceil: 10, ledge: 10, pillar: 12, step: 14, beam: 11, bg: 40, art: 9 };

export function buildCanyon(T, ZONES, o = {}) {
  const S = T.spline, R = T.rand, cp = S.cpS, L = S.length, rr = (a, b) => a + R() * (b - a);
  const zoneOf = s => { s = S.wrap(s); let i = 0; while (i + 1 < cp.length && cp[i + 1] <= s) i++; return ZONES[i % ZONES.length]; };
  const at = s => { const P = S.pointAt(s), t = S.tangentAt(s), Th = new V3(t.x, 0, t.z).normalize(), Rh = new V3(-Th.z, 0, Th.x); return { P, Th, Rh, yaw: yawFromRight(Th), yawR: yawFromRight(Rh) }; };
  const cand = [], box = (c, h, yaw, kind, vis) => cand.push({ c: { type: 'box', c, h, yaw }, kind, vis });
  const SEG = 20, lights = [];
  for (let s = 0; s < L; s += SEG) {
    const z = zoneOf(s), f = at(s);
    if (z.open) continue;
    for (const sd of [-1, 1]) {
      const inner = z.W + rr(0, 3), depth = rr(12, 30), top = Math.max(20, f.P.y + rr(z.top[0], z.top[1])), lat = inner + depth / 2;
      const c = new V3(f.P.x + f.Rh.x * sd * lat, top / 2, f.P.z + f.Rh.z * sd * lat);
      const cc = new V3(f.P.x + f.Rh.x * sd * (lat - 0.75), top / 2, f.P.z + f.Rh.z * sd * (lat - 0.75));
      box(cc, new V3(SEG / 2 + 0.6, top / 2, depth / 2 + 0.75), f.yaw, 'wall', { c, h: new V3(SEG / 2 + 0.6, top / 2, depth / 2), yaw: f.yaw, side: sd, inner, s });
      if (R() < 0.55) { const d2 = rr(20, 60), l2 = inner + depth + rr(4, 30) + d2 / 2, t2 = top + rr(-40, 120); box(new V3(f.P.x + f.Rh.x * sd * l2, t2 / 2, f.P.z + f.Rh.z * sd * l2), new V3(SEG / 2 + rr(2, 14), t2 / 2, d2 / 2), f.yaw + rr(-0.08, 0.08), 'wall', null); }
      for (let j = 0, nj = 1 + Math.floor(R() * 3); j < nj; j++) {
        const up = (R() < 0.5 ? 1 : -1) * rr(24, 70), out = rr(4, 13), hy = rr(3, 12), l4 = inner - out / 2;
        if (f.P.y + up - hy < 2) continue;
        box(new V3(f.P.x + f.Rh.x * sd * l4, f.P.y + up, f.P.z + f.Rh.z * sd * l4), new V3(rr(3, 10), hy, out / 2 + 0.5), f.yaw, 'ledge', { sculpt: R() < (o.sculpt ?? 0.35) });
      }
      if (R() < 0.3 && z.W < 40) { const up = (R() < 0.5 ? 1 : -1) * rr(19, 34), dep = rr(5, 10), l3 = inner - dep / 2; box(new V3(f.P.x + f.Rh.x * sd * l3, f.P.y + up, f.P.z + f.Rh.z * sd * l3), new V3(rr(5, 11), rr(1, 2.5), dep / 2), f.yaw, 'ledge', null); }
    }
    if (z.floor) box(new V3(f.P.x, f.P.y - z.floor - 2.5, f.P.z), new V3(SEG / 2 + 0.6, 2.5, z.W + 2), f.yaw, 'floor', null);
    if (z.ceil) {
      if (R() < z.ceilP) box(new V3(f.P.x, f.P.y + z.ceil + 3, f.P.z), new V3(SEG / 2 + 0.6, 3, z.W + 2), f.yaw, 'ceil', null);
      else lights.push({ p: new V3(f.P.x, f.P.y + z.ceil, f.P.z), w: z.W, h: z.ceil + (z.floor || 40), yaw: f.yaw });
    }
    if (z.pillars) for (const lat of [-0.85, -0.45, 0.45, 0.85]) { if (s % 30 > SEG) break; const l = lat * z.W + rr(-4, 4), top = f.P.y + (z.ceil || 30), p = new V3(f.P.x + f.Rh.x * l, top / 2, f.P.z + f.Rh.z * l); box(p, new V3(3.6, top / 2, 3.6), f.yaw, 'pillar', null); }
    if (z.beams && R() < 0.5) { const up = (R() < 0.65 ? 1 : -1) * rr(16, 60); box(new V3(f.P.x, f.P.y + up, f.P.z), new V3(rr(2, 4), rr(1.5, 3), z.W + 6), f.yaw, 'beam', null); }
  }
  // escalones gigantes bajo la línea
  for (let s = 0; s < L; s += 7) { const z = zoneOf(s); if (!z.steps) continue; const f = at(s), top = Math.max(4, f.P.y - 26); box(new V3(f.P.x, top / 2, f.P.z), new V3(3.7, top / 2, z.W + 3), f.yaw, 'step', null); }
  // arcos que hay que atravesar
  const arches = [], gateNear = s => cp.some(g => Math.min(Math.abs(S.wrap(s - g)), Math.abs(S.wrap(g - s))) < 30);
  for (let s = 60; s < L - 150; s += 20) {
    const z = zoneOf(s);
    if (!z.arches || gateNear(s) || (arches.length && s - arches[arches.length - 1].s < z.arches)) continue;
    const f = at(s), top = f.P.y + Math.max(60, z.top[0]), hole = { hw: z.archHW || Math.min(24, z.W - 3), hh: z.archHH || 32, y: f.P.y - 20 - top / 2 };
    const col = T.stat({ type: 'archwall', c: new V3(f.P.x, top / 2, f.P.z), h: new V3(z.W + 28, top / 2, 4), yaw: f.yawR, hole }, 'arch');
    arches.push({ col, f, s, hole, top });
  }
  // moles de fondo alrededor (con ventanas en la vista)
  if (o.bg) for (let k = 0, tries = 0; k < o.bg.n && tries < 3000; tries++) {
    const x = rr(o.bg.x[0], o.bg.x[1]), zz = rr(o.bg.z[0], o.bg.z[1]), w = rr(25, 90), d = rr(25, 90), top = rr(60, 340);
    const n = S.nearest(new V3(x, Math.min(top, 150), zz));
    if (n.d < 80 + Math.max(w, d)) continue;
    box(new V3(x, top / 2, zz), new V3(w / 2, top / 2, d / 2), R() < 0.7 ? 0 : rr(-0.4, 0.4), 'bg', null);
    k++;
  }
  // holgura: se queda solo lo que deja pasar
  const samples = []; for (let s = 0; s < L; s += 5) samples.push(S.pointAt(s));
  const reach = c => Math.hypot(c.h.x, c.h.y, c.h.z);
  for (const p of cand) {
    const cc = p.c.c, r = reach(p.c) + MIN[p.kind] + 5;
    let ok = true;
    for (const q of samples) if (Math.abs(q.x - cc.x) < r && Math.abs(q.z - cc.z) < r && Math.abs(q.y - cc.y) < r && sdf(p.c, q) < MIN[p.kind]) { ok = false; break; }
    if (!ok) continue;
    T.stat(p.c, p.kind);
    T.decor.push({ kind: 'block', tag: p.kind, c: p.c.c, h: p.c.h, yaw: p.c.yaw, ...(p.vis || {}) });
  }
  for (const a of arches) T.decor.push({ kind: 'arch', c: a.col.c, h: a.col.h, yaw: a.col.yaw, hole: a.hole });
  for (const l of lights) T.decor.push({ kind: 'light', ...l });
  return { zoneOf, at, arches };
}
