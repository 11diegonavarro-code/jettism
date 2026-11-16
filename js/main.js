// Jettism · parte 1: vuelo, piruetas, contrarreloj con fantasma y vuelo libre.
import * as THREE from 'three';
import { createWorld, QUALITY } from './world.js';
import { Track, SECTIONS } from './track.js';
import { CourseView } from './course-view.js';
import { buildJet, DEFAULT_LOOK } from './jet-model.js';
import { Jet, steerToward, applyAssist, collisionWarning } from './flight.js';
import { Race } from './race.js';
import { Autopilot } from './ai.js';
import { ComboParser, ManualDetector, Style, COMBO_HELP } from './tricks.js';
import { GhostRecorder, GhostPlayer, encodeGhost, decodeGhost } from './ghost.js';
import { FX } from './fx.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { HUD, fmtTime } from './hud.js';
import { V3, Quat, clamp, damp } from './math.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const STEP = 1 / 120, MAP = 'desierto';
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
const touchDevice = matchMedia('(pointer: coarse)').matches;

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
  name: store.get('jt-name', 'Piloto' + Math.floor(Math.random() * 90 + 10)),
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
const view = new CourseView(scene, track);
const fx = new FX(scene, camera, world.quality);
const sound = new Sound();
sound.volume = settings.volume;
const input = new Input(renderer.domElement, settings);
const hud = new HUD();
addEventListener('resize', () => { world.resize(); fx.setPointScale(renderer, camera); });
fx.setPointScale(renderer, camera);

const look = { ...DEFAULT_LOOK };
const model = buildJet(look);
scene.add(model.group);
const ghostModel = buildJet(look, { ghost: true });
ghostModel.group.visible = false;
scene.add(ghostModel.group);

// ---------- Estado ----------
const game = { phase: 'menu', mode: null, paused: false, t: 0, clock: 0, autopilot: false, crashAt: null, outT: 0, finishT: 0, lastBoostEdge: -99, perfect: false, sectionGate: -1 };
const jet = new Jet();
const race = new Race(track, 3);
const ap = new Autopilot(track, { skill: 0.9 });
const combo = new ComboParser(), manual = new ManualDetector(), style = new Style();
const assistState = {};
const ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, aimed: false, trick: null };
const prevPos = new V3(), prevQ = new Quat(), aim = { yaw: 0, pitch: 0, dir: new V3(0, 0, -1) };
let st = null, ghostRec = new GhostRecorder(), ghost = null, pendingTrick = null, warn = null, warnBeep = 0, wasLocked = false, prevBoost = false;
const PLATFORM = new V3(0, 46.6, 44);
const rec = {
  lap: +store.get(`jt-${MAP}-lap`, 0) || null,
  total: +store.get(`jt-${MAP}-total`, 0) || null,
  style: +store.get(`jt-${MAP}-style`, 0) || 0,
};
const playing = () => ['countdown', 'race', 'free'].includes(game.phase);

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

// ---------- Partidas ----------
function resetRun() {
  race.reset(0); style.reset(); manual.reset(); combo.state = 'idle';
  ghostRec.reset(); pendingTrick = null; warn = null;
  jet.turbo = 30; fx.clearTrails(); view.setNextGate(0);
  game.crashAt = null; game.outT = 0; game.perfect = false; game.lastBoostEdge = -99; game.sectionGate = 0;
  model.group.visible = true;
}
function startTrial() {
  sound.init();
  game.mode = 'trial'; game.phase = 'countdown'; game.paused = false; game.autopilot = DEBUG && params.has('auto');
  race.laps = +params.get('laps') || 3;
  resetRun();
  game.t = -3.6; game.cd = 0;
  jet.spawn(PLATFORM, new V3(0, 0, -1), 0, 99);
  prevPos.copy(jet.pos); prevQ.copy(jet.q);
  syncAim();
  ghost = loadGhost();
  showOverlay(null); hud.show(true); cam.cut = true;
  lockIfNeeded();
}
function launch() {
  game.phase = 'race'; game.t = 0;
  const p = 0.12;
  jet.spawn(PLATFORM.clone().add(new V3(0, 0.3, 0)), new V3(0, Math.sin(p), -Math.cos(p)), 72, 1);
  jet.turbo = 30;
  race.reset(0); race.teleport(jet.pos);
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
  game.mode = 'free'; game.phase = 'free'; game.paused = false; game.autopilot = DEBUG && params.has('auto');
  race.laps = Infinity;
  resetRun();
  game.t = 0;
  const s = track.gates[0].s - 260, S = track.spline;
  jet.spawn(S.pointAt(s), S.tangentAt(s), 85, 2);
  prevPos.copy(jet.pos); prevQ.copy(jet.q);
  race.reset(0); race.teleport(jet.pos);
  syncAim();
  showOverlay(null); hud.show(true); cam.cut = true;
  lockIfNeeded();
}
function toMenu() {
  game.phase = 'menu'; game.mode = null; game.paused = false; game.autopilot = true;
  hud.show(false); ghostModel.group.visible = false; hud.warn(0);
  showOverlay('menu');
  input.exitLock();
  sound.silence();
  resetRun();
  race.laps = Infinity;
  const s = track.gates[1].s + 200, S = track.spline;
  jet.spawn(S.pointAt(s), S.tangentAt(s), 90, 2);
  prevPos.copy(jet.pos); prevQ.copy(jet.q);
  race.teleport(jet.pos); ap.hint = -1;
  cam.cut = true;
  updateRecords();
}
function restart() { if (game.mode === 'free') startFree(); else startTrial(); }

function respawn() {
  const r = race.respawnPoint();
  jet.spawn(r.pos, r.fwd, 72, 1.5);
  jet.turbo = Math.max(jet.turbo, 15);
  race.teleport(jet.pos);
  prevPos.copy(jet.pos); prevQ.copy(jet.q);
  combo.state = 'idle'; manual.reset(); pendingTrick = null; ap.hint = -1;
  syncAim(); fx.clearTrails();
  model.group.visible = true; game.crashAt = null; game.outT = 0;
  cam.cut = true;
}

// ---------- Física (paso fijo) ----------
function buildControls() {
  if (game.autopilot || game.phase === 'menu' || game.phase === 'finished') {
    ap.control(jet, STEP, ctl, game.clock);
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

function physicsStep() {
  game.clock += STEP;
  if (game.phase === 'race' || game.phase === 'free' || game.phase === 'finished') game.t += STEP;
  track.update(game.clock);
  prevPos.copy(jet.pos); prevQ.copy(jet.q);
  const ev = [], awards = [];
  if (jet.alive) {
    buildControls();
    const want = ctl.trick || pendingTrick;
    if (want) { jet.startTrick(want.name, want.side, game.t); pendingTrick = null; ctl.trick = null; }
    jet.step(STEP, ctl, track, game.t, ev);
    if (jet.alive) race.update(jet, game.t, ev);
    if (jet.alive && !jet.trick) manual.step(STEP, game.t, jet, awards);
    if (game.mode === 'trial' && game.phase === 'race') ghostRec.sample(game.t - race.lapStart, jet);
  } else {
    jet.step(STEP, ctl, track, game.t, ev);
    if (jet.crashT <= 0) respawn();
  }
  handleEvents(ev, awards);
}

function award(a) {
  const r = style.award(a.name, { ...a, now: game.t, tricksStat: jet.stats.tricks });
  jet.turbo = Math.min(100, jet.turbo + r.turbo);
  if (game.phase === 'menu') return;
  const mult = r.mult > 1 ? ` ×${r.mult.toFixed(1).replace('.', ',')}` : '';
  hud.feed(`${r.label.toUpperCase()}${r.manual ? ' A MANO' : ''} +${r.pts}${mult}`, r.manual ? 'manual trick' : 'trick');
  sound.sfx('trick', style.chain);
}

function handleEvents(ev, awards) {
  const menu = game.phase === 'menu';
  for (const e of ev) {
    switch (e.type) {
      case 'crash':
        fx.explosion(e.p, e.v);
        fx.eject(e.p, e.v, look);
        model.group.visible = false;
        game.crashAt = new THREE.Vector3(e.p.x, e.p.y, e.p.z);
        style.breakChain(); manual.reset(); combo.state = 'idle'; pendingTrick = null;
        cam.shake = 1.2;
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
  hud.center('¡META!', '', 2.4);
  const total = e.time, newTotal = !rec.total || total < rec.total, newStyle = style.total > rec.style;
  if (newTotal) { rec.total = total; store.set(`jt-${MAP}-total`, total.toFixed(3)); }
  if (newStyle) { rec.style = style.total; store.set(`jt-${MAP}-style`, String(style.total)); }
  const laps = race.lapTimes.map((t, i) => `Vuelta ${i + 1}: <b>${fmtTime(t)}</b>${t === race.best ? ' ⭐' : ''}`).join('<br>');
  $('resTitle').textContent = newTotal ? '¡Nuevo récord!' : '¡Meta!';
  $('resBody').innerHTML = `<p style="font-size:30px;text-align:center;margin:6px 0;color:var(--gold)"><b>${fmtTime(total)}</b></p>
    <p>${laps}</p>
    <p>Estilo: <b>${style.total.toLocaleString('es-ES')}</b> puntos en ${style.count} piruetas${newStyle ? ' · ¡récord de estilo!' : ''}</p>
    <p class="hint">Récords: vuelta ${fmtTime(rec.lap)} · carrera ${fmtTime(rec.total)} · estilo ${rec.style.toLocaleString('es-ES')}. El fantasma cian es tu mejor vuelta.</p>`;
  input.exitLock();
}

function updateRecords() {
  $('records').textContent = rec.lap ? `Récords · vuelta ${fmtTime(rec.lap)} · carrera ${fmtTime(rec.total)} · estilo ${rec.style.toLocaleString('es-ES')}` : '';
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
    const aimMode = st?.mouseAim && !jet.trick && game.phase !== 'countdown' && !game.autopilot;
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
function drawHud(dt) {
  if (game.phase === 'menu') return;
  hud.tick(dt);
  // al cruzar la meta el cronómetro se queda quieto con el tiempo final
  const done = race.finished;
  const lapTime = game.phase === 'countdown' ? 0 : done ? race.lapTimes[race.lapTimes.length - 1] : Math.max(0, game.t - race.lapStart);
  const best = [race.best, rec.lap].filter(Boolean);
  hud.setRace({ lap: race.lap || 1, laps: race.laps, time: done ? race.finishTime : Math.max(0, game.t), lapTime, best: best.length ? Math.min(...best) : null, free: game.mode === 'free' });
  hud.setFlight(jet.alive ? jet.speed * 3.6 : 0, jet.turbo, jet.pos.y, jet.boosting);
  hud.setStyle(style.total, style.mult, style.chainLeft(game.t));
  // siguiente puerta
  const g = track.gates[race.next], showMarker = settings.assist >= 1 && jet.alive && playing() && game.phase !== 'countdown';
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
  const showAim = st?.mouseAim && jet.alive && !jet.trick && playing() && game.phase !== 'countdown' && cam.mode === 'chase' && !game.autopilot;
  if (showAim) {
    const a = project(_o.copy(rp).addScaledVector(_t.set(aim.dir.x, aim.dir.y, aim.dir.z), 600));
    const n = project(_o.copy(rp).addScaledVector(_f.set(0, 0, -1).applyQuaternion(rq), 600));
    hud.reticle(a.x, a.y, n.x, n.y, a.front && n.front);
  } else hud.reticle(0, 0, 0, 0, false);
  // aviso de choque
  let w = 0;
  if (warn && settings.assist >= 1 && playing()) w = clamp(1 - warn.t / 0.8, 0, 1);
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
      : settings.scheme === 'mouse' ? 'Ratón: apuntar · Shift: turbo · Espacio + dirección: pirueta · C: cámara · Esc: pausa'
        : 'W/S: cabeceo · A/D: alabeo · ↑/↓: gas · Shift: turbo · Espacio + dirección: pirueta · Esc: pausa';
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
function frame(now) {
  // el primer fotograma puede traer una marca de tiempo anterior a «last»: nunca dejamos que el tiempo vaya hacia atrás
  const raw = Math.max(0, (now - last) / 1000), dt = Math.min(0.05, raw);
  last = now;
  adaptResolution(raw);
  st = input.poll();

  // botones generales
  if (st.pause && playing()) game.paused ? resume() : pause();
  if (st.cam && playing()) { cam.mode = CAMS[(CAMS.indexOf(cam.mode) + 1) % CAMS.length]; store.set('jt-cam', cam.mode); cam.cut = true; }
  if (st.respawn && jet.alive && (game.phase === 'race' || game.phase === 'free') && !game.paused) respawn();
  if (st.boost && !prevBoost) game.lastBoostEdge = game.t;
  prevBoost = st.boost;

  if (!game.paused) {
    if (game.phase === 'countdown') {
      game.t += dt;
      game.clock += dt;
      track.update(game.clock);
      const n = Math.ceil(-game.t / 1.2);
      if (n > 0 && n !== game.cd) { game.cd = n; hud.center(String(n), '', 1.1); sound.sfx('beep'); }
      if (game.t >= 0) launch();
    } else {
      // combos y mira (por fotograma); las peticiones esperan al siguiente paso de física
      if (playing() && !game.autopilot) {
        const req = combo.update(dt, { pDown: st.trickDown, pHeld: st.trickHeld, dirs: st.dirs, current: st.dirCurrent, drifting: Math.abs(st.yaw) > 0.3 });
        if (req) pendingTrick = req;
        if (st.mouseAim && jet.alive && !jet.trick) { aim.yaw -= st.aimDX; aim.pitch -= st.aimDY; updateAimDir(); } else syncAim();
        if (game.phase === 'race' && game.t < 0.2 && st.boost && game.lastBoostEdge > -0.3) perfectStart();
      }
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 12) { physicsStep(); acc -= STEP; n++; }
      if (n >= 12) acc = 0;
      if (game.phase === 'finished' && (game.finishT += dt) > 2.5 && $('results').hidden && game.mode === 'trial') showOverlay('results');
    }
  }

  // pose interpolada para dibujar
  const alpha = game.phase === 'countdown' || game.paused ? 1 : clamp(acc / STEP, 0, 1);
  rp.set(prevPos.x + (jet.pos.x - prevPos.x) * alpha, prevPos.y + (jet.pos.y - prevPos.y) * alpha, prevPos.z + (jet.pos.z - prevPos.z) * alpha);
  rq.set(prevQ.x, prevQ.y, prevQ.z, prevQ.w).slerp(_q2.set(jet.q.x, jet.q.y, jet.q.z, jet.q.w), alpha);
  model.group.position.copy(rp);
  model.group.quaternion.copy(rq);
  const throttleVis = game.phase === 'countdown' ? 0.35 + 0.65 * Math.max(0, st.throttle, st.boost ? 1 : 0) : clamp(0.55 + ctl.throttle * 0.45, 0.15, 1);
  model.update(dt, throttleVis, jet.boosting || (game.phase === 'countdown' && st.boost));

  // fantasma
  if (game.mode === 'trial' && ghost && game.phase === 'race' && race.lap >= 1) {
    const ok = ghost.at(game.t - race.lapStart);
    ghostModel.group.visible = ok;
    if (ok) { ghostModel.group.position.set(ghost.pos.x, ghost.pos.y, ghost.pos.z); ghostModel.group.quaternion.set(ghost.q.x, ghost.q.y, ghost.q.z, ghost.q.w); ghostModel.update(dt, 0.6, false); }
  } else ghostModel.group.visible = false;

  view.update(game.clock);
  if (!game.paused) {
    // estelas de condensación en las puntas de las alas al tirar fuerte o ir muy rápido
    const k = jet.alive ? clamp(Math.max((jet.gload - 3.5) / 5, (jet.speed - 128) / 25), 0, 1) : 0;
    if (jet.alive) model.wingTips.forEach((t, i) => tips[i].copy(t).applyQuaternion(rq).add(rp));
    fx.trailsUpdate(dt, jet.alive ? tips : null, k, camera.position);
    fx.update(dt, { speed: jet.alive && game.phase !== 'menu' ? jet.speed : 0, cam: camera });
    warn = jet.alive && game.phase !== 'menu' ? collisionWarning(jet, track) : null;
  }
  updateCamera(dt);
  drawHud(dt);
  if (playing() && !game.paused && sound.ctx) {
    const slip = jet.alive ? clamp(Math.abs(jet.w.y) * 0.6 + jet.gload / 14, 0, 1) : 0;
    sound.engine({ power: throttleVis, boost: jet.boosting || (game.phase === 'countdown' && st.boost), speed: jet.alive ? jet.speed : 0, slip, on: jet.alive });
  } else if (game.phase === 'finished' && sound.ctx) sound.engine({ power: 0.4, speed: jet.speed * 0.5, on: true });
  world.render();
  requestAnimationFrame(frame);
}

// ---------- Interfaz ----------
const OVERLAYS = ['menu', 'settingsPanel', 'controlsPanel', 'pause', 'results'];
let backTo = 'menu';
function showOverlay(id) { for (const o of OVERLAYS) $(o).hidden = o !== id; $('touch').hidden = !(touchDevice && !id && playing()); }
function lockIfNeeded() { if (settings.scheme === 'mouse' && !touchDevice) input.requestLock(); }
function pause() {
  if (!playing() || game.paused) return;
  game.paused = true;
  showOverlay('pause');
  input.exitLock();
  sound.silence();
}
function resume() { game.paused = false; showOverlay(null); last = performance.now(); lockIfNeeded(); }
input.onLockChange = locked => {
  if (locked) wasLocked = true;
  else if (wasLocked && playing() && !game.paused && settings.scheme === 'mouse') pause();
};
renderer.domElement.addEventListener('click', () => { if (playing() && !game.paused) lockIfNeeded(); });

$('btnTrial').onclick = startTrial;
$('btnFree').onclick = startFree;
$('btnSettings').onclick = () => { backTo = 'menu'; showOverlay('settingsPanel'); };
$('btnControls').onclick = () => { backTo = 'menu'; showOverlay('controlsPanel'); };
$('btnResume').onclick = resume;
$('btnRestart').onclick = () => { game.paused = false; restart(); };
$('btnPSettings').onclick = () => { backTo = 'pause'; showOverlay('settingsPanel'); };
$('btnPControls').onclick = () => { backTo = 'pause'; showOverlay('controlsPanel'); };
$('btnQuit').onclick = toMenu;
$('btnAgain').onclick = startTrial;
$('btnResMenu').onclick = toMenu;
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
nameEl.addEventListener('input', () => { settings.name = nameEl.value.replace(/[^\p{L}\p{N} _.-]/gu, '').slice(0, 14); store.set('jt-name', settings.name); });

// ---------- Arranque ----------
toMenu();
renderer.compile(scene, camera);
$('loading').hidden = true;
helpLine();
setInterval(helpLine, 1000);
requestAnimationFrame(frame);

if (DEBUG) {
  window.jetDebug = {
    game, jet, race, track, style, settings, ap, view, fx, sound, world, renderer, cam, aim, rec,
    startTrial, startFree, toMenu, respawn,
    THREE, scene, camera, input, hud, ctl, combo,
    get st() { return st; },
    setAutopilot(on) { game.autopilot = on; },
    spawnAt(s, v = 90) { const S = track.spline; jet.spawn(S.pointAt(s), S.tangentAt(s), v, 2); race.teleport(jet.pos); ap.hint = -1; prevPos.copy(jet.pos); prevQ.copy(jet.q); syncAim(); cam.cut = true; },
    trick(name, side = 1) { pendingTrick = { name, side }; },
    perf() { const r = { fps: perf.frames / (perf.sum || 1), slowPct: (perf.slow / (perf.frames || 1)) * 100, pixelRatio, frames: perf.frames }; perf.frames = perf.slow = perf.sum = 0; return r; },
    noAdapt: false,
  };
}
