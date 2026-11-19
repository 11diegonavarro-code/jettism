// Estadio flotante: lo que se ve. La cápsula es una celosía de cristal (se ve el cielo a través) con nervios de tinta y
// una trama de cómic; en cada extremo, la portería: un aro de neón del color del equipo y una red de líneas detrás; los
// portales, discos que giran en espiral con un aro de su color; anillos de luz que marcan el centro; nubes debajo.
import * as THREE from 'three';
import { ARENA, GOALS, PORTALS } from './estadio.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
export function atmo() {
  return {
    sky: { zenith: '#1a2a6a', mid: '#5a7ad8', horizon: '#ffcfa0', ground: '#f0e6ff', sun: '#fff6e0', clouds: 0.6, sunDisc: 1 },
    sunDir: [0.4, 0.7, -0.6], sunColor: '#fff2dc', sunIntensity: 3.4,
    hemiSky: '#c8d8ff', hemiGround: '#ffd8c0', hemiIntensity: 0.8,
    fog: { color: '#d8d8f0', density: 0.0002 },
    exposure: 1.0,
    ground: false,
    grade: { sat: 1.12, contrast: 1.12, tint: [1, 1, 1.02], grain: 0.03, vignette: 0.7 },
  };
}
export const MUSIC = { chords: [[48, 55, 60, 64, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [43, 50, 55, 59, 62]] };
export const CLOUDS = {
  lit: '#ffffff', shade: '#c8b8e8',
  layout(cluster, R) {
    for (let k = 0; k < 60; k++) { const a = R() * Math.PI * 2, d = R() * 1800; cluster(Math.cos(a) * d, 200 + R() * 120, Math.sin(a) * d, 9, 160, 220, 0.4); }
    for (let k = 0; k < 30; k++) { const a = (k / 30) * Math.PI * 2, d = 2600 + R() * 2000; cluster(Math.cos(a) * d, 400 + R() * 600, Math.sin(a) * d, 8, 300, 440, 0.3); }
  },
};

export function buildView(cv) {
  const root = cv.group, owned = [], geos = [], A = ARENA;
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  // la cápsula: cristal con nervios y trama (sombreador, por las dos caras)
  const shellMat = mat(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main() { vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
      void main() {
        float a = atan(vP.x, vP.y) * 12.0 / 3.14159, z = vP.z / 60.0;
        vec2 g = abs(fract(vec2(a, z + a * 0.5)) - 0.5);
        float rib = smoothstep(0.035, 0.0, min(g.x, g.y));
        float dots = step(0.35, length(fract(gl_FragCoord.xy / 7.0) - 0.5));
        float rim = pow(1.0 - abs(dot(vN, vV)), 3.0);
        vec3 col = mix(vec3(0.85, 0.9, 1.0), vec3(0.03), rib) ;
        float alpha = rib * 0.9 + rim * 0.35 + (1.0 - dots) * 0.06;
        gl_FragColor = vec4(col + vec3(0.2, 0.3, 0.6) * rim, alpha);
      }`,
  }));
  const cap = new THREE.CapsuleGeometry(A.r + 1, A.half * 2, 24, 96).rotateX(Math.PI / 2);
  const shell = new THREE.Mesh(own(cap), shellMat); shell.position.copy(v3(A.c)); shell.renderOrder = 2; root.add(shell);
  // anillos de luz en el centro y en los cuartos
  const ringM = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff4d8').multiplyScalar(1.5) }));
  for (const z of [-A.half / 2, 0, A.half / 2]) { const r = new THREE.Mesh(own(new THREE.TorusGeometry(A.r - 1, 1.2, 8, 96)), ringM); r.position.set(A.c.x, A.c.y, A.c.z + z); root.add(r); }
  // porterías: aro de neón y red de líneas en forma de cuenco detrás
  for (const g of GOALS) {
    const col = new THREE.Color(g.team ? '#2f8cff' : '#ff2a3c'), neon = mat(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.6) }));
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(g.r, 3, 12, 64)), neon); ring.position.copy(v3(g.c)); root.add(ring);
    const pts = [], depth = 40, back = -1 * Math.sign(g.n.z);
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; for (let j = 0; j < 6; j++) { const f0 = j / 6, f1 = (j + 1) / 6, r0 = g.r * Math.cos(f0 * 1.2), r1 = g.r * Math.cos(f1 * 1.2); pts.push(g.c.x + Math.cos(a) * r0, g.c.y + Math.sin(a) * r0, g.c.z + back * depth * f0, g.c.x + Math.cos(a) * r1, g.c.y + Math.sin(a) * r1, g.c.z + back * depth * f1); } }
    for (let j = 1; j <= 6; j++) { const f = j / 6, r = g.r * Math.cos(f * 1.2); for (let k = 0; k < 24; k++) { const a0 = (k / 24) * Math.PI * 2, a1 = ((k + 1) / 24) * Math.PI * 2; pts.push(g.c.x + Math.cos(a0) * r, g.c.y + Math.sin(a0) * r, g.c.z + back * depth * f, g.c.x + Math.cos(a1) * r, g.c.y + Math.sin(a1) * r, g.c.z + back * depth * f); } }
    const lg = own(new THREE.BufferGeometry()); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    root.add(new THREE.LineSegments(lg, mat(new THREE.LineBasicMaterial({ color: col }))));
    const glow = new THREE.Mesh(own(new THREE.CircleGeometry(g.r, 48)), mat(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })));
    glow.position.copy(v3(g.c)); root.add(glow);
  }
  // portales: disco con espiral que gira y aro de su color
  const spinners = [];
  for (const P of PORTALS) for (const d of [P.a, P.b]) {
    const col = new THREE.Color(P.color);
    const m = mat(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCol: { value: col } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uTime; uniform vec3 uCol; varying vec2 vUv; void main() { vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x); float s = 0.5 + 0.5 * sin(a * 3.0 + r * 14.0 - uTime * 6.0); float f = smoothstep(1.0, 0.85, r); gl_FragColor = vec4(uCol * (0.3 + s * 1.4) * f + vec3(1.0) * smoothstep(0.25, 0.0, r) * 0.6, f); }',
    }));
    const disc = new THREE.Mesh(own(new THREE.CircleGeometry(d.r, 48)), m); disc.position.copy(v3(d.c)); disc.lookAt(v3(d.c).add(v3(d.n))); root.add(disc); spinners.push(m);
    const ring = new THREE.Mesh(own(new THREE.TorusGeometry(d.r, 1.8, 10, 48)), mat(new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.4) }))); ring.position.copy(disc.position); ring.quaternion.copy(disc.quaternion); root.add(ring);
  }
  let time = 0;
  return { update(t) { time = t || time + 0.016; for (const m of spinners) m.uniforms.uTime.value = time; shellMat.uniforms.uTime.value = time; }, dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); } };
}
