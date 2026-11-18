// Campo de líneas: lo que se ve. El campo es una malla grande cuyo relieve se calcula en el sombreador con las mismas
// cuentas que campo.js (las olas que se ven son las que chocan). Las rayas violetas se doblan alrededor de las esferas
// y brillan más en las crestas. La línea roja y la dorada siguen el recorrido pegadas al relieve. Esferas de cromo
// que reflejan el cielo, hilos de luz y un crepúsculo violeta.
import * as THREE from 'three';
import { FIELD } from './campo.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
const NS = 16; // esferas que doblan las rayas
const F = FIELD, f = x => x.toFixed(4);
const GLSL_FIELD = /* glsl */`
  float fieldStatic(vec2 p) { return 10.0 + 6.0 * sin(0.011 * p.x + 0.7 * sin(0.005 * p.y)) + 5.0 * sin(0.013 * p.y - 0.004 * p.x); }
  float fwave(float u, float t, float sp, float per, float amp, float w) { float ph = mod(u - sp * t, per) - per * 0.5; return amp * exp(-(ph / w) * (ph / w)); }
  float fieldWave(vec2 p, float t) {
    return max(fwave(dot(vec2(${f(F.d1[0])}, ${f(F.d1[1])}), p), t, ${f(F.s1)}, ${f(F.p1)}, ${f(F.a1)}, ${f(F.w1)}),
               fwave(dot(vec2(${f(F.d2[0])}, ${f(F.d2[1])}), p), t, ${f(F.s2)}, ${f(F.p2)}, ${f(F.a2)}, ${f(F.w2)}));
  }`;

function fieldMaterial(mode, color) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSph: { value: Array.from({ length: NS }, () => new THREE.Vector4(0, 0, 0, 0)) }, uColor: { value: new THREE.Color(color || '#ffffff') } }]),
    vertexShader: /* glsl */`
      uniform float uTime; varying vec3 vW; varying float vCrest;
      ${GLSL_FIELD}
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        float w = fieldWave(p.xz, uTime);
        vCrest = w;
        p.y += fieldStatic(p.xz) + w;
        vW = p;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec4 uSph[${NS}]; uniform vec3 uColor; varying vec3 vW; varying float vCrest;
      #include <fog_pars_fragment>
      void main() {
        vec3 col;
        if (${mode === 'line' ? 'true' : 'false'}) col = uColor * (1.4 + vCrest * 0.05);
        else {
          // rayas: líneas de z constante, onduladas y apartadas por las esferas
          float v = vW.z + 28.0 * sin(vW.x * 0.0045) + 14.0 * sin(vW.x * 0.011 + vW.z * 0.002);
          for (int i = 0; i < ${NS}; i++) { vec4 s = uSph[i]; if (s.z <= 0.0) continue; vec2 d = vW.xz - s.xy; float R = s.z * 2.6; v += sign(d.y) * s.z * 1.7 * exp(-dot(d, d) / (R * R)); }
          float per = 7.0, fw = fwidth(v), fr = abs(fract(v / per) - 0.5) * per;
          float line = 1.0 - smoothstep(0.7, 0.7 + fw * 1.3, fr);
          line = mix(line, 0.22, smoothstep(1.5, 5.0, fw)); // a lo lejos, gris medio en vez de parpadeo
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
          float shade = 0.55 + 0.45 * clamp(dot(n, normalize(vec3(-0.4, 0.5, 0.75))), 0.0, 1.0);
          float crest = clamp(vCrest / 22.0, 0.0, 1.0);
          vec3 lc = mix(vec3(0.42, 0.26, 1.0), vec3(1.0, 0.42, 0.85), 0.5 + 0.5 * sin(vW.x * 0.0016 + vW.z * 0.001));
          col = mix(vec3(0.012, 0.006, 0.03), lc * (0.42 + crest * 2.0), line) * shade + vec3(0.05, 0.0, 0.08) * crest;
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

export function atmo() {
  return {
    sky: { zenith: '#05030f', mid: '#1c0d36', horizon: '#7a2c62', ground: '#0a0612', sun: '#ff86c0', clouds: 0.18, sunDisc: 0.9 },
    sunDir: [-0.55, 0.12, -0.83], sunColor: '#ff8cc6', sunIntensity: 2.2,
    hemiSky: '#8a6cff', hemiGround: '#12081e', hemiIntensity: 0.6,
    fog: { color: '#1c0e33', density: 0.00085 },
    exposure: 0.84,
    ground: false,
    grade: { sat: 1.06, contrast: 1.2, tint: [1.0, 0.95, 1.08], grain: 0.07, vignette: 0.55 },
  };
}
// Música: grave y lenta, en Si bemol menor
export const MUSIC = { chords: [[46, 53, 58, 61, 65], [42, 49, 54, 58, 61], [44, 51, 56, 59, 63], [41, 48, 53, 56, 60]] };
export const CLOUDS = {
  lit: '#8a4f86', shade: '#120820',
  layout(cluster, R) {
    for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2, d = 3000 + R() * 2200; cluster(300 + Math.cos(a) * d, 220 + R() * 420, -200 + Math.sin(a) * d, 8, 300, 440, 0.25); }
  },
};

export function buildView(cv) {
  const T = cv.track, S = T.spline, root = cv.group, owned = [], geos = [];
  const mat = m => { owned.push(m); return m; };
  const own = g => { geos.push(g); return g; };
  const field = mat(fieldMaterial('field')), red = mat(fieldMaterial('line', '#ff2a2a')), gold = mat(fieldMaterial('line', '#ffc44a'));
  const fieldMats = [field, red, gold];

  // ---------- el campo: malla densa cerca del recorrido y otra más basta alrededor hasta el horizonte ----------
  const plane = (size, seg, cx, cz) => own(new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2).translate(cx, 0, cz));
  const near = new THREE.Mesh(plane(2000, 400, 300, -200), field); near.frustumCulled = false; root.add(near);
  // anillo exterior: cuatro losas alrededor de la del centro (un poco por debajo, para que no asome la junta)
  for (const [dx, dz] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
    const m = new THREE.Mesh(plane(2000, 90, 300 + dx * 2000, -200 + dz * 2000), field); m.position.y = -0.6; m.frustumCulled = false; root.add(m);
  }
  // ---------- la línea roja y la dorada, a los dos lados del recorrido ----------
  const ribbon = off => {
    const pos = [], idx = [];
    for (let s = 0, i = 0; s <= S.length + 0.1; s += 3, i++) {
      const P = S.pointAt(s % S.length), t = S.tangentAt(s % S.length), rx = -t.z, rz = t.x, k = 1 / Math.hypot(rx, rz);
      for (const w of [-0.9, 0.9]) pos.push(P.x + rx * k * (off + w), 0.8, P.z + rz * k * (off + w));
      if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
    }
    const g = own(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    return g;
  };
  for (const [off, m] of [[-7, red], [7, gold]]) { const me = new THREE.Mesh(ribbon(off), m); me.frustumCulled = false; root.add(me); }

  // ---------- esferas de cromo, hilos de luz ----------
  const chrome = mat(new THREE.MeshStandardMaterial({ color: '#efe6ff', metalness: 1, roughness: 0.05 }));
  const sphGeo = own(new THREE.SphereGeometry(1, 64, 40));
  const orbs = T.decor.filter(d => d.kind === 'orb' || d.kind === 'far');
  if (orbs.length) {
    const I = new THREE.InstancedMesh(sphGeo, chrome, orbs.length), o = new THREE.Object3D();
    orbs.forEach((d, i) => { o.position.copy(v3(d.c)); o.scale.setScalar(d.r); o.updateMatrix(); I.setMatrixAt(i, o.matrix); });
    I.castShadow = true; root.add(I);
  }
  const glow = mat(new THREE.MeshBasicMaterial({ color: new THREE.Color('#9a6cff').multiplyScalar(1.8) }));
  for (const d of T.decor.filter(x => x.kind === 'pillar')) { const h = d.b.y - d.a.y, m = new THREE.Mesh(own(new THREE.CylinderGeometry(d.r * 0.5, d.r * 0.5, h, 8)), glow); m.position.set(d.a.x, (d.a.y + d.b.y) / 2, d.a.z); root.add(m); }
  // las esferas fijas más grandes cercanas también doblan las rayas
  const bend = T.decor.filter(d => d.kind === 'orb').sort((a, b) => b.r - a.r).slice(0, NS - T.movers.length);

  // ---------- esferas que ruedan ----------
  const movers = [], axis = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  for (const m of T.movers) {
    const c = m.cols[0], me = new THREE.Mesh(sphGeo, chrome); me.scale.setScalar(m.r); me.castShadow = true; root.add(me);
    axis.crossVectors(Y, v3(m.dir)).normalize(); const ax = axis.clone();
    movers.push(() => { me.position.set(c.c.x, c.c.y, c.c.z); me.quaternion.setFromAxisAngle(ax, m.roll); });
  }
  return {
    update() {
      for (const fn of movers) fn();
      const t = T.time || 0;
      for (const m of fieldMats) m.uniforms.uTime.value = t;
      const u = field.uniforms.uSph.value;
      T.movers.forEach((m, i) => u[i].set(m.cols[0].c.x, m.cols[0].c.z, m.r, 0));
      bend.forEach((d, i) => u[T.movers.length + i].set(d.c.x, d.c.z, d.r, 0));
    },
    dispose() { for (const m of owned) m.dispose(); for (const g of geos) g.dispose(); },
  };
}
