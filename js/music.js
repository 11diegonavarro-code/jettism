// Música generativa (sin archivos): pads soñadores, bajo, arpegio con eco y, en carrera, batería.
// Se programa por adelantado con el reloj de Web Audio, así no se desacompasa aunque baje la tasa de fotogramas.
const BPM = 96, STEP = 60 / BPM / 4; // semicorcheas
// Re menor soñador: Dm9 · Bbmaj7 · Fmaj7 · C(add9); cada acorde dura 2 compases
const CHORDS = [[50, 57, 60, 64, 65], [46, 53, 57, 60, 62], [41, 53, 57, 60, 64], [48, 55, 60, 62, 67]];
const hz = m => 440 * 2 ** ((m - 69) / 12);

export class Music {
  constructor(sound) { this.sound = sound; this.mode = 'menu'; this.volume = 0.35; this.on = false; this.step = 0; this.timer = null; this.setTheme(null); }
  // Tema de cada mapa: { bpm, chords } (null: el del desierto)
  setTheme(t) { this.chords = t?.chords || CHORDS; this.dur = 60 / (t?.bpm || BPM) / 4; if (this.delay) this.delay.delayTime.value = this.dur * 3; }

  start() {
    const S = this.sound;
    if (!S.ctx || this.on || this.volume <= 0) return;
    const ctx = this.ctx = S.ctx;
    if (!this.out) {
      this.out = ctx.createGain(); this.out.gain.value = 0;
      this.out.connect(S.master);
      // eco para el arpegio
      this.delay = ctx.createDelay(1); this.delay.delayTime.value = this.dur * 3;
      this.fb = ctx.createGain(); this.fb.gain.value = 0.38;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      this.delay.connect(lp).connect(this.fb).connect(this.delay);
      this.wet = ctx.createGain(); this.wet.gain.value = 0.5;
      lp.connect(this.wet).connect(this.out);
      // filtro del pad que se abre y se cierra despacio
      this.padF = ctx.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 900; this.padF.Q.value = 0.6;
      this.padF.connect(this.out);
      this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 500;
      this.lfo.connect(lg).connect(this.padF.frequency); this.lfo.start();
    }
    this.on = true;
    this.out.gain.setTargetAtTime(this.volume * 0.55, ctx.currentTime, 1.2);
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 100);
  }
  stop() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer); this.timer = null;
    this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
  }
  setVolume(v) {
    this.volume = v;
    if (v <= 0) { this.stop(); return; }
    if (!this.on) this.start(); else this.out.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.2);
  }
  // 'menu' tranquilo · 'race' con batería y bajo marcado
  setMode(m) { this.mode = m; }

  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.next < ctx.currentTime + 0.35) { this.play(this.step, this.next); this.step++; this.next += this.dur; }
  }
  play(i, t) {
    const bar = Math.floor(i / 16), s = i % 16, chord = this.chords[Math.floor(bar / 2) % this.chords.length], race = this.mode === 'race', STEP = this.dur;
    if (s === 0 && bar % 2 === 0) this.pad(chord, t, STEP * 32);
    // bajo: notas largas en el menú, corcheas con acento en carrera
    if (race ? s % 2 === 0 : s === 0 || s === 10) this.bass(chord[0] - 12 + (race && s % 8 === 6 ? 12 : 0), t, race ? STEP * 1.6 : STEP * 7, race ? 0.22 : 0.16);
    // arpegio: notas del acorde en un orden que cambia cada compás
    const pat = [0, 2, 3, 4, 2, 3, 1, 4], on = race ? s % 2 === 0 || s === 7 || s === 15 : s % 4 === 0;
    if (on) this.pluck(chord[pat[(s + bar) % pat.length]] + 12, t, race ? 0.07 : 0.09);
    if (race) {
      if (s === 0 || s === 8 || (s === 14 && bar % 2)) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.05 : 0.03);
    }
  }
  env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); }
  pad(chord, t, dur) {
    const ctx = this.ctx;
    for (const n of chord.slice(1)) for (const det of [-7, 7]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.032, t + 1.6); g.gain.setValueAtTime(0.032, t + dur - 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
      o.connect(g).connect(this.padF); o.start(t); o.stop(t + dur + 0.9);
    }
  }
  bass(n, t, dur, vol) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = o2.frequency.value = hz(n);
    this.env(g, t, 0.015, vol, dur);
    o.connect(g); o2.connect(g); g.connect(this.out);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  pluck(n, t, vol) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = hz(n);
    this.env(g, t, 0.005, vol, 0.35);
    o.connect(g); g.connect(this.out); g.connect(this.delay);
    o.start(t); o.stop(t + 0.4);
  }
  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    this.env(g, t, 0.003, 0.5, 0.28);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
  }
  noiseHit(t, vol, type, f, dur) {
    const ctx = this.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.sound.white; fl.type = type; fl.frequency.value = f;
    this.env(g, t, 0.002, vol, dur);
    s.connect(fl).connect(g).connect(this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  snare(t) { this.noiseHit(t, 0.16, 'bandpass', 1800, 0.18); }
  hat(t, vol) { this.noiseHit(t, vol, 'highpass', 7500, 0.05); }
}
