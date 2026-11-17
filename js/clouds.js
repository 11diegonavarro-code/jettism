// Nubes sueltas: cúmulos hechos de bocanadas que siempre miran a la cámara (una sola llamada de dibujo).
// Están en el horizonte, sobre el recorrido, donde cuelgan los péndulos y en los extremos del raíl del tren.
import * as THREE from 'three';
import { rng } from './math.js';

function puffTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), R = rng(5);
  const blobs = Array.from({ length: 9 }, () => ({ x: 0.3 + R() * 0.4, y: 0.32 + R() * 0.36, r: 0.14 + R() * 0.16 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let a = 0;
    for (const b of blobs) { const d = Math.hypot(x / S - b.x, y / S - b.y) / b.r; a = Math.max(a, 1 - d * d); }
    const edge = Math.max(0, 1 - Math.hypot(x / S - 0.5, y / S - 0.5) * 2);
    const n = 0.92 + 0.08 * Math.sin(x * 0.09 + Math.sin(y * 0.07) * 2) * Math.sin(y * 0.11);
    const i = (y * S + x) * 4, v = Math.max(0, Math.min(1, a * n)) * Math.min(1, edge * 2.5);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255 * (0.75 + 0.25 * (1 - y / S)); // la parte de arriba más clara
    img.data[i + 3] = 255 * v;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export class Clouds {
  // opts: { layout(cluster, R, track, Q) para colocarlas en otro mapa, lit y shade: colores de la parte iluminada y la sombra }
  constructor(scene, track, Q, sunDir, opts = {}) {
    this.scene = scene;
    const R = rng(33), puffs = [];
    const cluster = (cx, cy, cz, n, spread, size, flat = 0.35) => {
      for (let k = 0; k < n; k++) {
        const dx = (R() - 0.5) * spread * 2, dy = (R() - 0.3) * spread * flat, dz = (R() - 0.5) * spread * 2;
        const lift = (dy / (spread * flat) + 0.3) * 0.5; // las de arriba, más iluminadas
        const sunward = (dx * sunDir.x + dz * sunDir.z) / (spread * 2) * 0.5 + 0.5;
        puffs.push([cx + dx, cy + dy, cz + dz, size * (0.6 + R() * 0.7), Math.min(1, Math.max(0, 0.25 + lift * 0.5 + sunward * 0.45)), R() * 6.28]);
      }
    };
    if (opts.layout) opts.layout(cluster, R, track, Q);
    else this.desertLayout(cluster, R, track, Q);
    this.build(scene, puffs, opts);
  }

  desertLayout(cluster, R, track, Q) {
    // de los péndulos cuelgan de nubes
    for (const m of track.movers) if (m.kind === 'pendulum') cluster(m.pivot.x, m.pivot.y + 10, m.pivot.z, 14, 70, 95, 0.4);
    // el tren sale y entra en nubes bajas sobre el lago
    const rail = track.decor.find(d => d.kind === 'rail');
    if (rail) for (const x of [rail.xA - 40, rail.xB + 45]) cluster(x, rail.yR, rail.zR, 16, 42, 58, 0.6);
    // nubes medianas sobre el recorrido y un cinturón de cúmulos en el horizonte
    const nMid = Math.round(14 * Q.clouds), nFar = Math.round(40 * Q.clouds);
    for (let i = 0; i < nMid; i++) {
      const a = R() * Math.PI * 2, d = 700 + R() * 1400;
      cluster(500 + Math.cos(a) * d, 620 + R() * 380, -900 + Math.sin(a) * d, 10, 110, 150);
    }
    for (let i = 0; i < nFar; i++) {
      const a = (i / nFar) * Math.PI * 2 + R() * 0.15, d = 3600 + R() * 2600;
      cluster(500 + Math.cos(a) * d, 380 + R() * 700, -900 + Math.sin(a) * d, 9, 300, 430, 0.3);
    }
  }

  build(scene, puffs, opts) {

    const base = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    const pos = new Float32Array(puffs.length * 3), size = new Float32Array(puffs.length), shade = new Float32Array(puffs.length), rot = new Float32Array(puffs.length);
    puffs.forEach((p, i) => { pos.set(p.slice(0, 3), i * 3); size[i] = p[3]; shade[i] = p[4]; rot[i] = p[5]; });
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 3));
    geo.setAttribute('iSize', new THREE.InstancedBufferAttribute(size, 1));
    geo.setAttribute('iShade', new THREE.InstancedBufferAttribute(shade, 1));
    geo.setAttribute('iRot', new THREE.InstancedBufferAttribute(rot, 1));
    geo.instanceCount = puffs.length;
    this.uniforms = {
      map: { value: puffTexture() },
      uLit: { value: new THREE.Color(opts.lit || '#ffd9b8').multiplyScalar(1.25) }, uShade: { value: new THREE.Color(opts.shade || '#8e5f8e') },
      uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0002 },
    };
    this.day = { lit: this.uniforms.uLit.value.clone(), shade: this.uniforms.uShade.value.clone() };
    this.night = { lit: new THREE.Color('#7f8fc8').multiplyScalar(0.55), shade: new THREE.Color('#1c1d40') };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 iPos; attribute float iSize, iShade, iRot; uniform float uFogDensity;
        varying vec2 vUv; varying float vShade, vFog, vNear;
        void main() {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float c = cos(iRot), s = sin(iRot);
          vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
          vec4 mv = viewMatrix * vec4(iPos + (right * p.x + up * p.y) * iSize, 1.0);
          float dist = length(mv.xyz);
          vUv = uv; vShade = iShade;
          vFog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * 0.3);
          vNear = smoothstep(iSize * 0.15, iSize * 0.9, dist);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 uLit, uShade, uFogColor; varying vec2 vUv; varying float vShade, vFog, vNear;
        void main() {
          vec4 t = texture2D(map, vUv);
          float a = t.a * vNear * 0.92;
          if (a < 0.01) discard;
          vec3 col = mix(uShade, uLit, clamp(vShade * 0.8 + (t.r - 0.75) * 1.6, 0.0, 1.0));
          gl_FragColor = vec4(mix(col, uFogColor, vFog), a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.count = puffs.length;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.uniforms.map.value.dispose();
  }
  update(fog, night) {
    this.uniforms.uFogColor.value.copy(fog.color);
    this.uniforms.uFogDensity.value = fog.density;
    this.uniforms.uLit.value.copy(this.day.lit).lerp(this.night.lit, night);
    this.uniforms.uShade.value.copy(this.day.shade).lerp(this.night.shade, night);
  }
}
