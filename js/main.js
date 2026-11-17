// Jettism: vuelo, piruetas, contrarreloj con fantasma, vuelo libre y carreras de hasta 8 (amigos y bots).
import * as THREE from 'three';
import { createWorld, QUALITY, SUN } from './world.js';
import { Track } from './track.js';
import { MAPS, mapById } from './maps/index.js';
import { Race } from './race.js';
import { encodeCourse, decodeCourse, courseId, CourseStore, cleanCourseName } from './course.js';
import { Editor } from './editor.js';
import { CourseView } from './course-view.js';
import { Clouds } from './clouds.js';
import { buildJet } from './jet-model.js';
import { steerToward, applyAssist, collisionWarning } from './flight.js';
import { Autopilot } from './ai.js';
import { ComboParser, COMBO_HELP } from './tricks.js';
import { GhostRecorder, GhostPlayer, encodeGhost, decodeGhost, packGhost, unpackGhost } from './ghost.js';
import { Board } from './board.js';
import { FX } from './fx.js';
import { Sound, RemoteVoice } from './audio.js';
import { Music } from './music.js';
import { Input } from './input.js';
import { HUD, fmtTime } from './hud.js';
import { Net } from './net.js';
import { Racer, COLORS, BOT_NAMES } from './racers.js';
import { Hangar, HangarUI } from './hangar.js';
import { Items, ITEMS } from './items.js';
import { ReplayRecorder, ReplayPlayer, REPLAY_CAMS, CAM_LABEL } from './replay.js';
import { defaultCfg, randomCfg, sanitizeCfg } from './hangar-data.js';
import { V3, clamp, damp } from './math.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
// la clave del mapa cambia cuando cambia el recorrido, para no mezclar récords y fantasmas de versiones distintas
const STEP = 1 / 120, MAX_JETS = 8;
let MAP = 'desierto2'; // clave de los récords y del fantasma: la del mapa o la del circuito propio
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const touchDevice = matchMedia('(pointer: coarse)').matches;
// para meter nombres en HTML sin riesgo
const esc = t => String(t).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14) || 'Piloto';

// ---------- Ajustes ----------
const savedQ = store.get('jt-quality', 'alta');
const settings = {
  scheme: store.get('jt-scheme', touchDevice ? 'classic' : 'mouse'),
  assist: +store.get('jt-assist', 1),
  invert: store.get('jt-invert', '0') === '1',
  sens: +store.get('jt-sens', 1) || 1,
  volume: +store.get('jt-volume', 0.6),
  music: +store.get('jt-music', 0.35),
  board: store.get('jt-board', '1') === '1',
  quality: QUALITY[savedQ] ? savedQ : 'alta',
  gyro: store.get('jt-gyro', '0') === '1',
  name: cleanName(store.get('jt-name', 'Piloto' + Math.floor(Math.random() * 90 + 10))),
  color: COLORS.includes(store.get('jt-color', '')) ? store.get('jt-color', '') : COLORS[0],
};
// Configuración del jet (hangar): se guarda en el navegador y se envía a la sala
settings.cfg = (() => { try { const s = store.get('jt-cfg', ''); return s ? sanitizeCfg(JSON.parse(s)) : defaultCfg(settings.color); } catch { return defaultCfg(settings.color); } })();
const saveCfg = () => store.set('jt-cfg', JSON.stringify(settings.cfg));

// ---------- Motor ----------
const renderer = new THREE.WebGLRenderer({ antialias: settings.quality === 'baja', powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, QUALITY[settings.quality].maxRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const world = createWorld(renderer, settings.quality);
const { scene, camera } = world;
settings.map = mapById(store.get('jt-map', 'desierto')).id;
const track = new Track(mapById(settings.map));
MAP = track.map.key;
const view = new CourseView(scene, track, world.quality);
world.setMap(track.map.atmo ? track.map.atmo() : null);
// nubes sueltas: solo en el desierto (cuelgan de ellas los péndulos y el tren sale de ellas)
let clouds = null;
function syncClouds() {
  const want = track.map.clouds || track.map.cloudLayout;
  if (clouds && clouds.mapId !== track.map.id) { clouds.dispose(); clouds = null; }
  if (want && !clouds) {
    const C = track.map.cloudLayout, sd = track.map.atmo ? new THREE.Vector3(...(track.map.atmo().sunDir || [0, 1, 0])).normalize() : SUN;
    clouds = new Clouds(scene, track, world.quality, sd, C ? { layout: C.layout, lit: C.lit, shade: C.shade } : {});
    clouds.mapId = track.map.id;
  }
}
syncClouds();
const fx = new FX(scene, camera, world.quality);
// tramos con clima propio (solo en el desierto): noche tras la puerta y niebla rosa en el bosque
let ZONE = null;
const syncZones = () => { ZONE = track.map.zones ? { night0: track.sOf('puerta'), night1: track.sOf('lago'), pink0: track.sOf('bosque'), pink1: track.sOf('acantilado') } : null; };
syncZones();
const atm = { night: 0, pink: 0, steamT: 0 };
const sound = new Sound();
sound.volume = settings.volume;
// música: empieza con el primer clic o tecla (los navegadores no dejan sonar nada antes)
const music = new Music(sound);
music.volume = settings.music;
{ const init = sound.init.bind(sound); sound.init = () => { init(); music.start(); }; }
addEventListener('pointerdown', () => sound.init(), { once: true });
addEventListener('keydown', () => sound.init(), { once: true });
const input = new Input(renderer.domElement, settings);
const hud = new HUD();
const net = new Net();
// Objetos (misiles, minas, escudo y bengalas): cada pantalla decide sobre sus propios jets
const items = new Items(scene, track, fx, sound, {
  racers: () => racers,
  byId: id => racerById(id),
  owned: r => r.owned,
  send: m => { if (net.online) net.send(m); },
  onHit: (r, cause, by) => itemHit(r, cause, by),
  onShield: r => { if (r === me) { hud.feed('¡EL ESCUDO TE HA SALVADO!', 'near'); sound.sfx('shieldPop'); } },
});
addEventListener('resize', () => { world.resize(); fx.setPointScale(renderer, camera); });
fx.setPointScale(renderer, camera);

let ghostModel = null;
function rebuildGhost() {
  if (ghostModel) { scene.remove(ghostModel.group); ghostModel.dispose(); }
  ghostModel = buildJet(settings.cfg, { ghost: true });
  ghostModel.group.visible = false;
  scene.add(ghostModel.group);
}
rebuildGhost();
const hangar = new Hangar(renderer, scene.environment);
const hangarUI = new HangarUI(hangar, {
  onDone(cfg) {
    settings.cfg = cfg; saveCfg();
    settings.color = cfg.paint.c1; store.set('jt-color', settings.color);
    hangar.active = false;
    rebuildGhost(); renderColors();
    toMenu();
  },
});
addEventListener('resize', () => hangar.resize());
hangar.resize();

// ---------- Estado ----------
const game = {
  phase: 'menu', mode: null, paused: false, menuOpen: false, t: 0, clock: 0, autopilot: false, crashAt: null, outT: 0, finishT: 0,
  lastBoostEdge: -99, perfect: false, cd: 0, go: 0, laps: 3, resultsShown: false, inThermal: false, inWind: false, drafting: false,
};
// Sala (la lleva el anfitrión, o el propio jugador en las carreras contra bots)
let lobby = { players: [], bots: 5, laps: 3, diff: 'normal', racing: false };
let racers = [], me = null, jet, race, model, style, manual, ctl;
const meAp = new Autopilot(track, { skill: 0.9 });
const combo = new ComboParser();
const assistState = {};
const aim = { yaw: 0, pitch: 0, dir: new V3(0, 0, -1) };
let st = null, ghostRec = new GhostRecorder(), ghost = null, pendingTrick = null, warn = null, warnBeep = 0, wasLocked = false, prevBoost = false, sendT = 0;
const PLATFORM = new V3(0, 46.6, 44);
const slotPos = k => new V3(k % 2 ? 10 : -10, 46.6, 40 + Math.floor(k / 2) * 22);
const rec = { lap: null, total: null, style: 0, acro: 0 };
function loadRecords() {
  rec.lap = +store.get(`jt-${MAP}-lap`, 0) || null;
  rec.total = +store.get(`jt-${MAP}-total`, 0) || null;
  rec.style = +store.get(`jt-${MAP}-style`, 0) || 0;
  rec.acro = +store.get(`jt-${MAP}-acro`, 0) || 0;
}
loadRecords();
const playing = () => ['countdown', 'race', 'free', 'lobby'].includes(game.phase);
const multi = () => game.mode === 'race' || game.mode === 'lobby';
const myId = () => (net.online ? net.me : 'me');

// ---------- Circuitos ----------
const courses = new CourseStore(store);
let courseCode = null; // circuito puesto ahora (null: el original)
// circuito elegido en cada mapa (vacío: el original del mapa)
const courseKey = () => `jt-course-${track.map.id}`;
settings.course = store.get(courseKey(), track.map.id === 'desierto' ? store.get('jt-course', '') : '') || '';
const _bs = new V3();
// Posición equivalente en el recorrido original (para el clima por zonas en los circuitos propios)
const baseS = p => track.base.spline.nearest(_bs.set(p.x, p.y, p.z)).s;
function courseName(code) { if (!code) return track.map.course.name; try { return decodeCourse(code).name; } catch { return '¿?'; } }
// Cambia de mapa: recorrido, colisionadores, decorado, luz, objetos, récords y música; los jets que vuelan siguen
function applyMap(id) {
  const m = mapById(id);
  if (m === track.map) return false;
  track.load(m);
  courseCode = null;
  view.load(m); view.setNextGate(0);
  world.setMap(m.atmo ? m.atmo() : null);
  syncClouds(); syncZones();
  items.layout();
  MAP = m.key; loadRecords(); ghost = null;
  for (const r of racers) { r.race = new Race(track, r.race.laps, r.race.dir, r.race.flying); r.race.teleport(r.jet.pos); r.L = track.length; if (r.ap) r.ap.hint = -1; }
  if (me) setMe(me);
  meAp.hint = -1;
  music.setTheme(m.music);
  settings.course = store.get(courseKey(), '') || '';
  try { renderer.compile(scene, camera); } catch { /* se compila al dibujar */ }
  return true;
}
function selectMap(id) { settings.map = mapById(id).id; store.set('jt-map', settings.map); }
// Medallas de la contrarreloj de cada mapa (tiempo total: 3 vueltas en el desierto, 1 en los demás)
const MEDALS = [['autor', '🏆', 'Autor'], ['oro', '🥇', 'Oro'], ['plata', '🥈', 'Plata'], ['bronce', '🥉', 'Bronce']];
const medalOf = (m, time) => (time && m.medals ? MEDALS.find(([k]) => time <= m.medals[k]) || null : null);
// Muestra «Cargando…» un par de fotogramas antes de algo que tarda (construir un mapa)
function withLoading(text, fn) {
  $('loading').textContent = text; $('loading').hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => { try { fn(); } finally { $('loading').hidden = true; } }));
}
function openMaps() {
  const box = $('mapCards');
  box.innerHTML = '';
  for (const m of MAPS) {
    const best = +store.get(`jt-${m.key}-total`, 0) || null, md = medalOf(m, best), b = document.createElement('button');
    b.className = 'mapCard' + (m.id === track.map.id ? ' on' : '');
    b.innerHTML = `<div class="thumb" style="background-image:url(img/mapas/${m.id}.jpg)"></div><b>${esc(m.name)}</b><small>${esc(m.blurb || '')}</small>` +
      `<span class="mrow">${md ? `${md[1]} ${md[2]}` : 'Sin medalla'} · tu mejor: ${best ? fmtTime(best) : '—'}</span>` +
      `<span class="mrow dim">Contrarreloj de ${m.laps} ${m.laps === 1 ? 'vuelta' : 'vueltas'} · oro ${fmtTime(m.medals.oro)} · autor ${fmtTime(m.medals.autor)}</span>`;
    b.onclick = () => { selectMap(m.id); withLoading(`Cargando «${m.name}»…`, () => toMenu()); };
    box.appendChild(b);
  }
  showOverlay('maps');
}
// Pone un circuito (o el original): puertas, anillos, objetos, récords; los jets que ya vuelan siguen con la carrera nueva
function applyCourse(code) {
  code = code || null;
  let c = null;
  if (code) { try { c = decodeCourse(code); } catch { code = null; } }
  if (c && c.map !== track.map.id) applyMap(c.map); // un circuito de otro mapa lleva a ese mapa
  if (code === courseCode) return;
  track.setCourse(c);
  courseCode = code;
  view.buildGates(); view.setNextGate(0);
  items.layout();
  MAP = code ? courseId(code) : track.map.key;
  loadRecords(); ghost = null;
  for (const r of racers) { r.race = new Race(track, r.race.laps, r.race.dir, r.race.flying); r.race.teleport(r.jet.pos); r.L = track.length; if (r.ap) r.ap.hint = -1; }
  if (me) setMe(me);
  meAp.hint = -1;
}
function selectCourse(code) { settings.course = code || ''; store.set(courseKey(), settings.course); }
// Lista para un desplegable: el original, mis circuitos y, si hace falta, el de la sala
function fillCourseSelect(sel, value, withBase = true) {
  const list = courses.list(track.map.id);
  sel.innerHTML = (withBase ? `<option value="">${esc(track.map.course.name)} (original)</option>` : '') + list.map(c => `<option value="${esc(c.code)}">${esc(c.name)}</option>`).join('');
  if (value && !list.some(c => c.code === value)) sel.insertAdjacentHTML('beforeend', `<option value="${esc(value)}">${esc(courseName(value))}</option>`);
  sel.value = value || '';
}

function setMe(r) { me = r; jet = r.jet; race = r.race; model = r.model; style = r.style; manual = r.manual; ctl = r.ctl; }
function clearRacers(keepMe = false) {
  for (const r of racers) if (!(keepMe && r === me)) r.dispose();
  racers = keepMe && me ? [me] : [];
}
function newMe(laps = 3, flying = false) {
  const r = new Racer(scene, track, { id: myId(), name: settings.name, cfg: settings.cfg, owned: true, me: true, laps, flying });
  racers.push(r);
  setMe(r);
  sound.setEngine(settings.cfg.engine);
  return r;
}

function loadGhost() {
  const s = store.get(`jt-${MAP}-ghost`, '');
  if (!s) return null;
  try { return new GhostPlayer(decodeGhost(s)); } catch { return null; }
}
function syncAim() {
  aim.yaw = Math.atan2(-jet.fwd.x, -jet.fwd.z);
  aim.pitch = Math.asin(clamp(jet.fwd.y, -1, 1));
  updateAimDir();
}
function updateAimDir() {
  aim.pitch = clamp(aim.pitch, -1.45, 1.45);
  const cp = Math.cos(aim.pitch);
  aim.dir.set(-Math.sin(aim.yaw) * cp, Math.sin(aim.pitch), -Math.cos(aim.yaw) * cp);
}
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
}

// ---------- Partidas ----------
function resetRun() {
  race.reset(0); style.reset(); manual.reset(); combo.state = 'idle';
  ghostRec.reset(); pendingTrick = null; warn = null;
  jet.turbo = 30; fx.clearTrails(); view.setNextGate(0);
  Object.assign(game, { crashAt: null, outT: 0, perfect: false, lastBoostEdge: -99, cd: 0, resultsShown: false, menuOpen: false, drafting: false });
  me.finishTime = null;
  me.smoke.clear();
}
// Partida en solitario: deja solo mi jet
function soloRacers(laps, flying = false) {
  net.close();
  clearRacers();
  newMe(laps, flying);
  resetModes();
}
// Vuelve a lo normal: sin modo especial, sin objetos, sin noche forzada y en el sentido normal
function resetModes() {
  game.rules = null; game.forceNight = false; meAp.dir = 1;
  items.enable(false);
  touchItems();
}
// quick: reinicio instantáneo (sin cuenta atrás si la salida es lanzada; 1,2 s si es desde la plataforma)
function startTrial(laps, quick = false) {
  sound.init();
  game.trialLaps = laps || +params.get('laps') || track.map.laps;
  const flying = track.map.start === 'air' || !!track.custom;
  soloRacers(game.trialLaps, flying);
  game.mode = 'trial'; game.phase = 'countdown'; game.paused = false; game.autopilot = DEBUG && params.has('auto');
  resetRun();
  run = { splits: [] };
  pbSplits = (() => { try { return JSON.parse(store.get(`jt-${MAP}-splits`, '[]')); } catch { return []; } })();
  me.start = startSpot({ kind: 'carrera', dir: 1 }, 0, true);
  me.place(me.start.pos, me.start.fwd, 0, 99);
  syncAim();
  ghost = loadGhost();
  showOverlay(null); hud.show(true); cam.cut = true;
  touchTrial();
  lockIfNeeded();
  if (quick && flying) { game.t = 0; game.go = performance.now(); launch(); }
  else { const cd = quick ? 1.2 : 3.6; game.go = performance.now() + cd * 1000; game.t = -cd; }
}
// Botón táctil de reiniciar: solo en la contrarreloj
function touchTrial() { const b = document.querySelector('#touch [data-btn=restart]'); if (b) b.hidden = game.mode !== 'trial'; }
// Salida: desde la plataforma (un poco hacia arriba) o, al revés y en combate, desde el aire
function launchRacer(r) {
  const S = r.start || { pos: PLATFORM, fwd: new V3(0, 0, -1), air: false }, p = 0.12;
  const pos = S.air ? S.pos.clone() : S.pos.clone().add(new V3(0, 0.3, 0)), fwd = S.air ? S.fwd.clone() : new V3(0, Math.sin(p), -Math.cos(p));
  r.jet.spawn(pos, fwd, 72, rules().kind === 'combate' ? 3 : 1);
  r.jet.turbo = 30;
  r.race.reset(0); r.race.teleport(r.jet.pos);
  r.prevPos.copy(r.jet.pos); r.prevQ.copy(r.jet.q);
  if (r.ap) r.ap.hint = -1;
}
function launch() {
  game.phase = 'race';
  for (const r of racers) if (r.owned) launchRacer(r);
  recorder.reset(racers);
  syncAim();
  sound.sfx('launch'); sound.sfx('beep', 1);
  hud.center('¡YA!', '', 0.8);
  if (game.lastBoostEdge > -0.3) perfectStart();
}
function perfectStart() {
  if (game.perfect) return;
  game.perfect = true;
  jet.turbo = Math.min(100, jet.turbo + 25);
  hud.feed('¡SALIDA PERFECTA! +25 TURBO', 'trick');
}
function startFree() {
  sound.init();
  soloRacers(Infinity);
  game.mode = 'free'; game.phase = 'free'; game.paused = false; game.autopilot = DEBUG && params.has('auto');
  resetRun();
  game.t = 0;
  const s = track.gates[0].s - 260, S = track.spline;
  me.place(S.pointAt(s), S.tangentAt(s), 85, 2);
  race.reset(0); race.teleport(jet.pos);
  syncAim();
  showOverlay(null); hud.show(true); cam.cut = true;
  lockIfNeeded();
}
// Menú: mi jet y tres bots vuelan solos por el recorrido de fondo
function toMenu(msg = '') {
  net.close();
  editorTest = false;
  applyMap(settings.map);
  applyCourse(settings.course);
  fillCourseSelect($('courseMenu'), settings.course);
  $('mapName').textContent = track.map.name;
  $('mapBlurb').textContent = `${track.map.blurb} Modos: carrera, carrera con objetos, copa, combate aéreo y acrobacias. Con el editor puedes trazar tus propios circuitos por el mismo mapa.`;
  $('btnTrial').textContent = `Contrarreloj · ${track.map.laps} ${track.map.laps === 1 ? 'vuelta' : 'vueltas'}`;
  clearRacers();
  newMe(Infinity);
  resetModes();
  game.phase = 'menu'; game.mode = null; game.paused = false; game.autopilot = true;
  hud.show(false); ghostModel.group.visible = false; hud.warn(0);
  showOverlay('menu');
  $('menuMsg').textContent = msg;
  input.exitLock();
  sound.silence();
  resetRun();
  const S = track.spline;
  const s = track.gates[1].s + 200;
  me.place(S.pointAt(s), S.tangentAt(s), 90, 2);
  for (let k = 0; k < 3; k++) {
    const b = new Racer(scene, track, { id: 'D' + k, name: BOT_NAMES[k], cfg: randomCfg(), bot: true, owned: true, laps: Infinity });
    const sb = s + 120 + k * 260;
    b.place(S.pointAt(sb), S.tangentAt(sb), 90, 2);
    racers.push(b);
  }
  cam.cut = true;
  updateRecords();
  setupJoin();
}
function restart() {
  if (game.mode === 'free') startFree();
  else if (game.mode === 'race' && !net.online) startRace(null);
  else startTrial(game.trialLaps);
}

function respawnRacer(r) {
  let p = r.race.respawnPoint();
  // en combate se reaparece en cualquier punto del mapa, con 3 s de escudo
  if (game.mode === 'race' && rules().kind === 'combate') {
    const g = track.gates[Math.floor(Math.random() * track.gates.length)], S = track.spline;
    p = { pos: S.pointAt(g.s + 30), fwd: S.tangentAt(g.s + 30) };
    r.shieldT = 3;
  }
  r.jet.spawn(p.pos, p.fwd, 72, 1.5);
  r.jet.turbo = Math.max(r.jet.turbo, 15);
  r.race.teleport(r.jet.pos);
  r.prevPos.copy(r.jet.pos); r.prevQ.copy(r.jet.q);
  r.manual.reset();
  if (r.ap) r.ap.hint = -1;
}
function respawn() {
  respawnRacer(me);
  combo.state = 'idle'; pendingTrick = null; meAp.hint = -1;
  syncAim(); fx.clearTrails();
  game.crashAt = null; game.outT = 0;
  cam.cut = true;
}

// ---------- Sala y carreras con varios jets ----------
const MODES = {
  carrera: { label: 'Carrera', info: 'Carrera normal: turbo, rebufo y piruetas.' },
  objetos: { label: 'Carrera con objetos', info: 'Recoge objetos en los anillos morados: misil, escudo, mina y bengalas. Los que van detrás reciben mejores objetos.' },
  copa: { label: 'Copa', info: 'Tres carreras seguidas: normal, al revés y de noche. Puntos por puesto (10, 8, 6, 5, 4, 3, 2, 1) y +3/+2/+1 a los tres con más estilo de cada carrera.' },
  combate: { label: 'Combate aéreo', info: 'Todos contra todos por el mapa. Tienes misiles que se recargan: fija a un rival delante de ti y dispara. Gana quien más derribe.' },
  acro: { label: 'Acrobacias', info: 'Vuela libre por el mapa y encadena piruetas. Gana quien más puntos de estilo consiga.' },
};
const CUP_PTS = [10, 8, 6, 5, 4, 3, 2, 1];
const ACRO_TRICKS = ['tonel', 'derrape', 'looping', 'campana', 'immelmann', 'splitS', 'barrena', 'cobra'];
const newLobby = (players, bots) => ({ players, bots, map: settings.map, course: settings.course || null, laps: lobby.laps || 3, diff: lobby.diff || 'normal', mode: lobby.mode || 'carrera', time: lobby.time || 180, racing: false });
const rules = () => game.rules || { kind: 'carrera', dir: 1 };
const timed = () => ['combate', 'acro'].includes(rules().kind);
// Carrera contra bots (sin red): la «sala» es solo la ventana de ajustes
function openBotsLobby() {
  sound.init();
  net.close();
  lobby = newLobby([{ pid: 'me', name: settings.name, cfg: settings.cfg }], lobby.bots || 5);
  game.cup = null;
  backTo = 'menu';
  showOverlay('lobby');
  renderLobby();
}
async function hostRoom() {
  sound.init();
  $('menuMsg').textContent = 'Creando sala…';
  try {
    await net.createRoom();
    lobby = newLobby([{ pid: 'H', name: settings.name, cfg: settings.cfg }], 3);
    game.cup = null;
    history.replaceState(null, '', `#${net.code}`);
    enterLobby();
  } catch (e) { $('menuMsg').textContent = 'No se pudo crear la sala: ' + (e.message || e); }
}
async function join(code) {
  sound.init();
  $('menuMsg').textContent = 'Conectando… (puede tardar unos segundos)';
  try {
    await net.joinRoom(code, { name: settings.name, cfg: settings.cfg });
    $('menuMsg').textContent = '';
    toast(net.via === 'directa' ? 'Conectado' : 'Conectado (vía servidor)');
    lobby = newLobby([], 0);
    enterLobby();
  } catch (e) { $('menuMsg').textContent = e.message || String(e); }
}
// Sala online: todos vuelan libres por el mapa mientras el anfitrión prepara la carrera
function enterLobby() {
  clearRacers();
  newMe(Infinity);
  game.mode = 'lobby'; game.phase = 'lobby'; game.paused = false; game.autopilot = false; game.rules = null; game.forceNight = false;
  items.enable(false);
  resetRun();
  game.t = 0;
  const S = track.spline, s = track.gates[0].s - 200 - Math.random() * 300;
  me.place(S.pointAt(s).add(new V3((Math.random() - 0.5) * 60, 10 + Math.random() * 30, 0)), S.tangentAt(s), 85, 3);
  syncAim();
  syncLobbyRacers();
  hud.show(true); cam.cut = true;
  game.menuOpen = true;
  backTo = 'lobby';
  showOverlay('lobby');
  renderLobby();
  if (net.host) broadcastLobby();
}
// En la sala se ven los demás jugadores volando
function syncLobbyRacers() {
  if (game.mode !== 'lobby') return;
  for (const p of lobby.players) {
    if (p.pid === myId() || racers.some(r => r.id === p.pid)) continue;
    racers.push(new Racer(scene, track, { id: p.pid, name: p.name, cfg: p.cfg, laps: Infinity }));
  }
  for (const r of [...racers]) if (r !== me && !lobby.players.some(p => p.pid === r.id)) { r.dispose(); racers.splice(racers.indexOf(r), 1); }
}
function broadcastLobby() {
  lobby.racing = game.mode === 'race';
  net.send({ t: 'lobby', lobby });
  renderLobby();
}
function renderLobby() {
  const L = lobby, ul = $('players'), online = net.online, hosting = !online || net.host;
  $('lobbyTitle').textContent = online ? `Sala ${net.code}` : 'Partida contra bots';
  $('linkBox').hidden = !online;
  if (online) $('link').value = `${location.origin}${location.pathname}#${net.code}`;
  ul.innerHTML = '';
  for (const p of L.players) {
    const li = document.createElement('li'), dot = document.createElement('span');
    dot.className = 'dot'; dot.style.background = sanitizeCfg(p.cfg).paint.c1;
    li.append(dot, document.createTextNode(p.name + (online && p.pid === 'H' ? ' (anfitrión)' : '') + (p.pid === myId() ? ' — tú' : '')));
    ul.appendChild(li);
  }
  const maxBots = MAX_JETS - L.players.length;
  L.bots = Math.min(L.bots, maxBots);
  $('hostOpts').hidden = !hosting;
  if (hosting) {
    $('mapSel').innerHTML = MAPS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    $('mapSel').value = track.map.id;
    fillCourseSelect($('courseSel'), L.course || '');
  }
  $('courseInfo').textContent = hosting ? '' : `Mapa: ${mapById(L.map).name} · circuito: ${courseName(L.course)}`;
  $('btnSaveCourse').hidden = hosting || !L.course || courses.list().some(c => c.code === L.course);
  $('mode').value = L.mode || 'carrera';
  $('modeInfo').textContent = (MODES[L.mode] || MODES.carrera).info;
  const isTimed = L.mode === 'combate' || L.mode === 'acro';
  $('lapsRow').hidden = isTimed; $('timeRow').hidden = !isTimed;
  $('bots').max = maxBots; $('bots').value = L.bots; $('botsVal').textContent = L.bots;
  $('laps').value = L.laps; $('lapsVal').textContent = L.laps;
  $('time').value = String(L.time || 180);
  $('diff').value = L.diff;
  $('btnStart').textContent = L.mode === 'copa' ? '¡Empezar la copa!' : L.mode === 'combate' ? '¡Empezar el combate!' : L.mode === 'acro' ? '¡Empezar!' : '¡Empezar la carrera!';
  $('waitMsg').hidden = hosting;
  $('waitMsg').textContent = L.racing ? 'Hay una partida en marcha: entrarás en la siguiente.' : `Esperando a que el anfitrión empiece · ${(MODES[L.mode] || MODES.carrera).label}`;
  $('btnFly').hidden = !online;
  $('lobbyHint').hidden = !online;
}
// El anfitrión (o el jugador solo) reparte la parrilla y da la salida
function startRace(sameGrid = null) {
  const humans = net.online ? lobby.players : [{ pid: 'me', name: settings.name, cfg: settings.cfg }];
  const kind = lobby.mode || 'carrera';
  // la copa empieza de cero o pasa a la siguiente carrera
  if (kind === 'copa' && (!game.cup || game.cup.done || sameGrid === null)) game.cup = { round: 0, pts: {}, done: false };
  if (kind !== 'copa') game.cup = null;
  const round = game.cup ? game.cup.round : 0;
  let all = sameGrid;
  if (!all) {
    // los bots salen con jets al azar (el anfitrión los elige y los manda, para que todos los vean igual)
    const bots = Array.from({ length: Math.min(lobby.bots, MAX_JETS - humans.length) }, (_, k) => (
      { id: 'B' + k, name: BOT_NAMES[(k + Math.floor(Math.random() * BOT_NAMES.length)) % BOT_NAMES.length], cfg: randomCfg(), bot: true }
    ));
    const names = new Set();
    for (const b of bots) { while (names.has(b.name)) b.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; names.add(b.name); }
    all = [...humans.map(p => ({ id: p.pid, name: p.name, cfg: p.cfg, bot: false })), ...bots];
  }
  const slots = all.map((_, i) => i).sort(() => Math.random() - 0.5);
  const R = { kind, laps: timed2(kind) ? Infinity : lobby.laps, time: lobby.time || 180, dir: kind === 'copa' && round === 1 ? -1 : 1, night: kind === 'copa' && round === 2, round };
  const msg = { t: 'start', map: track.map.id, course: lobby.course || null, go: net.hostNow() + 4200, laps: R.laps === Infinity ? 0 : R.laps, diff: lobby.diff, rules: { ...R, laps: R.laps === Infinity ? 0 : R.laps }, cup: game.cup, grid: all.map((p, i) => ({ id: p.id, name: p.name, cfg: p.cfg, bot: p.bot, slot: slots[i] })) };
  if (net.online) net.send(msg);
  beginRace(msg);
  if (net.online) broadcastLobby();
}
const timed2 = kind => kind === 'combate' || kind === 'acro';
// Dónde empieza cada jet según el modo: la plataforma, el aire antes de la meta (al revés) o repartidos (combate)
function clearSpot(p) {
  for (let k = 0; k < 12 && (track.nearest(p, 30).d < 9 || p.y < 15); k++) p.y += 12;
  return p;
}
// solo: un único jet (contrarreloj): sale justo sobre la línea
function startSpot(R, slot, solo = false) {
  const S = track.spline;
  if ((track.custom || track.map.start === 'air') && R.dir > 0 && R.kind !== 'combate') {
    const s = track.length - 110 - Math.floor(slot / 2) * 24, f = S.frame(s);
    return { pos: clearSpot(f.P.clone().addScaled(f.R, solo ? 0 : slot % 2 ? 10 : -10)), fwd: f.T, air: true };
  }
  if (R.kind === 'combate') {
    const g = track.gates[(slot * 3 + 1) % track.gates.length], s = g.s + 40;
    return { pos: S.pointAt(s), fwd: S.tangentAt(s), air: true };
  }
  if (R.dir < 0) {
    const s = 260 + Math.floor(slot / 2) * 24, f = S.frame(s);
    return { pos: clearSpot(f.P.clone().addScaled(f.R, slot % 2 ? 10 : -10)), fwd: f.T.clone().scale(-1), air: true };
  }
  return { pos: slotPos(slot), fwd: new V3(0, 0, -1), air: false };
}
function beginRace(m) {
  sound.init();
  if (m.map) applyMap(m.map);
  applyCourse(m.course || null);
  clearRacers();
  const R = { kind: 'carrera', dir: 1, night: false, round: 0, ...(m.rules || {}) };
  R.laps = timed2(R.kind) ? Infinity : (R.laps || m.laps || 3);
  game.rules = R;
  if (m.cup) game.cup = m.cup;
  const hostSide = !net.online || net.host;
  for (const g of m.grid) {
    const mine = g.id === myId();
    const r = new Racer(scene, track, { id: g.id, name: g.name, cfg: mine ? settings.cfg : g.cfg, bot: g.bot, owned: mine || (g.bot && hostSide), me: mine, laps: R.laps, diff: m.diff, dir: R.dir });
    r.slot = g.slot;
    r.start = startSpot(R, g.slot);
    r.place(r.start.pos, r.start.fwd, 0, 99);
    if (r.ap && R.kind === 'acro') { r.ap.trickPool = ACRO_TRICKS; r.ap.skill = 1; }
    if (R.kind === 'combate') r.ammo = 2;
    racers.push(r);
    if (mine) setMe(r);
  }
  if (!me) { newMe(R.laps); me.start = startSpot(R, 7); me.place(me.start.pos, me.start.fwd, 0, 99); }
  meAp.dir = R.dir;
  items.clear();
  items.enable(R.kind === 'objetos' || R.kind === 'combate');
  touchItems();
  precompile();
  game.mode = 'race'; game.phase = 'countdown'; game.paused = false; game.autopilot = DEBUG && params.has('auto');
  game.laps = R.laps; game.go = m.go; game.forceNight = !!R.night;
  resetRun();
  game.t = (net.hostNow() - game.go) / 1000;
  syncAim();
  showOverlay(null); hud.show(true); cam.cut = true;
  const sub = R.kind === 'copa' ? `Copa · carrera ${R.round + 1} de 3${R.dir < 0 ? ' · al revés' : R.night ? ' · de noche' : ''}` : MODES[R.kind]?.label;
  if (sub) hud.sectionName(sub);
  lockIfNeeded();
}
// Compila los materiales de todos los jets durante la cuenta atrás, para que no haya tirones cuando aparecen en pantalla
function precompile() {
  for (const r of racers) r.model.group.visible = true;
  try { renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : renderer.compile(scene, camera); } catch { /* no pasa nada */ }
}
function racerById(id) { return racers.find(r => r.id === id); }
// En el reflejo del lago solo salen los jets cercanos (cada jet reflejado es otra pasada de dibujo)
const mirrorHidden = [];
world.mirrorHooks.before = () => {
  for (const r of racers) {
    const g = r.model.group;
    if (r !== me && g.visible && r.view.p.distanceTo(camera.position) > 350) { g.visible = false; mirrorHidden.push(g); }
  }
};
world.mirrorHooks.after = () => { for (const g of mirrorHidden) g.visible = true; mirrorHidden.length = 0; };
const styleOf = r => (r.owned ? r.style.total : r.styleTotal || 0);
// Clasificación según el modo: derribos en combate, estilo en acrobacias y lo recorrido en las carreras
function standings() {
  const k = rules().kind;
  if (game.mode === 'race' && k === 'combate') return [...racers].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  if (game.mode === 'race' && k === 'acro') return [...racers].sort((a, b) => styleOf(b) - styleOf(a));
  return [...racers].sort((a, b) => b.progress() - a.progress());
}

// Un jet propio (el mío o un bot del anfitrión) ha terminado
function finishRacer(r, time) {
  r.finishTime = time;
  if (net.online) net.send({ t: 'ev', k: 'fin', id: r.id, time, best: r.race.best, style: r.style.total });
}
function checkRaceEnd() {
  if (game.mode !== 'race' || game.resultsShown || game.phase === 'countdown') return;
  if (timed()) { if (game.t >= rules().time) { game.phase = 'finished'; game.autopilot = true; sound.sfx('finish'); hud.center('¡TIEMPO!', '', 2.4); showRaceResults(); } return; }
  const fin = racers.filter(r => r.finishTime != null);
  if (!fin.length) return;
  const first = Math.min(...fin.map(r => r.finishTime));
  const done = fin.length === racers.length || (me.finishTime != null && game.t - me.finishTime > 20) || game.t - first > 60;
  if (done) showRaceResults();
}
// Puntos de la copa de esta carrera: por puesto y por estilo
function addCupPoints(order) {
  const C = game.cup;
  if (!C || C.scored === C.round) return;
  C.scored = C.round;
  order.forEach((r, i) => { C.pts[r.id] = C.pts[r.id] || { name: r.name, bot: r.bot, pts: 0 }; C.pts[r.id].pts += CUP_PTS[i] || 0; });
  [...racers].sort((a, b) => styleOf(b) - styleOf(a)).slice(0, 3).forEach((r, i) => { C.pts[r.id].pts += [3, 2, 1][i]; });
  if (C.round >= 2) C.done = true;
}
function showRaceResults() {
  game.resultsShown = true;
  const R = rules(), order = standings();
  const table = $('resTable');
  const row = (cells, cls) => { const tr = document.createElement('tr'); if (cls) tr.className = cls; for (const text of cells) { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); } table.appendChild(tr); };
  table.innerHTML = '';
  if (R.kind === 'combate') {
    row(['#', 'Piloto', 'Derribos', 'Caídas', '']);
    order.forEach((r, i) => row([`${i + 1}º`, r.name + (r.bot ? ' 🤖' : ''), String(r.kills), String(r.deaths), ''], r === me ? 'me' : ''));
  } else if (R.kind === 'acro') {
    row(['#', 'Piloto', 'Estilo', '', '']);
    order.forEach((r, i) => row([`${i + 1}º`, r.name + (r.bot ? ' 🤖' : ''), styleOf(r).toLocaleString('es-ES'), '', ''], r === me ? 'me' : ''));
    if (styleOf(me) > (rec.acro || 0)) { rec.acro = styleOf(me); store.set(`jt-${MAP}-acro`, String(rec.acro)); }
  } else {
    row(['#', 'Piloto', 'Tiempo', 'Mejor vuelta', 'Estilo']);
    order.forEach((r, i) => {
      const best = r.owned ? r.race.best : r.best;
      row([`${i + 1}º`, r.name + (r.bot ? ' 🤖' : ''), r.finishTime != null ? fmtTime(r.finishTime) : '—', best ? fmtTime(best) : '—', styleOf(r).toLocaleString('es-ES')], r === me ? 'me' : '');
    });
  }
  const pos = order.indexOf(me) + 1;
  $('resTitle').textContent = pos === 1 ? '¡Has ganado!' : `Has quedado ${pos}º de ${order.length}`;
  $('resBody').innerHTML = '';
  // copa: tabla acumulada
  if (R.kind === 'copa' && game.cup) {
    if (!net.online || net.host) { addCupPoints(order); if (net.online) net.send({ t: 'cup', cup: game.cup }); }
    renderCup();
  }
  const btns = $('resBtns');
  btns.innerHTML = '';
  const add = (text, fn, primary) => { const b = document.createElement('button'); b.textContent = text; if (primary) b.className = 'primary'; b.onclick = fn; btns.appendChild(b); };
  const again = () => startRace(R.kind === 'copa' && game.cup && !game.cup.done ? racers.map(r => ({ id: r.id, name: r.name, cfg: r.cfg, bot: r.bot })) : null);
  const nextLabel = R.kind === 'copa' && game.cup && !game.cup.done ? `Carrera ${game.cup.round + 2} de 3` : R.kind === 'copa' ? 'Otra copa' : 'Otra vez';
  const advance = () => { if (R.kind === 'copa' && game.cup && !game.cup.done) game.cup.round++; again(); };
  add('Ver repetición', () => startReplay(), false);
  if (!net.online) { add(nextLabel, advance, true); add('Cambiar', openBotsLobby); add('Menú', () => toMenu()); }
  else if (net.host) {
    if (R.kind === 'copa' && game.cup && !game.cup.done) add(nextLabel, advance, true);
    add('Volver a la sala', () => { net.send({ t: 'tolobby' }); enterLobby(); }, !(R.kind === 'copa' && game.cup && !game.cup.done));
    add('Cerrar la sala', () => toMenu());
  } else add('Salir de la sala', () => toMenu());
  $('resWait').textContent = net.online && !net.host ? 'Esperando al anfitrión…' : '';
  input.exitLock();
  showOverlay('results');
}
function renderCup() {
  const C = game.cup;
  if (!C) return;
  const list = Object.entries(C.pts).sort((a, b) => b[1].pts - a[1].pts);
  $('resBody').innerHTML = `<h3>${C.done ? '🏆 Clasificación final de la copa' : `Copa · después de la carrera ${C.round + 1} de 3`}</h3>` +
    `<table class="combos results">${list.map(([id, p], i) => `<tr class="${id === me.id ? 'me' : ''}"><td>${i + 1}º</td><td>${esc(p.name)}${p.bot ? ' 🤖' : ''}</td><td>${p.pts} puntos</td></tr>`).join('')}</table>` +
    (C.done ? `<p class="msg">¡${esc(list[0][1].name)} gana la copa!</p>` : '');
}

// ---------- Red ----------
net.on('join', m => {
  if (!net.host) return;
  if (lobby.players.length >= MAX_JETS) return;
  const p = { pid: m.from, name: cleanName(m.name), cfg: sanitizeCfg(m.cfg) };
  lobby.players.push(p);
  toast(`${p.name} se ha unido`);
  syncLobbyRacers();
  broadcastLobby();
});
net.on('leave', m => {
  const p = lobby.players.find(x => x.pid === m.from), r = racerById(m.from);
  if (p || r) toast(`${(p || r).name} se ha ido`);
  if (net.host) { lobby.players = lobby.players.filter(x => x.pid !== m.from); broadcastLobby(); }
  if (r && r !== me) { r.dispose(); racers.splice(racers.indexOf(r), 1); }
});
net.on('lobby', m => {
  if (net.host) return;
  lobby = m.lobby;
  if (game.mode === 'lobby' && lobby.map && lobby.map !== track.map.id) applyMap(lobby.map);
  if (game.mode === 'lobby' && (lobby.course || null) !== courseCode) applyCourse(lobby.course);
  syncLobbyRacers();
  if (!$('lobby').hidden) renderLobby();
});
net.on('start', m => { if (!net.host) beginRace(m); });
net.on('tolobby', () => { if (!net.host) enterLobby(); });
net.on('st', m => {
  const now = performance.now();
  for (const e of m.rs || []) {
    const r = racerById(e[0]);
    if (r && !r.owned) r.receive(e, now);
  }
});
const ITEM_EVENTS = ['mfire', 'mine', 'mhit', 'minehit', 'mlost', 'flares'];
net.on('ev', m => {
  if (ITEM_EVENTS.includes(m.k)) { if (items.on && !(m.k === 'flares' && racerById(m.id)?.owned)) items.onNet(m); return; }
  const r = racerById(m.id);
  if (!r || r.owned) return;
  if (m.k === 'crash') {
    if (game.phase === 'replay') return;
    fx.explosion(m.p, m.v);
    fx.eject(m.p, m.v, r.cfg);
    recorder.event({ k: 'boom', id: r.id, p: m.p, v: m.v });
    creditCrash(r, m.by);
    if (r.view.p.distanceTo(camera.position) < 600) sound.sfx('explosion');
  } else if (m.k === 'trick') {
    r.tricks.push({ name: m.name, t: m.t });
    if (r.tricks.length > 6) r.tricks.shift();
  } else if (m.k === 'fin') {
    r.finishTime = m.time; r.best = m.best; r.styleTotal = m.style;
    if (game.mode === 'race') hud.feed(`${r.name} ha llegado a la meta`, 'info');
  }
});
net.on('cup', m => { if (!net.host) { game.cup = m.cup; if (!$('results').hidden) renderCup(); } });
net.on('hostgone', () => toMenu('El anfitrión ha cerrado la sala.'));
function sendState() {
  const rs = racers.filter(r => r.owned).map(r => r.pack());
  if (rs.length) net.send({ t: 'st', rs });
}

// ---------- Física (paso fijo) ----------
function buildControls() {
  if (game.autopilot || game.menuOpen || game.phase === 'menu' || game.phase === 'finished') {
    meAp.control(jet, STEP, ctl, game.clock);
    ctl.aimed = true;
    return;
  }
  const busy = combo.busy() || st.trickHeld;
  ctl.trick = null;
  ctl.pitch = busy ? 0 : st.pitch;
  ctl.roll = busy ? 0 : st.roll;
  ctl.yaw = st.yaw;
  ctl.throttle = busy ? 0 : st.throttle;
  ctl.boost = st.boost;
  ctl.aimed = false;
  if (st.mouseAim && !jet.trick) {
    const manualRoll = ctl.roll;
    steerToward(jet, aim.dir, ctl);
    if (Math.abs(manualRoll) > 0) ctl.roll = manualRoll;
    if (Math.abs(st.yaw) > 0) ctl.yaw = st.yaw;
    ctl.aimed = true;
  }
  applyAssist(jet, ctl, settings.assist, STEP, assistState, warn);
}

// Un jet propio da un paso: el mío con los mandos, los bots con su piloto automático
function stepRacer(r, ev, awards) {
  const J = r.jet, isMe = r === me;
  r.prevPos.copy(J.pos); r.prevQ.copy(J.q);
  if (J.alive) {
    if (isMe) buildControls(); else botControl(r);
    const want = isMe ? (ctl.trick || pendingTrick) : r.ctl.trick;
    if (want) {
      const ok = J.startTrick(want.name, want.side, game.t);
      if (ok && J.trick && J.trick.t === 0) noteTrick(r, want.name);
      if (isMe) { pendingTrick = null; ctl.trick = null; } else r.ctl.trick = null;
    }
    J.step(STEP, r.ctl, track, game.t, ev);
    if (J.alive) r.race.update(J, game.t, ev);
    if (J.alive && !J.trick) r.manual.step(STEP, game.t, J, awards);
    // puerta saltada: aviso y, al poco, vuelta justo antes de ella
    if (J.alive && items.on && game.phase === 'race') {
      const got = items.pickup(r, r.prevPos, () => placeFrac(r), isCombat());
      if (got && isMe) { sound.sfx('pickup'); hud.feed(`${ITEMS[got].icon} ${ITEMS[got].label.toUpperCase()}`, 'near'); }
      if (!isMe) botItems(r, STEP);
      if (isCombat()) reload(r, STEP);
    }
    if (J.alive && r.race.missed && game.phase === 'race' && !timed()) {
      r.missT = (r.missT || 0) + STEP;
      if (isMe && r.missT < STEP * 1.5) { hud.center('¡Te has saltado una puerta!', 'small', 1.5); sound.sfx('trickFail'); }
      if (r.missT > (isMe ? 1.5 : 0.3)) { r.missT = 0; isMe ? respawn() : respawnRacer(r); }
    } else r.missT = 0;
    if (isMe && game.mode === 'trial' && game.phase === 'race' && race.lap >= 1) ghostRec.sample(game.t - race.lapStart, J);
  } else {
    J.step(STEP, r.ctl, track, game.t, ev);
    if (J.crashT <= 0) isMe ? respawn() : respawnRacer(r);
  }
}
// Guarda y anuncia una pirueta (para las formaciones)
function noteTrick(r, name) {
  if (name === 'cobra' && items.on && r.owned) items.evade(r, 'cobra');
  r.tricks.push({ name, t: game.clock });
  if (r.tricks.length > 6) r.tricks.shift();
  if (net.online) net.send({ t: 'ev', k: 'trick', id: r.id, name, t: game.clock });
}
// ¿Algún jet cercano ha hecho la misma pirueta casi a la vez?
function inFormation(r, name) {
  const p = r.view.p;
  return racers.some(o => o !== r && o.view.alive && o.view.p.distanceTo(p) < 35 && o.tricks.some(x => x.name === name && Math.abs(x.t - game.clock) < 3.2));
}

function physicsStep() {
  game.clock += STEP;
  if (['race', 'free', 'finished', 'lobby'].includes(game.phase)) game.t += STEP;
  track.update(game.clock);
  for (const r of racers) {
    if (!r.owned) continue;
    const ev = [], awards = [];
    stepRacer(r, ev, awards);
    if (r === me) handleEvents(ev, awards); else handleBotEvents(r, ev, awards);
  }
}

function award(a) {
  const formation = multi() && inFormation(me, a.name);
  const r = style.award(a.name, { ...a, now: game.t, tricksStat: jet.stats.tricks, formation });
  jet.turbo = Math.min(100, jet.turbo + r.turbo);
  if (a.manual) noteTrick(me, a.name);
  if (game.phase === 'menu') return;
  const mult = r.mult > 1 ? ` ×${r.mult.toFixed(1).replace('.', ',')}` : '';
  hud.feed(`${r.label.toUpperCase()}${r.manual ? ' A MANO' : ''} +${r.pts}${mult}${formation ? ' · ¡FORMACIÓN ×2!' : ''}`, r.manual ? 'manual trick' : 'trick');
  sound.sfx('trick', style.chain);
}

function handleBotEvents(r, ev, awards) {
  for (const e of ev) {
    if (e.type === 'crash') {
      fx.explosion(e.p, e.v);
      fx.eject(e.p, e.v, r.cfg);
      r.style.breakChain(); r.manual.reset();
      if (game.phase !== 'menu' && r.view.p.distanceTo(camera.position) < 600) sound.sfx('explosion');
      if (net.online) net.send({ t: 'ev', k: 'crash', id: r.id, p: e.p, v: e.v, by: e.by });
      recorder.event({ k: 'boom', id: r.id, p: e.p, v: e.v });
      creditCrash(r, e.by);
    } else if (e.type === 'scrape') fx.sparks(e.p);
    else if (e.type === 'near') { r.jet.turbo = Math.min(100, r.jet.turbo + 8); if (items.on) items.evade(r, 'near'); }
    else if (e.type === 'trickEnd') awards.push({ name: e.name, start: e.start });
    else if (e.type === 'boostRing') { r.jet.turbo = Math.min(100, r.jet.turbo + 30); r.jet.vel.addScaled(r.jet.fwd, 12); }
    else if (e.type === 'gate' && e.ring) r.jet.turbo = Math.min(100, r.jet.turbo + 5);
    else if (e.type === 'finish' && game.mode === 'race') finishRacer(r, e.time);
  }
  for (const a of awards) {
    const res = r.style.award(a.name, { ...a, now: game.t, formation: multi() && inFormation(r, a.name) });
    r.jet.turbo = Math.min(100, r.jet.turbo + res.turbo);
  }
}

function handleEvents(ev, awards) {
  const menu = game.phase === 'menu';
  for (const e of ev) {
    switch (e.type) {
      case 'crash':
        fx.explosion(e.p, e.v);
        fx.eject(e.p, e.v, me.cfg);
        game.crashAt = new THREE.Vector3(e.p.x, e.p.y, e.p.z);
        style.breakChain(); manual.reset(); combo.state = 'idle'; pendingTrick = null;
        cam.shake = 1.2;
        if (net.online) net.send({ t: 'ev', k: 'crash', id: me.id, p: e.p, v: e.v, by: e.by });
        recorder.event({ k: 'boom', id: me.id, p: e.p, v: e.v });
        creditCrash(me, e.by);
        if (!menu) { sound.sfx('explosion'); sound.sfx('chute'); hud.center(e.by && e.by !== me.id ? '¡DERRIBADO!' : '¡BOOM!', 'small', 1.4); }
        break;
      case 'scrape':
        fx.sparks(e.p); fx.puff(e.p); cam.shake = Math.max(cam.shake, 0.5);
        if (!menu) sound.sfx('scrape');
        break;
      case 'near': {
        const gain = Math.round(5 + 10 * (1 - e.dist / 6));
        jet.turbo = Math.min(100, jet.turbo + gain);
        style.bonus(25);
        if (items.on) items.evade(me, 'near');
        cam.shake = Math.max(cam.shake, 0.15);
        if (!menu) { hud.feed(`¡ROCE! +${gain} TURBO`, 'near'); sound.sfx('near'); }
        break;
      }
      case 'sonic':
        fx.sonic(model.group); cam.shake = Math.max(cam.shake, 0.7);
        if (!menu) { sound.sfx('sonic'); hud.feed('¡ESTAMPIDO SÓNICO!', 'info'); }
        break;
      case 'trickEnd': awards.push({ name: e.name, start: e.start }); break;
      case 'trickFail':
        style.breakChain();
        if (!menu) { hud.feed('Pirueta interrumpida', 'bad'); sound.sfx('trickFail'); }
        break;
      case 'gate': {
        const g = track.gates[e.i];
        trialGate(e);
        view.setNextGate(race.next);
        if (e.ring) { jet.turbo = Math.min(100, jet.turbo + 5); fx.ringBurst(g.p, g.t, g.ring); }
        if (!menu) {
          sound.sfx(e.ring ? 'ring' : 'gate');
          const sec = !track.custom && (track.map.sections || []).find(([i]) => i === e.i && i > 0);
          if (sec) hud.sectionName(sec[1]);
        }
        break;
      }
      case 'boostRing':
        jet.turbo = Math.min(100, jet.turbo + 30);
        jet.vel.addScaled(jet.fwd, 12);
        fx.ringBurst(jet.pos, jet.fwd, 7, '#ff9a40');
        if (!menu) { hud.feed('ANILLO DE TURBO +30', 'near'); sound.sfx('boostRing'); }
        break;
      case 'lap': onLap(e); break;
      case 'finish': onFinish(e); break;
    }
  }
  for (const a of awards) award(a);
}

// ---------- Récords: parciales, medallas, fantasma rival y tabla mundial ----------
let run = { splits: [] }, pbSplits = [], rival = null;
const runTime = () => (race.flying ? game.t - race.runStart : game.t);
// Cada puerta de la contrarreloj: parcial comparado con el de tu récord
function trialGate(e) {
  if (game.mode !== 'trial' || game.phase !== 'race') return;
  if (race.flying && e.i === 0 && race.lap === 1 && !race.lapTimes.length) { ghostRec.reset(); return; } // la salida lanzada
  const t = runTime();
  run.splits.push(t);
  const pb = pbSplits[run.splits.length - 1];
  if (pb != null) showSplit(t - pb);
}
function showSplit(d) {
  const el = $('split');
  el.textContent = `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(3).replace('.', ',')}`;
  el.className = 'sh ' + (d < 0 ? 'good' : 'bad');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}
const PID = (() => { let id = store.get('jt-pid', ''); if (!/^[a-z0-9]{10}$/.test(id)) { id = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''); store.set('jt-pid', id); } return id; })();
const board = new Board();
// Tiempos posibles en la tabla de un mapa (los imposibles se descartan)
const boardCheck = e => e.t >= (track.custom ? 5000 : (track.map.medals?.autor || 10) * 600) && e.t < 1800000;
// Fantasma rival (de la tabla mundial o de un reto por enlace), en rosa
const rivalModel = buildJet(settings.cfg, { ghost: true, ghostColor: 0xff6fd8 });
rivalModel.group.visible = false;
scene.add(rivalModel.group);
function setRival(name, time, data) {
  try { rival = { name, time, key: MAP, player: new GhostPlayer(data) }; toast(`Fantasma rival: ${name} · ${fmtTime(time)}`); } catch { rival = null; toast('Ese fantasma no se puede cargar'); }
}
// Publica mi récord en la tabla mundial (si está activado) con el fantasma de mi mejor vuelta
async function publishRecord(total) {
  if (!settings.board) return;
  const g = store.get(`jt-${MAP}-ghost`, '');
  let packed = '';
  try { packed = g ? packGhost(decodeGhost(g)) : ''; } catch { packed = ''; }
  try {
    const n = await board.publish(MAP, PID, { v: 1, n: settings.name, t: Math.round(total * 1000), c: settings.color, d: Date.now(), g: packed });
    if (n) toast('Récord subido a la tabla mundial');
  } catch { /* sin conexión: no pasa nada */ }
}
// Tabla mundial del mapa o circuito actual
async function openBoard(from = 'menu') {
  boardBack = from;
  const title = track.custom ? track.custom.name : track.map.name;
  $('boardTitle').textContent = `Récords mundiales · ${title}`;
  $('boardMsg').textContent = 'Cargando…';
  $('boardTable').innerHTML = '';
  showOverlay('board');
  const key = MAP;
  let list;
  try { list = await board.fetch(key, boardCheck); } catch (err) { $('boardMsg').textContent = 'No se ha podido conectar con los servidores. Prueba más tarde.'; return; }
  if (key !== MAP || $('board').hidden) return;
  const T = $('boardTable'), mine = list.findIndex(e => e.pid === PID);
  $('boardMsg').textContent = list.length ? `${list.length} ${list.length === 1 ? 'piloto' : 'pilotos'}${mine >= 0 ? ` · tú vas ${mine + 1}º` : rec.total ? ' · tu récord aún no está subido' : ''}` : 'Aún no hay tiempos: ¡sé el primero!';
  T.innerHTML = '<tr><td>#</td><td>Piloto</td><td>Tiempo</td><td></td><td></td></tr>';
  list.slice(0, 30).forEach((e, i) => {
    const tr = document.createElement('tr'), md = track.custom ? null : medalOf(track.map, e.t / 1000);
    if (e.pid === PID) tr.className = 'me';
    for (const txt of [`${i + 1}º`, cleanName(e.n), fmtTime(e.t / 1000), md ? md[1] : '']) { const td = document.createElement('td'); td.textContent = txt; tr.appendChild(td); }
    const td = document.createElement('td');
    if (typeof e.g === 'string' && e.g.length > 20 && e.pid !== PID) {
      const b = document.createElement('button'); b.textContent = '👻 Correr contra él'; b.className = 'mini';
      b.onclick = () => { try { setRival(cleanName(e.n), e.t / 1000, unpackGhost(e.g)); startTrial(); } catch { toast('Ese fantasma no se puede cargar'); } };
      td.appendChild(b);
    }
    tr.appendChild(td); T.appendChild(tr);
  });
}
let boardBack = 'menu';
// Enlace para retar a un amigo: lleva mi fantasma, mi tiempo y, si es un circuito propio, el circuito
function challengeLink() {
  const g = store.get(`jt-${MAP}-ghost`, '');
  if (!g || !rec.total) return null;
  const data = JSON.stringify({ v: 1, k: MAP, m: track.map.id, c: courseCode || '', n: settings.name, t: Math.round(rec.total * 1000), g: packGhost(decodeGhost(g)) });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(data))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  // va tras «#»: el navegador no lo envía al servidor (GitHub Pages rechaza direcciones tan largas)
  return `${location.origin}${location.pathname}#reto=${b64}`;
}

function onLap(e) {
  if (game.mode === 'race') {
    sound.sfx('lap');
    if (!race.finished) hud.center(`VUELTA ${e.lap + 1}/${race.laps}\n${fmtTime(e.time)}`, 'small', 1.8);
    return;
  }
  if (game.mode !== 'trial' || game.phase === 'menu') { if (game.mode === 'free') hud.feed(`VUELTA ${fmtTime(e.time)}`, 'info'); ghostRec.reset(); return; }
  const best = !rec.lap || e.time < rec.lap;
  if (best) {
    rec.lap = e.time;
    store.set(`jt-${MAP}-lap`, e.time.toFixed(3));
    store.set(`jt-${MAP}-ghost`, encodeGhost(ghostRec.data()));
    ghost = loadGhost();
  }
  ghostRec.reset();
  sound.sfx('lap');
  if (!race.finished) hud.center(best ? `VUELTA ${e.lap}\n${fmtTime(e.time)}\n¡RÉCORD!` : `VUELTA ${e.lap}\n${fmtTime(e.time)}`, 'small', 2);
  if (best) sound.sfx('record');
}

function onFinish(e) {
  game.phase = 'finished'; game.finishT = 0; game.autopilot = true;
  sound.sfx('finish');
  if (game.mode === 'race') {
    finishRacer(me, e.time);
    const pos = standings().indexOf(me) + 1;
    hud.center(`¡META!\n${pos}º`, '', 3);
    input.exitLock();
    return;
  }
  hud.center('¡META!', '', 2.4);
  const total = e.time, prevTotal = rec.total, newTotal = !rec.total || total < rec.total, newStyle = style.total > rec.style;
  if (newTotal) { rec.total = total; store.set(`jt-${MAP}-total`, total.toFixed(3)); store.set(`jt-${MAP}-splits`, JSON.stringify(run.splits)); publishRecord(total); }
  if (prevTotal && run.splits.length) showSplit(total - prevTotal);
  const md = track.custom ? null : medalOf(track.map, total), best = track.custom ? null : medalOf(track.map, rec.total);
  const nextM = track.custom ? null : [...MEDALS].reverse().find(([k]) => track.map.medals[k] < rec.total);
  const medalLine = track.custom ? '' : `<p style="text-align:center;font-weight:800">${md ? `${md[1]} Medalla de ${md[2].toLowerCase()}` : 'Sin medalla'}${nextM ? ` · siguiente: ${nextM[1]} ${fmtTime(track.map.medals[nextM[0]])} (te faltan ${(rec.total - track.map.medals[nextM[0]]).toFixed(3).replace('.', ',')} s)` : best ? ' · ¡tienes todas!' : ''}</p>`;
  if (newStyle) { rec.style = style.total; store.set(`jt-${MAP}-style`, String(style.total)); }
  const laps = race.lapTimes.map((t, i) => `Vuelta ${i + 1}: <b>${fmtTime(t)}</b>${t === race.best ? ' ⭐' : ''}`).join('<br>');
  $('resTitle').textContent = newTotal ? '¡Nuevo récord!' : '¡Meta!';
  $('resTable').innerHTML = '';
  $('resWait').textContent = '';
  $('resBody').innerHTML = `<p style="font-size:30px;text-align:center;margin:6px 0;color:var(--gold)"><b>${fmtTime(total)}</b>${prevTotal && !newTotal ? `<small style="font-size:15px;color:#ff8a8a"> +${(total - prevTotal).toFixed(3).replace('.', ',')}</small>` : prevTotal && newTotal ? `<small style="font-size:15px;color:#58f0a0"> −${(prevTotal - total).toFixed(3).replace('.', ',')}</small>` : ''}</p>
    ${medalLine}
    <p>${laps}</p>
    <p>Estilo: <b>${style.total.toLocaleString('es-ES')}</b> puntos en ${style.count} piruetas${newStyle ? ' · ¡récord de estilo!' : ''}</p>
    <p class="hint">Récords: vuelta ${fmtTime(rec.lap)} · carrera ${fmtTime(rec.total)} · estilo ${rec.style.toLocaleString('es-ES')}. El fantasma cian es tu mejor vuelta${rival && rival.key === MAP ? ` y el rosa, el de ${esc(rival.name)} (${fmtTime(rival.time)})` : ''}. <b>Retroceso</b> (o mantener Select) reinicia al instante.</p>`;
  const btns = $('resBtns');
  btns.innerHTML = '';
  const challenge = async () => { const l = challengeLink(); if (!l) { toast('Aún no tienes récord en este mapa'); return; } try { await navigator.clipboard.writeText(l); toast('Enlace del reto copiado: pásaselo a quien quieras retar'); } catch { prompt('Copia este enlace', l); } };
  const trialBtns = editorTest ? [['Volver al editor', () => openEditor(true), true], ['Repetir', () => startTrial(game.trialLaps, true)], ['Ver repetición', () => startReplay()]]
    : [['Repetir', () => startTrial(game.trialLaps, true), true], ['Ver repetición', () => startReplay()], ['Récords mundiales', () => openBoard('results')], ['Retar', challenge], ['Menú', () => toMenu()]];
  for (const [text, fn, primary] of trialBtns) {
    const b = document.createElement('button'); b.textContent = text; if (primary) b.className = 'primary'; b.onclick = fn; btns.appendChild(b);
  }
  input.exitLock();
}

function updateRecords() {
  const parts = [];
  if (rec.lap) parts.push(`vuelta ${fmtTime(rec.lap)}`, `carrera ${fmtTime(rec.total)}`, `estilo ${rec.style.toLocaleString('es-ES')}`);
  if (rec.acro) parts.push(`acrobacias ${rec.acro.toLocaleString('es-ES')}`);
  $('records').textContent = parts.length ? `Récords en «${track.custom ? track.custom.name : track.map.name}» · ${parts.join(' · ')}` : '';
}

// ---------- Interacción entre jets: rebufo y empujones ----------
const _d = new THREE.Vector3(), _vd = new THREE.Vector3();
function jetInteractions(dt) {
  for (const r of racers) {
    if (!r.owned || !r.jet.alive) { r.ctl.draft = 0; continue; }
    const J = r.jet;
    _vd.set(J.vel.x, J.vel.y, J.vel.z).normalize();
    let drafting = false;
    for (const o of racers) {
      if (o === r || !o.view.alive) continue;
      _d.set(o.view.p.x - J.pos.x, o.view.p.y - J.pos.y, o.view.p.z - J.pos.z);
      const dist = _d.length();
      // empujón al tocarse: cada uno se aparta por su lado
      if (dist < 6 && (r.bumpT -= dt) <= 0) {
        r.bumpT = 0.4;
        _d.normalize();
        J.vel.addScaled({ x: -_d.x, y: -_d.y, z: -_d.z }, 14);
        J.pos.addScaled({ x: -_d.x, y: -_d.y, z: -_d.z }, (6 - dist) * 0.5);
        if (r === me) { fx.sparks(J.pos); sound.sfx('scrape'); cam.shake = Math.max(cam.shake, 0.6); }
      }
      if (dist > 4 && dist < 48 && _d.dot(_vd) / dist > 0.975) drafting = true;
    }
    r.draftT = drafting ? r.draftT + dt : Math.max(0, r.draftT - dt * 2);
    r.ctl.draft = clamp((r.draftT - 0.3) / 0.4, 0, 1);
    if (r.ctl.draft > 0) J.turbo = Math.min(100, J.turbo + 5 * r.ctl.draft * dt);
  }
  if (me.ctl.draft >= 1 && !game.drafting && playing()) { game.drafting = true; hud.feed('¡REBUFO!', 'near'); }
  else if (me.ctl.draft === 0) game.drafting = false;
}

// ---------- Objetos y combate ----------
const LOCK_COS = Math.cos((22 * Math.PI) / 180), LOCK_RANGE = 900, LOCK_TIME = 0.6, RELOAD = 6, MAX_AMMO = 2;
let alarmT = 0, itemTxt = '';
const isCombat = () => game.mode === 'race' && rules().kind === 'combate';
// Puesto de 0 (primero) a 1 (último), para repartir los objetos
function placeFrac(r) { const o = standings(); return o.length > 1 ? o.indexOf(r) / (o.length - 1) : 0; }
// Botones táctiles de objeto (solo en los modos con objetos)
function touchItems() {
  for (const [b, on] of [['item', items.on], ['item2', items.on && isCombat()]]) { const el = document.querySelector(`#touch [data-btn=${b}]`); if (el) el.hidden = !on; }
}
// Un misil o una mina le ha dado a un jet propio: explota como si chocara, y el derribo es de quien lo lanzó
function itemHit(r, cause, by) {
  if (!r.jet.alive) return;
  const ev = [];
  r.jet.crash(ev, cause);
  ev[0].by = by;
  if (r === me) handleEvents(ev, []); else handleBotEvents(r, ev, []);
}
// Cuenta caídas y derribos (las caídas de los jets de la red llegan con su estado)
function creditCrash(r, by) {
  if (game.mode !== 'race' || game.phase === 'countdown') return;
  if (r.owned) { r.deaths++; r.item = null; }
  const k = by && by !== r.id ? racerById(by) : null;
  if (!k) return;
  if (k.owned) k.kills++;
  if (k === me) { hud.feed(`¡HAS DERRIBADO A ${r.name.toUpperCase()}!`, 'trick'); sound.sfx('kill'); style.bonus(150); }
  else hud.feed(r === me ? `${k.name} te ha derribado` : `${k.name} ha derribado a ${r.name}`, r === me ? 'bad' : 'info');
}
// El rival más fácil de fijar delante de un jet (dentro del cono y del alcance)
const _ld = new V3();
function findTarget(r, cone = LOCK_COS, range = LOCK_RANGE, dir = r.jet.fwd) {
  let best = null, bs = Infinity;
  const p = r.jet.pos;
  for (const o of racers) {
    if (o === r || !o.view.alive) continue;
    _ld.set(o.view.p.x - p.x, o.view.p.y - p.y, o.view.p.z - p.z);
    const d = _ld.len();
    if (d > range || d < 12) continue;
    const c = _ld.dot(dir) / d;
    if (c < cone) continue;
    const score = d * (2.2 - c);
    if (score < bs) { bs = score; best = o; }
  }
  return best;
}
// En la carrera con objetos, sin fijar, el misil va a por el de delante
function racerAhead(r) {
  const o = standings(), i = o.indexOf(r), a = i > 0 ? o[i - 1] : null;
  return a && a.view.alive && a.view.p.distanceTo(r.view.p) < 1500 ? a : null;
}
function useItem(r, target) {
  const it = r.item;
  if (!it) return false;
  if (it.id === 'misil' && !target) target = (r.lockT >= LOCK_TIME && r.lock) || (isCombat() ? null : racerAhead(r));
  items.use(r, it.id, target);
  if (--it.charges <= 0) r.item = null;
  if (r === me && it.id === 'escudo') hud.feed('ESCUDO ACTIVADO', 'near');
  return true;
}
function fireMissile(r, target) {
  if (r.ammo <= 0) { if (r === me) { hud.feed('Sin misiles: se recargan solos', 'bad'); sound.sfx('trickFail'); } return; }
  r.ammo--;
  items.use(r, 'misil', target);
}
function reload(r, dt) {
  if (r.ammo >= MAX_AMMO) { r.reloadT = 0; return; }
  if ((r.reloadT += dt) >= RELOAD) { r.reloadT = 0; r.ammo++; if (r === me) sound.sfx('pickup'); }
}
// Mis objetos: F o clic (misil u objeto), G o clic derecho (objeto en combate)
function playerItems() {
  if (!items.on || game.phase !== 'race' || !jet.alive || game.autopilot || game.menuOpen || game.paused) return;
  if (isCombat()) {
    if (st.fire) fireMissile(me, me.lockT >= LOCK_TIME ? me.lock : null);
    if (st.use2) useItem(me);
  } else if (st.fire || st.use2) useItem(me);
}
// Fijar blanco: mantener a un rival dentro del cono 0,6 s
function updateLock(dt) {
  const want = items.on && game.phase === 'race' && jet.alive && (isCombat() ? me.ammo > 0 : me.item?.id === 'misil');
  const mark = $('lockMark');
  if (!want) { me.lock = null; me.lockT = 0; mark.hidden = true; return; }
  const t = findTarget(me, LOCK_COS, LOCK_RANGE, st?.mouseAim ? aim.dir : jet.fwd);
  if (t !== me.lock) { me.lock = t; me.lockT = 0; } else if (t) {
    const was = me.lockT;
    me.lockT += dt;
    if (was < LOCK_TIME && me.lockT >= LOCK_TIME) sound.sfx('lock');
  }
  if (!me.lock) { mark.hidden = true; return; }
  const p = project(_o.copy(me.lock.view.p));
  if (!p.front) { mark.hidden = true; return; }
  const locked = me.lockT >= LOCK_TIME, sc = locked ? 1 : 1.8 - 0.8 * (me.lockT / LOCK_TIME);
  mark.hidden = false;
  mark.classList.toggle('on', locked);
  mark.style.transform = `translate(${p.x}px, ${p.y}px) rotate(45deg) scale(${sc})`;
}
// Bots en combate: persiguen a un rival y, si no, siguen el recorrido
function botControl(r) {
  const J = r.jet;
  // en los mapas estrechos no se persigue por libre (se estrellarían): siguen el recorrido y disparan a quien tengan delante
  if (isCombat() && game.phase === 'race' && !track.map.ai) {
    if ((r.pickT = (r.pickT || 0) - STEP) <= 0 || !r.prey || !r.prey.view.alive || !racers.includes(r.prey)) {
      r.pickT = 4 + Math.random() * 5;
      let best = null, bd = Infinity;
      for (const o of racers) { if (o === r || !o.view.alive) continue; const d = o.view.p.distanceTo(J.pos) * (0.6 + Math.random() * 0.8); if (d < bd) { bd = d; best = o; } }
      r.prey = best;
    }
    if (r.prey && r.prey.view.p.distanceTo(J.pos) < 1400 && J.pos.y > 25) { r.ap.chase(J, STEP, r.ctl, game.clock, r.prey.view.p, r.prey.view.v); return; }
  }
  r.ap.control(J, STEP, r.ctl, game.clock);
}
// Bots: cuándo usar cada objeto
function botItems(r, dt) {
  if ((r.itemThink = (r.itemThink || 0) - dt) > 0) return;
  r.itemThink = 0.2;
  const J = r.jet, threat = items.threats(r).some(m => m.p.dist(J.pos) < 260);
  if (isCombat() && r.ammo > 0) {
    const t = findTarget(r, LOCK_COS, 700);
    if (t) { r.aimT = (r.aimT || 0) + 0.2; if (r.aimT >= LOCK_TIME + 0.2 + Math.random() * 0.8) { r.aimT = 0; fireMissile(r, t); } } else r.aimT = 0;
  }
  const it = r.item;
  if (!it) { r.holdT = 0; return; }
  r.holdT = (r.holdT || 0) + 0.2;
  let use = false, target = null;
  if (it.id === 'escudo') use = threat || r.holdT > 12;
  else if (it.id === 'bengalas') use = threat || r.holdT > (it.charges < ITEMS.bengalas.charges ? 6 : 20);
  else if (it.id === 'mina') use = r.holdT > 2 && (racers.some(o => o !== r && o.view.alive && o.view.p.distanceTo(J.pos) < 160 && _ld.set(o.view.p.x - J.pos.x, o.view.p.y - J.pos.y, o.view.p.z - J.pos.z).dot(J.fwd) < 0) || r.holdT > 10);
  else if (it.id === 'misil') { target = findTarget(r, LOCK_COS, 900); use = (target && r.holdT > 1.2) || r.holdT > 9; if (!target) target = isCombat() ? null : racerAhead(r); }
  if (use) { useItem(r, target); r.holdT = 0; }
}
// Recuadro del objeto y aviso de misil
function drawItemHud(dt) {
  const box = $('itemBox'), warnEl = $('missileWarn');
  const on = items.on && game.mode === 'race' && (game.phase === 'race' || game.phase === 'countdown');
  if (!on) { box.hidden = true; warnEl.hidden = true; return; }
  const it = me.item, combat = isCombat(), dev = st?.device;
  const k1 = dev === 'pad' ? 'B' : dev === 'touch' ? 'OBJETO' : 'F o clic', k2 = dev === 'pad' ? 'Y' : dev === 'touch' ? 'OBJETO 2' : 'G o clic derecho';
  let icon, name, hint;
  if (combat) {
    icon = '🚀'; name = `Misiles ${me.ammo}/${MAX_AMMO}${it ? ` · ${ITEMS[it.id].icon}` : ''}`;
    hint = me.ammo < MAX_AMMO ? `recargando ${Math.floor((me.reloadT / RELOAD) * 10) * 10} %` : `${k1}: disparar`;
    if (it) hint += ` · ${k2}: ${ITEMS[it.id].label.toLowerCase()}`;
  } else {
    icon = it ? ITEMS[it.id].icon : '◌'; name = it ? ITEMS[it.id].label + (it.charges > 1 ? ` ×${it.charges}` : '') : 'Sin objeto';
    hint = it ? `${k1}: usar${it.id === 'misil' ? ' (fija a un rival para que no falle)' : ''}` : 'Cruza un anillo morado';
  }
  const txt = icon + name + hint;
  if (txt !== itemTxt) { itemTxt = txt; $('itemIcon').textContent = icon; $('itemName').textContent = name; $('itemHint').textContent = hint; }
  box.hidden = false;
  const th = jet.alive ? items.threats(me).filter(m => m.p.dist(jet.pos) < 700) : [];
  warnEl.hidden = !th.length;
  if (th.length && (alarmT -= dt) <= 0) { const d = Math.min(...th.map(m => m.p.dist(jet.pos))); sound.sfx('alarm'); alarmT = 0.1 + (d / 700) * 0.45; }
}

// ---------- Cámara ----------
const CAMS = ['chase', 'cockpit', 'nose'];
const cam = { mode: CAMS.includes(store.get('jt-cam', 'chase')) ? store.get('jt-cam', 'chase') : 'chase', offset: new THREE.Vector3(0, 4, 15), up: new THREE.Vector3(0, 1, 0), fov: 72, shake: 0, cut: true, orbit: 0, crashLook: new THREE.Vector3() };
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3(), _o = new THREE.Vector3(), WUP = new THREE.Vector3(0, 1, 0);
const rp = new THREE.Vector3(), rq = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

function updateCamera(dt) {
  const fwd = _f.set(0, 0, -1).applyQuaternion(rq), up = _u.set(0, 1, 0).applyQuaternion(rq);
  const speedK = clamp((jet.speed - 80) / 70, 0, 1);
  let fovTarget = 72 + 16 * speedK + (jet.boosting ? 6 : 0);
  const viewMode = game.phase === 'menu' || game.phase === 'finished' ? 'chase' : cam.mode;
  model.pilot.visible = viewMode !== 'cockpit';
  model.group.visible = jet.alive && viewMode !== 'nose';
  if (game.phase === 'menu' || game.phase === 'finished') {
    // cámara de cine que gira alrededor del jet
    cam.orbit += dt * 0.16;
    _o.set(Math.sin(cam.orbit) * 24, 6 + Math.sin(cam.orbit * 0.7) * 3, Math.cos(cam.orbit) * 24);
    cam.offset.lerp(_o, cam.cut ? 1 : damp(2, dt));
    camera.position.copy(rp).add(cam.offset);
    camera.up.set(0, 1, 0);
    camera.lookAt(rp);
    fovTarget = 60;
  } else if (!jet.alive && game.crashAt) {
    cam.crashLook.lerp(game.crashAt, damp(3, dt));
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.crashLook);
  } else if (cam.mode === 'chase') {
    const aimMode = st?.mouseAim && !jet.trick && game.phase !== 'countdown' && !game.autopilot && !game.menuOpen;
    // en los toneles, la barrena, la campana y la cobra la cámara sigue a la trayectoria y deja girar al jet
    const stable = jet.trick && ['tonel', 'derrape', 'barrena', 'campana', 'cobra'].includes(jet.trick.name) && jet.speed > 1;
    const dir = aimMode ? _t.set(aim.dir.x, aim.dir.y, aim.dir.z) : stable ? _t.set(jet.vel.x, jet.vel.y, jet.vel.z).normalize() : _t.copy(fwd);
    const upv = aimMode || (stable && Math.abs(dir.y) < 0.9) ? WUP : _o.copy(WUP).multiplyScalar(0.35).addScaledVector(up, 0.65).normalize();
    const dist = 14.5 + speedK * 3.5 + (jet.boosting ? 1.5 : 0), h = 3.8;
    const back = st?.lookBack ? -1 : 1;
    const desired = new THREE.Vector3().copy(dir).multiplyScalar(-dist * back).addScaledVector(upv, h);
    if (st && (st.lookX || st.lookY)) {
      desired.applyAxisAngle(upv, -st.lookX * Math.PI * 0.9);
      desired.addScaledVector(upv, st.lookY * 8);
    }
    cam.offset.lerp(desired, cam.cut ? 1 : damp(st?.lookBack ? 20 : 7, dt));
    cam.up.lerp(upv, cam.cut ? 1 : damp(5, dt)).normalize();
    camera.position.copy(rp).add(cam.offset);
    camera.up.copy(cam.up);
    camera.lookAt(_o.copy(rp).addScaledVector(dir, 22 * back).addScaledVector(cam.up, 1.2));
    cam.crashLook.copy(rp);
  } else {
    const local = cam.mode === 'cockpit' ? model.eye : _o.set(0, 0.5, -8.4);
    camera.position.copy(local).applyQuaternion(rq).add(rp);
    camera.quaternion.copy(rq);
    if (st?.lookBack) camera.quaternion.multiply(_q2.setFromAxisAngle(WUP, Math.PI));
    else if (st && st.lookX) camera.quaternion.multiply(_q2.setFromAxisAngle(WUP, -st.lookX * Math.PI * 0.8));
    camera.up.copy(up);
    fovTarget += 4;
    cam.crashLook.copy(rp);
  }
  cam.cut = false;
  // temblor: golpes y postcombustión
  const sh = cam.shake + (jet.boosting && jet.alive ? 0.06 : 0);
  if (sh > 0.002) camera.position.add(_o.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
  cam.shake *= Math.exp(-dt * 5);
  cam.fov += (fovTarget - cam.fov) * damp(4, dt);
  if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); fx.setPointScale(renderer, camera); }
  world.setBlur(game.phase === 'menu' ? 0 : clamp((jet.speed - 100) / 50, 0, 1) * (jet.boosting ? 1 : 0.55));
  world.followSun(jet.alive ? rp : cam.crashLook);
}

// ---------- Calor del escape (distorsión en la imagen detrás de las toberas de mi jet) ----------
const _h0 = new THREE.Vector3(), _h1 = new THREE.Vector3(), _hb = new THREE.Vector3();
function updateHeat() {
  if (!me || !me.view.alive || game.phase === 'hangar' || !model.group.visible) { world.setHeat(null, null, 0, 0); return; }
  const q = me.view.q, segs = [];
  _hb.set(0, 0, 1).applyQuaternion(q);
  const boost = me.view.boost, len = 7 + (boost ? 7 : 0) + me.view.throttle * 3;
  let dist = 0;
  for (const nz of model.nozzles.slice(0, 2)) {
    _h0.copy(nz).applyQuaternion(q).add(me.view.p);
    _h1.copy(_h0).addScaledVector(_hb, len);
    dist = _h0.distanceTo(camera.position);
    _h0.project(camera); _h1.project(camera);
    if (_h0.z > 1 || _h1.z > 1) continue;
    segs.push([_h0.x * 0.5 + 0.5, _h0.y * 0.5 + 0.5, _h1.x * 0.5 + 0.5, _h1.y * 0.5 + 0.5]);
  }
  if (!segs.length || dist > 120) { world.setHeat(null, null, 0, 0); return; }
  const width = clamp(1.9 / dist / (2 * Math.tan((camera.fov * Math.PI) / 360)), 0.005, 0.09);
  const strength = (0.002 + 0.0022 * me.view.throttle + (boost ? 0.003 : 0)) * clamp(30 / dist, 0.35, 1);
  world.setHeat(segs[0], segs[1] || null, width, strength, game.clock);
}

// ---------- Marcador ----------
const _p = new THREE.Vector3();
function project(v) {
  _p.set(v.x, v.y, v.z).project(camera);
  return { x: (_p.x * 0.5 + 0.5) * innerWidth, y: (-_p.y * 0.5 + 0.5) * innerHeight, front: _p.z < 1, nx: _p.x, ny: _p.y };
}
const tagEls = new Map();
function drawTags() {
  const box = $('tags'), alive = new Set(), order = game.mode === 'race' ? standings() : null;
  if (game.phase !== 'menu') for (const r of racers) {
    if (r === me || !r.view.alive) continue;
    const d = r.view.p.distanceTo(camera.position);
    if (d > 900) continue;
    const p = project(_o.copy(r.view.p).add(_t.set(0, 5, 0)));
    if (!p.front || Math.abs(p.nx) > 1.05 || Math.abs(p.ny) > 1.05) continue;
    let el = tagEls.get(r);
    if (!el) { el = document.createElement('div'); box.appendChild(el); tagEls.set(r, el); }
    el.style.color = r.color;
    el.textContent = (order ? `${order.indexOf(r) + 1} · ` : '') + r.name;
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%) scale(${clamp(260 / d, 0.65, 1.1)})`;
    el.hidden = false;
    alive.add(r);
  }
  for (const [r, el] of tagEls) if (!alive.has(r)) { if (!racers.includes(r)) { el.remove(); tagEls.delete(r); } else el.hidden = true; }
}
let standT = 0;
function drawStandings(dt) {
  const box = $('standings'), place = $('place');
  if (game.mode !== 'race') { if (box.childElementCount) box.innerHTML = ''; place.innerHTML = ''; return; }
  if ((standT -= dt) > 0) return;
  standT = 0.25;
  const order = standings();
  box.innerHTML = order.map((r, i) => `<li class="${r === me ? 'me' : ''} ${r.finishTime != null ? 'done' : ''}" style="${r === me ? '' : `color:${r.color}`}">${i + 1}. ${r === me ? 'Tú' : esc(r.name)}</li>`).join('');
  place.innerHTML = `${order.indexOf(me) + 1}º<small>/${order.length}</small>`;
}
function drawHud(dt) {
  drawTags();
  if (game.phase === 'menu') return;
  hud.tick(dt);
  drawStandings(dt);
  // al cruzar la meta el cronómetro se queda quieto con el tiempo final
  const done = race.finished;
  const notYet = game.phase === 'countdown' || (race.flying && race.lap === 0);
  const lapTime = notYet ? 0 : done ? race.lapTimes[race.lapTimes.length - 1] : Math.max(0, game.t - race.lapStart);
  const best = game.mode === 'trial' ? [race.best, rec.lap].filter(Boolean) : [race.best].filter(Boolean);
  const tm = game.mode === 'race' && timed(), R = rules();
  const label = tm ? (R.kind === 'combate' ? `COMBATE · ${me.kills} ${me.kills === 1 ? 'DERRIBO' : 'DERRIBOS'}` : 'ACROBACIAS')
    : game.mode === 'lobby' ? (net.online ? `SALA ${net.code}` : 'SALA') : game.mode === 'free' ? 'VUELO LIBRE' : null;
  hud.setRace({ lap: race.lap || 1, laps: race.laps, time: done ? race.finishTime : notYet ? 0 : Math.max(0, runTime()), lapTime: tm ? Math.max(0, R.time - Math.max(0, game.t)) : lapTime, best: tm ? null : best.length ? Math.min(...best) : null, free: !!label, label });
  drawItemHud(dt);
  updateLock(dt);
  hud.setFlight(jet.alive ? jet.speed * 3.6 : 0, jet.turbo, jet.pos.y, jet.boosting);
  hud.setStyle(style.total, style.mult, style.chainLeft(game.t));
  // siguiente puerta
  const g = track.gates[race.next], showMarker = settings.assist >= 1 && jet.alive && playing() && game.phase !== 'countdown' && game.mode !== 'lobby' && !tm;
  if (showMarker) {
    const p = project(g.p), on = p.front && Math.abs(p.nx) < 0.95 && Math.abs(p.ny) < 0.9;
    if (on) hud.marker(p.x, p.y, true, jet.pos.dist(g.p), 0, true);
    else {
      let dx = p.nx, dy = -p.ny;
      if (!p.front) { dx = -dx; dy = -dy; }
      const l = Math.hypot(dx, dy) || 1, r = Math.min(innerWidth, innerHeight) * 0.42;
      hud.marker(innerWidth / 2 + (dx / l) * r, innerHeight / 2 + (dy / l) * r, false, 0, Math.atan2(dx, -dy), true);
    }
  } else hud.marker(0, 0, false, 0, 0, false);
  // mira del modo ratón
  const showAim = st?.mouseAim && jet.alive && !jet.trick && playing() && game.phase !== 'countdown' && cam.mode === 'chase' && !game.autopilot && !game.menuOpen;
  if (showAim) {
    const a = project(_o.copy(rp).addScaledVector(_t.set(aim.dir.x, aim.dir.y, aim.dir.z), 600));
    const n = project(_o.copy(rp).addScaledVector(_f.set(0, 0, -1).applyQuaternion(rq), 600));
    hud.reticle(a.x, a.y, n.x, n.y, a.front && n.front);
  } else hud.reticle(0, 0, 0, 0, false);
  // aviso de choque
  let w = 0;
  if (warn && settings.assist >= 1 && playing() && !game.menuOpen) w = clamp(1 - warn.t / 0.8, 0, 1);
  hud.warn(w * 0.85);
  if (w > 0.15 && (warnBeep -= dt) <= 0) { sound.sfx('warn'); warnBeep = 0.24 - w * 0.12; }
  // fuera del recorrido
  if (playing() && jet.alive && race.off > 650) {
    game.outT += dt;
    hud.center(`¡Vuelve al recorrido!\n${Math.ceil(5 - game.outT)}`, 'small', 0.2);
    if (game.outT > 5) respawn();
  } else game.outT = 0;
}

function helpLine() {
  const d = st?.device;
  $('helpLine').textContent = d === 'pad' ? 'X + stick: pirueta · A: turbo · Y: cámara · Start: pausa'
    : d === 'touch' ? ''
      : settings.scheme === 'mouse' ? 'Ratón: apuntar · Shift: turbo · Espacio + dirección: pirueta · H: humo · C: cámara · Esc: pausa'
        : 'W/S: cabeceo · A/D: alabeo · ↑/↓: gas · Shift: turbo · Espacio + dirección: pirueta · H: humo · Esc: pausa';
}

// ---------- Clima por tramos, vapor del tren y avisos de viento ----------
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function updateAtmosphere(dt) {
  const k = cam.cut ? 1 : damp(3.5, dt);
  if (ZONE) {
    const s = game.phase === 'replay' ? replayS : game.phase === 'editor' ? baseS(camera.position) : track.custom ? baseS(jet.pos) : race.s || 0;
    const nightT = game.forceNight ? 1 : sstep(ZONE.night0 - 5, ZONE.night0 + 55, s) * (1 - sstep(ZONE.night1 - 260, ZONE.night1 + 40, s));
    const pinkT = game.forceNight ? 0 : sstep(ZONE.pink0 - 160, ZONE.pink0 + 120, s) * (1 - sstep(ZONE.pink1 - 220, ZONE.pink1 + 40, s));
    atm.night += (nightT - atm.night) * k;
    atm.pink += (pinkT - atm.pink) * k;
    world.setAtmosphere(atm.night, atm.pink);
  } else {
    atm.night += ((game.forceNight ? 1 : 0) - atm.night) * k;
    world.setMapNight(atm.night);
  }
  world.update(dt, game.clock);
  if (clouds) clouds.update(scene.fog, atm.night);
  if ((atm.steamT -= dt) <= 0) { atm.steamT = 0.06; const c = view.trainChimney(); if (c) fx.steam(c); }
  if (playing() && jet.alive && game.phase !== 'countdown') {
    if (jet.thermal > 0.3 && !game.inThermal) { game.inThermal = true; hud.feed('TÉRMICA ↑ +TURBO', 'near'); } else if (!jet.thermal) game.inThermal = false;
    if (jet.cross > 1 && !game.inWind) { game.inWind = true; hud.feed('VIENTO LATERAL', 'info'); } else if (!jet.cross) game.inWind = false;
  }
}

// ---------- Sonido 3D de los demás jets (los 4 más cercanos) ----------
const lisP = new THREE.Vector3(), lisV = new THREE.Vector3(), lisPrev = new THREE.Vector3();
function updateVoices(dt) {
  if (!sound.ctx) return;
  lisV.subVectors(camera.position, lisPrev).divideScalar(Math.max(dt, 1e-3));
  lisPrev.copy(camera.position);
  lisP.copy(camera.position);
  sound.setListener(lisP, _f.set(0, 0, -1).applyQuaternion(camera.quaternion), _u.set(0, 1, 0).applyQuaternion(camera.quaternion));
  const on = playing() || game.phase === 'finished' || game.phase === 'replay';
  const near = on ? racers.filter(r => (r !== me || game.phase === 'replay') && r.view.alive && r.view.p.distanceTo(lisP) < 700).sort((a, b) => a.view.p.distanceTo(lisP) - b.view.p.distanceTo(lisP)).slice(0, 4) : [];
  for (const r of racers) {
    if (near.includes(r)) {
      if (!r.voice) r.voice = new RemoteVoice(sound, r.cfg.engine);
      r.voice.update({ p: r.view.p, v: r.view.v }, { p: lisP, v: lisV }, r.view.boost, true);
    } else if (r.voice) { r.voice.dispose(); r.voice = null; }
  }
}

// ---------- Resolución dinámica ----------
let perfT = 0, perfN = 0, perfSlow = 0, warmup = 3;
const perf = { frames: 0, slow: 0, sum: 0 };
function adaptResolution(raw) {
  perf.frames++; perf.sum += raw; if (raw > 0.02) perf.slow++;
  if (raw > 0.25 || window.jetDebug?.noAdapt) return;
  if ((warmup -= raw) > 0) return;
  perfT += raw; perfN++;
  if (raw > 0.02) perfSlow++;
  if (perfT < 1.5) return;
  const slow = perfSlow / perfN;
  perfT = perfN = perfSlow = 0;
  const max = Math.min(devicePixelRatio, world.quality.maxRatio), min = Math.max(0.5, max * 0.5);
  let next = pixelRatio;
  if (slow > 0.12) next = Math.max(min, pixelRatio * 0.9);
  else if (slow < 0.03 && pixelRatio < max) next = Math.min(max, pixelRatio * 1.05);
  if (Math.abs(next - pixelRatio) > 0.01) { pixelRatio = next; world.setPixelRatio(pixelRatio); fx.setPointScale(renderer, camera); }
}

// ---------- Bucle ----------
let last = performance.now(), acc = 0;
const tips = [new THREE.Vector3(), new THREE.Vector3()];
// Pose de dibujo de cada jet: los propios se interpolan entre pasos de física; los de la red, entre estados recibidos
function updateRacerViews(alpha, now, dt) {
  for (const r of racers) {
    const v = r.view, J = r.jet;
    if (r.owned) {
      const a = game.phase === 'countdown' || game.paused ? 1 : alpha;
      v.p.set(r.prevPos.x + (J.pos.x - r.prevPos.x) * a, r.prevPos.y + (J.pos.y - r.prevPos.y) * a, r.prevPos.z + (J.pos.z - r.prevPos.z) * a);
      v.q.set(r.prevQ.x, r.prevQ.y, r.prevQ.z, r.prevQ.w).slerp(_q2.set(J.q.x, J.q.y, J.q.z, J.q.w), a);
      v.v.set(J.vel.x, J.vel.y, J.vel.z);
      v.alive = J.alive; v.boost = J.boosting;
      v.throttle = r === me && game.phase === 'countdown' ? 0.35 + 0.65 * Math.max(0, st.throttle, st.boost ? 1 : 0) : clamp(0.55 + r.ctl.throttle * 0.45, 0.15, 1);
      if (r === me && game.phase === 'countdown' && st.boost) v.boost = true;
    } else r.interpolate(now);
    if (r !== me) { r.model.group.visible = v.alive; }
    r.model.group.position.copy(v.p);
    r.model.group.quaternion.copy(v.q);
    r.model.update(dt, v.throttle, v.boost);
    // humo de colores
    r.smokeOn = r === me ? !!st.smoke && J.alive && playing() : r.owned ? false : v.smoke;
    r.smoke.push(_o.copy(r.model.nozzles[0]).applyQuaternion(v.q).add(v.p), r.smokeOn && v.alive, game.clock, dt);
    r.smoke.update(game.clock, camera.position);
  }
}

function frame(now) {
  // el primer fotograma puede traer una marca de tiempo anterior a «last»: nunca dejamos que el tiempo vaya hacia atrás
  const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw);
  last = now;
  adaptResolution(raw);
  st = input.poll();
  music.setMode((game.mode === 'race' || game.mode === 'trial') && (game.phase === 'race' || game.phase === 'countdown') ? 'race' : 'menu');
  // en el hangar solo se dibuja el estudio con el jet
  if (game.phase === 'hangar') { hangar.frame(dt); requestAnimationFrame(frame); return; }
  // repetición y modo foto: su propio bucle
  if (photo.on && st.pause) { exitPhoto(); st.pause = false; }
  if (game.phase === 'replay') { replayFrame(dt); requestAnimationFrame(frame); return; }
  if (game.phase === 'editor') { editorFrame(dt); requestAnimationFrame(frame); return; }

  // botones generales
  if (st.pause && (playing() || game.phase === 'finished')) togglePause();
  if (st.cam && playing()) { cam.mode = CAMS[(CAMS.indexOf(cam.mode) + 1) % CAMS.length]; store.set('jt-cam', cam.mode); cam.cut = true; }
  if (st.respawn && jet.alive && ['race', 'free', 'lobby'].includes(game.phase) && !game.paused) respawn();
  if (st.restart && game.mode === 'trial' && ['countdown', 'race', 'finished'].includes(game.phase) && !game.paused) { startTrial(game.trialLaps, true); requestAnimationFrame(frame); return; }
  if (st.boost && !prevBoost) game.lastBoostEdge = game.t;
  prevBoost = st.boost;

  // en línea, el reloj de los obstáculos y el de la carrera siguen al del anfitrión
  if (net.online && !photo.on) {
    const hc = net.hostNow() / 1000;
    if (Math.abs(hc - game.clock) > 0.08) game.clock = hc;
  }
  if (!game.paused) {
    if (game.phase === 'countdown') {
      game.t = game.mode === 'race' ? (net.hostNow() - game.go) / 1000 : game.t + dt;
      if (!net.online) game.clock += dt;
      track.update(game.clock);
      const n = Math.ceil(-game.t / 1.2);
      if (n > 0 && n <= 3 && n !== game.cd) { game.cd = n; hud.center(String(n), '', 1.1); sound.sfx('beep'); }
      if (game.t >= 0) launch();
    } else {
      if (game.mode === 'race' && game.phase !== 'finished') {
        const target = (net.hostNow() - game.go) / 1000;
        if (Math.abs(target - game.t) > 0.1) game.t = target;
      }
      // combos y mira (por fotograma); las peticiones esperan al siguiente paso de física
      if (playing() && !game.autopilot && !game.menuOpen) {
        const req = combo.update(dt, { pDown: st.trickDown, pHeld: st.trickHeld, dirs: st.dirs, current: st.dirCurrent, drifting: Math.abs(st.yaw) > 0.3 });
        if (req) pendingTrick = req;
        if (st.mouseAim && jet.alive && !jet.trick) { aim.yaw -= st.aimDX; aim.pitch -= st.aimDY; updateAimDir(); } else syncAim();
        if (game.phase === 'race' && game.t < 0.2 && st.boost && game.lastBoostEdge > -0.3) perfectStart();
        playerItems();
      } else syncAim();
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 12) { physicsStep(); acc -= STEP; n++; }
      if (n >= 12) acc = 0;
      if (multi() || game.phase === 'menu') jetInteractions(dt);
      if (game.phase === 'finished' && (game.finishT += dt) > 2.5 && $('results').hidden && game.mode === 'trial' && !game.resultsShown) { game.resultsShown = true; showOverlay('results'); }
      checkRaceEnd();
      items.update(dt);
      if ((game.mode === 'race' || game.mode === 'trial') && (game.phase === 'race' || (game.phase === 'finished' && !game.resultsShown))) recorder.sample(dt, game.clock, racerById, items);
    }
  }
  if (net.online && (sendT -= dt) <= 0) { sendT = 0.05; sendState(); }

  // poses para dibujar
  updateRacerViews(clamp(acc / STEP, 0, 1), performance.now(), dt);
  rp.copy(me.view.p); rq.copy(me.view.q);

  // fantasma
  if (game.mode === 'trial' && ghost && game.phase === 'race' && race.lap >= 1) {
    const ok = ghost.at(game.t - race.lapStart);
    ghostModel.group.visible = ok;
    if (ok) { ghostModel.group.position.set(ghost.pos.x, ghost.pos.y, ghost.pos.z); ghostModel.group.quaternion.set(ghost.q.x, ghost.q.y, ghost.q.z, ghost.q.w); ghostModel.update(dt, 0.6, false); }
  } else ghostModel.group.visible = false;
  if (game.mode === 'trial' && rival && rival.key === MAP && game.phase === 'race' && race.lap >= 1) {
    const R2 = rival.player, ok = R2.at(game.t - race.lapStart);
    rivalModel.group.visible = ok;
    if (ok) { rivalModel.group.position.set(R2.pos.x, R2.pos.y, R2.pos.z); rivalModel.group.quaternion.set(R2.q.x, R2.q.y, R2.q.z, R2.q.w); rivalModel.update(dt, 0.6, false); }
  } else rivalModel.group.visible = false;

  view.update(game.clock);
  updateAtmosphere(dt);
  if (!game.paused) {
    // estelas de condensación en las puntas de las alas al tirar fuerte o ir muy rápido
    const k = jet.alive ? clamp(Math.max((jet.gload - 3.5) / 5, (jet.speed - 128) / 25), 0, 1) : 0;
    if (jet.alive) model.wingTips.forEach((t, i) => tips[i].copy(t).applyQuaternion(rq).add(rp));
    fx.trailsUpdate(dt, jet.alive ? tips : null, k, camera.position);
    fx.update(dt, { speed: jet.alive && game.phase !== 'menu' ? jet.speed + (me.ctl.draft ? 20 : 0) : 0, cam: camera });
    warn = jet.alive && game.phase !== 'menu' ? collisionWarning(jet, track) : null;
  }
  if (photo.on) photoCamera(dt, rp, rq); else updateCamera(dt);
  updateHeat();
  if (!photo.on) drawHud(dt);
  updateVoices(dt);
  if (playing() && !game.paused && sound.ctx) {
    const slip = jet.alive ? clamp(Math.abs(jet.w.y) * 0.6 + jet.gload / 14, 0, 1) : 0;
    sound.engine({ power: me.view.throttle, boost: me.view.boost, speed: jet.alive ? jet.speed : 0, slip, on: jet.alive });
  } else if (game.phase === 'finished' && sound.ctx) sound.engine({ power: 0.4, speed: jet.speed * 0.5, on: true });
  world.render();
  requestAnimationFrame(frame);
}

// ---------- Repetición ----------
const recorder = new ReplayRecorder();
let replay = null, replayS = 0, replayBack = null;
const rpPose = { p: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(), flags: 0, throttle: 0.5, s: 0 };
const fmtClock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
function startReplay() {
  if (recorder.frames.length < 10) { toast('No hay repetición de esta partida'); return; }
  replayBack = { results: !$('results').hidden };
  replay?.dispose();
  replay = new ReplayPlayer(scene, recorder, track, {
    boom: e => { fx.explosion(e.p, e.v); const r = racerById(e.id); if (r) fx.eject(e.p, e.v, r.cfg); if (camera.position.distanceTo(_o.set(e.p.x, e.p.y, e.p.z)) < 600) sound.sfx('explosion'); },
  });
  const mine = recorder.ids.indexOf(me.id);
  replay.focus = mine >= 0 ? mine : 0;
  replay.seek(0);
  game.phase = 'replay'; game.paused = false;
  items.clear(); items.group.visible = items.on;
  ghostModel.group.visible = false;
  for (const r of racers) r.smoke.clear();
  fx.clearTrails();
  hud.show(false); hud.warn(0);
  showOverlay(null);
  $('replayBar').hidden = false; $('rpInfo').hidden = false;
  $('rpDur').textContent = fmtClock(replay.duration);
  renderReplayBar();
  input.exitLock();
  sound.silence();
}
function stopReplay() {
  if (!replay) return;
  replay.dispose(); replay = null;
  $('replayBar').hidden = true; $('rpInfo').hidden = true;
  if (photo.on) exitPhoto();
  for (const r of racers) { r.smoke.clear(); if (r.shieldMesh) r.shieldMesh.visible = false; }
  fx.clearTrails();
  // vuelve a los resultados con todo como estaba (los jets siguen volando solos)
  game.phase = 'finished'; game.autopilot = true; cam.cut = true;
  showOverlay(replayBack?.results ? 'results' : null);
  last = performance.now();
}
function renderReplayBar() {
  if (!replay) return;
  $('rpPlay').textContent = replay.playing ? '⏸' : '▶';
  $('rpSpeed').textContent = `${String(replay.speed).replace('.', ',')}×`;
  $('rpCam').textContent = `🎬 ${CAM_LABEL[replay.camMode]}`;
}
function replayFocusRacer() { return racerById(recorder.ids[replay.focus]); }
let rpBarT = 0;
function replayFrame(dt) {
  const R = replay;
  world.setHeat(null, null, 0, 0);
  // teclado: espacio pausa, flechas avanzan o retroceden, A/D cambian de piloto, C la cámara, Esc sale
  if (!photo.on) {
    if (st.trickDown) { if (R.t >= R.duration) R.seek(0); R.playing = !R.playing; renderReplayBar(); }
    if (st.pause) { stopReplay(); return; }
    if (st.cam) cycleReplayCam();
  }
  R.advance(photo.on ? 0 : dt);
  game.clock = R.clock();
  track.update(game.clock);
  view.update(game.clock);
  // poses de todos los jets
  recorder.ids.forEach((id, i) => {
    const r = racerById(id);
    if (!r) return;
    const P = R.pose(i, rpPose);
    const alive = !!P && (P.flags & 1) > 0;
    r.model.group.visible = alive;
    r.view.alive = alive;
    if (!P) return;
    r.view.p.copy(P.p); r.view.q.copy(P.q); r.view.v.copy(P.v); r.view.boost = (P.flags & 2) > 0;
    r.model.group.position.copy(P.p); r.model.group.quaternion.copy(P.q);
    r.model.update(dt, P.throttle, r.view.boost);
    if (r === me) { model.pilot.visible = true; }
    if (r.shieldMesh || P.flags & 8) items.shieldOf(r).visible = alive && (P.flags & 8) > 0;
    r.smoke.push(_o.copy(r.model.nozzles[0]).applyQuaternion(P.q).add(P.p), (P.flags & 4) > 0 && alive && R.playing, game.clock, dt);
    r.smoke.update(game.clock, camera.position);
  });
  R.drawItems();
  // cámara sobre el piloto enfocado
  const fr = replayFocusRacer(), F = R.pose(R.focus, rpPose);
  if (F) {
    replayS = track.custom ? baseS(F.p) : F.s;
    if (photo.on) photoCamera(dt, F.p, F.q);
    else {
      const fov = R.camera(dt, camera, F);
      cam.fov += (fov - cam.fov) * (R.cut ? 1 : damp(3, dt));
      if (Math.abs(camera.fov - cam.fov) > 0.05) { camera.fov = cam.fov; camera.updateProjectionMatrix(); fx.setPointScale(renderer, camera); }
    }
    world.followSun(F.p);
  }
  if ((rpBarT -= dt) <= 0) {
    rpBarT = 0.2;
    $('rpTime').textContent = fmtClock(R.t);
    if (!seeking) $('rpSeek').value = String(Math.round((R.t / (R.duration || 1)) * 1000));
    const order = recorder.ids.length > 1 ? ` · ${R.focus + 1}/${recorder.ids.length}` : '';
    $('rpName').textContent = ` · ${fr ? (fr === me ? 'Tú' : fr.name) : '—'}${order}`;
    if (!R.playing) renderReplayBar();
  }
  world.setBlur(0);
  updateAtmosphere(dt);
  fx.update(dt, { speed: 0, cam: camera });
  fx.trailsUpdate(dt, null, 0, camera.position);
  updateVoices(dt);
  world.render();
}
function cycleReplayCam() {
  replay.camMode = REPLAY_CAMS[(REPLAY_CAMS.indexOf(replay.camMode) + 1) % REPLAY_CAMS.length];
  replay.cut = true;
  renderReplayBar();
}
function replayFocus(d) {
  const n = recorder.ids.length;
  for (let k = 1; k <= n; k++) {
    const i = (replay.focus + d * k + n * 2) % n;
    if (racerById(recorder.ids[i])) { replay.focus = i; break; }
  }
  replay.cut = true;
  for (const r of racers) r.smoke.clear();
  fillPhotoTargets();
}
let seeking = false;
$('rpPlay').onclick = () => { if (replay.t >= replay.duration) replay.seek(0); replay.playing = !replay.playing; renderReplayBar(); };
$('rpSpeed').onclick = () => { const S = [0.25, 0.5, 1, 2]; replay.speed = S[(S.indexOf(replay.speed) + 1) % S.length]; renderReplayBar(); };
$('rpCam').onclick = cycleReplayCam;
$('rpPrev').onclick = () => replayFocus(-1);
$('rpNext').onclick = () => replayFocus(1);
$('rpExit').onclick = () => stopReplay();
$('rpPhoto').onclick = () => enterPhoto();
$('rpSeek').oninput = e => { seeking = true; replay.seek((+e.target.value / 1000) * replay.duration); for (const r of racers) r.smoke.clear(); };
$('rpSeek').onchange = () => { seeking = false; };
addEventListener('keydown', e => {
  if (game.phase !== 'replay' || photo.on || !replay) return;
  if (e.code === 'ArrowLeft') replay.seek(replay.t - 5);
  else if (e.code === 'ArrowRight') replay.seek(replay.t + 5);
  else if (e.code === 'KeyA' || e.code === 'KeyQ') replayFocus(-1);
  else if (e.code === 'KeyD' || e.code === 'KeyE') replayFocus(1);
  else if (e.code === 'KeyF') enterPhoto();
  else return;
  for (const r of racers) r.smoke.clear();
});

// ---------- Modo foto ----------
// Cámara libre alrededor del jet, filtros, viñeta y foto en PNG a la resolución de la pantalla
const photo = { on: false, yaw: 150, pitch: 12, dist: 18, roll: 0, fov: 55, filter: 'none', vig: 0.3, dof: 0, mark: true, target: null, drag: null, from: null };
const FILTERS = {
  none: '', calido: 'sepia(0.25) saturate(1.25) hue-rotate(-8deg) brightness(1.04)', frio: 'saturate(0.9) hue-rotate(12deg) brightness(1.02) contrast(1.05)',
  sueno: 'saturate(1.6) hue-rotate(-25deg) contrast(0.92) brightness(1.08)', bn: 'grayscale(1) contrast(1.15)', sepia: 'sepia(0.85) contrast(1.05)', cine: 'contrast(1.18) saturate(0.85) brightness(0.96)',
};
function enterPhoto() {
  const can = game.phase === 'replay' || (game.paused && !net.online);
  if (!can) return;
  photo.on = true;
  photo.from = game.phase === 'replay' ? 'replay' : 'pause';
  if (replay) replay.playing = false;
  // empieza desde donde estaba la cámara, mirando al jet
  const target = photo.from === 'replay' ? replay.pose(replay.focus, rpPose)?.p : rp;
  if (target) {
    _o.subVectors(camera.position, target);
    photo.dist = clamp(_o.length(), 4, 120);
    photo.yaw = (Math.atan2(_o.x, _o.z) * 180) / Math.PI;
    photo.pitch = clamp((Math.asin(clamp(_o.y / (_o.length() || 1), -1, 1)) * 180) / Math.PI, -80, 85);
  }
  photo.fov = clamp(Math.round(camera.fov), 15, 100);
  photo.roll = 0;
  syncPhotoInputs();
  fillPhotoTargets();
  $('phDofRow').hidden = !world.setDof(photo.dof, photo.dist); // sin posprocesado (calidad baja) no hay desenfoque
  document.body.classList.add('photo');
  showOverlay(null);
  $('replayBar').hidden = true; $('rpInfo').hidden = true;
  $('photoBar').hidden = false; $('photoHide').hidden = true;
  applyPhotoFilter();
}
function exitPhoto() {
  photo.on = false;
  world.setDof(0, 20);
  document.body.classList.remove('photo');
  renderer.domElement.style.filter = '';
  $('vigOverlay')?.remove();
  $('photoBar').hidden = true; $('photoHide').hidden = true;
  cam.cut = true;
  if (photo.from === 'replay' && replay) { $('replayBar').hidden = false; $('rpInfo').hidden = false; renderReplayBar(); if (replay) replay.cut = true; } else if (game.paused) showOverlay('pause');
}
function syncPhotoInputs() {
  $('phDist').value = photo.dist; $('phPitch').value = photo.pitch; $('phYaw').value = ((photo.yaw + 540) % 360) - 180;
  $('phRoll').value = photo.roll; $('phFov').value = photo.fov; $('phFilter').value = photo.filter; $('phVig').value = photo.vig; $('phMark').checked = photo.mark; $('phDof').value = photo.dof;
}
// En la repetición se puede elegir a qué jet mirar
function fillPhotoTargets() {
  const sel = $('phTarget'), row = sel.closest('label');
  row.hidden = game.phase !== 'replay';
  if (row.hidden || !replay) return;
  sel.innerHTML = recorder.ids.map((id, i) => { const r = racerById(id); return r ? `<option value="${i}">${r === me ? 'Tú' : esc(r.name)}</option>` : ''; }).join('');
  sel.value = String(replay.focus);
}
function applyPhotoFilter() {
  renderer.domElement.style.filter = FILTERS[photo.filter] || '';
  let v = $('vigOverlay');
  if (!v) { v = document.createElement('div'); v.id = 'vigOverlay'; v.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1'; document.body.appendChild(v); }
  v.style.background = `radial-gradient(ellipse at center, transparent ${Math.round(70 - photo.vig * 40)}%, rgba(0,0,0,${(photo.vig * 0.85).toFixed(2)}) 100%)`;
}
const _pq = new THREE.Quaternion();
function photoCamera(dt, P) {
  const y = (photo.yaw * Math.PI) / 180, x = (photo.pitch * Math.PI) / 180;
  camera.position.set(P.x + Math.sin(y) * Math.cos(x) * photo.dist, P.y + Math.sin(x) * photo.dist, P.z + Math.cos(y) * Math.cos(x) * photo.dist);
  camera.up.set(0, 1, 0);
  camera.lookAt(P.x, P.y, P.z);
  if (photo.roll) camera.quaternion.multiply(_pq.setFromAxisAngle(_t.set(0, 0, 1), (photo.roll * Math.PI) / 180));
  if (Math.abs(camera.fov - photo.fov) > 0.05) { camera.fov = cam.fov = photo.fov; camera.updateProjectionMatrix(); fx.setPointScale(renderer, camera); }
  world.setBlur(0);
  world.setDof(photo.dof, photo.dist);
}
// Guarda la foto: se dibuja una vez a la máxima resolución y se copia con el filtro, la viñeta y la marca
function savePhoto() {
  const old = pixelRatio, hi = Math.min(2, Math.max(devicePixelRatio, 1));
  world.setPixelRatio(hi);
  world.render();
  const src = renderer.domElement, W = src.width, H = src.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.filter = FILTERS[photo.filter] || 'none';
  g.drawImage(src, 0, 0);
  g.filter = 'none';
  if (photo.vig > 0) {
    const grd = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.7 - photo.vig * 0.4) * 0.6, W / 2, H / 2, Math.hypot(W, H) / 2);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, `rgba(0,0,0,${photo.vig * 0.85})`);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
  }
  if (photo.mark) {
    const fs = Math.round(H * 0.035);
    g.font = `900 ${fs}px system-ui, sans-serif`; g.textAlign = 'right'; g.textBaseline = 'bottom';
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText('JETTISM', W - fs * 0.8 + 2, H - fs * 0.6 + 2);
    g.fillStyle = 'rgba(255,248,238,.9)'; g.fillText('JETTISM', W - fs * 0.8, H - fs * 0.6);
  }
  world.setPixelRatio(old);
  c.toBlob(b => {
    if (!b) { toast('No se pudo guardar la foto'); return; }
    const a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(b);
    a.download = `jettism-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    sound.sfx('ring');
    toast(`Foto guardada (${W}×${H})`);
  }, 'image/png');
  if (window.jetDebug) window.jetDebug.lastPhoto = { w: W, h: H };
}
const phIn = (id, key, f = Number) => { $(id).addEventListener('input', e => { photo[key] = f(e.target.type === 'checkbox' ? e.target.checked : e.target.value); applyPhotoFilter(); }); };
phIn('phDist', 'dist'); phIn('phPitch', 'pitch'); phIn('phYaw', 'yaw'); phIn('phRoll', 'roll'); phIn('phFov', 'fov'); phIn('phVig', 'vig'); phIn('phDof', 'dof');
phIn('phFilter', 'filter', String); phIn('phMark', 'mark', Boolean);
$('phTarget').onchange = e => { if (replay) { replay.focus = +e.target.value; replay.cut = true; } };
$('phSave').onclick = savePhoto;
$('phExit').onclick = exitPhoto;
$('phHide').onclick = () => { $('photoBar').hidden = true; $('photoHide').hidden = false; };
$('photoHide').onclick = () => { $('photoBar').hidden = false; $('photoHide').hidden = true; };
$('btnPhoto').onclick = enterPhoto;
// arrastrar para girar y rueda para acercar
renderer.domElement.addEventListener('pointerdown', e => { if (photo.on) { photo.drag = { x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture?.(e.pointerId); } });
renderer.domElement.addEventListener('pointermove', e => {
  if (!photo.on || !photo.drag) return;
  photo.yaw -= (e.clientX - photo.drag.x) * 0.3; photo.pitch = clamp(photo.pitch + (e.clientY - photo.drag.y) * 0.3, -80, 85);
  photo.drag = { x: e.clientX, y: e.clientY };
  syncPhotoInputs();
});
addEventListener('pointerup', () => { photo.drag = null; });
renderer.domElement.addEventListener('wheel', e => { if (!photo.on) return; e.preventDefault(); photo.dist = clamp(photo.dist * (e.deltaY > 0 ? 1.1 : 0.9), 4, 120); syncPhotoInputs(); }, { passive: false });

// ---------- Editor de circuitos ----------
const editor = new Editor(scene, camera, track, renderer, { onChange: () => renderEditorPanel(), toast });
let editorTest = false, edInfoT = 0;
function openEditor(resume = false) {
  net.close();
  sound.silence();
  if (!resume || !editor.gates.length) {
    let d = null;
    editor.draftKey = `jt-editor-${track.map.id}`;
    try { d = JSON.parse(store.get(editor.draftKey, track.map.id === 'desierto' ? store.get('jt-editor', 'null') : 'null')); } catch { d = null; }
    if (d && Array.isArray(d.gates) && d.gates.length) { editor.restore(d); editor.history = []; editor.future = []; editor.lookAtGate(0); } else editor.load({ ...track.map.course, name: 'Mi circuito' });
  }
  editorTest = false;
  clearRacers(); newMe(Infinity);
  me.model.group.visible = false; ghostModel.group.visible = false;
  for (const r of racers) r.smoke.clear();
  fx.clearTrails(); items.clear();
  game.phase = 'editor'; game.mode = 'editor'; game.paused = false; game.menuOpen = false;
  hud.show(false); hud.warn(0);
  showOverlay(null);
  $('editor').hidden = false; $('edTouch').hidden = !touchDevice; $('edShareBox').hidden = true;
  view.courseGroup.visible = false; items.group.visible = false;
  input.exitLock();
  editor.open();
  fillCourseSelect($('edList'), '', false);
  renderEditorPanel();
}
function closeEditorUI() {
  editor.close();
  $('editor').hidden = true;
  view.courseGroup.visible = true; items.group.visible = items.on;
}
function editorFrame(dt) {
  world.setHeat(null, null, 0, 0);
  editor.update(dt, input.keys);
  game.clock += dt;
  track.update(game.clock); view.update(game.clock);
  if (Math.abs(camera.fov - 70) > 0.05) { camera.fov = cam.fov = 70; camera.updateProjectionMatrix(); fx.setPointScale(renderer, camera); }
  world.setBlur(0);
  world.followSun(editor.cursor);
  updateAtmosphere(dt);
  fx.update(dt, { speed: 0, cam: camera });
  if ((edInfoT -= dt) <= 0) {
    edInfoT = 0.15;
    const E = editor, selName = E.sel === 0 ? 'de salida' : String(E.sel + 1);
    $('edInfo').textContent = `Mira a ${Math.round(E.cursor.distanceTo(camera.position))} m${E.cursorHit ? ' (antes del obstáculo)' : ''} · altura ${Math.round(E.cursor.y)} m · ` +
      (E.grab ? `moviendo la puerta ${selName}: clic para soltarla` : E.sel >= 0 ? `puerta ${selName} elegida · clic en el vacío: otra detrás` : touchDevice ? 'toca el vacío: poner puerta · arrastra: girar' : 'clic: poner puerta · arrastrar: girar · WASD/QE: volar');
  }
  world.render();
}
function renderEditorPanel() {
  const E = editor, I = E.info;
  if (document.activeElement !== $('edName')) $('edName').value = E.name;
  $('edStats').textContent = `${I.n} puertas · ${(I.length / 1000).toFixed(2).replace('.', ',')} km · unos ${fmtClock(I.lap || 0)} por vuelta · ${E.boosts.length} ${E.boosts.length === 1 ? 'anillo' : 'anillos'} de turbo`;
  $('edWarn').innerHTML = (I.warnings.length ? I.warnings.map(w => `<li>${esc(w)}</li>`) : ['<li class="ok">✓ Listo: pruébalo y compártelo</li>']).join('');
  $('edMove').textContent = E.grab ? '✋ Soltar' : '✋ Mover';
  for (const id of ['edMove', 'edDel', 'edSize', 'edGo']) $(id).disabled = E.sel < 0;
  $('edUndo').disabled = !E.history.length;
  for (const id of ['edTest', 'edSave', 'edShare']) $(id).disabled = !I.ok;
  $('edDist').value = String(Math.round(E.dist));
}
// Circuito del editor como código (o null si aún no vale)
function editorCode() {
  if (!editor.info.ok) { toast(editor.info.warnings[0] || 'El circuito aún no está listo'); return null; }
  editor.name = cleanCourseName(editor.name);
  return encodeCourse({ ...editor.course(), map: track.map.id });
}
function saveCourse(quiet = false) {
  const code = editorCode();
  if (!code) return null;
  courses.save(code); selectCourse(code);
  fillCourseSelect($('edList'), code, false);
  if (!quiet) toast(`Guardado «${editor.name}»: ya puedes elegirlo en el menú y en la sala`);
  return code;
}
function shareCourse() {
  const code = saveCourse(true);
  if (!code) return;
  $('edLink').value = `${location.origin}${location.pathname}?circuito=${code}`;
  $('edShareBox').hidden = false;
  $('edLink').select();
}
function testCourse() {
  const code = saveCourse(true);
  if (!code) return;
  if (editor.info.blocked) toast('Ojo: hay tramos en rojo, ahí te vas a chocar');
  applyCourse(code);
  startTrial(1);
  editorTest = true;
}
// Lee un código o un enlace con «circuito=»
function parseCourseInput(text) {
  const t = String(text || '').trim(), m = t.match(/[?&]circuito=([A-Za-z0-9_-]+)/);
  return decodeCourse(m ? m[1] : t);
}
const edBtn = (id, fn) => { $(id).onclick = () => { fn(); $(id).blur(); renderEditorPanel(); }; };
edBtn('edAdd', () => editor.addGate());
edBtn('edMove', () => editor.toggleGrab());
edBtn('edDel', () => editor.deleteGate());
edBtn('edSize', () => editor.cycleSize());
edBtn('edBoost', () => editor.toggleBoost());
edBtn('edGo', () => editor.lookAtGate(editor.sel));
edBtn('edPrev', () => editor.selectNext(-1));
edBtn('edNext', () => editor.selectNext(1));
edBtn('edUndo', () => editor.undo());
edBtn('edTest', testCourse);
edBtn('edSave', () => saveCourse());
edBtn('edShare', shareCourse);
edBtn('edNew', () => { editor.snapshot(); editor.sel = -1; editor.restore({ name: 'Mi circuito', gates: [], boosts: [] }); toast('Circuito vacío: haz clic para poner la salida'); });
edBtn('edOrig', () => { editor.load({ ...track.map.course, name: 'Mi circuito' }); toast('Copia del recorrido original'); });
edBtn('edLoad', () => { const v = $('edList').value; if (!v) return; try { editor.load(decodeCourse(v)); toast(`Abierto «${editor.name}»`); } catch { toast('No se ha podido abrir'); } });
let removeArmed = 0;
edBtn('edRemove', () => {
  const v = $('edList').value;
  if (!v) return;
  if (Date.now() - removeArmed > 3000) { removeArmed = Date.now(); toast('Pulsa otra vez «Borrar» para borrarlo de verdad'); return; }
  courses.remove(v); if (settings.course === v) selectCourse(''); removeArmed = 0;
  fillCourseSelect($('edList'), '', false); toast('Circuito borrado');
});
edBtn('edImport', () => {
  try { const c = parseCourseInput($('edCode').value); editor.load(c); $('edCode').value = ''; toast(`Importado «${c.name}»`); } catch { toast('Ese código no es válido'); }
});
$('edCopy').onclick = async () => { try { await navigator.clipboard.writeText($('edLink').value); } catch { $('edLink').select(); document.execCommand('copy'); } toast('Enlace copiado'); };
$('edExit').onclick = () => toMenu();
$('edFold').onclick = () => { const f = $('edPanel').classList.toggle('folded'); $('edFold').textContent = f ? '▸' : '▾'; };
$('edDist').oninput = e => { editor.dist = +e.target.value; };
$('edName').oninput = e => { editor.name = e.target.value; };
$('edName').onchange = e => { editor.name = cleanCourseName(e.target.value); e.target.value = editor.name; editor.rebuild(); };
for (const b of document.querySelectorAll('#edTouch [data-ed]')) {
  const k = b.dataset.ed, on = v => e => { e.preventDefault(); editor.touchMove = { ...(editor.touchMove || {}), [k]: v }; };
  b.addEventListener('pointerdown', on(true)); b.addEventListener('pointerup', on(false)); b.addEventListener('pointerleave', on(false)); b.addEventListener('pointercancel', on(false));
}
addEventListener('keydown', e => {
  if (game.phase !== 'editor' || ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  const E = editor, ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.code === 'KeyZ') E.undo();
  else if (ctrl && e.code === 'KeyY') E.redo();
  else if (ctrl) return;
  else if (e.code === 'KeyG') E.toggleGrab();
  else if (e.code === 'Delete' || e.code === 'Backspace' || e.code === 'KeyX') E.deleteGate();
  else if (e.code === 'KeyT') E.cycleSize();
  else if (e.code === 'KeyB') E.toggleBoost();
  else if (e.code === 'Tab') { e.preventDefault(); E.selectNext(e.shiftKey ? -1 : 1); }
  else if (e.code === 'KeyV') E.lookAtGate(E.sel);
  else if (e.code === 'Enter' || e.code === 'KeyP') E.addGate();
  else return;
  renderEditorPanel();
});
$('btnEditor').onclick = () => openEditor(false);
$('btnEdBack').onclick = () => { game.paused = false; openEditor(true); };
$('courseMenu').onchange = e => { selectCourse(e.target.value); toMenu(); };
$('btnMaps').onclick = openMaps;
$('btnMapsBack').onclick = () => showOverlay('menu');
$('btnBoard').onclick = () => openBoard('menu');
$('boardBack').onclick = () => showOverlay(boardBack);

// ---------- Interfaz ----------
const OVERLAYS = ['board', 'maps', 'menu', 'settingsPanel', 'controlsPanel', 'pause', 'results', 'lobby', 'hangar'];
function enterHangar() {
  net.close();
  game.phase = 'hangar'; game.mode = null;
  hud.show(false); hud.warn(0);
  for (const r of racers) { r.voice?.dispose(); r.voice = null; }
  sound.silence();
  showOverlay('hangar');
  hangar.active = true;
  hangarUI.open(settings.cfg, settings.name);
}
let backTo = 'menu';
function showOverlay(id) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
  const inReplay = game.phase === 'replay';
  if (replay && !inReplay && id !== 'results') { replay.dispose(); replay = null; $('replayBar').hidden = true; $('rpInfo').hidden = true; }
  if (photo.on && !inReplay && !(game.paused && (id === null || id === 'pause'))) { photo.on = false; world.setDof(0, 20); document.body.classList.remove('photo'); renderer.domElement.style.filter = ''; $('vigOverlay')?.remove(); $('photoBar').hidden = true; $('photoHide').hidden = true; }
  $('touch').hidden = !(touchDevice && !id && playing());
  touchTrial();
  if (game.phase !== 'editor' && editor.active) closeEditorUI();
}
function lockIfNeeded() { if (settings.scheme === 'mouse' && !touchDevice) input.requestLock(); }
// En línea el mundo no se para: abrir un menú deja tu jet con el piloto automático
function togglePause() {
  if (game.mode === 'lobby') { if ($('lobby').hidden) openLobbyPanel(); else closeLobbyPanel(); return; }
  if (net.online) {
    if (game.menuOpen) resume();
    else { game.menuOpen = true; showOverlay('pause'); $('btnPhoto').hidden = true; $('edBackRow').hidden = true; input.exitLock(); }
    return;
  }
  game.paused ? resume() : pause();
}
function openLobbyPanel() { game.menuOpen = true; backTo = 'lobby'; showOverlay('lobby'); renderLobby(); input.exitLock(); }
function closeLobbyPanel() { game.menuOpen = false; showOverlay(null); lockIfNeeded(); }
function pause() {
  if (!playing() || game.paused) return;
  game.paused = true;
  showOverlay('pause');
  $('btnPhoto').hidden = false;
  $('edBackRow').hidden = !editorTest;
  input.exitLock();
  sound.silence();
}
function resume() {
  game.paused = false; game.menuOpen = false;
  showOverlay(game.resultsShown && game.mode === 'race' ? 'results' : null);
  last = performance.now();
  if (!game.resultsShown) lockIfNeeded();
}
input.onLockChange = locked => {
  if (locked) wasLocked = true;
  else if (wasLocked && playing() && !game.paused && !game.menuOpen && settings.scheme === 'mouse') togglePause();
};
renderer.domElement.addEventListener('click', () => { if (playing() && !game.paused && !game.menuOpen) lockIfNeeded(); });

function setupJoin() {
  const code = location.hash.slice(1).toUpperCase(), valid = /^[A-Z0-9]{5}$/.test(code);
  $('joinBox').hidden = !valid;
  $('joinCode').textContent = valid ? code : '';
}
function renderColors() {
  const el = $('colors');
  el.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === settings.color ? ' on' : '');
    b.style.background = c;
    b.setAttribute('aria-label', 'Color ' + c);
    b.onclick = () => {
      settings.color = c; store.set('jt-color', c);
      settings.cfg.paint.c1 = c; saveCfg(); rebuildGhost(); renderColors();
      if (game.phase === 'menu') toMenu($('menuMsg').textContent); // el jet del fondo cambia de color
    };
    el.appendChild(b);
  }
}

$('btnTrial').onclick = () => startTrial();
$('btnFree').onclick = startFree;
$('btnHangar').onclick = enterHangar;
$('btnBots').onclick = openBotsLobby;
$('btnHost').onclick = hostRoom;
$('btnJoin').onclick = () => join(location.hash.slice(1).toUpperCase());
$('btnCode').onclick = () => { const c = $('codeInput').value.trim().toUpperCase(); if (/^[A-Z0-9]{5}$/.test(c)) join(c); else $('menuMsg').textContent = 'El código tiene 5 letras o números.'; };
$('btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('link').value); } catch { $('link').select(); document.execCommand('copy'); }
  toast('Enlace copiado');
};
$('btnStart').onclick = () => { if (!net.online || net.host) startRace(null); };
$('btnSaveCourse').onclick = () => { try { const c = courses.save(lobby.course); toast(`«${c.name}» guardado en «Mis circuitos»`); } catch { toast('No se ha podido guardar'); } renderLobby(); };
$('mapSel').onchange = e => {
  selectMap(e.target.value); applyMap(settings.map);
  lobby.map = settings.map; lobby.course = settings.course || null; applyCourse(lobby.course); updateRecords();
  if (game.mode === 'lobby') { const S = track.spline, s0 = track.gates[0].s - 200; me.place(S.pointAt(s0), S.tangentAt(s0), 85, 3); syncAim(); cam.cut = true; }
  if (net.online) broadcastLobby(); else renderLobby();
};
$('courseSel').onchange = e => {
  lobby.course = e.target.value || null;
  selectCourse(lobby.course); applyCourse(lobby.course); updateRecords();
  if (net.online) broadcastLobby(); else renderLobby();
};
$('mode').onchange = e => { lobby.mode = e.target.value; game.cup = null; if (net.online) broadcastLobby(); else renderLobby(); };
$('time').onchange = e => { lobby.time = +e.target.value; if (net.online) broadcastLobby(); else renderLobby(); };
$('btnFly').onclick = closeLobbyPanel;
$('btnLeave').onclick = () => toMenu();
$('bots').oninput = e => { lobby.bots = +e.target.value; if (net.online) broadcastLobby(); else renderLobby(); };
$('laps').oninput = e => { lobby.laps = +e.target.value; if (net.online) broadcastLobby(); else renderLobby(); };
$('diff').onchange = e => { lobby.diff = e.target.value; if (net.online) broadcastLobby(); else renderLobby(); };
$('btnSettings').onclick = () => { backTo = 'menu'; showOverlay('settingsPanel'); };
$('btnControls').onclick = () => { backTo = 'menu'; showOverlay('controlsPanel'); };
$('btnResume').onclick = resume;
$('btnRestart').onclick = () => { game.paused = false; restart(); };
$('btnPSettings').onclick = () => { backTo = 'pause'; showOverlay('settingsPanel'); };
$('btnPControls').onclick = () => { backTo = 'pause'; showOverlay('controlsPanel'); };
$('btnQuit').onclick = () => toMenu();
for (const b of document.querySelectorAll('.settingsBack')) b.onclick = () => showOverlay(backTo);
$('comboTable').innerHTML = COMBO_HELP.map(([n, c]) => `<tr><td>${n}</td><td>${c}</td></tr>`).join('');

const bind = (id, key, get, apply) => {
  const el = $(id);
  if (el.type === 'checkbox') el.checked = !!settings[key]; else el.value = settings[key];
  el.addEventListener('input', () => {
    settings[key] = get(el);
    store.set('jt-' + key, el.type === 'checkbox' ? (el.checked ? '1' : '0') : String(settings[key]));
    apply?.();
  });
};
bind('scheme', 'scheme', el => el.value, helpLine);
bind('assist', 'assist', el => +el.value);
bind('invert', 'invert', el => el.checked);
bind('sens', 'sens', el => +el.value);
bind('volume', 'volume', el => +el.value, () => sound.setVolume(settings.volume));
bind('boardOn', 'board', el => el.checked);
bind('music', 'music', el => +el.value, () => { sound.init(); music.setVolume(settings.music); });
bind('quality', 'quality', el => el.value, () => location.reload());
bind('gyro', 'gyro', el => el.checked, () => { if (settings.gyro) input.enableGyro(); else input.gyro.on = false; });
$('gyroRow').hidden = !touchDevice;
if (touchDevice && settings.gyro) input.enableGyro();
const nameEl = $('name');
nameEl.value = settings.name;
nameEl.addEventListener('input', () => { settings.name = cleanName(nameEl.value); store.set('jt-name', settings.name); if (me && game.phase === 'menu') me.name = settings.name; });
// un reto pegado en una pestaña ya abierta: se recarga para leerlo
addEventListener('hashchange', () => { if (location.hash.startsWith('#reto=')) location.reload(); else setupJoin(); });

// ---------- Arranque ----------
renderColors();
// ?reto=… : el fantasma y el tiempo de un amigo (y su circuito, si es propio) para batirlo
const retoRaw = params.get('reto') || (location.hash.startsWith('#reto=') ? location.hash.slice(6) : null);
if (retoRaw) {
  let msg;
  try {
    const raw = retoRaw, txt = new TextDecoder().decode(Uint8Array.from(atob(raw.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((raw.length + 3) % 4)), c => c.charCodeAt(0)));
    const d = JSON.parse(txt);
    if (d.c) { const c = courses.save(d.c); selectMap(c.map); applyMap(c.map); selectCourse(d.c); applyCourse(d.c); } else { selectMap(d.m); applyMap(d.m); selectCourse(''); applyCourse(null); }
    if (d.k !== MAP) throw new Error('otro mapa');
    setRival(cleanName(d.n), d.t / 1000, unpackGhost(d.g));
    msg = `Reto de ${cleanName(d.n)} en «${track.custom ? track.custom.name : track.map.name}»: bate ${fmtTime(d.t / 1000)} en la contrarreloj`;
  } catch { msg = 'El enlace del reto no es válido'; }
  params.delete('reto');
  const q = [...params].map(([k, v]) => (v ? `${k}=${encodeURIComponent(v)}` : k)).join('&');
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + (location.hash.startsWith('#reto=') ? '' : location.hash));
  setTimeout(() => toast(msg), 900);
}
// ?circuito=… : se guarda en «Mis circuitos», queda elegido y se quita de la dirección
if (params.has('circuito')) {
  const code = params.get('circuito');
  let msg;
  try { const c = courses.save(code); selectMap(c.map); applyMap(c.map); selectCourse(code); msg = `Circuito «${c.name}» guardado en «Mis circuitos» y elegido`; } catch { msg = 'El enlace del circuito no es válido'; }
  params.delete('circuito');
  const q = [...params].map(([k, v]) => (v ? `${k}=${encodeURIComponent(v)}` : k)).join('&');
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
  setTimeout(() => toast(msg), 800);
}
toMenu();
renderer.compile(scene, camera);
$('loading').hidden = true;
helpLine();
setInterval(helpLine, 1000);
requestAnimationFrame(frame);

if (DEBUG) {
  window.jetDebug = {
    game, track, settings, view, fx, sound, world, renderer, cam, aim, rec, net, combo, clouds, atm, THREE, scene, camera, input, hud,
    get jet() { return jet; }, get race() { return race; }, get style() { return style; }, get me() { return me; }, get racers() { return racers; },
    get ctl() { return ctl; }, get st() { return st; }, get lobby() { return lobby; }, get ap() { return meAp; },
    startTrial, startFree, toMenu, respawn, startRace, openBotsLobby, hostRoom, join, standings, enterHangar, hangar, hangarUI,
    items, recorder, photo, music, startReplay, stopReplay, enterPhoto, exitPhoto, savePhoto, useItem, fireMissile, findTarget, itemHit,
    get replay() { return replay; }, board, openBoard, setRival, challengeLink, get rival() { return rival; }, PID, editor, courses, applyCourse, applyMap, selectMap, MAPS, openEditor, encodeCourse, decodeCourse, get courseCode() { return courseCode; }, get lobbyRef() { return lobby; }, setLobby(o) { Object.assign(lobby, o); },
    setAutopilot(on) { game.autopilot = on; },
    spawnAt(s, v = 90) { const S = track.spline; me.place(S.pointAt(s), S.tangentAt(s), v, 2); race.teleport(jet.pos); meAp.hint = -1; syncAim(); cam.cut = true; },
    trick(name, side = 1) { pendingTrick = { name, side }; },
    perf() { const r = { fps: perf.frames / (perf.sum || 1), slowPct: (perf.slow / (perf.frames || 1)) * 100, pixelRatio, frames: perf.frames }; perf.frames = perf.slow = perf.sum = 0; return r; },
    noAdapt: false,
  };
}
