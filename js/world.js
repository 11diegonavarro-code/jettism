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
      uSunDir: { value: SUN.clone() }, uMoonDir: { value: MOON.clone() }, uNight: { value: 0 }, uTime: { value: 0 },
    },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `uniform vec3 uZenith, uMid, uHorizon, uGround, uSun, uSunDir, uMoonDir, nZenith, nMid, nHorizon, nGround;
      uniform float uNight, uTime; varying vec3 vDir;
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
            cov = smoothstep(0.5, 0.78, c) * smoothstep(0.012, 0.14, h);
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
          day += uSun * smoothstep(0.99935, 0.9997, sd) * 26.0 * (1.0 - cov);
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
      uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 }, uHeatA: { value: new THREE.Vector4() }, uHeatB: { value: new THREE.Vector4() }, uHeatW: { value: new THREE.Vector2() }, uTime: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur; uniform vec4 uHeatA, uHeatB; uniform vec2 uHeatW; uniform float uTime, uAspect; varying vec2 vUv;
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
          if (uBlur > 0.002) {
            float k = uBlur * 0.055 * smoothstep(0.12, 0.65, length(c));
            vec3 acc = col.rgb;
            for (int i = 1; i <= 5; i++) acc += texture2D(tDiffuse, vUv - c * k * float(i) / 5.0).rgb;
            col.rgb = acc / 6.0;
          }
          float l = dot(col.rgb, vec3(0.2126, 0.7152, 0.0722));
          col.rgb = mix(vec3(l), col.rgb, 1.12);
          col.rgb *= mix(0.74, 1.0, smoothstep(0.85, 0.28, length(c * vec2(1.0, 0.82))));
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
    update(dt, t) {
      skyMat.uniforms.uTime.value = t;
      if (water) water.material.uniforms.time.value += dt * 0.6;
    },
    // Atmósfera por tramos: night 0..1 (tras la puerta), pink 0..1 (niebla rosa del bosque)
    setAtmosphere(night, pink) {
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
