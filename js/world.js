// Escena base: cielo pintado por código (atardecer con nubes, o noche con remolinos, estrellas y luna), sol con
// sombras largas, desierto, lago espejo con reflejo real, niebla que cambia por tramos y posprocesado.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { Water } from 'three/addons/objects/Water.js';
import { LAKE } from './track.js';
import { noiseTexture } from './textures.js';

export const QUALITY = {
  ultra: { shadow: 4096, shadowBox: 230, msaa: 4, post: true, maxRatio: 2, particles: 1600, blur: true, mirror: 1024, octaves: 6, cloudLight: 1, clouds: 1 },
  alta: { shadow: 2048, shadowBox: 170, msaa: 0, post: true, maxRatio: 1.5, particles: 1100, blur: true, mirror: 512, octaves: 5, cloudLight: 1, clouds: 1 },
  baja: { shadow: 1024, shadowBox: 120, msaa: 0, post: false, maxRatio: 1, particles: 600, blur: false, mirror: 0, octaves: 4, cloudLight: 0, clouds: 0.55 },
};

// Sol bajo de atardecer, por delante a la izquierda de la salida; la luna, alta y al otro lado
export const SUN = new THREE.Vector3(-0.55, 0.16, -0.82).normalize();
export const MOON = new THREE.Vector3(0.45, 0.55, 0.7).normalize();
const C = h => new THREE.Color(h);
const DAY = { zenith: C('#262a6b'), mid: C('#a4548a'), horizon: C('#ffb168'), ground: C('#d68a5a'), sun: C('#ffd09a') };
const NIGHT = { zenith: C('#070a2e'), mid: C('#1d2468'), horizon: C('#5a3f8f'), ground: C('#22183a') };
const FOG = { haze: C('#e49a70'), pink: C('#e98fa8'), night: C('#2a2552') };
const LIGHT = { day: C('#ffc48a'), night: C('#9bb0ff'), hemiSky: C('#8f86d6'), hemiGround: C('#b87a52'), hemiSkyN: C('#3a4290'), hemiGroundN: C('#2a2440') };
export const FOG_COLOR = FOG.haze;

class LightBloomPass extends UnrealBloomPass {
  setSize(w, h) { super.setSize(Math.max(2, w / 2), Math.max(2, h / 2)); } // a 1/4 de resolución
}

function skyMaterial(Q) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    defines: { OCT: Q.octaves, CLOUD_LIGHT: Q.cloudLight },
    uniforms: {
      uZenith: { value: DAY.zenith }, uMid: { value: DAY.mid }, uHorizon: { value: DAY.horizon }, uGround: { value: DAY.ground }, uSun: { value: DAY.sun },
      nZenith: { value: NIGHT.zenith }, nMid: { value: NIGHT.mid }, nHorizon: { value: NIGHT.horizon }, nGround: { value: NIGHT.ground },
      uSunDir: { value: SUN.clone() }, uMoonDir: { value: MOON.clone() }, uNight: { value: 0 }, uTime: { value: 0 }, uCloudCov: { value: 0 }, uSunDisc: { value: 1 },
    },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `uniform vec3 uZenith, uMid, uHorizon, uGround, uSun, uSunDir, uMoonDir, nZenith, nMid, nHorizon, nGround;
      uniform float uNight, uTime, uCloudCov, uSunDisc; varying vec3 vDir;
      // hash sin sin(): con números grandes, sin() pierde precisión en la gráfica y el ruido sale a bloques
      float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y, az = atan(d.z, d.x);
        vec2 plane = d.xz / (max(h, 0.0) + 0.06);
        vec3 col = vec3(0.0);
        // ---- día: atardecer con nubes pintadas ----
        if (uNight < 0.999) {
          vec3 day = mix(uHorizon, uMid, smoothstep(0.0, 0.24, h));
          day = mix(day, uZenith, smoothstep(0.2, 0.9, h));
          day = mix(day, uGround, smoothstep(0.0, -0.1, h));
          float sd = max(dot(d, uSunDir), 0.0);
          day += uSun * (pow(sd, 5.0) * 0.45 + pow(sd, 40.0) * 1.1) * (1.0 - smoothstep(0.1, 0.7, h) * 0.6);
          float band = sin(h * 46.0 + sin(az * 3.0 + h * 9.0) * 1.7 + sin(az * 11.0) * 0.25);
          day *= 1.0 + 0.04 * band * smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.5, 0.95, h));
          float cov = 0.0;
          if (h > 0.012) {
            vec2 uv = plane * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
            float c = fbm(uv);
            cov = smoothstep(0.5 - uCloudCov, 0.78 - uCloudCov * 0.6, c) * smoothstep(0.012, 0.14, h);
            #if CLOUD_LIGHT == 1
            float lit = clamp(0.55 + (c - fbm(uv + uSunDir.xz * 0.07)) * 3.5, 0.0, 1.0);
            #else
            float lit = 0.6;
            #endif
            vec3 shade = mix(uMid * 0.8, uZenith * 1.3, 0.35);
            vec3 cloud = mix(shade, uSun * 0.95 + uHorizon * 0.25, lit * (0.45 + 0.55 * pow(sd, 3.0)));
            cloud += uSun * pow(sd, 10.0) * (1.0 - cov) * cov * 2.2;
            day = mix(day, cloud, cov * 0.92);
          }
          day += uSun * smoothstep(0.99935, 0.9997, sd) * 26.0 * (1.0 - cov) * uSunDisc;
          col = day;
        }
        // ---- noche: cielo de pinceladas en remolino, estrellas y luna ----
        if (uNight > 0.001) {
          vec3 night = mix(nHorizon, nMid, smoothstep(0.0, 0.3, h));
          night = mix(night, nZenith, smoothstep(0.25, 0.9, h));
          night = mix(night, nGround, smoothstep(0.0, -0.1, h));
          float strokes = sin(h * 38.0 + sin(az * 4.0 + h * 7.0 + uTime * 0.08) * 2.2 + fbm(plane * 0.7) * 3.0);
          night *= 1.0 + 0.14 * strokes * smoothstep(0.03, 0.3, h);
          float sw = 0.0;
          for (int i = 0; i < 3; i++) {
            vec3 cdir = normalize(vec3(cos(float(i) * 2.1 + 0.4), 0.45 + 0.12 * float(i), sin(float(i) * 2.1 + 0.4)));
            vec3 r3 = d - cdir; float rad = length(r3) * 6.0;
            vec3 tg = normalize(cross(cdir, vec3(0.0, 1.0, 0.0))), bt = cross(tg, cdir);
            float ang = atan(dot(r3, bt), dot(r3, tg));
            // sin centro brillante: si no, cada remolino parecía otra luna
            sw += (0.5 + 0.5 * sin(rad * 9.0 - ang * 2.0 + uTime * 0.35)) * exp(-rad * 0.9) * smoothstep(0.15, 1.2, rad);
          }
          night += (vec3(0.95, 0.85, 0.5) * 0.32 + vec3(0.25, 0.4, 0.9) * 0.15) * sw * smoothstep(0.04, 0.3, h);
          vec3 sp = d * 160.0, id = floor(sp);
          float rnd = hash(id.xy + id.z * 17.17);
          float star = step(0.986, rnd) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5)) * (0.6 + 0.4 * sin(uTime * 2.0 + rnd * 40.0));
          night += vec3(1.0, 0.95, 0.75) * star * 5.0 * smoothstep(0.02, 0.15, h);
          float md = max(dot(d, uMoonDir), 0.0);
          night += vec3(1.0, 0.92, 0.6) * smoothstep(0.9986, 0.9992, md) * 9.0;
          night += vec3(1.0, 0.85, 0.5) * (0.5 + 0.5 * sin(acos(md) * 90.0)) * pow(md, 50.0) * 0.55;
          col = mix(col, night, uNight);
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Ondas del lago con frecuencias enteras para que la textura se repita sin costuras
function waveNormals() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  const waves = [[2, 1, 0.7], [1, 3, 0.5], [4, -2, 0.3], [-3, 5, 0.2], [7, 4, 0.12]].map(([kx, kz, a]) => ({ kx, kz, a, ph: Math.random() * 6.28 }));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dx = 0, dz = 0;
    for (const w of waves) { const d = w.a * Math.cos((2 * Math.PI * (w.kx * x + w.kz * y)) / S + w.ph); dx += d * w.kx; dz += d * w.kz; }
    const nx = -dx * 0.06, nz = -dz * 0.06, l = Math.hypot(nx, nz, 1), i = (y * S + x) * 4;
    img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (nz / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function createWorld(renderer, qualityName) {
  const Q = { ...(QUALITY[qualityName] || QUALITY.alta), name: qualityName };
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(FOG.haze.clone(), 0.00021);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.3, 14000);

  // Cielo: sigue a la cámara que lo dibuje (también a la del reflejo del lago)
  const skyMat = skyMaterial(Q);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  sky.onBeforeRender = (r, s, cam) => { sky.position.copy(cam.position); sky.updateMatrixWorld(); };
  scene.add(sky);
  // Luz ambiental del propio cielo: una versión de día y otra de noche, calculadas al cargar
  const env = {};
  {
    const envScene = new THREE.Scene(), envSky = new THREE.Mesh(sky.geometry, skyMat);
    envScene.add(envSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    env.day = pmrem.fromScene(envScene, 0.02).texture;
    skyMat.uniforms.uNight.value = 1;
    env.night = pmrem.fromScene(envScene, 0.02).texture;
    skyMat.uniforms.uNight.value = 0;
    pmrem.dispose();
  }
  scene.environment = env.day;

  const sun = new THREE.DirectionalLight(LIGHT.day.clone(), 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(sun.shadow.camera, { left: -Q.shadowBox, right: Q.shadowBox, top: Q.shadowBox, bottom: -Q.shadowBox, near: 10, far: 2600 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(LIGHT.hemiSky.clone(), LIGHT.hemiGround.clone(), 0.55);
  scene.add(hemi);
  const lightDir = SUN.clone();

  // Desierto infinito
  const sandTex = noiseTexture({ size: 512, kind: 'sand' });
  sandTex.repeat.set(220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
    color: 0xd9a06a, roughness: 0.95, map: sandTex, normalMap: noiseTexture({ size: 256, kind: 'ripples' }), normalScale: new THREE.Vector2(0.6, 0.6),
  }));
  ground.material.normalMap.repeat.set(900, 900);
  ground.receiveShadow = true;
  scene.add(ground);
  const sandMat = ground.material;
  let groundMat = null, envCustom = null, custom = false;
  const base = { exposure: 1, sun: 3, hemi: 0.6, fog: new THREE.Color(), night: 0 };

  // Lago espejo: reflejo real del mundo en Ultra y Altos; en Rendimiento refleja solo el cielo
  const waves = waveNormals(), mirrorHooks = {};
  let lake, water = null;
  if (Q.mirror) {
    water = new Water(new THREE.CircleGeometry(LAKE.r, 96), {
      textureWidth: Q.mirror, textureHeight: Q.mirror, waterNormals: waves, sunDirection: SUN.clone(), sunColor: LIGHT.day.clone(),
      waterColor: 0x0a1c2c, distortionScale: 0.7, fog: true, alpha: 1,
    });
    water.material.uniforms.size.value = 0.5;
    // el reflejo vuelve a dibujar la escena: antes, el juego puede esconder lo que no merece la pena reflejar
    const orig = water.onBeforeRender;
    water.onBeforeRender = (...args) => { mirrorHooks.before?.(); orig.apply(water, args); mirrorHooks.after?.(); };
    lake = water;
  } else {
    waves.repeat.set(36, 36);
    lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 96), new THREE.MeshStandardMaterial({
      color: 0x0f2436, roughness: 0.06, metalness: 0.35, normalMap: waves, normalScale: new THREE.Vector2(0.11, 0.11), envMapIntensity: 1.6,
    }));
    lake.receiveShadow = true;
  }
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE.x, 0.25, LAKE.z);
  scene.add(lake);
  const shore = new THREE.Mesh(new THREE.RingGeometry(LAKE.r - 2, LAKE.r + 22, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0d2a8, roughness: 0.9 }));
  shore.position.set(LAKE.x, 0.12, LAKE.z);
  shore.receiveShadow = true;
  scene.add(shore);

  // Posprocesado: bloom ligero, FXAA, viñeta, saturación y desenfoque radial con la velocidad
  let composer = null, fxaa = null, finalPass = null, dof = null;
  if (Q.post) {
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: Q.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    // profundidad de campo: solo en el modo foto (vuelve a dibujar la escena para sacar la profundidad)
    dof = new BokehPass(scene, camera, { focus: 20, aperture: 0, maxblur: 0.012 });
    dof.enabled = false;
    composer.addPass(dof);
    composer.addPass(new LightBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.5, 1.0));
    composer.addPass(new OutputPass());
    if (!Q.msaa) { fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa); }
    finalPass = new ShaderPass({
      uniforms: { uInk: { value: 0 }, uComic: { value: 0 }, uSpeed: { value: 0 }, uImpact: { value: 0 }, uChroma: { value: 0 }, uPulse: { value: 0 }, uGrainAdd: { value: 0 }, uSat: { value: 1.12 }, uContrast: { value: 1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uGrain: { value: 0 }, uKeepRed: { value: 0 }, uVigMin: { value: 0.74 }, uGT: { value: 0 },
        tDiffuse: { value: null }, uBlur: { value: 0 }, uHeatA: { value: new THREE.Vector4() }, uHeatB: { value: new THREE.Vector4() }, uHeatW: { value: new THREE.Vector2() }, uTime: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur; uniform vec4 uHeatA, uHeatB; uniform vec2 uHeatW; uniform float uTime, uAspect; uniform float uSat, uContrast, uGrain, uKeepRed, uVigMin, uGT, uChroma, uPulse, uGrainAdd, uComic, uSpeed, uImpact, uInk; uniform vec3 uTint; varying vec2 vUv;
        float gHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        // distorsión de calor: un cono que sale de cada tobera, ondulando, más ancho y más flojo cuanto más lejos
        vec2 heat(vec2 uv, vec4 seg) {
          vec2 a = seg.xy, ab = seg.zw - seg.xy;
          float L2 = dot(ab, ab);
          if (L2 < 1e-7) return vec2(0.0);
          float h = clamp(dot(uv - a, ab) / L2, 0.0, 1.0);
          vec2 d = (uv - (a + ab * h)) * vec2(uAspect, 1.0);
          float w = uHeatW.x * (0.5 + h * 1.6);
          float m = smoothstep(w, 0.0, length(d)) * (1.0 - h) * smoothstep(0.0, 0.06, h);
          float n = sin(uv.y * 190.0 + uTime * 26.0 + sin(uv.x * 70.0) * 2.0) * sin(uv.x * 160.0 - uTime * 21.0);
          return vec2(n, n * 0.8) * m * uHeatW.y;
        }
        void main() {
          vec2 c = vUv - 0.5;
          vec2 uvH = vUv;
          if (uHeatW.y > 0.0) uvH += heat(vUv, uHeatA) + heat(vUv, uHeatB);
          vec4 col = texture2D(tDiffuse, uvH);
          // tensión: los colores se separan hacia los bordes
          if (uChroma > 0.0) { vec2 dc = c * uChroma * (0.3 + length(c) * 1.4); col.r = texture2D(tDiffuse, uvH + dc).r; col.b = texture2D(tDiffuse, uvH - dc).b; }
          if (uBlur > 0.002) {
            float k = uBlur * 0.055 * smoothstep(0.12, 0.65, length(c));
            vec3 acc = col.rgb;
            for (int i = 1; i <= 5; i++) acc += texture2D(tDiffuse, vUv - c * k * float(i) / 5.0).rgb;
            col.rgb = acc / 6.0;
          }
          float l = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
          // saturación (los rojos pueden conservar el color aunque el resto vaya a blanco y negro)
          float red = clamp((col.r - max(col.g, col.b)) * 4.0, 0.0, 1.0);
          col.rgb = mix(vec3(l), col.rgb, mix(uSat, 1.3, red * uKeepRed));
          col.rgb = (col.rgb - 0.5) * uContrast + 0.5;
          col.rgb *= uTint;
          if (uGrain + uGrainAdd > 0.0) col.rgb += (gHash(gl_FragCoord.xy + fract(uGT * 7.13) * 917.0) - 0.5) * (uGrain + uGrainAdd);
          col.rgb *= mix(max(0.0, uVigMin - uPulse), 1.0, smoothstep(0.85, 0.28 - uPulse * 0.25, length(c * vec2(1.0, 0.82))));
          // ---- estilo cómic y anime (niveles más difíciles) ----
          if (uComic > 0.0) {
            float r = length(c * vec2(uAspect, 1.0)), edge = smoothstep(0.32, 0.95, r);
            // trama de puntos en los bordes, como la tinta de un cómic impreso
            vec2 g = gl_FragCoord.xy * 0.7071; g = vec2(g.x - g.y, g.x + g.y) / 5.0;
            float lum = dot(col.rgb, vec3(0.3, 0.59, 0.11)), dotR = (1.0 - lum) * 0.62 * edge * uComic;
            float dt = 1.0 - smoothstep(dotR - 0.08, dotR, length(fract(g) - 0.5));
            col.rgb = mix(col.rgb, col.rgb * 0.12, dt * uComic * 0.9);
            // líneas de velocidad de anime: rayas que salen del centro, cambian varias veces por segundo
            float a = atan(c.y, c.x), seed = floor(uGT * 14.0);
            float ray = gHash(vec2(floor(a * 120.0), seed));
            float lineK = step(0.82, ray) * smoothstep(0.28 + (1.0 - uSpeed) * 0.5, 0.9, r) * uSpeed * uComic;
            col.rgb = mix(col.rgb, vec3(1.0), lineK * 0.75);
            // marco de viñeta: borde blanco de papel y línea de tinta, con los bordes un poco inclinados
            vec2 u = vUv;
            float bx = min(u.x - (0.012 + 0.012 * u.y), 1.0 - u.x - (0.012 + 0.010 * (1.0 - u.y)));
            float by = min(u.y - (0.016 + 0.014 * u.x), 1.0 - u.y - (0.016 + 0.012 * (1.0 - u.x)));
            float b = min(bx, by * 1.0);
            float paper = 1.0 - step(0.0, b), ink = step(0.0, b) * (1.0 - step(0.006, b));
            float fr = min(1.0, uComic * 2.5);
            col.rgb = mix(col.rgb, vec3(0.96, 0.93, 0.86), paper * fr);
            col.rgb = mix(col.rgb, vec3(0.03), ink * fr);
          }
          // fuera de la tinta (combate por equipos): blanco y negro duro y la tinta comiéndose los bordes
          if (uInk > 0.0) {
            float lum3 = dot(col.rgb, vec3(0.3, 0.59, 0.11));
            vec3 bw = vec3(smoothstep(0.32, 0.5, lum3)) * 0.92;
            float r2 = length(c * vec2(uAspect, 1.0)), wob = 0.06 * sin(atan(c.y, c.x) * 9.0 + uGT * 3.0) * sin(atan(c.y, c.x) * 5.0 - uGT * 2.0);
            float edge = smoothstep(0.42 + wob, 0.62 + wob, r2);
            col.rgb = mix(col.rgb, bw, uInk * 0.85);
            col.rgb = mix(col.rgb, vec3(0.01), edge * uInk);
            col.rgb += vec3(0.9, 0.05, 0.08) * edge * (1.0 - edge) * 3.0 * uInk * (0.6 + 0.4 * sin(uGT * 8.0));
          }
          // fotograma de impacto (al chocar): blanco y negro de golpe, invertido
          if (uImpact > 0.0) { float lum2 = dot(col.rgb, vec3(0.3, 0.59, 0.11)); col.rgb = mix(col.rgb, vec3(1.0 - step(0.42, lum2)), uImpact); }
          gl_FragColor = col;
        }`,
    });
    composer.addPass(finalPass);
  }

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    const pr = renderer.getPixelRatio();
    if (composer) { composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
    fxaa?.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
  }
  resize();

  const atm = { night: 0, pink: 0 };
  const tmpC = new THREE.Color();
  return {
    scene, camera, quality: Q, sun, resize, atm, lightDir, mirrorHooks,
    render() { composer ? composer.render() : renderer.render(scene, camera); },
    setPixelRatio(pr) { renderer.setPixelRatio(pr); resize(); },
    // Efectos de tensión: chroma (separación de colores), pulse (la viñeta se cierra), grain (grano extra)
    setTension(chroma, pulse, grain) { if (!finalPass) return; const U = finalPass.uniforms; U.uChroma.value = chroma; U.uPulse.value = pulse; U.uGrainAdd.value = grain; },
    // cómic y anime: k (0 a 1) según la dificultad, speed (0 a 1) para las líneas de velocidad, impact (0 a 1) al chocar
    setInk(k) { if (!finalPass) return; const U = finalPass.uniforms.uInk; U.value += (k - U.value) * 0.12; },
    setComic(k, speed, impact) { if (!finalPass) return; const U = finalPass.uniforms; U.uComic.value = k; U.uSpeed.value = speed; U.uImpact.value = impact; },
    setBlur(k) { if (finalPass && Q.blur) finalPass.uniforms.uBlur.value = k; },
    // Calor del escape: a y b son tramos [x0, y0, x1, y1] en coordenadas de pantalla 0..1 (o null); width en pantalla; strength 0 lo apaga
    setHeat(a, b, width, strength, t) {
      if (!finalPass) return;
      const U = finalPass.uniforms;
      U.uHeatW.value.set(width, strength);
      if (!strength) return;
      a ? U.uHeatA.value.set(...a) : U.uHeatA.value.set(0, 0, 0, 0);
      b ? U.uHeatB.value.set(...b) : U.uHeatB.value.set(0, 0, 0, 0);
      U.uTime.value = t; U.uAspect.value = innerWidth / innerHeight;
    },
    // amount 0..1; focus: distancia en metros a lo que sale nítido
    setDof(amount, focus) {
      if (!dof) return false;
      dof.enabled = amount > 0.01;
      dof.uniforms.focus.value = focus;
      dof.uniforms.aperture.value = amount * 0.0006;
      dof.uniforms.maxblur.value = 0.004 + amount * 0.012;
      return true;
    },
    // Ambiente de un mapa (null: el del desierto, con su clima por tramos). a: { sky, sunDir, sunColor, sunIntensity,
    // hemiSky, hemiGround, hemiIntensity, fog: { color, density }, exposure, ground: { color, map, repeat, roughness } | false, grade }
    setMap(a) {
      const U = skyMat.uniforms, G = finalPass?.uniforms;
      custom = !!a;
      if (!a) {
        U.uZenith.value = DAY.zenith; U.uMid.value = DAY.mid; U.uHorizon.value = DAY.horizon; U.uGround.value = DAY.ground; U.uSun.value = DAY.sun;
        U.uCloudCov.value = 0; U.uSunDisc.value = 1; U.uSunDir.value.copy(SUN);
        ground.material = sandMat; ground.visible = true; lake.visible = shore.visible = true;
        hemi.intensity = 0.55; scene.environment = env.day;
        renderer.toneMappingExposure = 1;
        if (G) { G.uSat.value = 1.12; G.uContrast.value = 1; G.uTint.value.set(1, 1, 1); G.uGrain.value = 0; G.uKeepRed.value = 0; G.uVigMin.value = 0.74; }
        atm.night = atm.pink = -1;
        this.setAtmosphere(0, 0);
        return;
      }
      const sk = a.sky || {};
      U.uZenith.value = C(sk.zenith || '#7d8590'); U.uMid.value = C(sk.mid || '#b9bec4'); U.uHorizon.value = C(sk.horizon || '#e8e6e0'); U.uGround.value = C(sk.ground || '#8a8780'); U.uSun.value = C(sk.sun || '#fff4e0');
      U.uNight.value = 0; U.uCloudCov.value = sk.clouds ?? 0; U.uSunDisc.value = sk.sunDisc ?? 1;
      lightDir.set(...(a.sunDir || [0.3, 0.8, -0.4])).normalize();
      U.uSunDir.value.copy(lightDir);
      // luz ambiental a partir de este cielo
      const envScene = new THREE.Scene();
      envScene.add(new THREE.Mesh(sky.geometry, skyMat));
      const pmrem = new THREE.PMREMGenerator(renderer);
      envCustom?.dispose();
      envCustom = pmrem.fromScene(envScene, 0.02).texture;
      pmrem.dispose();
      scene.environment = envCustom;
      sun.color.set(a.sunColor || '#ffffff'); sun.intensity = a.sunIntensity ?? 3;
      hemi.color.set(a.hemiSky || '#c8ccd2'); hemi.groundColor.set(a.hemiGround || '#5a5852'); hemi.intensity = a.hemiIntensity ?? 0.6;
      scene.fog.color.set(a.fog?.color || '#d8d6d0'); scene.fog.density = a.fog?.density ?? 0.0006;
      renderer.toneMappingExposure = a.exposure ?? 1;
      lake.visible = shore.visible = false;
      if (a.ground === false) ground.visible = false;
      else {
        const g = a.ground || {};
        groundMat?.dispose();
        groundMat = new THREE.MeshStandardMaterial({ color: g.color || '#777', roughness: g.roughness ?? 0.9, map: g.map || null });
        if (g.map) { g.map.repeat.set(g.repeat || 400, g.repeat || 400); }
        ground.material = groundMat; ground.visible = true;
      }
      Object.assign(base, { exposure: renderer.toneMappingExposure, sun: sun.intensity, hemi: hemi.intensity, night: 0 });
      base.fog.copy(scene.fog.color);
      if (G) {
        const d = a.grade || {};
        G.uSat.value = d.sat ?? 1.1; G.uContrast.value = d.contrast ?? 1; G.uTint.value.set(...(d.tint || [1, 1, 1])); G.uGrain.value = d.grain ?? 0;
        G.uKeepRed.value = d.keepRed ?? 0; G.uVigMin.value = d.vignette ?? 0.74;
      }
    },
    // Noche en un mapa nuevo (la carrera nocturna de la copa): cielo de noche, menos luz y niebla oscura
    setMapNight(k) {
      if (!custom || Math.abs(k - base.night) < 0.002) return;
      base.night = k;
      skyMat.uniforms.uNight.value = k;
      renderer.toneMappingExposure = base.exposure * (1 - 0.4 * k);
      sun.intensity = base.sun * (1 - 0.75 * k);
      hemi.intensity = base.hemi * (1 - 0.35 * k);
      scene.fog.color.copy(base.fog).lerp(FOG.night, k);
    },
    update(dt, t) {
      skyMat.uniforms.uTime.value = t;
      if (finalPass) finalPass.uniforms.uGT.value = t;
      if (water) water.material.uniforms.time.value += dt * 0.6;
    },
    // Atmósfera por tramos: night 0..1 (tras la puerta), pink 0..1 (niebla rosa del bosque)
    setAtmosphere(night, pink) {
      if (custom) return;
      if (Math.abs(night - atm.night) < 0.002 && Math.abs(pink - atm.pink) < 0.002) return;
      atm.night = night; atm.pink = pink;
      skyMat.uniforms.uNight.value = night;
      scene.fog.color.copy(FOG.haze).lerp(FOG.pink, pink).lerp(FOG.night, night);
      scene.fog.density = 0.00021 + pink * 0.00016 + night * 0.00006;
      sun.color.copy(LIGHT.day).lerp(LIGHT.night, night);
      sun.intensity = 3.1 + (0.95 - 3.1) * night;
      hemi.color.copy(LIGHT.hemiSky).lerp(LIGHT.hemiSkyN, night);
      hemi.groundColor.copy(LIGHT.hemiGround).lerp(LIGHT.hemiGroundN, night);
      lightDir.copy(SUN).lerp(MOON, night).normalize();
      scene.environment = night > 0.5 ? env.night : env.day;
      if (water) {
        water.material.uniforms.sunDirection.value.copy(lightDir);
        water.material.uniforms.sunColor.value.copy(sun.color);
        water.material.uniforms.waterColor.value.copy(tmpC.set(0x0a1c2c).lerp(C('#060a20'), night));
      }
    },
    followSun(target) {
      // la cámara de sombras sigue al jugador, en pasos de 4 m para que las sombras no tiemblen
      const sx = Math.round(target.x / 4) * 4, sy = Math.round(target.y / 4) * 4, sz = Math.round(target.z / 4) * 4;
      sun.target.position.set(sx, sy, sz);
      sun.position.set(sx, sy, sz).addScaledVector(lightDir, 1300);
      sun.target.updateMatrixWorld();
    },
  };
}
