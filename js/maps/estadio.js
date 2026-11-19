// Mapa abierto: el Estadio flotante, para el Aerobalón. Una cápsula enorme suspendida en el cielo (sin suelo: el espacio
// libre es la cápsula, fuera todo es pared), con una portería circular en cada extremo y dos parejas de portales en las
// paredes. El recorrido es un óvalo por dentro (para el vuelo libre y los bots en los demás modos).
// JS puro (también se simula en Node); lo que se dibuja está en estadio-view.js.
import { V3 } from '../math.js';

export const ARENA = { c: new V3(0, 600, 0), half: 380, r: 190 }; // eje a lo largo de z, de c.z − half a c.z + half
// porterías: anillo en el plano perpendicular a z; la del equipo 0 (rojo) en z −, la del 1 (azul) en z +
export const GOALS = [{ team: 0, c: new V3(0, 600, -ARENA.half - 30), n: new V3(0, 0, 1), r: 72 }, { team: 1, c: new V3(0, 600, ARENA.half + 30), n: new V3(0, 0, -1), r: 72 }];
// portales: parejas a y b (centro, normal hacia dentro); lo que entra por uno sale por el otro
// el disco flota a 22 m de la pared (si estuviera pegado, la bola rebotaría en la pared antes de tocarlo)
const pt = (ang, z) => { const a = (ang * Math.PI) / 180, r = ARENA.r - 22; return { c: new V3(Math.cos(a) * r, 600 + Math.sin(a) * r, z), n: new V3(-Math.cos(a), -Math.sin(a), 0), r: 26 }; };
export const PORTALS = [
  { a: pt(0, -150), b: pt(180, 150), color: '#ffb000' },
  { a: pt(90, 160), b: pt(270, -160), color: '#00d8ff' },
];
const GATES = [[0, 600, 300, 'l'], [120, 560, 0, 'l'], [0, 600, -300, 'l'], [-120, 640, 0, 'l']];
export const COURSE = { name: 'Estadio flotante', gates: GATES, boosts: [] };

export function build(T) {
  const A = ARENA, D = T.decor;
  // el hueco: cápsula (dos esferas en los extremos y un tubo), con las porterías un poco fuera
  T.stat({ type: 'void', shapes: [{ t: 'c', a: new V3(A.c.x, A.c.y, A.c.z - A.half), b: new V3(A.c.x, A.c.y, A.c.z + A.half), r: A.r }, ...GOALS.map(g => ({ t: 's', c: g.c, r: g.r + 30 }))] }, 'wall');
  // los aros de las porterías (chocan: hay que entrar por el centro)
  for (const g of GOALS) for (let k = 0; k < 24; k++) { const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2; T.stat({ type: 'capsule', a: new V3(g.c.x + Math.cos(a0) * g.r, g.c.y + Math.sin(a0) * g.r, g.c.z), b: new V3(g.c.x + Math.cos(a1) * g.r, g.c.y + Math.sin(a1) * g.r, g.c.z), r: 2.5 }, 'goalring'); }
  D.push({ kind: 'arena' });
}

export default {
  id: 'estadio', name: 'Estadio flotante', key: 'estadio1', laps: 1, start: 'air', seed: 191, groundY: -10000,
  blurb: 'Una cápsula enorme flotando en el cielo, sin suelo, con una portería circular en cada extremo y portales en las paredes: el campo del Aerobalón.',
  course: COURSE, sections: [], build,
  medals: { autor: 20, oro: 22, plata: 25, bronce: 29 },
};
