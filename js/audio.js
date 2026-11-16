// Sonido sintetizado con Web Audio: turbina, rugido, postcombustión, viento, estampido sónico,
// roces, piruetas, anillos, explosión y paracaídas. Sin archivos de audio.
export class Sound {
  constructor() { this.volume = 0.6; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // Ruidos base
    const len = ctx.sampleRate * 2;
    const white = ctx.createBuffer(1, len, ctx.sampleRate), wd = white.getChannelData(0);
    for (let i = 0; i < len; i++) wd[i] = Math.random() * 2 - 1;
    const brown = ctx.createBuffer(1, len, ctx.sampleRate), bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.white = white; this.brown = brown;
    const loop = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // Turbina: dos tonos que suben con el gas
    this.turbine = ctx.createGain(); this.turbine.gain.value = 0;
    this.t1 = ctx.createOscillator(); this.t1.type = 'sine';
    this.t2 = ctx.createOscillator(); this.t2.type = 'triangle';
    const t2g = ctx.createGain(); t2g.gain.value = 0.35;
    this.t1.connect(this.turbine); this.t2.connect(t2g).connect(this.turbine);
    this.turbine.connect(this.master);
    this.t1.start(); this.t2.start();

    // Rugido del motor
    this.roarF = ctx.createBiquadFilter(); this.roarF.type = 'lowpass'; this.roarF.frequency.value = 400;
    this.roar = ctx.createGain(); this.roar.gain.value = 0;
    loop(brown).connect(this.roarF).connect(this.roar).connect(this.master);

    // Postcombustión: ruido grave con chisporroteo
    this.burnF = ctx.createBiquadFilter(); this.burnF.type = 'lowpass'; this.burnF.frequency.value = 700;
    this.burn = ctx.createGain(); this.burn.gain.value = 0;
    loop(white).connect(this.burnF).connect(this.burn).connect(this.master);
    this.rumble = ctx.createOscillator(); this.rumble.type = 'sine'; this.rumble.frequency.value = 46;
    this.rumbleG = ctx.createGain(); this.rumbleG.gain.value = 0;
    this.rumble.connect(this.rumbleG).connect(this.master); this.rumble.start();

    // Viento
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.7; this.windF.frequency.value = 600;
    this.wind = ctx.createGain(); this.wind.gain.value = 0;
    loop(white).connect(this.windF).connect(this.wind).connect(this.master);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }

  // power 0..1, boost, speed m/s, slip 0..1 (derrape o tirón)
  engine({ power = 0, boost = false, speed = 0, slip = 0, on = true }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, k = 0.08, o = on ? 1 : 0;
    const rpm = Math.min(1, power * 0.75 + (boost ? 0.35 : 0) + speed / 600);
    this.t1.frequency.setTargetAtTime(520 + rpm * 900, t, k);
    this.t2.frequency.setTargetAtTime((520 + rpm * 900) * 1.505, t, k);
    this.turbine.gain.setTargetAtTime(o * (0.025 + rpm * 0.03), t, k);
    this.roarF.frequency.setTargetAtTime(260 + rpm * 900, t, k);
    this.roar.gain.setTargetAtTime(o * (0.18 + power * 0.32), t, k);
    this.burn.gain.setTargetAtTime(o * (boost ? 0.32 : 0), t, 0.06);
    this.burnF.frequency.setTargetAtTime(boost ? 900 + Math.random() * 500 : 500, t, 0.03);
    this.rumbleG.gain.setTargetAtTime(o * (boost ? 0.35 : 0.04 + power * 0.06), t, 0.08);
    const w = Math.min(1, speed / 160);
    this.windF.frequency.setTargetAtTime(300 + w * 1300 + slip * 600, t, 0.1);
    this.wind.gain.setTargetAtTime(o * (w * w * 0.32 + slip * 0.18), t, 0.1);
  }

  silence() { this.engine({ on: false }); }

  tone(freq, dur, { type = 'sine', vol = 0.2, to = null, delay = 0 } = {}) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.4, type = 'lowpass', f = 800, to = null, q = 0.7, delay = 0, buf = 'white' } = {}) {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource(), fl = this.ctx.createBiquadFilter(), g = this.ctx.createGain(), t = this.ctx.currentTime + delay;
    s.buffer = buf === 'brown' ? this.brown : this.white;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  sfx(name, k = 0) {
    if (!this.ctx) return;
    switch (name) {
      case 'sonic': // dos golpes secos y graves (onda en N)
        this.noise(0.35, { vol: 1.2, f: 180, to: 60, buf: 'brown' });
        this.tone(70, 0.3, { vol: 0.6, to: 35 });
        this.noise(0.4, { vol: 1.0, f: 160, to: 50, buf: 'brown', delay: 0.12 });
        this.tone(60, 0.35, { vol: 0.5, to: 30, delay: 0.12 });
        break;
      case 'near': this.noise(0.45, { vol: 0.5, type: 'bandpass', f: 2600, to: 380, q: 1.4 }); break;
      case 'trick': { // campanilla que sube con la cadena
        const base = 660 * 2 ** (Math.min(k, 6) / 12 * 2);
        this.tone(base, 0.18, { type: 'triangle', vol: 0.16 });
        this.tone(base * 1.5, 0.28, { type: 'sine', vol: 0.13, delay: 0.07 });
        break;
      }
      case 'trickFail': this.tone(300, 0.25, { type: 'sawtooth', vol: 0.1, to: 140 }); break;
      case 'ring': this.tone(1320, 0.12, { vol: 0.12 }); this.tone(1760, 0.18, { vol: 0.1, delay: 0.05 }); break;
      case 'gate': this.tone(990, 0.1, { vol: 0.08 }); break;
      case 'boostRing': this.noise(0.6, { vol: 0.6, type: 'bandpass', f: 400, to: 2400, q: 1 }); this.tone(440, 0.4, { type: 'sawtooth', vol: 0.08, to: 880 }); break;
      case 'scrape': this.noise(0.3, { vol: 0.45, type: 'bandpass', f: 3200, q: 3 }); this.noise(0.25, { vol: 0.35, f: 300, buf: 'brown' }); break;
      case 'explosion':
        this.noise(1.8, { vol: 1.4, f: 900, to: 80, buf: 'brown' });
        this.noise(0.5, { vol: 0.8, f: 3000, to: 300 });
        this.tone(55, 1.0, { vol: 0.7, to: 25 });
        break;
      case 'chute': this.noise(0.35, { vol: 0.5, type: 'bandpass', f: 500, q: 0.8, delay: 0.85 }); break;
      case 'beep': this.tone(k ? 1320 : 660, k ? 0.5 : 0.18, { type: 'square', vol: 0.12 }); break;
      case 'warn': this.tone(1100, 0.07, { type: 'square', vol: 0.06 }); break;
      case 'lap': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', vol: 0.14, delay: i * 0.1 })); break;
      case 'finish': [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.15, delay: i * 0.11 })); break;
      case 'record': [1047, 1319, 1568, 2093].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', vol: 0.14, delay: 0.5 + i * 0.09 })); break;
      case 'launch': this.noise(1.2, { vol: 0.9, f: 300, to: 1800, buf: 'brown' }); break;
    }
  }
}
