// Lista de mapas. Cada mapa: id, nombre, clave de récords, vueltas de la contrarreloj, salida (plataforma o en el aire),
// recorrido, tramos, medallas, colisionadores (build), vista (buildView), ambiente (atmo) y música.
import { DESIERTO, BASE_COURSE, SECTIONS as DESERT_SECTIONS } from '../track.js';
import laberintoDef from './laberinto.js';
import * as laberintoView from './laberinto-view.js';
import torresDef from './torres.js';
import * as torresView from './torres-view.js';
import nudosDef from './nudos.js';
import * as nudosView from './nudos-view.js';
import collageDef from './collage.js';
import * as collageView from './collage-view.js';

const desierto = {
  ...DESIERTO, name: 'Desierto de los sueños', key: 'desierto3', laps: 1, start: 'platform', course: BASE_COURSE,
  sections: DESERT_SECTIONS, atmo: null, zones: true, clouds: true,
  blurb: 'Torres de cera, cajones gigantes, péndulos, una puerta a la noche, una ballena de nubes y un lago espejo.',
  medals: { autor: 68, oro: 72.5, plata: 78, bronce: 86 },
};
const laberinto = { ...laberintoDef, atmo: laberintoView.atmo, buildView: laberintoView.buildView, music: laberintoView.MUSIC };

const torres = { ...torresDef, atmo: torresView.atmo, buildView: torresView.buildView, music: torresView.MUSIC, cloudLayout: torresView.CLOUDS };

const nudos = { ...nudosDef, atmo: nudosView.atmo, buildView: nudosView.buildView, music: nudosView.MUSIC, cloudLayout: nudosView.CLOUDS };

const collage = { ...collageDef, atmo: collageView.atmo, buildView: collageView.buildView, music: collageView.MUSIC, cloudLayout: collageView.CLOUDS };

// Niveles: de la paleta más viva a la más oscura, y con ellos la dificultad, la música y la tensión de la cámara
const LEVELS = ['collage', 'torres', 'desierto', 'espiral', 'tunel', 'laberinto', 'plano', 'nudos', 'campo', 'sombra'];
const all = { collage, torres, desierto, laberinto, nudos };
export const MAPS = LEVELS.map((id, i) => all[id] && Object.assign(all[id], {
  tension: i / (LEVELS.length - 1),
  // el tempo sube con el nivel: de 82 a unos 150 pulsos por minuto
  music: { ...(all[id].music || {}), bpm: Math.round(82 + i * 7.5), tension: i / (LEVELS.length - 1) },
})).filter(Boolean).map((m, i) => Object.assign(m, { level: i + 1 })); // número de nivel según los mapas ya hechos
export const mapById = id => MAPS.find(m => m.id === id) || MAPS[0];
