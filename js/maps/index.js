// Lista de mapas. Cada mapa: id, nombre, clave de récords, vueltas de la contrarreloj, salida (plataforma o en el aire),
// recorrido, tramos, medallas, colisionadores (build), vista (buildView), ambiente (atmo) y música.
import { DESIERTO, BASE_COURSE, SECTIONS as DESERT_SECTIONS } from '../track.js';
import laberintoDef from './laberinto.js';
import * as laberintoView from './laberinto-view.js';
import torresDef from './torres.js';
import * as torresView from './torres-view.js';

const desierto = {
  ...DESIERTO, name: 'Desierto de los sueños', key: 'desierto2', laps: 3, start: 'platform', course: BASE_COURSE,
  sections: DESERT_SECTIONS, atmo: null, zones: true, clouds: true,
  blurb: 'Torres de cera, cajones gigantes, péndulos, una puerta a la noche, una ballena de nubes y un lago espejo.',
  medals: { autor: 205, oro: 216, plata: 236, bronce: 262 },
};
const laberinto = { ...laberintoDef, atmo: laberintoView.atmo, buildView: laberintoView.buildView, music: laberintoView.MUSIC };

const torres = { ...torresDef, atmo: torresView.atmo, buildView: torresView.buildView, music: torresView.MUSIC, cloudLayout: torresView.CLOUDS };

export const MAPS = [desierto, laberinto, torres];
export const mapById = id => MAPS.find(m => m.id === id) || desierto;
