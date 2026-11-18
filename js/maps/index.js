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
import espiralDef from './espiral.js';
import * as espiralView from './espiral-view.js';
import tunelDef from './tunel.js';
import * as tunelView from './tunel-view.js';
import planoDef from './plano.js';
import * as planoView from './plano-view.js';
import campoDef from './campo.js';
import * as campoView from './campo-view.js';
import luzDef from './luz.js';
import * as luzView from './luz-view.js';
import jardinDef from './jardin.js';
import * as jardinView from './jardin-view.js';
import rostroDef from './rostro.js';
import * as rostroView from './rostro-view.js';
import ambarDef from './ambar.js';
import * as ambarView from './ambar-view.js';

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

const espiral = { ...espiralDef, atmo: espiralView.atmo, buildView: espiralView.buildView, music: espiralView.MUSIC, cloudLayout: espiralView.CLOUDS };

const tunel = { ...tunelDef, atmo: tunelView.atmo, buildView: tunelView.buildView, music: tunelView.MUSIC, cloudLayout: tunelView.CLOUDS };

const plano = { ...planoDef, atmo: planoView.atmo, buildView: planoView.buildView, music: planoView.MUSIC, cloudLayout: planoView.CLOUDS };

const campo = { ...campoDef, atmo: campoView.atmo, buildView: campoView.buildView, music: campoView.MUSIC, cloudLayout: campoView.CLOUDS };

const luz = { ...luzDef, atmo: luzView.atmo, buildView: luzView.buildView, music: luzView.MUSIC, cloudLayout: luzView.CLOUDS };

// Niveles: de la paleta más viva a la más oscura, y con ellos la dificultad, la música y la tensión de la cámara
const jardin = { ...jardinDef, atmo: jardinView.atmo, buildView: jardinView.buildView, music: jardinView.MUSIC, cloudLayout: jardinView.CLOUDS };

const rostro = { ...rostroDef, atmo: rostroView.atmo, buildView: rostroView.buildView, music: rostroView.MUSIC, cloudLayout: rostroView.CLOUDS };

const ambar = { ...ambarDef, atmo: ambarView.atmo, buildView: ambarView.buildView, music: ambarView.MUSIC, cloudLayout: ambarView.CLOUDS };

// 18 huecos: los que aún no están hechos se saltan (el número de nivel se cuenta solo con los hechos)
const LEVELS = ['collage', 'jardin', 'torres', 'rostro', 'desierto', 'ambar', 'espiral', 'liquido', 'tunel', 'mar', 'laberinto', 'escaleras', 'plano', 'nudos', 'campo', 'ojos', 'luz', 'estelar'];
// dificultad por tramos de tres huecos, como en los juegos de plataformas de ritmo; los Demonio: un choque y a empezar
export const DIFFS = [['Fácil', '#58f0a0'], ['Normal', '#3ee8ff'], ['Difícil', '#f2b630'], ['Muy difícil', '#f97316'], ['Locura', '#ec4899'], ['Demonio', '#ff2a2a']];
const all = { collage, jardin, torres, rostro, desierto, ambar, espiral, tunel, laberinto, plano, nudos, campo, luz };
export const MAPS = LEVELS.map((id, i) => all[id] && Object.assign(all[id], {
  slot: i, tension: i / (LEVELS.length - 1), diff: Math.floor(i / 3), demon: Math.floor(i / 3) === DIFFS.length - 1,
  // el tempo sube con el nivel: de 82 a unos 153 pulsos por minuto
  music: { ...(all[id].music || {}), bpm: Math.round(82 + i * 4.2), tension: i / (LEVELS.length - 1) },
})).filter(Boolean).map((m, i) => Object.assign(m, { level: i + 1 })); // número de nivel según los mapas ya hechos
export const mapById = id => MAPS.find(m => m.id === id) || MAPS[0];
