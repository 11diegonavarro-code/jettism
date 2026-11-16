// Escena base: cielo de atardecer pintado por código, sol con sombras largas, desierto, lago espejo y posprocesado.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { LAKE } from './track.js';
import { noiseTexture } from './textures.js';

export const QUALITY = {
  ultra: { shadow: 4096, shadowBox: 230, msaa: 4, post: true, maxRatio: 2, particles: 1600, blur: true },
  alta: { shadow: 2048, shadowBox: 170, msaa: 0, post: true, maxRatio: 1.5, particles: 1100, blur: true },
  baja: { shadow: 1024, shadowBox: 120, msaa: 0, post: false, maxRatio: 1, particles: 600, blur: false },
};

// Sol bajo de atardecer, por delante a la izquierda de la salida
export const SUN = new THREE.Vector3(-0.55, 0.16, -0.82).normalize();
const SKY = { zenith: '#262a6b', mid: '#a4548a', horizon: '#ffb168', ground: '#d68a5a', sun: '#ffd09a' };
export const FOG_COLOR = new THREE.Color('#e49a70');

class LightBloomPass extends UnrealBloomPass {
  setSize(w, h) { super.setSize(Math.max(2, w / 2), Math.max(2, h / 2)); } // a 1/4 de resolución
}

function skyMaterial() {
  const c = k => new THREE.Color(SKY[k]);
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: c('zenith') }, uMid: { value: c('mid') }, uHorizon: { value: c('horizon') },
      uGround: { value: c('ground') }, uSun: { value: c('sun') }, uSunDir: { value: SUN.clone() },
    },
    vertexShader: `varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `uniform vec3 uZenith, uMid, uHorizon, uGround, uSun, uSunDir; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.24, h));
        col = mix(col, uZenith, smoothstep(0.2, 0.9, h));
        col = mix(col, uGround, smoothstep(0.0, -0.1, h));
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(sd, 5.0) * 0.45 + pow(sd, 40.0) * 1.1) * (1.0 - smoothstep(0.1, 0.7, h) * 0.6);
        col += uSun * smoothstep(0.99935, 0.9997, sd) * 26.0;
        // pinceladas suaves, como un cielo pintado
        float az = atan(d.z, d.x);
        float band = sin(h * 46.0 + sin(az * 3.0 + h * 9.0) * 1.7 + sin(az * 11.0) * 0.25);
        col *= 1.0 + 0.04 * band * smoothstep(0.02, 0.25, h) * (1.0 - smoothstep(0.5, 0.95, h));
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
  scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00021);
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.3, 14000);

  // Cielo y luz ambiental a partir del mismo cielo
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), skyMaterial());
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  {
    const envScene = new THREE.Scene(), envSky = new THREE.Mesh(sky.geometry, sky.material);
    envScene.add(envSky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();
  }

  const sun = new THREE.DirectionalLight(0xffc48a, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  Object.assign(sun.shadow.camera, { left: -Q.shadowBox, right: Q.shadowBox, top: Q.shadowBox, bottom: -Q.shadowBox, near: 10, far: 2600 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0x8f86d6, 0xb87a52, 0.55));

  // Desierto infinito
  const sandTex = noiseTexture({ size: 512, kind: 'sand' });
  sandTex.repeat.set(220, 220);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
    color: 0xd9a06a, roughness: 0.95, map: sandTex, normalMap: noiseTexture({ size: 256, kind: 'ripples' }), normalScale: new THREE.Vector2(0.6, 0.6),
  }));
  ground.material.normalMap.repeat.set(900, 900);
  ground.receiveShadow = true;
  scene.add(ground);

  // Lago espejo (de momento refleja el cielo; el reflejo real llega en la parte 2)
  // ondas grandes y suaves, con filtro anisótropo: con muchas repeticiones el lago hacía moiré a lo lejos
  const waves = waveNormals();
  waves.repeat.set(36, 36);
  waves.anisotropy = 8;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
    color: 0x0f2436, roughness: 0.06, metalness: 0.35, normalMap: waves, normalScale: new THREE.Vector2(0.11, 0.11), envMapIntensity: 1.6,
  }));
  lake.position.set(LAKE.x, 0.25, LAKE.z);
  lake.receiveShadow = true;
  scene.add(lake);
  // orilla clara alrededor
  const shore = new THREE.Mesh(new THREE.RingGeometry(LAKE.r - 2, LAKE.r + 22, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0d2a8, roughness: 0.9 }));
  shore.position.set(LAKE.x, 0.12, LAKE.z);
  shore.receiveShadow = true;
  scene.add(shore);

  // Posprocesado: bloom ligero, FXAA, viñeta, saturación y desenfoque radial con la velocidad
  let composer = null, fxaa = null, finalPass = null;
  if (Q.post) {
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: Q.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new LightBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.5, 1.0));
    composer.addPass(new OutputPass());
    if (!Q.msaa) { fxaa = new ShaderPass(FXAAShader); composer.addPass(fxaa); }
    finalPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uBlur: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uBlur; varying vec2 vUv;
        void main() {
          vec2 c = vUv - 0.5;
          vec4 col = texture2D(tDiffuse, vUv);
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

  return {
    scene, camera, quality: Q, sun, resize,
    render() {
      sky.position.copy(camera.position);
      composer ? composer.render() : renderer.render(scene, camera);
    },
    setPixelRatio(pr) { renderer.setPixelRatio(pr); resize(); },
    setBlur(k) { if (finalPass && Q.blur) finalPass.uniforms.uBlur.value = k; },
    followSun(target) {
      // la cámara de sombras sigue al jugador, en pasos de 4 m para que las sombras no tiemblen
      const sx = Math.round(target.x / 4) * 4, sy = Math.round(target.y / 4) * 4, sz = Math.round(target.z / 4) * 4;
      sun.target.position.set(sx, sy, sz);
      sun.position.set(sx, sy, sz).addScaledVector(SUN, 1300);
      sun.target.updateMatrixWorld();
    },
  };
}
