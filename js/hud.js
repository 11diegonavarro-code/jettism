// Marcador: tiempos, velocidad, turbo, estilo, mensajes de piruetas, marcador de la siguiente puerta y mira.
const $ = id => document.getElementById(id);

export const fmtTime = t => {
  if (t == null || !isFinite(t)) return '--:--.---';
  const s = Math.max(0, t), m = Math.floor(s / 60), r = s - m * 60;
  return `${m}:${r.toFixed(3).padStart(6, '0')}`;
};

export class HUD {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'lap', 'time', 'lapTime', 'best', 'style', 'chain', 'chainBar', 'speed', 'turboFill', 'turbo', 'alt', 'center', 'feed', 'marker', 'markerDist', 'edgeArrow', 'reticle', 'noseMark', 'warn', 'section', 'helpLine'])
      this.el[id] = $(id);
    this.centerT = 0; this.sectionT = 0; this.last = {};
  }
  show(on) { this.el.hud.hidden = !on; }
  // Solo toca el DOM si el texto cambia
  text(id, v) { if (this.last[id] !== v) { this.last[id] = v; this.el[id].textContent = v; } }

  setRace({ lap, laps, time, lapTime, best, free, label }) {
    this.text('lap', free ? label || 'VUELO LIBRE' : `VUELTA ${Math.min(lap || 1, laps)}/${laps}`);
    this.text('time', free ? fmtTime(lapTime) : fmtTime(time));
    this.text('lapTime', free ? '' : `Vuelta ${fmtTime(lapTime)}`);
    this.text('best', best ? `Mejor ${fmtTime(best)}` : '');
  }
  setFlight(kmh, turbo, alt, boosting) {
    this.text('speed', String(Math.round(kmh)));
    this.text('alt', `${Math.round(alt)} m`);
    const w = `${Math.round(turbo)}%`;
    if (this.last.tw !== w) { this.last.tw = w; this.el.turboFill.style.width = w; }
    this.el.turbo.classList.toggle('on', boosting);
    this.el.turbo.classList.toggle('full', turbo >= 99.5);
  }
  setStyle(total, mult, left) {
    this.text('style', total.toLocaleString('es-ES'));
    this.text('chain', mult > 1 && left > 0 ? `×${mult.toFixed(1).replace('.', ',')}` : '');
    const w = `${Math.round((left / 2) * 100)}%`;
    if (this.last.cw !== w) { this.last.cw = w; this.el.chainBar.style.width = mult > 1 ? w : '0%'; }
  }
  // Mensaje que sube y se desvanece (piruetas, roces, anillos)
  feed(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'fd ' + cls;
    d.textContent = text;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 4) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 1700);
  }
  center(text, cls = '', dur = 1.2) {
    this.el.center.textContent = text;
    this.el.center.className = 'sh ' + cls;
    this.centerT = dur;
  }
  sectionName(text) {
    this.el.section.textContent = text;
    this.el.section.classList.remove('on');
    void this.el.section.offsetWidth;
    this.el.section.classList.add('on');
  }
  tick(dt) {
    if (this.centerT > 0 && (this.centerT -= dt) <= 0) this.el.center.textContent = '';
  }
  // Marcador de la siguiente puerta: x, y en píxeles; si está fuera de la pantalla, flecha en el borde
  marker(x, y, onScreen, dist, angle, visible) {
    const m = this.el.marker, a = this.el.edgeArrow;
    if (!visible) { m.hidden = a.hidden = true; return; }
    m.hidden = !onScreen; a.hidden = onScreen;
    if (onScreen) {
      m.style.transform = `translate(${x}px, ${y}px)`;
      this.text('markerDist', `${Math.round(dist)} m`);
    } else a.style.transform = `translate(${x}px, ${y}px) rotate(${angle}rad)`;
  }
  reticle(rx, ry, nx, ny, visible) {
    this.el.reticle.hidden = this.el.noseMark.hidden = !visible;
    if (!visible) return;
    this.el.reticle.style.transform = `translate(${rx}px, ${ry}px)`;
    this.el.noseMark.style.transform = `translate(${nx}px, ${ny}px)`;
  }
  warn(k) {
    const v = k.toFixed(2);
    if (this.last.warn !== v) { this.last.warn = v; this.el.warn.style.opacity = v; }
  }
}
