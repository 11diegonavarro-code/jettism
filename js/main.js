// Jettism: vuelo, piruetas, contrarreloj con fantasma, vuelo libre y carreras de hasta 8 (amigos y bots).
import * as THREE from 'three';
import { createWorld, QUALITY, SUN } from './world.js';
import { Track, SECTIONS } from './track.js';
import { CourseView } from './course-view.js';
import { Clouds } from './clouds.js';
import { buildJet } from './jet-model.js';
import { steerToward, applyAssist, collisionWarning } from './flight.js';
import { Autopilot } from './ai.js';
import { ComboParser, COMBO_HELP } from './tricks.js';
import { GhostRecorder, GhostPlayer, encodeGhost, decodeGhost } from './ghost.js';
import { FX } from './fx.js';
import { Sound, RemoteVoice } from './audio.js';
import { Input } from './input.js';
import { HUD, fmtTime } from './hud.js';
import { Net } from './net.js';
import { Racer, COLORS, BOT_NAMES, DIFFICULTY } from './racers.js';
import { V3, clamp, damp } from './math.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
// la clave del mapa cambia cuando cambia el recorrido, para no mezclar récords y fantasmas de versiones distintas
const STEP = 1 / 120, MAP = 'desierto2', MAX_JETS = 8;
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const touchDevice = matchMedia('(pointer: coarse)').matches;
const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14) || 'Piloto';

// ---------- Ajustes ----------
const savedQ = store.get('jt-quality', 'alta');
const settings = {
  scheme: store.get('jt-scheme', touchDevice ? 'classic' : 'mouse'),
  assist: +store.get('jt-assist', 1),
  invert: store.get('jt-invert', '0') === '1',
  sens: +store.get('jt-sens', 1) || 1,
  volume: +store.get('jt-volume', 0.6),
  quality: QUALITY[savedQ] ? savedQ : 'alta',
  gyro: store.get('jt-gyro', '0') === '1',
  name: cleanName(store.get('jt-name', 'Piloto' + Math.floor(Math.random() * 90 + 10))),
  color: COLORS.includes(store.get('jt-color', '')) ? store.get('jt-color', '') : COLORS[0],
};

// ---------- Motor ----------
const renderer = new THREE.WebGLRenderer({ antialias: settings.quality === 'baja', powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, QUALITY[settings.quality].maxRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);
const world = createWorld(renderer, settings.quality);
const { scene, camera } = world;
const track = new Track();
const view = new CourseView(scene, track, world.quality);
const clouds = new Clouds(scene, track, world.quality, SUN);
const fx = new FX(scene, camera, world.quality);
// tramos con clima propio: noche tras la puerta y niebla rosa en el bosque
const ZONE = { night0: track.sOf('puerta'), night1: track.sOf('lago'), pink0: track.sOf('bosque'), pink1: track.sOf('acantilado') };
const atm = { night: 0, pink: 0, steamT: 0 };
const sound = new Sound();
sound.volume = settings.volume;
const input = new Input(renderer.domElement, settings);
const hud = new HUD();
const net = new Net();
addEventListener('resize', () => { world.resize(); fx.setPointScale(renderer, camera); });
fx.setPointScale(renderer, camera);

const ghostModel = buildJet(undefined, { ghost: true });
ghostModel.group.visible = false;
scene.add(ghostModel.group);

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
const rec = {
  lap: +store.get(`jt-${MAP}-lap`, 0) || null,
  total: +store.get(`jt-${MAP}-total`, 0) || null,
  style: +store.get(`jt-${MAP}-style`, 0) || 0,
};
const playing = () => ['countdown', 'race', 'free', 'lobby'].includes(game.phase);
const multi = () => game.mode === 'race' || game.mode === 'lobby';
const myId = () => (net.online ? net.me : 'me');

function setMe(r) { me = r; jet = r.jet; race = r.race; model = r.model; style = r.style; manual = r.manual; ctl = r.ctl; }
function clearRacers(keepMe = false) {
  for (const r of racers) if (!(keepMe && r === me)) r.dispose();
  racers = keepMe && me ? [me] : [];
}
function newMe(laps = 3) {
  const r = new Racer(scene, track, { id: myId(), name: settings.name, color: settings.color, owned: true, me: true, laps });
  racers.push(r);
  setMe(r);
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
function soloRacers(laps) {
  net.close();
  clearRacers();
  newMe(laps);
}
function startTrial() {
  sound.init();
  soloRacers(+params.get('laps') || 3);
  game.mode = 'trial'; game.phase = 'countdown'; game.paused = false; game.autopilot = DEBUG && params.has('auto');
  resetRun();
  game.go = performance.now() + 3600; game.t = -3.6;
  me.place(PLATFORM, new V3(0, 0, -1), 0, 99);
  syncAim();
  ghost = loadGhost();
  showOverlay(null); hud.show(true); cam.cut = true;
  lockIfNeeded();
}
function launchRacer(r, pos) {
  const p = 0.12;
  r.jet.spawn(pos.clone().add(new V3(0, 0.3, 0)), new V3(0, Math.sin(p), -Math.cos(p)), 72, 1);
  r.jet.turbo = 30;
  r.race.reset(0); r.race.teleport(r.jet.pos);
  r.prevPos.copy(r.jet.pos); r.prevQ.copy(r.jet.q);
  if (r.ap) r.ap.hint = -1;
}
function launch() {
  game.phase = 'race';
  for (const r of racers) if (r.owned) launchRacer(r, r.slot != null ? slotPos(r.slot) : PLATFORM);
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
  clearRacers();
  newMe(Infinity);
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
    const b = new Racer(scene, track, { id: 'D' + k, name: BOT_NAMES[k], color: COLORS[(k + 1) % COLORS.length], bot: true, owned: true, laps: Infinity });
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
  else if (game.mode === 'race' && !net.online) startRace();
  else startTrial();
}

function respawnRacer(r) {
  const p = r.race.respawnPoint();
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
function lobbyPlayerColor(want) {
  const used = new Set(lobby.players.map(p => p.color));
  return COLORS.includes(want) && !used.has(want) ? want : COLORS.find(c => !used.has(c)) || COLORS[0];
}
// Carrera contra bots (sin red): la «sala» es solo la ventana de ajustes
function openBotsLobby() {
  sound.init();
  net.close();
  lobby = { players: [{ pid: 'me', name: settings.name, color: settings.color }], bots: lobby.bots || 5, laps: lobby.laps || 3, diff: lobby.diff || 'normal', racing: false };
  backTo = 'menu';
  showOverlay('lobby');
  renderLobby();
}
async function hostRoom() {
  sound.init();
  $('menuMsg').textContent = 'Creando sala…';
  try {
    await net.createRoom();
    lobby = { players: [{ pid: 'H', name: settings.name, color: settings.color }], bots: 3, laps: 3, diff: 'normal', racing: false };
    history.replaceState(null, '', `#${net.code}`);
    enterLobby();
  } catch (e) { $('menuMsg').textContent = 'No se pudo crear la sala: ' + (e.message || e); }
}
async function join(code) {
  sound.init();
  $('menuMsg').textContent = 'Conectando… (puede tardar unos segundos)';
  try {
    await net.joinRoom(code, { name: settings.name, color: settings.color });
    $('menuMsg').textContent = '';
    toast(net.via === 'directa' ? 'Conectado' : 'Conectado (vía servidor)');
    lobby = { players: [], bots: 0, laps: 3, diff: 'normal', racing: false };
    enterLobby();
  } catch (e) { $('menuMsg').textContent = e.message || String(e); }
}
// Sala online: todos vuelan libres por el mapa mientras el anfitrión prepara la carrera
function enterLobby() {
  clearRacers();
  newMe(Infinity);
  game.mode = 'lobby'; game.phase = 'lobby'; game.paused = false; game.autopilot = false;
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
    racers.push(new Racer(scene, track, { id: p.pid, name: p.name, color: p.color, laps: Infinity }));
  }
  for (const r of [...racers]) if (r !== me && !lobby.players.some(p => p.pid === r.id)) { r.dispose(); racers.splice(racers.indexOf(r), 1); }
  const mine = lobby.players.find(p => p.pid === myId());
  if (mine && mine.color !== me.color) { me.color = mine.color; me.smoke.setColor(mine.color); }
}
function broadcastLobby() {
  lobby.racing = game.mode === 'race';
  net.send({ t: 'lobby', lobby });
  renderLobby();
}
function renderLobby() {
  const L = lobby, ul = $('players'), online = net.online, hosting = !online || net.host;
  $('lobbyTitle').textContent = online ? `Sala ${net.code}` : 'Carrera contra bots';
  $('linkBox').hidden = !online;
  if (online) $('link').value = `${location.origin}${location.pathname}#${net.code}`;
  ul.innerHTML = '';
  for (const p of L.players) {
    const li = document.createElement('li'), dot = document.createElement('span');
    dot.className = 'dot'; dot.style.background = p.color;
    li.append(dot, document.createTextNode(p.name + (online && p.pid === 'H' ? ' (anfitrión)' : '') + (p.pid === myId() ? ' — tú' : '')));
    ul.appendChild(li);
  }
  const maxBots = MAX_JETS - L.players.length;
  L.bots = Math.min(L.bots, maxBots);
  $('hostOpts').hidden = !hosting;
  $('bots').max = maxBots; $('bots').value = L.bots; $('botsVal').textContent = L.bots;
  $('laps').value = L.laps; $('lapsVal').textContent = L.laps;
  $('diff').value = L.diff;
  $('waitMsg').hidden = hosting;
  $('waitMsg').textContent = L.racing ? 'Hay una carrera en marcha: entrarás en la siguiente.' : 'Esperando a que el anfitrión empiece…';
  $('btnFly').hidden = !online;
  $('lobbyHint').hidden = !online;
}
// El anfitrión (o el jugador solo) reparte la parrilla y da la salida
function startRace() {
  const humans = net.online ? lobby.players : [{ pid: 'me', name: settings.name, color: settings.color }];
  const used = new Set(humans.map(p => p.color));
  const bots = Array.from({ length: Math.min(lobby.bots, MAX_JETS - humans.length) }, (_, k) => {
    const color = COLORS.find(c => !used.has(c)) || COLORS[k % COLORS.length];
    used.add(color);
    return { id: 'B' + k, name: BOT_NAMES[(k + Math.floor(Math.random() * BOT_NAMES.length)) % BOT_NAMES.length], color, bot: true };
  });
  const names = new Set();
  for (const b of bots) { while (names.has(b.name)) b.name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]; names.add(b.name); }
  const all = [...humans.map(p => ({ id: p.pid, name: p.name, color: p.color, bot: false })), ...bots];
  const slots = all.map((_, i) => i).sort(() => Math.random() - 0.5);
  const msg = { t: 'start', go: net.hostNow() + 4200, laps: lobby.laps, diff: lobby.diff, grid: all.map((p, i) => ({ ...p, slot: slots[i] })) };
  if (net.online) net.send(msg);
  beginRace(msg);
  if (net.online) broadcastLobby();
}
function beginRace(m) {
  sound.init();
  clearRacers();
  const hostSide = !net.online || net.host;
  for (const g of m.grid) {
    const mine = g.id === myId();
    const r = new Racer(scene, track, { id: g.id, name: g.name, color: g.color, bot: g.bot, owned: mine || (g.bot && hostSide), me: mine, laps: m.laps, diff: m.diff });
    r.slot = g.slot;
    r.place(slotPos(g.slot), new V3(0, 0, -1), 0, 99);
    racers.push(r);
    if (mine) setMe(r);
  }
  if (!me) { newMe(m.laps); me.place(slotPos(7), new V3(0, 0, -1), 0, 99); }
  game.mode = 'race'; game.phase = 'countdown'; game.paused = false; game.autopilot = DEBUG && params.has('auto');
  game.laps = m.laps; game.go = m.go;
  resetRun();
  game.t = (net.hostNow() - game.go) / 1000;
  syncAim();
  showOverlay(null); hud.show(true); cam.cut = true;
  lockIfNeeded();
}
function racerById(id) { return racers.find(r => r.id === id); }
function standings() { return [...racers].sort((a, b) => b.progress(track.length) - a.progress(track.length)); }

// Un jet propio (el mío o un bot del anfitrión) ha terminado
function finishRacer(r, time) {
  r.finishTime = time;
  if (net.online) net.send({ t: 'ev', k: 'fin', id: r.id, time, best: r.race.best, style: r.style.total });
}
function checkRaceEnd() {
  if (game.mode !== 'race' || game.resultsShown) return;
  const fin = racers.filter(r => r.finishTime != null);
  if (!fin.length) return;
  const first = Math.min(...fin.map(r => r.finishTime));
  const done = fin.length === racers.length || (me.finishTime != null && game.t - me.finishTime > 20) || game.t - first > 60;
  if (done) showRaceResults();
}
function showRaceResults() {
  game.resultsShown = true;
  const order = standings();
  const table = $('resTable');
  table.innerHTML = '<tr><td>#</td><td>Piloto</td><td>Tiempo</td><td>Mejor vuelta</td><td>Estilo</td></tr>';
  order.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r === me) tr.className = 'me';
    const best = r.owned ? r.race.best : r.best;
    const sty = r.owned ? r.style.total : r.styleTotal;
    for (const text of [`${i + 1}º`, r.name + (r.bot ? ' 🤖' : ''), r.finishTime != null ? fmtTime(r.finishTime) : '—', best ? fmtTime(best) : '—', sty != null ? sty.toLocaleString('es-ES') : '—']) {
      const td = document.createElement('td'); td.textContent = text; tr.appendChild(td);
    }
    table.appendChild(tr);
  });
  const pos = order.indexOf(me) + 1;
  $('resTitle').textContent = pos === 1 ? '¡Has ganado!' : `Has quedado ${pos}º de ${order.length}`;
  $('resBody').innerHTML = '';
  const btns = $('resBtns');
  btns.innerHTML = '';
  const add = (text, fn, primary) => { const b = document.createElement('button'); b.textContent = text; if (primary) b.className = 'primary'; b.onclick = fn; btns.appendChild(b); };
  if (!net.online) { add('Otra carrera', startRace, true); add('Cambiar bots', openBotsLobby); add('Menú', () => toMenu()); }
  else if (net.host) { add('Volver a la sala', () => { net.send({ t: 'tolobby' }); enterLobby(); }, true); add('Cerrar la sala', () => toMenu()); }
  else { add('Salir de la sala', () => toMenu()); }
  $('resWait').textContent = net.online && !net.host ? 'Esperando a que el anfitrión vuelva a la sala…' : '';
  input.exitLock();
  showOverlay('results');
}

// ---------- Red ----------
net.on('join', m => {
  if (!net.host) return;
  if (lobby.players.length >= MAX_JETS) return;
  const p = { pid: m.from, name: cleanName(m.name), color: lobbyPlayerColor(m.color) };
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
net.on('ev', m => {
  const r = racerById(m.id);
  if (!r || r.owned) return;
  if (m.k === 'crash') {
    fx.explosion(m.p, m.v);
    fx.eject(m.p, m.v, r.look);
    if (r.view.p.distanceTo(camera.position) < 600) sound.sfx('explosion');
  } else if (m.k === 'trick') {
    r.tricks.push({ name: m.name, t: m.t });
    if (r.tricks.length > 6) r.tricks.shift();
  } else if (m.k === 'fin') {
    r.finishTime = m.time; r.best = m.best; r.styleTotal = m.style;
    if (game.mode === 'race') hud.feed(`${r.name} ha llegado a la meta`, 'info');
  }
});
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
    if (isMe) buildControls(); else r.ap.control(J, STEP, r.ctl, game.clock);
    const want = isMe ? (ctl.trick || pendingTrick) : r.ctl.trick;
    if (want) {
      const ok = J.startTrick(want.name, want.side, game.t);
      if (ok && J.trick && J.trick.t === 0) noteTrick(r, want.name);
      if (isMe) { pendingTrick = null; ctl.trick = null; } else r.ctl.trick = null;
    }
    J.step(STEP, r.ctl, track, game.t, ev);
    if (J.alive) r.race.update(J, game.t, ev);
    if (J.alive && !J.trick) r.manual.step(STEP, game.t, J, awards);
    if (isMe && game.mode === 'trial' && game.phase === 'race') ghostRec.sample(game.t - race.lapStart, J);
  } else {
    J.step(STEP, r.ctl, track, game.t, ev);
    if (J.crashT <= 0) isMe ? respawn() : respawnRacer(r);
  }
}
// Guarda y anuncia una pirueta (para las formaciones)
function noteTrick(r, name) {
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
      fx.eject(e.p, e.v, r.look);
      r.style.breakChain(); r.manual.reset();
      if (game.phase !== 'menu' && r.view.p.distanceTo(camera.position) < 600) sound.sfx('explosion');
      if (net.online) net.send({ t: 'ev', k: 'crash', id: r.id, p: e.p, v: e.v });
    } else if (e.type === 'scrape') fx.sparks(e.p);
    else if (e.type === 'near') r.jet.turbo = Math.min(100, r.jet.turbo + 8);
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
        fx.eject(e.p, e.v, me.look);
        game.crashAt = new THREE.Vector3(e.p.x, e.p.y, e.p.z);
        style.breakChain(); manual.reset(); combo.state = 'idle'; pendingTrick = null;
        cam.shake = 1.2;
        if (net.online) net.send({ t: 'ev', k: 'crash', id: me.id, p: e.p, v: e.v });
        if (!menu) { sound.sfx('explosion'); sound.sfx('chute'); hud.center('¡BOOM!', 'small', 1.4); }
        break;
      case 'scrape':
        fx.sparks(e.p); fx.puff(e.p); cam.shake = Math.max(cam.shake, 0.5);
        if (!menu) sound.sfx('scrape');
        break;
      case 'near': {
        const gain = Math.round(5 + 10 * (1 - e.dist / 6));
        jet.turbo = Math.min(100, jet.turbo + gain);
        style.bonus(25);
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
        view.setNextGate(race.next);
        if (e.ring) { jet.turbo = Math.min(100, jet.turbo + 5); fx.ringBurst(g.p, g.t, g.ring); }
        if (!menu) {
          sound.sfx(e.ring ? 'ring' : 'gate');
          const sec = SECTIONS.find(([i]) => i === e.i && i > 0);
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
  const total = e.time, newTotal = !rec.total || total < rec.total, newStyle = style.total > rec.style;
  if (newTotal) { rec.total = total; store.set(`jt-${MAP}-total`, total.toFixed(3)); }
  if (newStyle) { rec.style = style.total; store.set(`jt-${MAP}-style`, String(style.total)); }
  const laps = race.lapTimes.map((t, i) => `Vuelta ${i + 1}: <b>${fmtTime(t)}</b>${t === race.best ? ' ⭐' : ''}`).join('<br>');
  $('resTitle').textContent = newTotal ? '¡Nuevo récord!' : '¡Meta!';
  $('resTable').innerHTML = '';
  $('resWait').textContent = '';
  $('resBody').innerHTML = `<p style="font-size:30px;text-align:center;margin:6px 0;color:var(--gold)"><b>${fmtTime(total)}</b></p>
    <p>${laps}</p>
    <p>Estilo: <b>${style.total.toLocaleString('es-ES')}</b> puntos en ${style.count} piruetas${newStyle ? ' · ¡récord de estilo!' : ''}</p>
    <p class="hint">Récords: vuelta ${fmtTime(rec.lap)} · carrera ${fmtTime(rec.total)} · estilo ${rec.style.toLocaleString('es-ES')}. El fantasma cian es tu mejor vuelta.</p>`;
  const btns = $('resBtns');
  btns.innerHTML = '';
  for (const [text, fn, primary] of [['Repetir', startTrial, true], ['Menú', () => toMenu()]]) {
    const b = document.createElement('button'); b.textContent = text; if (primary) b.className = 'primary'; b.onclick = fn; btns.appendChild(b);
  }
  input.exitLock();
}

function updateRecords() {
  $('records').textContent = rec.lap ? `Récords · vuelta ${fmtTime(rec.lap)} · carrera ${fmtTime(rec.total)} · estilo ${rec.style.toLocaleString('es-ES')}` : '';
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
  box.innerHTML = order.map((r, i) => `<li class="${r === me ? 'me' : ''} ${r.finishTime != null ? 'done' : ''}" style="${r === me ? '' : `color:${r.color}`}">${i + 1}. ${r === me ? 'Tú' : r.name}</li>`).join('');
  place.innerHTML = `${order.indexOf(me) + 1}º<small>/${order.length}</small>`;
}
function drawHud(dt) {
  drawTags();
  if (game.phase === 'menu') return;
  hud.tick(dt);
  drawStandings(dt);
  // al cruzar la meta el cronómetro se queda quieto con el tiempo final
  const done = race.finished;
  const lapTime = game.phase === 'countdown' ? 0 : done ? race.lapTimes[race.lapTimes.length - 1] : Math.max(0, game.t - race.lapStart);
  const best = game.mode === 'trial' ? [race.best, rec.lap].filter(Boolean) : [race.best].filter(Boolean);
  const label = game.mode === 'lobby' ? (net.online ? `SALA ${net.code}` : 'SALA') : game.mode === 'free' ? 'VUELO LIBRE' : null;
  hud.setRace({ lap: race.lap || 1, laps: race.laps, time: done ? race.finishTime : Math.max(0, game.t), lapTime, best: best.length ? Math.min(...best) : null, free: !!label, label });
  hud.setFlight(jet.alive ? jet.speed * 3.6 : 0, jet.turbo, jet.pos.y, jet.boosting);
  hud.setStyle(style.total, style.mult, style.chainLeft(game.t));
  // siguiente puerta
  const g = track.gates[race.next], showMarker = settings.assist >= 1 && jet.alive && playing() && game.phase !== 'countdown' && game.mode !== 'lobby';
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
  const s = race.s || 0;
  const nightT = sstep(ZONE.night0 - 5, ZONE.night0 + 55, s) * (1 - sstep(ZONE.night1 - 260, ZONE.night1 + 40, s));
  const pinkT = sstep(ZONE.pink0 - 160, ZONE.pink0 + 120, s) * (1 - sstep(ZONE.pink1 - 220, ZONE.pink1 + 40, s));
  const k = cam.cut ? 1 : damp(3.5, dt);
  atm.night += (nightT - atm.night) * k;
  atm.pink += (pinkT - atm.pink) * k;
  world.setAtmosphere(atm.night, atm.pink);
  world.update(dt, game.clock);
  clouds.update(scene.fog, atm.night);
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
  const on = playing() || game.phase === 'finished';
  const near = on ? racers.filter(r => r !== me && r.view.alive && r.view.p.distanceTo(lisP) < 700).sort((a, b) => a.view.p.distanceTo(lisP) - b.view.p.distanceTo(lisP)).slice(0, 4) : [];
  for (const r of racers) {
    if (near.includes(r)) {
      if (!r.voice) r.voice = new RemoteVoice(sound);
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

  // botones generales
  if (st.pause && (playing() || game.phase === 'finished')) togglePause();
  if (st.cam && playing()) { cam.mode = CAMS[(CAMS.indexOf(cam.mode) + 1) % CAMS.length]; store.set('jt-cam', cam.mode); cam.cut = true; }
  if (st.respawn && jet.alive && ['race', 'free', 'lobby'].includes(game.phase) && !game.paused) respawn();
  if (st.boost && !prevBoost) game.lastBoostEdge = game.t;
  prevBoost = st.boost;

  // en línea, el reloj de los obstáculos y el de la carrera siguen al del anfitrión
  if (net.online) {
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
      } else syncAim();
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 12) { physicsStep(); acc -= STEP; n++; }
      if (n >= 12) acc = 0;
      if (multi() || game.phase === 'menu') jetInteractions(dt);
      if (game.phase === 'finished' && (game.finishT += dt) > 2.5 && $('results').hidden && game.mode === 'trial' && !game.resultsShown) { game.resultsShown = true; showOverlay('results'); }
      checkRaceEnd();
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
  updateCamera(dt);
  drawHud(dt);
  updateVoices(dt);
  if (playing() && !game.paused && sound.ctx) {
    const slip = jet.alive ? clamp(Math.abs(jet.w.y) * 0.6 + jet.gload / 14, 0, 1) : 0;
    sound.engine({ power: me.view.throttle, boost: me.view.boost, speed: jet.alive ? jet.speed : 0, slip, on: jet.alive });
  } else if (game.phase === 'finished' && sound.ctx) sound.engine({ power: 0.4, speed: jet.speed * 0.5, on: true });
  world.render();
  requestAnimationFrame(frame);
}

// ---------- Interfaz ----------
const OVERLAYS = ['menu', 'settingsPanel', 'controlsPanel', 'pause', 'results', 'lobby'];
let backTo = 'menu';
function showOverlay(id) {
  for (const o of OVERLAYS) $(o).hidden = o !== id;
  $('touch').hidden = !(touchDevice && !id && playing());
}
function lockIfNeeded() { if (settings.scheme === 'mouse' && !touchDevice) input.requestLock(); }
// En línea el mundo no se para: abrir un menú deja tu jet con el piloto automático
function togglePause() {
  if (game.mode === 'lobby') { if ($('lobby').hidden) openLobbyPanel(); else closeLobbyPanel(); return; }
  if (net.online) {
    if (game.menuOpen) resume();
    else { game.menuOpen = true; showOverlay('pause'); input.exitLock(); }
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
      settings.color = c; store.set('jt-color', c); renderColors();
      if (game.phase === 'menu') toMenu($('menuMsg').textContent); // el jet del fondo cambia de color
    };
    el.appendChild(b);
  }
}

$('btnTrial').onclick = startTrial;
$('btnFree').onclick = startFree;
$('btnBots').onclick = openBotsLobby;
$('btnHost').onclick = hostRoom;
$('btnJoin').onclick = () => join(location.hash.slice(1).toUpperCase());
$('btnCode').onclick = () => { const c = $('codeInput').value.trim().toUpperCase(); if (/^[A-Z0-9]{5}$/.test(c)) join(c); else $('menuMsg').textContent = 'El código tiene 5 letras o números.'; };
$('btnCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('link').value); } catch { $('link').select(); document.execCommand('copy'); }
  toast('Enlace copiado');
};
$('btnStart').onclick = () => { if (!net.online || net.host) startRace(); };
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
bind('quality', 'quality', el => el.value, () => location.reload());
bind('gyro', 'gyro', el => el.checked, () => { if (settings.gyro) input.enableGyro(); else input.gyro.on = false; });
$('gyroRow').hidden = !touchDevice;
if (touchDevice && settings.gyro) input.enableGyro();
const nameEl = $('name');
nameEl.value = settings.name;
nameEl.addEventListener('input', () => { settings.name = cleanName(nameEl.value); store.set('jt-name', settings.name); if (me && game.phase === 'menu') me.name = settings.name; });
addEventListener('hashchange', setupJoin);

// ---------- Arranque ----------
renderColors();
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
    startTrial, startFree, toMenu, respawn, startRace, openBotsLobby, hostRoom, join, standings,
    setAutopilot(on) { game.autopilot = on; },
    spawnAt(s, v = 90) { const S = track.spline; me.place(S.pointAt(s), S.tangentAt(s), v, 2); race.teleport(jet.pos); meAp.hint = -1; syncAim(); cam.cut = true; },
    trick(name, side = 1) { pendingTrick = { name, side }; },
    perf() { const r = { fps: perf.frames / (perf.sum || 1), slowPct: (perf.slow / (perf.frames || 1)) * 100, pixelRatio, frames: perf.frames }; perf.frames = perf.slow = perf.sum = 0; return r; },
    noAdapt: false,
  };
}
