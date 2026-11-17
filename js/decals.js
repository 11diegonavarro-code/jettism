// Calcomanías dibujadas por código en blanco (el color se aplica al pegarlas) y el número con el nombre de la cola.
import * as THREE from 'three';

const S = 256;
const star = (g, cx, cy, r1, r2, n = 5, rot = -Math.PI / 2) => {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath(); g.fill();
};
const flame = (g, x, y, w, h) => {
  g.beginPath();
  g.moveTo(x, y + h);
  g.bezierCurveTo(x - w * 0.6, y + h * 0.5, x + w * 0.1, y + h * 0.35, x - w * 0.15, y);
  g.bezierCurveTo(x + w * 0.45, y + h * 0.25, x + w * 0.2, y + h * 0.45, x + w * 0.45, y + h * 0.25);
  g.bezierCurveTo(x + w * 0.7, y + h * 0.6, x + w * 0.5, y + h * 0.9, x, y + h);
  g.fill();
};
const circle = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
const hole = (g, fn) => { g.globalCompositeOperation = 'destination-out'; fn(); g.globalCompositeOperation = 'source-over'; };

const DRAW = {
  llama: g => { g.save(); g.translate(S / 2, 0); g.rotate(Math.PI / 2); flame(g, 128, -200, 150, 180); g.restore(); },
  llamas: g => { for (const [y, s] of [[70, 0.8], [128, 1], [186, 0.8]]) { g.save(); g.translate(30, y); g.scale(s, s); g.beginPath(); g.moveTo(0, -18); g.quadraticCurveTo(120, -40, 210, 0); g.quadraticCurveTo(120, 40, 0, 18); g.quadraticCurveTo(30, 0, 0, -18); g.fill(); g.restore(); } },
  raya: g => { g.fillRect(0, 104, S, 48); },
  rayas: g => { g.fillRect(0, 78, S, 34); g.fillRect(0, 144, S, 34); },
  estrella: g => star(g, 128, 134, 118, 48),
  estrellas: g => { star(g, 70, 90, 56, 22); star(g, 180, 80, 40, 16); star(g, 140, 185, 60, 24); },
  ojo: g => { g.beginPath(); g.ellipse(128, 128, 120, 66, 0, 0, Math.PI * 2); g.fill(); hole(g, () => circle(g, 128, 128, 48)); circle(g, 128, 128, 30); hole(g, () => circle(g, 142, 114, 10)); },
  lagrima: g => { DRAW.ojo(g); g.beginPath(); g.moveTo(150, 190); g.quadraticCurveTo(180, 240, 150, 252); g.quadraticCurveTo(120, 240, 150, 190); g.fill(); },
  dientes: g => { g.beginPath(); g.moveTo(10, 60); for (let i = 0; i < 7; i++) { g.lineTo(10 + i * 34 + 17, 150); g.lineTo(10 + (i + 1) * 34, 60); } g.lineTo(246, 40); g.lineTo(10, 40); g.fill(); g.beginPath(); g.moveTo(10, 220); for (let i = 0; i < 7; i++) { g.lineTo(10 + i * 34 + 17, 160); g.lineTo(10 + (i + 1) * 34, 220); } g.lineTo(246, 236); g.lineTo(10, 236); g.fill(); },
  rayo: g => { g.beginPath(); g.moveTo(150, 0); g.lineTo(60, 140); g.lineTo(120, 140); g.lineTo(90, 256); g.lineTo(200, 100); g.lineTo(138, 100); g.lineTo(180, 0); g.fill(); },
  luna: g => { circle(g, 128, 128, 110); hole(g, () => circle(g, 176, 100, 96)); },
  sol: g => { circle(g, 128, 128, 58); for (let i = 0; i < 12; i++) { g.save(); g.translate(128, 128); g.rotate((i * Math.PI) / 6); g.beginPath(); g.moveTo(-12, -70); g.lineTo(0, -122); g.lineTo(12, -70); g.fill(); g.restore(); } },
  espiral: g => { g.lineWidth = 18; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.beginPath(); for (let a = 0; a < Math.PI * 6; a += 0.08) { const r = 6 + a * 6; g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } g.stroke(); },
  nube: g => { circle(g, 90, 140, 50); circle(g, 150, 115, 62); circle(g, 196, 150, 42); g.fillRect(90, 140, 106, 52); circle(g, 70, 170, 22); },
  gota: g => { g.beginPath(); g.moveTo(128, 10); g.bezierCurveTo(200, 120, 210, 160, 200, 180); g.arc(128, 175, 72, 0.07, Math.PI - 0.07); g.bezierCurveTo(46, 160, 56, 120, 128, 10); g.fill(); },
  corazon: g => { g.beginPath(); g.moveTo(128, 230); g.bezierCurveTo(-20, 130, 40, 20, 128, 80); g.bezierCurveTo(216, 20, 276, 130, 128, 230); g.fill(); },
  alas: g => { for (const sd of [-1, 1]) { g.save(); g.translate(128, 128); g.scale(sd, 1); for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(40 + k * 18, -10 + k * 16, 70 - k * 10, 14, -0.35, 0, Math.PI * 2); g.fill(); } g.restore(); } circle(g, 128, 128, 26); },
  diana: g => { circle(g, 128, 128, 118); hole(g, () => circle(g, 128, 128, 92)); circle(g, 128, 128, 66); hole(g, () => circle(g, 128, 128, 40)); circle(g, 128, 128, 16); },
  cuadros: g => { for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) if ((x + y) % 2) g.fillRect(x * 32, 64 + y * 32, 32, 32); },
  ola: g => { g.beginPath(); g.moveTo(0, 200); for (let x = 0; x <= S; x += 8) g.lineTo(x, 150 + Math.sin(x / 26) * 30); g.lineTo(S, 256); g.lineTo(0, 256); g.fill(); g.beginPath(); g.arc(120, 120, 60, Math.PI * 0.9, Math.PI * 2.1); g.lineWidth = 18; g.strokeStyle = '#fff'; g.stroke(); },
  hoja: g => { g.beginPath(); g.moveTo(20, 236); g.quadraticCurveTo(20, 40, 236, 20); g.quadraticCurveTo(220, 236, 20, 236); g.fill(); hole(g, () => { g.lineWidth = 8; g.beginPath(); g.moveTo(30, 226); g.lineTo(200, 56); g.stroke(); }); },
  pez: g => { g.beginPath(); g.ellipse(110, 128, 90, 54, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(180, 128); g.lineTo(250, 70); g.lineTo(250, 186); g.fill(); hole(g, () => circle(g, 62, 112, 12)); },
  llave: g => { circle(g, 70, 128, 56); hole(g, () => circle(g, 70, 128, 24)); g.fillRect(110, 116, 140, 26); g.fillRect(200, 142, 18, 34); g.fillRect(230, 142, 18, 24); },
  mano: g => { g.fillRect(70, 120, 120, 120); for (let k = 0; k < 4; k++) { g.beginPath(); g.roundRect(70 + k * 31, 26 + Math.abs(k - 1.5) * 12, 26, 110, 13); g.fill(); } g.save(); g.translate(70, 160); g.rotate(-0.7); g.beginPath(); g.roundRect(-80, -14, 80, 28, 14); g.fill(); g.restore(); },
  labios: g => { g.beginPath(); g.moveTo(10, 128); g.bezierCurveTo(60, 50, 100, 60, 128, 84); g.bezierCurveTo(156, 60, 196, 50, 246, 128); g.bezierCurveTo(190, 220, 66, 220, 10, 128); g.fill(); hole(g, () => { g.lineWidth = 8; g.beginPath(); g.moveTo(20, 128); g.quadraticCurveTo(128, 150, 236, 128); g.stroke(); }); },
  bigote: g => { for (const sd of [-1, 1]) { g.save(); g.translate(128, 120); g.scale(sd, 1); g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(40, -40, 90, -10, 118, -40); g.bezierCurveTo(110, 30, 50, 40, 0, 20); g.fill(); g.restore(); } },
  escalera: g => { g.fillRect(40, 0, 22, S); g.fillRect(194, 0, 22, S); for (let y = 20; y < S; y += 46) g.fillRect(40, y, 176, 16); },
  reloj: g => { circle(g, 128, 128, 116); hole(g, () => circle(g, 128, 128, 100)); for (let i = 0; i < 12; i++) { g.save(); g.translate(128, 128); g.rotate((i * Math.PI) / 6); g.fillRect(-4, -96, 8, 18); g.restore(); } g.save(); g.translate(128, 128); g.rotate(0.9); g.fillRect(-5, -70, 10, 70); g.rotate(1.8); g.fillRect(-4, -50, 8, 50); g.restore(); circle(g, 128, 128, 10); },
  calavera: g => { circle(g, 128, 110, 92); g.fillRect(78, 160, 100, 70); hole(g, () => { circle(g, 92, 112, 26); circle(g, 164, 112, 26); g.beginPath(); g.moveTo(128, 140); g.lineTo(114, 170); g.lineTo(142, 170); g.fill(); for (let k = 0; k < 4; k++) g.fillRect(90 + k * 22, 200, 8, 30); }); },
};

const cache = new Map();
// Textura de una calcomanía; «letra» usa la inicial que se le pase
export function decalTexture(id, letter = 'J', mirror = false) {
  const key = `${id}|${id === 'letra' ? letter : ''}|${mirror ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  if (mirror) { g.translate(S, 0); g.scale(-1, 1); }
  if (id === 'letra') { g.font = '900 220px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter.toUpperCase(), 128, 140); }
  else (DRAW[id] || DRAW.estrella)(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

// Número de carreras grande con el nombre debajo, en el color secundario y perfilado con el de detalles
export function numberTexture(number, name, color, outline) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.font = '900 300px system-ui, sans-serif';
  g.lineWidth = 26; g.strokeStyle = outline; g.strokeText(String(number), 256, 210);
  g.fillStyle = color; g.fillText(String(number), 256, 210);
  if (name) {
    g.font = '800 72px system-ui, sans-serif';
    g.lineWidth = 12; g.strokeText(name.toUpperCase(), 256, 420, 480);
    g.fillText(name.toUpperCase(), 256, 420, 480);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
