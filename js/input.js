// Entrada unificada: teclado y ratón (dos esquemas), mando, pantalla táctil y giroscopio.
// Las pulsaciones se guardan hasta que el juego las lee (no se pierden entre fotogramas).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dz = (v, d = 0.15) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings;
    this.keys = new Set(); this.edges = new Set(); this.dirEvents = [];
    this.mdx = 0; this.mdy = 0; this.locked = false; this.device = 'keyboard';
    this.padPrev = []; this.padDir = null; this.touchDir = null;
    this.touch = { id: null, ox: 0, oy: 0, x: 0, y: 0, buttons: new Set(), edges: new Set() };
    this.gyro = { on: false, x: 0, y: 0, x0: null, y0: null };
    this.onLockChange = null;

    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.device = 'keyboard';
      if (!e.repeat) { this.edges.add(e.code); this.keyDir(e.code); }
      this.keys.add(e.code);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // clic izquierdo: misil u objeto; derecho: objeto (solo con el ratón capturado, en pleno vuelo)
    addEventListener('mousedown', e => { if (this.locked) { this.edges.add('Mouse' + e.button); this.device = 'keyboard'; } });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.mdx += e.movementX; this.mdy += e.movementY;
      this.device = 'keyboard';
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange?.(this.locked);
    });
    this.setupTouch();
    addEventListener('deviceorientation', e => this.onGyro(e));
  }

  requestLock() { if (!this.locked && this.canvas.requestPointerLock) { try { this.canvas.requestPointerLock()?.catch?.(() => {}); } catch { /* sin bloqueo */ } } }
  exitLock() { if (this.locked) document.exitPointerLock(); }

  keyDir(code) {
    const classic = this.settings.scheme === 'classic', inv = this.settings.invert;
    const map = classic
      ? { KeyS: inv ? 'push' : 'pull', KeyW: inv ? 'pull' : 'push', KeyA: 'left', KeyD: 'right' }
      : { KeyS: 'pull', KeyW: 'push', KeyA: 'left', KeyD: 'right', ArrowDown: 'pull', ArrowUp: 'push', ArrowLeft: 'left', ArrowRight: 'right' };
    if (map[code]) this.dirEvents.push(map[code]);
  }
  keyDirHeld() {
    const classic = this.settings.scheme === 'classic', inv = this.settings.invert, k = c => this.keys.has(c);
    if (k('KeyA')) return 'left';
    if (k('KeyD')) return 'right';
    if (k('KeyS')) return classic && inv ? 'push' : 'pull';
    if (k('KeyW')) return classic && inv ? 'pull' : 'push';
    return null;
  }

  // Dirección dominante de un stick con histéresis, para los combos
  stickDir(x, y, prev) {
    const m = Math.hypot(x, y);
    if (m < (prev ? 0.35 : 0.6)) return null;
    if (Math.abs(x) > Math.abs(y)) return x < 0 ? 'left' : 'right';
    return y > 0 ? 'pull' : 'push';
  }

  setupTouch() {
    const T = this.touch, el = id => document.getElementById(id);
    const zone = el('tStick'), knob = el('tKnob');
    if (!zone) return;
    zone.addEventListener('touchstart', e => {
      e.preventDefault();
      this.device = 'touch';
      const t = e.changedTouches[0];
      T.id = t.identifier; T.ox = T.x = t.clientX; T.oy = T.y = t.clientY;
      knob.style.left = `${T.ox}px`; knob.style.top = `${T.oy}px`; knob.hidden = false;
    }, { passive: false });
    zone.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === T.id) { T.x = t.clientX; T.y = t.clientY; }
      const dx = clamp(T.x - T.ox, -70, 70), dy = clamp(T.y - T.oy, -70, 70);
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }, { passive: false });
    const end = e => {
      for (const t of e.changedTouches) if (t.identifier === T.id) { T.id = null; knob.hidden = true; knob.style.transform = 'translate(-50%, -50%)'; }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    for (const b of document.querySelectorAll('#touch [data-btn]')) {
      const name = b.dataset.btn;
      b.addEventListener('touchstart', e => { e.preventDefault(); this.device = 'touch'; T.buttons.add(name); T.edges.add(name); }, { passive: false });
      const up = e => { e.preventDefault(); T.buttons.delete(name); };
      b.addEventListener('touchend', up); b.addEventListener('touchcancel', up);
    }
  }

  async enableGyro() {
    // iOS pide permiso; Android lo da directamente
    try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission(); } catch { /* sin permiso */ }
    this.gyro.on = true; this.calibrate();
  }
  calibrate() { this.gyro.x0 = null; }
  onGyro(e) {
    if (!this.gyro.on || e.beta == null) return;
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    let x, y;
    if (a === 90) { x = e.beta; y = -e.gamma; } else if (a === -90 || a === 270) { x = -e.beta; y = e.gamma; } else { x = e.gamma; y = e.beta; }
    if (this.gyro.x0 == null) { this.gyro.x0 = x; this.gyro.y0 = y; }
    this.gyro.x = clamp((x - this.gyro.x0) / 25, -1, 1);
    this.gyro.y = clamp((y - this.gyro.y0) / 25, -1, 1);
  }

  // Lee todo y devuelve el estado de este fotograma
  poll() {
    const S = this.settings, k = c => this.keys.has(c), e = c => this.edges.has(c);
    const classic = S.scheme === 'classic', inv = S.invert ? -1 : 1;
    const st = {
      pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false, trickDown: false, trickHeld: false,
      dirs: this.dirEvents.splice(0), dirCurrent: null, cam: false, lookBack: false, pause: false, respawn: false,
      aimDX: 0, aimDY: 0, lookX: 0, lookY: 0, mouseAim: false, device: this.device, any: false,
    };
    // Teclado y ratón
    st.roll = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    st.yaw = (k('KeyE') ? 1 : 0) - (k('KeyQ') ? 1 : 0);
    if (classic) {
      st.pitch = ((k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0)) * inv;
      st.throttle = (k('ArrowUp') ? 1 : 0) - (k('ArrowDown') ? 1 : 0);
    } else {
      st.throttle = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
      st.mouseAim = this.device === 'keyboard';
      const sens = 0.0021 * (S.sens || 1);
      st.aimDX = this.mdx * sens; st.aimDY = this.mdy * sens * (S.invertMouse ? -1 : 1);
    }
    this.mdx = this.mdy = 0;
    st.boost = k('ShiftLeft') || k('ShiftRight');
    st.trickDown = e('Space'); st.trickHeld = k('Space');
    st.dirCurrent = this.keyDirHeld();
    st.cam = e('KeyC'); st.lookBack = k('KeyV'); st.pause = e('Escape') || e('KeyP'); st.respawn = e('KeyR');
    st.restart = e('Backspace');
    st.smoke = k('KeyH');
    st.fire = e('KeyF') || e('Mouse0'); st.use2 = e('KeyG') || e('Mouse2');
    st.any = this.edges.size > 0;
    this.edges.clear();

    // Mando
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
    if (pad) {
      const b = i => !!pad.buttons[i]?.pressed, bv = i => pad.buttons[i]?.value || 0, was = i => !!this.padPrev[i];
      const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0), rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
      const active = Math.abs(lx) + Math.abs(ly) + Math.abs(rx) + Math.abs(ry) > 0.3 || pad.buttons.some(x => x.pressed);
      if (active) this.device = 'pad';
      if (this.device === 'pad') {
        st.mouseAim = false;
        st.pitch = ly * inv; st.roll = lx;
        st.yaw = (b(5) ? 1 : 0) - (b(4) ? 1 : 0);
        st.throttle = bv(7) - bv(6);
        st.boost = st.boost || b(0);
        st.trickHeld = st.trickHeld || b(2); st.trickDown = st.trickDown || (b(2) && !was(2));
        // Y: objeto (segundo) · B: misil u objeto · stick derecho pulsado: cámara · stick izquierdo pulsado: mirar atrás
        st.cam = st.cam || (b(11) && !was(11));
        st.use2 = st.use2 || (b(3) && !was(3));
        st.fire = st.fire || (b(1) && !was(1));
        st.lookBack = st.lookBack || b(10);
        st.pause = st.pause || (b(9) && !was(9));
        // Select: pulsado corto vuelve al recorrido; mantenido 0,6 s reinicia la contrarreloj
        if (b(8) && !was(8)) { this.selT = performance.now(); this.selUsed = false; }
        if (b(8) && !this.selUsed && performance.now() - this.selT > 600) { st.restart = true; this.selUsed = true; }
        if (!b(8) && was(8) && !this.selUsed) st.respawn = true;
        st.smoke = st.smoke || b(13);
        st.lookX = rx; st.lookY = ry;
        const d = this.stickDir(lx, ly * inv, this.padDir);
        if (d && d !== this.padDir) st.dirs.push(d);
        this.padDir = d;
        st.dirCurrent = st.dirCurrent || d;
        st.any = st.any || pad.buttons.some((x, i) => x.pressed && !was(i));
      }
      this.padPrev = pad.buttons.map(x => x.pressed);
    }

    // Táctil (y giroscopio)
    const T = this.touch;
    if (this.device === 'touch') {
      st.mouseAim = false;
      let sx = 0, sy = 0;
      if (T.id != null) { sx = clamp((T.x - T.ox) / 70, -1, 1); sy = clamp((T.y - T.oy) / 70, -1, 1); }
      if (this.gyro.on) { sx = clamp(sx + this.gyro.x, -1, 1); sy = clamp(sy + this.gyro.y, -1, 1); }
      st.roll = sx; st.pitch = sy * inv;
      st.throttle = T.buttons.has('brake') ? -1 : 0.35;
      st.boost = T.buttons.has('boost');
      st.trickHeld = T.buttons.has('trick'); st.trickDown = T.edges.has('trick');
      st.cam = T.edges.has('cam'); st.pause = T.edges.has('pause');
      st.smoke = T.buttons.has('smoke');
      st.fire = T.edges.has('item'); st.use2 = T.edges.has('item2');
      st.restart = T.edges.has('restart');
      const d = this.stickDir(sx, sy * inv, this.touchDir);
      if (d && d !== this.touchDir) st.dirs.push(d);
      this.touchDir = d;
      st.dirCurrent = d;
      st.any = st.any || T.edges.size > 0;
      T.edges.clear();
    }
    return st;
  }
}
