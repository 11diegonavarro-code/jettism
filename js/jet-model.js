// El jet, modelado por código a partir de piezas (en la parte 4 cada pieza tendrá variantes).
// El morro apunta a −Z, como en la física.
import * as THREE from 'three';

export const DEFAULT_LOOK = { c1: '#d62839', c2: '#f3efe6', c3: '#1c2230', glow: '#3ee8ff', flame: '#ff7a2e', helmet: '#f3efe6' };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Ala o estabilizador horizontal a partir de su planta [x, z]
function planform(pts, depth = 0.16, bevel = 0.05) {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(Math.PI / 2);
  g.translate(0, depth / 2, 0);
  return g;
}
const mirror = pts => pts.map(([x, z]) => [-x, z]);

// Deriva vertical a partir de su perfil [z, y]
function fin(pts, depth = 0.12) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  return g;
}

const flameVS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const flameFS = `uniform vec3 uColor; uniform float uPower, uTime, uDiamonds; varying vec2 vUv;
  void main() {
    float a = vUv.y;
    float fade = pow(1.0 - a, 1.6);
    float flick = 0.84 + 0.16 * sin(uTime * 53.0 + vUv.x * 40.0) * sin(uTime * 31.0 + a * 9.0);
    float dia = 1.0 + uDiamonds * 1.4 * pow(max(sin(a * 24.0 - uTime * 3.0), 0.0), 8.0) * (1.0 - a);
    gl_FragColor = vec4(uColor * fade * flick * dia * uPower, 1.0);
  }`;
function flameMat(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: 1 }, uTime: { value: 0 }, uDiamonds: { value: 0 } },
    vertexShader: flameVS, fragmentShader: flameFS,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}
function flameCone(radius, mat) {
  const g = new THREE.ConeGeometry(radius, 1, 20, 1, true);
  g.translate(0, 0.5, 0);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

// Pantalla de la cabina: horizonte artificial y radar, en tonos oscuros con líneas de luz
function screenTexture(glow) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#04121a'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = glow; g.globalAlpha = 0.25; g.lineWidth = 1;
  for (let x = 0; x < 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.globalAlpha = 0.9; g.lineWidth = 3;
  g.beginPath(); g.arc(64, 64, 42, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(26, 70); g.lineTo(102, 58); g.stroke();
  g.beginPath(); g.arc(192, 64, 42, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(192, 64, 22, 0, Math.PI * 2); g.stroke();
  g.fillStyle = glow;
  g.beginPath(); g.arc(205, 52, 4, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildPilot(look = DEFAULT_LOOK) {
  const p = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.27, 20, 14), new THREE.MeshStandardMaterial({ color: look.helmet, roughness: 0.25 }));
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.255, 20, 12, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.3, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0x2a1a08, metalness: 1, roughness: 0.12 }));
  visor.rotation.y = Math.PI;
  visor.scale.setScalar(1.07);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.5, 4, 12), new THREE.MeshStandardMaterial({ color: look.c3, roughness: 0.7 }));
  body.position.y = -0.55;
  helmet.add(visor);
  p.add(helmet, body);
  return p;
}

export function buildJet(look = DEFAULT_LOOK, { ghost = false } = {}) {
  const g = new THREE.Group();
  // pintura metalizada con material estándar (el barniz «physical» costaba demasiados fps en la gráfica integrada)
  const paint = c => new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.24, envMapIntensity: 1.3 });
  const M = {
    body: paint(look.c1), trim: paint(look.c2),
    dark: new THREE.MeshStandardMaterial({ color: look.c3, metalness: 0.55, roughness: 0.45 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.26, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a3a, metalness: 0.6, roughness: 0.04, transparent: true, opacity: 0.55, envMapIntensity: 2.2 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(look.glow).multiplyScalar(3.2) }),
    hot: new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a20').multiplyScalar(1.5) }),
  };
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

  // Fuselaje (perfil de cola a morro) y lomo detrás de la cabina
  const prof = [[0.62, -6.7], [0.86, -6.2], [1.0, -5.0], [1.1, -3.0], [1.14, -1.0], [1.1, 0.8], [1.0, 2.4], [0.84, 3.8], [0.62, 5.1], [0.38, 6.3], [0.16, 7.2], [0.0, 7.7]];
  const fus = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  fus.rotateX(-Math.PI / 2);
  fus.scale(1, 0.84, 1);
  add(fus, M.body);
  add(new THREE.SphereGeometry(1, 24, 14).scale(0.46, 0.36, 3.1), M.body, 0, 0.66, 0.6);
  // franja del segundo color a lo largo del lomo
  add(new THREE.BoxGeometry(0.16, 0.05, 5.2), M.trim, 0, 0.99, 0.9);

  // Cabina: cristal, panel con pantallas y piloto
  const canopy = add(new THREE.SphereGeometry(1, 28, 18).scale(0.6, 0.5, 1.9), M.glass, 0, 0.72, -3.2);
  canopy.castShadow = false;
  const cockpit = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 0.42), M.dark);
  panel.position.set(0, 0.6, -3.88);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTexture(look.glow), color: new THREE.Color(1.3, 1.3, 1.3) });
  for (const x of [-0.2, 0.2]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), screenMat);
    s.position.set(x, 0.725, -3.68); s.rotation.x = -0.55;
    cockpit.add(s);
  }
  cockpit.add(panel);
  g.add(cockpit);
  const pilot = buildPilot(look);
  pilot.position.set(0, 0.98, -3.0);
  g.add(pilot);

  // Tomas de aire laterales
  for (const sd of [-1, 1]) {
    add(new THREE.BoxGeometry(0.5, 0.74, 2.6), M.body, sd * 1.1, -0.12, -0.9);
    add(new THREE.BoxGeometry(0.42, 0.62, 0.06), M.dark, sd * 1.1, -0.12, -2.21);
  }

  // Alas, canards, derivas y estabilizadores
  const wingR = [[0.9, -1.6], [5.3, 2.7], [5.6, 4.1], [0.9, 4.3]];
  const stripeR = [[3.0, 0.75], [5.3, 2.7], [5.42, 3.2], [3.0, 1.35]];
  const canardR = [[0.85, -4.7], [2.1, -3.55], [2.0, -3.15], [0.85, -3.4]];
  const stabR = [[0.8, 4.6], [2.9, 6.2], [2.9, 6.8], [0.8, 6.6]];
  for (const sd of [1, -1]) {
    const f = sd > 0 ? p => p : mirror;
    add(planform(f(wingR)), M.body, 0, -0.25, 0);
    add(planform(f(stripeR), 0.01, 0.01), M.trim, 0, -0.1, 0);
    add(planform(f(canardR), 0.08, 0.03), M.trim, 0, 0.05, 0);
    add(planform(f(stabR), 0.1, 0.04), M.body, 0, -0.15, 0);
    add(new THREE.BoxGeometry(0.07, 0.05, 1.3), M.glow, sd * 5.47, -0.25, 3.45);
    const nav = add(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: sd > 0 ? new THREE.Color(0x30ff60).multiplyScalar(3) : new THREE.Color(0xff2020).multiplyScalar(3) }), sd * 5.3, -0.25, 2.75);
    nav.castShadow = false;
    const fn = add(fin([[2.9, 0], [5.9, 0], [6.4, 2.5], [5.4, 2.6]]), M.body, sd * 0.72, 0.45, 0);
    fn.rotation.z = -sd * 0.3;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.18, 1.0), M.trim);
    tip.position.set(0, 2.5, 5.9);
    fn.add(tip);
  }

  // Motores: toberas, interior caliente y aro de luz
  const flames = [], cores = [], hot = [];
  const outerMat = flameMat(new THREE.Color(look.flame).multiplyScalar(1.6)), coreMat = flameMat(new THREE.Color('#a8dcff').multiplyScalar(2.6));
  for (const sd of [-1, 1]) {
    const noz = add(new THREE.CylinderGeometry(0.47, 0.4, 1.1, 24, 1, true).rotateX(Math.PI / 2), M.metal, sd * 0.48, 0, 6.9);
    noz.castShadow = false;
    hot.push(add(new THREE.CircleGeometry(0.4, 24), M.hot, sd * 0.48, 0, 6.5));
    add(new THREE.TorusGeometry(0.5, 0.05, 8, 32), M.glow, sd * 0.48, 0, 7.43);
    if (!ghost) {
      const o = flameCone(0.4, outerMat), c = flameCone(0.24, coreMat);
      o.position.set(sd * 0.48, 0, 7.4); c.position.copy(o.position);
      g.add(o, c); flames.push(o); cores.push(c);
    }
  }
  const strobe = add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(6) }), 0, 1.2, 4.6);
  strobe.castShadow = false;

  if (ghost) {
    const gm = new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0.28, depthWrite: false });
    g.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; } });
  }

  let time = 0;
  return {
    group: g, pilot, cockpit, canopy, materials: M,
    wingTips: [V(5.5, -0.25, 4.0), V(-5.5, -0.25, 4.0)],
    nozzles: [V(0.48, 0, 7.4), V(-0.48, 0, 7.4)],
    eye: V(0, 1.1, -2.95), nose: V(0, 0, -8),
    // power 0..1 (gas), boost: postcombustión
    update(dt, power, boost) {
      time += dt;
      strobe.visible = time % 1.3 < 0.07;
      if (ghost) return;
      const len = boost ? 6.8 : 1.3 + 2.2 * power, clen = boost ? 3.2 : 0.7 + 1.1 * power;
      for (const f of flames) f.scale.set(1, 1, len * (0.94 + Math.random() * 0.12));
      for (const c of cores) c.scale.set(1, 1, clen);
      outerMat.uniforms.uPower.value = boost ? 2.6 : 0.5 + 1.1 * power;
      coreMat.uniforms.uPower.value = boost ? 2.2 : 0.6 + 0.9 * power;
      for (const m of [outerMat, coreMat]) { m.uniforms.uTime.value = time; m.uniforms.uDiamonds.value = boost ? 1 : 0; }
      M.hot.color.set('#ff6a20').multiplyScalar(boost ? 4 : 1 + power * 1.5);
    },
  };
}
