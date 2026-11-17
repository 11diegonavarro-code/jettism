// Hangar: piezas, estadísticas, pintura, calcomanías y extras del jet, y la configuración que se guarda y se envía.
// Cada pieza reparte puntos entre las cinco estadísticas sin cambiar el total: ninguna combinación es la mejor.

export const STATS = [['speed', 'Velocidad'], ['accel', 'Aceleración'], ['turn', 'Giro'], ['turbo', 'Turbo'], ['tricks', 'Piruetas']];

export const PIECES = {
  nose: {
    label: 'Morro',
    options: {
      halcon: { label: 'Halcón', desc: 'Equilibrado.', d: {} },
      aguja: { label: 'Aguja', desc: 'Largo y fino: más punta, gira y hace piruetas algo peor.', d: { speed: 2, turn: -1, tricks: -1 } },
      tiburon: { label: 'Tiburón', desc: 'Ancho y con boca: acelera y corre más, gira peor.', d: { accel: 1, speed: 1, turn: -2 } },
      cuna: { label: 'Cuña', desc: 'Corto y romo: gira mucho mejor, pierde punta y aceleración.', d: { turn: 2, speed: -1, accel: -1 } },
    },
  },
  wings: {
    label: 'Alas',
    options: {
      flecha: { label: 'Flecha', desc: 'Equilibradas.', d: {} },
      delta: { label: 'Delta', desc: 'Triángulo grande: más punta y turbo, gira y hace piruetas algo peor.', d: { speed: 1, turbo: 1, turn: -1, tricks: -1 } },
      recta: { label: 'Rectas', desc: 'Largas y rectas: giran mejor y hacen piruetas más rápido, pierden punta.', d: { turn: 1, tricks: 1, speed: -2 } },
      gaviota: { label: 'Gaviota', desc: 'Dobladas como un ala de gaviota: piruetas rápidas, menos turbo.', d: { tricks: 2, turn: 1, speed: -1, turbo: -2 } },
    },
  },
  engine: {
    label: 'Motor',
    options: {
      doble: { label: 'Doble', desc: 'Dos toberas: acelera fuerte, el turbo dura menos.', d: { accel: 2, turbo: -2 } },
      simple: { label: 'Simple', desc: 'Una tobera grande: el turbo dura algo más.', d: { turbo: 1, accel: -1 } },
      anillo: { label: 'Anillo', desc: 'Futurista, con aro de luz: el turbo dura mucho más.', d: { turbo: 2, accel: -1, speed: -1 } },
      vectorial: { label: 'Vectorial', desc: 'Toberas orientables: gira y hace piruetas mejor.', d: { turn: 1, tricks: 1, accel: -1, turbo: -1 } },
    },
  },
  tail: {
    label: 'Cola',
    options: {
      doble: { label: 'Doble deriva', desc: 'Dos derivas inclinadas: gira algo mejor.', d: { turn: 1, tricks: -1 } },
      una: { label: 'Una deriva', desc: 'Equilibrada.', d: {} },
      v: { label: 'En V', desc: 'Dos aletas en V: piruetas más rápidas.', d: { tricks: 2, turn: -1, accel: -1 } },
      sin: { label: 'Sin cola', desc: 'Ala volante: más punta, gira y hace piruetas peor.', d: { speed: 2, tricks: -1, turn: -1 } },
    },
  },
};

export const FINISHES = {
  brillo: { label: 'Brillante', metal: 0.3, rough: 0.2, env: 1.2 },
  mate: { label: 'Mate', metal: 0.05, rough: 0.72, env: 0.8 },
  metal: { label: 'Metálico', metal: 0.85, rough: 0.26, env: 1.4 },
  perla: { label: 'Perlado', metal: 0.5, rough: 0.16, env: 1.8 },
};

export const PALETTE = ['#d62839', '#f97316', '#f2b630', '#21b573', '#0fb5c4', '#2f6fe0', '#8b5cf6', '#ec4899', '#f3efe6', '#c9c9d1', '#2d3142', '#111318', '#7a4a2c', '#b8f04a', '#ff8fa8', '#3ee8ff'];

export const DECAL_SLOTS = [
  ['lados', 'Lados'], ['tomas', 'Tomas de aire'], ['alaSup', 'Alas (arriba)'], ['alaInf', 'Alas (abajo)'], ['morro', 'Morro'], ['lomo', 'Lomo'],
];
export const DECAL_IDS = ['llama', 'llamas', 'raya', 'rayas', 'estrella', 'estrellas', 'ojo', 'lagrima', 'dientes', 'rayo', 'luna', 'sol', 'espiral', 'nube', 'gota', 'corazon', 'alas', 'diana', 'cuadros', 'ola', 'hoja', 'pez', 'llave', 'mano', 'labios', 'bigote', 'escalera', 'reloj', 'letra', 'calavera'];
export const DECAL_LABELS = {
  llama: 'Llama', llamas: 'Llamas', raya: 'Raya', rayas: 'Rayas', estrella: 'Estrella', estrellas: 'Estrellas', ojo: 'Ojo', lagrima: 'Ojo que llora', dientes: 'Dientes',
  rayo: 'Rayo', luna: 'Luna', sol: 'Sol', espiral: 'Espiral', nube: 'Nube', gota: 'Gota', corazon: 'Corazón', alas: 'Alas', diana: 'Diana', cuadros: 'Cuadros',
  ola: 'Ola', hoja: 'Hoja', pez: 'Pez', llave: 'Llave', mano: 'Mano', labios: 'Labios', bigote: 'Bigote', escalera: 'Escalera', reloj: 'Reloj', letra: 'Inicial', calavera: 'Calavera',
};
export const HELMETS = { clasico: 'Clásico', aleta: 'Con aleta', antenas: 'Antenas', cresta: 'Cresta' };

export function defaultCfg(color = '#d62839') {
  return {
    nose: 'halcon', wings: 'flecha', engine: 'doble', tail: 'doble',
    paint: { c1: color, c2: '#f3efe6', c3: '#2d3142', finish: 'brillo' },
    decals: { lados: { id: 'llama', color: '#f2b630', size: 1, rot: 0, mirror: false } },
    smoke: '#ff8fa8', flame: '#f97316', helmet: { shape: 'clasico', color: '#f3efe6', visor: '#7a4a2c' },
    number: 7, tailName: '',
  };
}

const pick = (R, a) => a[Math.floor(R() * a.length)];
export function randomCfg(R = Math.random) {
  const c = defaultCfg(pick(R, PALETTE.slice(0, 8)));
  for (const k of ['nose', 'wings', 'engine', 'tail']) c[k] = pick(R, Object.keys(PIECES[k].options));
  c.paint.c2 = pick(R, PALETTE); c.paint.c3 = pick(R, ['#2d3142', '#111318', '#7a4a2c', '#c9c9d1']);
  c.paint.finish = pick(R, Object.keys(FINISHES));
  c.decals = {};
  for (const [slot] of DECAL_SLOTS) if (R() < 0.35) c.decals[slot] = { id: pick(R, DECAL_IDS.filter(d => d !== 'letra')), color: pick(R, PALETTE), size: 0.7 + R() * 0.7, rot: (R() - 0.5) * 0.6, mirror: R() < 0.3 };
  c.smoke = pick(R, PALETTE.slice(0, 8)); c.flame = pick(R, ['#f97316', '#3ee8ff', '#ec4899', '#b8f04a', '#f2b630']);
  c.helmet = { shape: pick(R, Object.keys(HELMETS)), color: pick(R, PALETTE), visor: pick(R, ['#7a4a2c', '#111318', '#3ee8ff', '#f2b630']) };
  c.number = Math.floor(R() * 100);
  return c;
}

// Limpia una configuración que llega de fuera (otro jugador, o el almacenamiento): nunca se confía en ella
const isColor = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const num = (v, a, b, d) => (Number.isFinite(+v) ? Math.min(b, Math.max(a, +v)) : d);
export function sanitizeCfg(c) {
  const d = defaultCfg();
  if (!c || typeof c !== 'object') return d;
  const out = defaultCfg(isColor(c.paint?.c1) ? c.paint.c1 : d.paint.c1);
  for (const k of ['nose', 'wings', 'engine', 'tail']) out[k] = PIECES[k].options[c[k]] ? c[k] : d[k];
  const p = c.paint || {};
  out.paint = { c1: isColor(p.c1) ? p.c1 : d.paint.c1, c2: isColor(p.c2) ? p.c2 : d.paint.c2, c3: isColor(p.c3) ? p.c3 : d.paint.c3, finish: FINISHES[p.finish] ? p.finish : 'brillo' };
  out.decals = {};
  if (c.decals && typeof c.decals === 'object') for (const [slot] of DECAL_SLOTS) {
    const x = c.decals[slot];
    if (x && DECAL_IDS.includes(x.id)) out.decals[slot] = { id: x.id, color: isColor(x.color) ? x.color : '#ffffff', size: num(x.size, 0.5, 1.6, 1), rot: num(x.rot, -3.15, 3.15, 0), mirror: !!x.mirror };
  }
  out.smoke = isColor(c.smoke) ? c.smoke : d.smoke;
  out.flame = isColor(c.flame) ? c.flame : d.flame;
  const h = c.helmet || {};
  out.helmet = { shape: HELMETS[h.shape] ? h.shape : 'clasico', color: isColor(h.color) ? h.color : d.helmet.color, visor: isColor(h.visor) ? h.visor : d.helmet.visor };
  out.number = Math.round(num(c.number, 0, 99, 7));
  out.tailName = String(c.tailName || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 10);
  return out;
}

// Estadísticas de 1 a 10 (5 de base) y su efecto en la física: ±1,2 % por punto (como mucho, un 12 % entre extremos)
export function statsOf(cfg) {
  const s = Object.fromEntries(STATS.map(([k]) => [k, 5]));
  for (const k of ['nose', 'wings', 'engine', 'tail']) for (const [st, v] of Object.entries(PIECES[k].options[cfg[k]].d)) s[st] += v;
  for (const k in s) s[k] = Math.max(1, Math.min(10, s[k]));
  return s;
}
export function statMultipliers(cfg) {
  const s = statsOf(cfg);
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, 1 + (v - 5) * 0.012]));
}
