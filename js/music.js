// Música generativa (sin archivos), con un estilo propio en cada mapa: instrumentos, batería, ritmos y una melodía que
// sale de una semilla. Todo se sintetiza con Web Audio y se programa por adelantado con su reloj, así no se desacompasa
// aunque bajen los fotogramas. La tensión del nivel (0..1) añade capas oscuras encima de cualquier estilo.
const BPM = 96;
const CHORDS = [[50, 57, 60, 64, 65], [46, 53, 57, 60, 62], [41, 53, 57, 60, 64], [48, 55, 60, 62, 67]];
const hz = m => 440 * 2 ** ((m - 69) / 12);
const X = 'x', _ = '.';
const mask = s => [...s].map(c => c === X); // 16 pasos: x suena, . no

// ---------- estilos ----------
// pad, arp (instrumento del arpegio), lead (melodía), bass y kit (batería). arpPat: orden de las notas del acorde.
// arpRhythm / leadRhythm / bassRhythm: en qué semicorcheas suenan. oct: octavas extra. swing: retraso de las corcheas pares.
export const STYLES = {
  // progresión pedida por Diego: synth de fondo al principio; el teclado se va y entra el techno, hasta hard techno
  synthpad: { pad: 'saw', arp: 'pluck', lead: null, bass: 'sub', kit: 'soft', arpRhythm: 'x...x...x...x...', bassRhythm: 'x.......x.......', arpPat: [0, 2, 3, 4, 2, 3, 1, 4] },
  synthpulse: { pad: 'saw', arp: 'pluck', lead: null, bass: 'synth', kit: 'house', arpRhythm: 'x.......x.......', bassRhythm: 'x.x.x.x.x.x.x.x.', arpPat: [0, 2, 4, 3] },
  pulsetechno: { pad: 'saw', arp: 'none', lead: null, bass: 'rumble', kit: 'techno', arpRhythm: '................', bassRhythm: '..x...x...x...x.', arpPat: [0] },
  hardtechno: { pad: 'drone', arp: 'none', lead: null, bass: 'rumble', kit: 'hard', arpRhythm: '................', bassRhythm: '..x...x...x...x.', arpPat: [0], acid: true },
  dream: { pad: 'saw', arp: 'pluck', lead: null, bass: 'sub', kit: 'pop', arpRhythm: 'x.x.x.x.x.x.x.x.', bassRhythm: 'x.x.x.x.x.x.x.x.', arpPat: [0, 2, 3, 4, 2, 3, 1, 4] },
  tropical: { pad: 'glass', arp: 'marimba', lead: 'marimba', bass: 'pluckbass', kit: 'latin', arpRhythm: 'x..x..x.x..x..x.', leadRhythm: 'x.....x...x.....', bassRhythm: 'x..x....x..x....', arpPat: [0, 2, 4, 3, 1, 3, 2, 4], leadOct: 2 },
  pastoral: { pad: 'strings', arp: 'harp', lead: 'flute', bass: 'sub', kit: 'soft', arpRhythm: 'xxxxxxxxxxxxxxxx', leadRhythm: 'x.......x...x...', bassRhythm: 'x.......x.......', arpPat: [0, 1, 2, 3, 4, 3, 2, 1], leadOct: 1 },
  dreamwave: { pad: 'saw', arp: 'epiano', lead: 'square', bass: 'synth', kit: 'house', arpRhythm: '..x...x...x...x.', leadRhythm: 'x..x..x.x.......', bassRhythm: 'x.xx.xx.x.xx.xx.', arpPat: [1, 2, 3, 4], leadOct: 1 },
  circus: { pad: 'organ', arp: 'square', lead: 'brass', bass: 'pluckbass', kit: 'oompah', arpRhythm: '....x.......x...', leadRhythm: 'x.x.x...x.x.x...', bassRhythm: 'x.......x.......', arpPat: [1, 2, 3, 4], leadOct: 1, stab: true },
  shoegaze: { pad: 'choir', arp: 'guitar', lead: 'guitar', bass: 'sub', kit: 'soft', arpRhythm: 'x.x.x.x.x.x.x.x.', leadRhythm: 'x...........x...', bassRhythm: 'x.......x.......', arpPat: [0, 3, 4, 2, 4, 3], leadOct: 1, wet: 0.85 },
  baroque: { pad: 'organ', arp: 'harpsi', lead: 'harpsi', bass: 'pluckbass', kit: 'none', arpRhythm: 'xxxxxxxxxxxxxxxx', leadRhythm: 'x.x.x.x.x.x.x.x.', bassRhythm: 'x.x.x.x.x.x.x.x.', arpPat: [0, 2, 4, 2, 1, 3, 4, 3], leadOct: 2 },
  dub: { pad: 'none', arp: 'epiano', lead: 'bell', bass: 'sub', kit: 'dub', arpRhythm: '....x.......x...', leadRhythm: '......x.........', bassRhythm: 'x..x..x...x.x...', arpPat: [1, 2, 3, 4], leadOct: 1, wet: 0.9, stab: true },
  flamenco: { pad: 'strings', arp: 'guitar', lead: 'sitar', bass: 'pluckbass', kit: 'palmas', arpRhythm: 'x.xx.x.xx.x.x.x.', leadRhythm: 'x.x.xx..x.x.....', bassRhythm: 'x.....x.....x...', arpPat: [0, 1, 2, 1, 3, 2, 4, 3], leadOct: 1, phrygian: true },
  western: { pad: 'choir', arp: 'guitar', lead: 'slide', bass: 'sub', kit: 'tribal', arpRhythm: 'x..x..x.x..x..x.', leadRhythm: 'x...............', bassRhythm: 'x.......x.......', arpPat: [0, 2, 1, 3], leadOct: 1 },
  industrial: { pad: 'darkorgan', arp: 'none', lead: 'bell', bass: 'acid', kit: 'metal', arpRhythm: '................', leadRhythm: 'x.......x.......', bassRhythm: 'x.xx.x.xx.xx.x.x', arpPat: [0], leadOct: 0 },
  techno: { pad: 'none', arp: 'stab', lead: null, bass: 'acid', kit: 'techno', arpRhythm: '..x...x...x..x..', bassRhythm: 'xxxxxxxxxxxxxxxx', arpPat: [1, 2, 3, 4], stab: true },
  glitch: { pad: 'glass', arp: 'bell', lead: 'square', bass: 'synth', kit: 'glitch', arpRhythm: 'x.xx...x.x..xx.x', leadRhythm: 'x..x.x......x...', bassRhythm: 'x...x.x...x.....', arpPat: [4, 0, 3, 1, 2], leadOct: 1, random: true },
  dnb: { pad: 'strings', arp: 'epiano', lead: null, bass: 'reese', kit: 'dnb', arpRhythm: 'x.......x.......', bassRhythm: 'x.......x..x....', arpPat: [1, 2, 3, 4] },
  synthdark: { pad: 'saw', arp: 'square', lead: 'brass', bass: 'synth', kit: 'trap', arpRhythm: 'xxxxxxxxxxxxxxxx', leadRhythm: 'x.......x.......', bassRhythm: 'x.......x.x.....', arpPat: [0, 2, 3, 2], leadOct: 0 },
  horror: { pad: 'tremolo', arp: 'musicbox', lead: null, bass: 'sub', kit: 'heart', arpRhythm: 'x..x..x.....x...', bassRhythm: 'x...............', arpPat: [4, 3, 1, 0, 2], random: true },
  minimal: { pad: 'none', arp: 'sinepulse', lead: null, bass: 'sub', kit: 'click', arpRhythm: 'x..x..x..x..x..x', bassRhythm: 'x...............', arpPat: [0, 3, 1, 4, 2] },
  epic: { pad: 'strings', arp: 'harp', lead: 'brass', bass: 'synth', kit: 'taiko', arpRhythm: 'xxxxxxxxxxxxxxxx', leadRhythm: 'x.......x...x...', bassRhythm: 'x.......x.......', arpPat: [0, 1, 2, 3, 4, 3, 2, 1], leadOct: 1, choir: true },
};
// semilla → números entre 0 y 1
const seeded = s => { let a = s >>> 0 || 7; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); };

export class Music {
  constructor(sound) { this.sound = sound; this.mode = 'menu'; this.volume = 0.35; this.on = false; this.step = 0; this.timer = null; this.setTheme(null); }
  // Tema de cada mapa: { bpm, chords, style, seed, tension }
  setTheme(t) {
    this.chords = t?.chords || CHORDS; this.dur = 60 / (t?.bpm || BPM) / 4; this.tension = t?.tension || 0;
    this.st = STYLES[t?.style] || STYLES.dream;
    this.masks = { arp: mask(this.st.arpRhythm), lead: mask(this.st.leadRhythm || '................'), bass: mask(this.st.bassRhythm) };
    // melodía de 2 compases por acorde: grados del acorde y notas de paso, sacados de la semilla del mapa
    const R = seeded(t?.seed || 11);
    this.motif = Array.from({ length: 32 }, () => (R() < 0.75 ? Math.floor(R() * 5) : -1 - Math.floor(R() * 2)));
    this.R = R;
    if (this.delay) { this.delay.delayTime.value = this.dur * 3; this.wet.gain.value = this.st.wet ?? 0.5; }
    if (this.padF) this.padF.frequency.value = 900 - this.tension * 520;
  }
  beat() { return this.on && this.ctx ? (((this.ctx.currentTime - (this.origin || 0)) / (this.dur * 4)) % 1 + 1) % 1 : 0; }

  start() {
    const S = this.sound;
    if (!S.ctx || this.on || this.volume <= 0) return;
    const ctx = this.ctx = S.ctx;
    if (!this.out) {
      this.out = ctx.createGain(); this.out.gain.value = 0;
      this.out.connect(S.master);
      this.delay = ctx.createDelay(1); this.delay.delayTime.value = this.dur * 3;
      this.fb = ctx.createGain(); this.fb.gain.value = 0.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      this.delay.connect(lp).connect(this.fb).connect(this.delay);
      this.wet = ctx.createGain(); this.wet.gain.value = this.st.wet ?? 0.5;
      lp.connect(this.wet).connect(this.out);
      this.padF = ctx.createBiquadFilter(); this.padF.type = 'lowpass'; this.padF.frequency.value = 900; this.padF.Q.value = 0.6;
      this.padF.connect(this.out);
      this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.07;
      const lg = ctx.createGain(); lg.gain.value = 500;
      this.lfo.connect(lg).connect(this.padF.frequency); this.lfo.start();
    }
    this.on = true;
    this.out.gain.setTargetAtTime(this.volume * 0.55, ctx.currentTime, 1.2);
    this.next = ctx.currentTime + 0.1; this.origin = this.next;
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
  setMode(m) { this.mode = m; }
  schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.next < ctx.currentTime + 0.35) { this.play(this.step, this.next); this.step++; this.next += this.dur; }
  }

  play(i, t0) {
    const st = this.st, bar = Math.floor(i / 16), s = i % 16, ci = Math.floor(bar / 2) % this.chords.length, chord = this.chords[ci];
    const race = this.mode === 'race', D = this.dur, k = this.tension;
    const t = t0 + (st.swing && s % 2 ? D * st.swing : 0);
    // pad: un acorde cada dos compases
    if (s === 0 && bar % 2 === 0 && st.pad !== 'none') this.padVoice(st.pad, chord, t, D * 32);
    if (st.choir && s === 0 && bar % 2 === 0) this.padVoice('choir', chord, t, D * 32);
    // bajo
    if (this.masks.bass[s] && st.bass !== 'none' && (race || s % 8 === 0)) this.bassVoice(st.bass, chord[0] - 12 + (race && s % 8 === 6 ? 12 : 0), t, D * (race ? 1.8 : 6));
    // arpegio (o acordes cortos)
    if (this.masks.arp[s] && st.arp !== 'none' && (race || s % 4 === 0)) {
      const pat = st.arpPat, idx = st.random ? Math.floor(this.R() * 5) : pat[(s + bar * 3) % pat.length];
      if (st.stab) this.stab(chord, t, st.arp);
      else this.voice(st.arp, chord[idx % chord.length] + 12 + (st.phrygian && s % 7 === 3 ? 1 : 0), t, 0.08);
    }
    if (st.acid && race && this.motif[(s + bar * 5) % 32] >= 2 && s % 2) this.bassVoice('acid', chord[Math.abs(this.motif[(s + bar * 5) % 32]) % chord.length] - 12 + (s % 4 === 3 ? 12 : 0), t, D * 0.9, 0.12);
    // melodía: el motivo de la semilla sobre el acorde (en carrera, entera; en el menú, la mitad)
    if (st.lead && this.masks.lead[s] && (race || bar % 2 === 0)) {
      const m = this.motif[(s + (bar % 2) * 16) % 32];
      if (m >= 0) this.voice(st.lead, chord[m % chord.length] + 12 * (1 + (st.leadOct || 0)) + (m === 4 && bar % 4 === 3 ? 2 : 0), t, 0.07);
    }
    // batería (solo en carrera; algunas, suave en el menú)
    if (race || st.kit === 'heart' || st.kit === 'click') this.drums(st.kit, s, bar, t);
    // capas de tensión encima de todo
    if (race && k > 0.55 && s % 4 === 0 && st.kit !== 'techno' && st.kit !== 'hard') this.kick(t, 0.35);
    if (race && k > 0.7 && s % 2 === 0) this.hat(t, 0.02);
    if (k > 0.85 && s === 3 && st.kit !== 'hard') this.kick(t + 0.001, 0.45);
    if (k > 0.35 && s === 0) this.bassVoice('sub', chord[0] - 24, t, D * 16, 0.06 + k * 0.08);
    if (k > 0.7 && s === 6 && bar % 2) this.voice('pluck', chord[0] + 13, t, 0.04 + k * 0.04);
  }

  // ---------- instrumentos ----------
  env(g, t, a, peak, d) { g.gain.value = 0; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d); }
  osc(type, f, t, stop, dest) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.connect(dest); o.start(t); o.stop(stop); return o; }
  // modulación de frecuencia: portadora + moduladora (campanas, piano eléctrico, clave)
  fm(f, t, ratio, index, decay, vol, dest, a = 0.004) {
    const ctx = this.ctx, g = ctx.createGain(), mg = ctx.createGain(), car = ctx.createOscillator(), mod = ctx.createOscillator();
    car.frequency.value = f; mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * index * 0.05 + 0.01, t + decay);
    mod.connect(mg).connect(car.frequency); car.connect(g).connect(dest);
    this.env(g, t, a, vol, decay);
    car.start(t); mod.start(t); car.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
  }
  voice(kind, n, t, vol) {
    const ctx = this.ctx, f = hz(n), out = this.out, D = this.dur;
    const g = ctx.createGain(); g.connect(out); g.connect(this.delay);
    switch (kind) {
      case 'marimba': this.fm(f, t, 4, 1.2, 0.35, vol * 1.3, g, 0.002); break;
      case 'bell': this.fm(f * 2, t, 3.5, 2.5, 1.4, vol * 0.9, g); break;
      case 'musicbox': this.fm(f * 2, t, 5, 1.5, 0.9, vol, g, 0.002); break;
      case 'epiano': this.fm(f, t, 1, 1.8, 0.9, vol * 1.1, g); break;
      case 'harpsi': { this.osc('square', f, t, t + 0.25, g); this.osc('sawtooth', f * 2, t, t + 0.25, g); this.env(g, t, 0.002, vol * 0.45, 0.22); break; }
      case 'harp': { this.osc('triangle', f, t, t + 0.9, g); this.osc('sine', f * 2, t, t + 0.9, g); this.env(g, t, 0.003, vol, 0.8); break; }
      case 'square': { const lp = ctx.createBiquadFilter(); lp.frequency.value = 2600; lp.connect(g); this.osc('square', f, t, t + D * 2, lp); this.env(g, t, 0.004, vol * 0.5, D * 1.8); break; }
      case 'guitar': { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.5); lp.connect(g); this.osc('sawtooth', f, t, t + 0.7, lp); this.osc('sawtooth', f * 1.003, t, t + 0.7, lp); this.env(g, t, 0.003, vol * 0.6, 0.6); break; }
      case 'sitar': { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.setValueAtTime(f * 4, t); bp.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.4); bp.connect(g); this.osc('sawtooth', f, t, t + 0.6, bp); this.env(g, t, 0.002, vol * 1.6, 0.55); break; }
      case 'slide': { const o = this.osc('sawtooth', f * 0.94, t, t + D * 10, g); o.frequency.exponentialRampToValueAtTime(f, t + 0.18); const lp = ctx.createBiquadFilter(); lp.frequency.value = 1400; o.disconnect(); o.connect(lp).connect(g); this.env(g, t, 0.05, vol * 0.5, D * 9); break; }
      case 'flute': { const o = this.osc('sine', f, t, t + D * 6, g), v = ctx.createOscillator(), vg = ctx.createGain(); v.frequency.value = 5.5; vg.gain.value = f * 0.008; v.connect(vg).connect(o.frequency); v.start(t); v.stop(t + D * 6); this.env(g, t, 0.06, vol * 0.9, D * 5.5); break; }
      case 'brass': { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(2400, t + 0.08); lp.frequency.exponentialRampToValueAtTime(900, t + 0.5); lp.connect(g); this.osc('sawtooth', f, t, t + D * 4, lp); this.osc('sawtooth', f * 1.005, t, t + D * 4, lp); this.env(g, t, 0.03, vol * 0.55, D * 3.6); break; }
      case 'sinepulse': { this.osc('sine', f * 2, t, t + 0.12, g); this.env(g, t, 0.002, vol, 0.1); break; }
      default: { this.osc('triangle', f, t, t + 0.4, g); this.env(g, t, 0.005, vol, 0.35); }
    }
  }
  stab(chord, t, kind) { for (const n of chord.slice(1, 4)) this.voice(kind === 'stab' ? 'square' : kind, n + 12, t, 0.045); }
  padVoice(kind, chord, t, dur) {
    const ctx = this.ctx;
    const shape = (g, a, peak) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + dur - 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8); };
    for (const n of chord.slice(1)) {
      const g = ctx.createGain(); g.connect(this.padF);
      if (kind === 'organ' || kind === 'darkorgan') { for (const [m, v] of [[1, 1], [2, 0.5], [3, 0.25], [kind === 'darkorgan' ? 0.5 : 4, 0.3]]) { const og = ctx.createGain(); og.gain.value = v; og.connect(g); this.osc('sine', hz(n) * m, t, t + dur + 0.9, og); } shape(g, 0.3, 0.03); }
      else if (kind === 'strings' || kind === 'tremolo') { for (const det of [-9, 0, 9]) { const o = this.osc('sawtooth', hz(n), t, t + dur + 0.9, g); o.detune.value = det; } if (kind === 'tremolo') { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 7; lg.gain.value = 0.012; l.connect(lg).connect(g.gain); l.start(t); l.stop(t + dur + 0.9); } shape(g, 2.2, 0.02); }
      else if (kind === 'choir') { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2; bp.connect(g); for (const det of [-6, 6]) { const o = this.osc('triangle', hz(n), t, t + dur + 0.9, bp); o.detune.value = det; } shape(g, 1.8, 0.07); }
      else if (kind === 'drone') { if (n !== chord[1]) { g.disconnect(); continue; } const lp = ctx.createBiquadFilter(); lp.frequency.value = 400; lp.connect(g); for (const det of [-12, 0, 12]) { const o = this.osc('sawtooth', hz(n - 24), t, t + dur + 0.9, lp); o.detune.value = det; } shape(g, 2.5, 0.05); }
      else if (kind === 'glass') { this.osc('sine', hz(n + 12), t, t + dur + 0.9, g); this.osc('sine', hz(n + 24) * 1.002, t, t + dur + 0.9, g); shape(g, 1.2, 0.018); }
      else { for (const det of [-7, 7]) { const o = this.osc('sawtooth', hz(n), t, t + dur + 0.9, g); o.detune.value = det; } shape(g, 1.6, 0.032); }
    }
  }
  bassVoice(kind, n, t, dur, vol = 0.2) {
    const ctx = this.ctx, f = hz(n), g = ctx.createGain(); g.connect(this.out);
    if (kind === 'synth' || kind === 'reese' || kind === 'acid') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = kind === 'acid' ? 12 : 1;
      lp.frequency.setValueAtTime(kind === 'acid' ? 2200 : 900, t); lp.frequency.exponentialRampToValueAtTime(kind === 'acid' ? 220 : 400, t + Math.min(dur, 0.3)); lp.connect(g);
      this.osc('sawtooth', f, t, t + dur + 0.05, lp);
      if (kind === 'reese') { const o = this.osc('sawtooth', f, t, t + dur + 0.05, lp); o.detune.value = 18; }
      this.env(g, t, 0.01, vol * 0.8, dur);
    } else if (kind === 'rumble') {
      const ws = ctx.createWaveShaper(), lp = ctx.createBiquadFilter(); ws.curve = this.dist || (this.dist = (() => { const c = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 4); } return c; })());
      lp.type = 'lowpass'; lp.frequency.value = 160; ws.connect(lp).connect(g);
      this.osc('sine', f, t, t + dur + 0.05, ws); this.osc('triangle', f * 0.5, t, t + dur + 0.05, ws);
      this.env(g, t, 0.01, vol * 0.4, dur);
    } else if (kind === 'pluckbass') { this.osc('triangle', f, t, t + 0.4, g); this.osc('square', f, t, t + 0.12, g); this.env(g, t, 0.004, vol * 0.9, Math.min(dur, 0.35)); }
    else { this.osc('sine', f, t, t + dur + 0.05, g); this.osc('triangle', f, t, t + dur + 0.05, g); this.env(g, t, 0.015, vol * 0.8, dur); }
  }
  drums(kit, s, bar, t) {
    const four = s % 4 === 0, back = s === 4 || s === 12;
    switch (kit) {
      case 'none': break;
      case 'soft': if (s === 0 || s === 10) this.kick(t, 0.3); if (back) this.noiseHit(t, 0.06, 'lowpass', 1800, 0.25); if (s % 2) this.hat(t, 0.012); break;
      case 'house': if (four) this.kick(t, 0.5); if (back) this.clap(t); if (s % 4 === 2) this.hat(t, 0.05); break;
      case 'techno': if (four) this.kick(t, 0.55); if (s % 4 === 2) this.hat(t, 0.06); if (back && bar % 2) this.clap(t); if (s % 2) this.hat(t, 0.015); break;
      case 'latin': if (s === 0 || s === 6 || s === 8) this.kick(t, 0.3); if ([0, 3, 6, 10, 12].includes(s)) this.blip(t, 2400, 0.05); if ([2, 7, 11, 14].includes(s)) this.blip(t, 380 + (s % 3) * 90, 0.12); break;
      case 'oompah': if (s === 0 || s === 8) this.kick(t, 0.4); if (back) this.noiseHit(t, 0.12, 'highpass', 3000, 0.25); break;
      case 'dub': if (s === 8) this.kick(t, 0.55); if (s === 8) this.noiseHit(t, 0.14, 'bandpass', 1500, 0.3); if (s % 4 === 2) this.hat(t, 0.03); break;
      case 'palmas': if ([0, 3, 6, 8, 10].includes(s)) this.clap(t); if (s === 0) this.kick(t, 0.3); break;
      case 'tribal': if (s === 0 || s === 6 || s === 10) this.tom(t, s === 0 ? 70 : 110); if (s === 12) this.tom(t, 90); break;
      case 'metal': if (s === 0 || s === 7 || s === 10) this.kick(t, 0.55); if (back) this.noiseHit(t, 0.12, 'bandpass', 4200, 0.12, 14); if (s % 2) this.noiseHit(t, 0.03, 'bandpass', 9000, 0.03, 20); break;
      case 'glitch': if ((s * 7 + bar * 3) % 5 === 0) this.kick(t, 0.4); if ((s * 5 + bar) % 7 === 3) this.noiseHit(t, 0.1, 'bandpass', 2000 + (s * 400) % 5000, 0.05); if (s % 3 === 0) this.hat(t, 0.03); break;
      case 'dnb': if (s === 0 || s === 10) this.kick(t, 0.5); if (back) this.snare(t); for (const h of [0, 0.5]) if (s % 2 === 0) this.hat(t + h * this.dur, 0.025); break;
      case 'trap': if (s === 0 || s === 11) this.kick808(t); if (s === 8) this.clap(t); this.hat(t, s % 4 === 0 ? 0.04 : 0.02); if (s >= 12 && bar % 2) this.hat(t + this.dur / 2, 0.02); break;
      case 'hard': if (four) this.hardKick(t); if (s % 4 === 2) this.noiseHit(t, 0.09, 'highpass', 6000, 0.14); if (s % 2 === 1) this.hat(t, 0.025); if (back) this.noiseHit(t, 0.1, 'bandpass', 2600, 0.12, 6); if (bar % 4 === 3 && s >= 12) this.noiseHit(t, 0.07, 'bandpass', 1800 + s * 200, 0.06, 4); break;
      case 'heart': if (s === 0 || s === 3) this.kick(t, 0.3); break;
      case 'click': if (s % 2 === 0) this.blip(t, 6000, 0.02); if (s === 0) this.kick(t, 0.35); break;
      case 'taiko': if (s === 0 || s === 3 || s === 8 || s === 11 || s === 14) this.tom(t, s % 8 === 0 ? 60 : 85); if (back) this.snare(t); break;
      default: if (s === 0 || s === 8 || (s === 14 && bar % 2)) this.kick(t, 0.5); if (back) this.snare(t); if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.05 : 0.03);
    }
  }
  kick(t, vol = 0.5) { const ctx = this.ctx, g = ctx.createGain(), o = this.osc('sine', 140, t, t + 0.3, g); o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14); g.connect(this.out); this.env(g, t, 0.003, vol, 0.28); }
  // bombo de hard techno: golpe largo y saturado
  hardKick(t) {
    const ctx = this.ctx, g = ctx.createGain(), ws = ctx.createWaveShaper();
    ws.curve = this.hard || (this.hard = (() => { const c = new Float32Array(257); for (let i = 0; i < 257; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 9); } return c; })());
    const o = this.osc('sine', 180, t, t + 0.45, ws); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    ws.connect(g).connect(this.out); this.env(g, t, 0.002, 0.32, 0.36);
  }
  kick808(t) { const ctx = this.ctx, g = ctx.createGain(), o = this.osc('sine', 120, t, t + 0.9, g); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.2); g.connect(this.out); this.env(g, t, 0.003, 0.55, 0.85); }
  tom(t, f) { const ctx = this.ctx, g = ctx.createGain(), o = this.osc('sine', f * 1.6, t, t + 0.5, g); o.frequency.exponentialRampToValueAtTime(f, t + 0.12); g.connect(this.out); this.env(g, t, 0.003, 0.45, 0.45); this.noiseHit(t, 0.05, 'lowpass', 800, 0.1); }
  blip(t, f, vol) { const g = this.ctx.createGain(); g.connect(this.out); this.osc('sine', f, t, t + 0.08, g); this.env(g, t, 0.002, vol, 0.07); }
  noiseHit(t, vol, type, f, dur, q = 1) {
    const ctx = this.ctx, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.sound.white; fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    this.env(g, t, 0.002, vol, dur);
    s.connect(fl).connect(g).connect(this.out);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  snare(t) { this.noiseHit(t, 0.16, 'bandpass', 1800, 0.18); }
  clap(t) { for (const d of [0, 0.012, 0.024]) this.noiseHit(t + d, 0.09, 'bandpass', 1300, 0.09, 2); }
  hat(t, vol) { this.noiseHit(t, vol, 'highpass', 7500, 0.05); }
}
