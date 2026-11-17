// Lo que se ve del mapa: torres de cera, acantilado con cajones y contrafuerte, escaleras, péndulos, la puerta,
// los puentes de papel, la ballena, el tren, las térmicas, los peñascos, las mesetas del horizonte y las puertas
// del recorrido. Se construye a partir de los datos de track.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture, checkerTexture, paperTexture } from './textures.js';
import { CLIFF_FACE_Z, BUTTRESS } from './track.js';
import { rng } from './math.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
const UPV = new THREE.Vector3(0, 1, 0), ZV = new THREE.Vector3(0, 0, 1);

// Desplaza los vértices un poco para que la roca no parezca un sólido perfecto
function roughen(geo, amount, seed = 1) {
  const R = rng(seed), pos = geo.attributes.position, seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    if (!seen.has(k)) seen.set(k, [(R() - 0.5) * amount, (R() - 0.5) * amount * 0.6, (R() - 0.5) * amount]);
    const [dx, dy, dz] = seen.get(k);
    pos.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
  }
  geo.computeVertexNormals();
  return geo;
}
const boxMesh = (c, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(c.h.x * 2, c.h.y * 2, c.h.z * 2), mat);
  m.position.copy(v3(c.c)); m.rotation.y = c.yaw || 0;
  return m;
};

export class CourseView {
  constructor(scene, track, quality) {
    this.track = track; this.quality = quality;
    this.group = new THREE.Group();
    scene.add(this.group);
    const marbleTex = noiseTexture({ size: 512, kind: 'marble' });
    // Materiales estándar: los «physical» (barniz, brillo) costaban un 25 % de fps en la gráfica integrada
    this.mat = {
      marble: new THREE.MeshStandardMaterial({ map: marbleTex, roughness: 0.3, envMapIntensity: 1.2 }),
      rock: new THREE.MeshStandardMaterial({ map: noiseTexture({ size: 512, kind: 'rock' }), normalMap: noiseTexture({ size: 512, kind: 'rockNormal' }), roughness: 0.92 }),
      sandTop: new THREE.MeshStandardMaterial({ color: 0xe0ad74, roughness: 0.95 }),
      wood: new THREE.MeshStandardMaterial({ map: noiseTexture({ size: 256, kind: 'wood' }), roughness: 0.6 }),
      woodFront: new THREE.MeshStandardMaterial({ color: 0x8a5634, roughness: 0.4 }),
      hole: new THREE.MeshBasicMaterial({ color: 0x120a06 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xd9ab52, metalness: 1, roughness: 0.22 }),
      doorFrame: new THREE.MeshStandardMaterial({ color: 0xf1e4cf, roughness: 0.4 }),
      doorLeaf: new THREE.MeshStandardMaterial({ color: 0x2f62b8, roughness: 0.3 }),
      whale: new THREE.MeshStandardMaterial({ color: 0xc9d6ef, roughness: 0.5 }),
      whaleBelly: new THREE.MeshStandardMaterial({ color: 0xf6efe6, roughness: 0.6 }),
      paper: new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 0.85, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ color: 0x24202a, metalness: 0.7, roughness: 0.45 }),
      trainRed: new THREE.MeshStandardMaterial({ color: 0x9e2a2b, metalness: 0.3, roughness: 0.4 }),
      trainCream: new THREE.MeshStandardMaterial({ color: 0xf0e2c4, roughness: 0.5 }),
    };
    // copias de la roca con otra repetición para piezas de distinto tamaño
    this.mat.rockSmall = this.mat.rock.clone();
    this.mat.rockSmall.map = this.mat.rock.map.clone(); this.mat.rockSmall.map.repeat.set(2, 1); this.mat.rockSmall.map.needsUpdate = true;
    this.mat.rockSmall.normalMap = this.mat.rock.normalMap.clone(); this.mat.rockSmall.normalMap.repeat.set(2, 1); this.mat.rockSmall.normalMap.needsUpdate = true;
    this.movers = [];
    this.thermalMat = null;
    this.buildStatics();
    this.buildMovers();
    this.buildGates();
    this.buildThermals();
    this.buildHorizon();
  }

  buildStatics() {
    const T = this.track, towerGeos = [], rockGeos = [], capGeos = [];
    for (const d of T.decor) {
      if (d.kind === 'tower') {
        const curve = new THREE.CatmullRomCurve3(d.pts.map(v3));
        towerGeos.push(new THREE.TubeGeometry(curve, 20, d.r, 12, false));
        const top = d.pts[d.pts.length - 1];
        // llama de cera en lo alto, base que se derrite en un charco, y gotas que chorrean
        towerGeos.push(new THREE.SphereGeometry(d.r * 1.25, 14, 10).scale(1, 1.6, 1).translate(top.x, top.y, top.z));
        towerGeos.push(new THREE.CylinderGeometry(d.r * 1.05, d.r * 2.2, 26, 14, 1, true).translate(d.pts[0].x, 13, d.pts[0].z));
        towerGeos.push(new THREE.SphereGeometry(d.r * 3.2, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.16, 1).translate(d.pts[0].x, 0, d.pts[0].z));
        for (const dr of d.drips) {
          const p = curve.getPoint(dr.h), len = d.r * (1.4 + dr.l * 2.2);
          towerGeos.push(new THREE.SphereGeometry(d.r * 0.38, 10, 8).scale(1, len / (d.r * 0.38) / 2, 1)
            .translate(p.x + Math.cos(dr.a) * d.r * 0.92, p.y - len / 2, p.z + Math.sin(dr.a) * d.r * 0.92));
        }
      } else if (d.kind === 'platform') {
        const c = d.col;
        const box = new THREE.Mesh(new THREE.BoxGeometry(c.h.x * 2, c.h.y * 2, c.h.z * 2), this.mat.marble);
        box.position.copy(v3(c.c));
        box.castShadow = box.receiveShadow = true;
        // línea de salida a cuadros
        const line = new THREE.Mesh(new THREE.PlaneGeometry(c.h.x * 2, 4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: checkerTexture(16), roughness: 0.6 }));
        line.material.map.repeat.set(4, 0.25);
        line.position.set(c.c.x, c.c.y + c.h.y + 0.05, c.c.z - c.h.z + 22);
        this.group.add(box, line);
        // peñasco que la sostiene flotando sobre el lago, y piedrecitas alrededor
        rockGeos.push(roughen(new THREE.ConeGeometry(34, 36, 11, 3).rotateX(Math.PI), 4, 3).translate(c.c.x, c.c.y - c.h.y - 18, c.c.z));
        const R = rng(11);
        for (let k = 0; k < 9; k++) {
          const a = R() * Math.PI * 2, r = 45 + R() * 30, s = 2 + R() * 4;
          rockGeos.push(roughen(new THREE.IcosahedronGeometry(s, 0), s * 0.4, k).translate(c.c.x + Math.cos(a) * r, 8 + R() * 22, c.c.z + Math.sin(a) * r));
        }
      } else if (d.kind === 'cliff') {
        const c = d.col, geo = new THREE.BoxGeometry(c.h.x * 2, c.h.y * 2, c.h.z * 2, 1, 1, 1);
        const mats = [this.mat.rock, this.mat.rock, this.mat.sandTop, this.mat.rock, this.mat.rock, this.mat.rock];
        this.mat.rock.map.repeat.set(12, 1.1); this.mat.rock.normalMap.repeat.set(12, 1.1);
        const cliff = new THREE.Mesh(geo, mats);
        cliff.position.copy(v3(c.c));
        cliff.castShadow = cliff.receiveShadow = true;
        this.group.add(cliff);
      } else if (d.kind === 'buttress') {
        // contrafuerte de roca con el cajón gigante atravesándolo (el atajo)
        for (const c of d.rock) { const m = boxMesh(c, this.mat.rockSmall); m.castShadow = m.receiveShadow = true; this.group.add(m); }
        for (const c of d.wood) { const m = boxMesh(c, this.mat.wood); m.castShadow = m.receiveShadow = true; this.group.add(m); }
        const B = BUTTRESS, Tn = B.tunnel, fw = 5;
        for (const x of [B.x0 - B.over, B.x1 + B.over]) {
          // marco del frente del cajón, con su tirador dorado encima de la boca
          const cy = (Tn.y0 + Tn.y1) / 2, cz = (Tn.z0 + Tn.z1) / 2, hy = (Tn.y1 - Tn.y0) / 2 + B.wood + fw, hz = (Tn.z1 - Tn.z0) / 2 + B.wood + fw;
          for (const [yy, h] of [[cy + hy - fw / 2, fw], [cy - hy + fw / 2, fw]]) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(3, h, hz * 2), this.mat.woodFront); m.position.set(x, yy, cz); this.group.add(m);
          }
          for (const zz of [cz + hz - fw / 2, cz - hz + fw / 2]) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(3, hy * 2, fw), this.mat.woodFront); m.position.set(x, cy, zz); this.group.add(m);
          }
          const knob = new THREE.Mesh(new THREE.SphereGeometry(3.5, 16, 12), this.mat.gold);
          knob.position.set(x + (x < B.x0 ? -3 : 3), cy + hy + 4, cz);
          this.group.add(knob);
        }
      } else if (d.kind === 'door') {
        const g = new THREE.Group();
        g.position.copy(v3(d.p)); g.rotation.y = d.yaw;
        for (const sd of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(12, (d.tall + 6) * 2, 12), this.mat.doorFrame);
          post.position.x = sd * (d.half + 6);
          const bar = new THREE.Mesh(new THREE.BoxGeometry((d.half + 12) * 2, 12, 12), this.mat.doorFrame);
          bar.position.y = sd * (d.tall + 6);
          g.add(post, bar);
        }
        // un velo oscuro y estrellado dentro del marco: al otro lado ya es de noche
        const veil = new THREE.Mesh(new THREE.PlaneGeometry(d.half * 2, d.tall * 2), new THREE.ShaderMaterial({
          uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending,
          vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform float uTime; varying vec2 vUv;
            float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            void main() {
              vec2 c = vUv - 0.5; float r = length(c), a = atan(c.y, c.x);
              float swirl = 0.5 + 0.5 * sin(r * 28.0 - a * 3.0 - uTime * 1.5);
              vec2 g = floor(vUv * vec2(60.0, 90.0)); float st = step(0.97, h(g)) * (0.6 + 0.4 * sin(uTime * 3.0 + h(g) * 20.0));
              vec3 col = vec3(0.12, 0.18, 0.55) * swirl + vec3(1.0, 0.9, 0.6) * st * 2.0;
              float edge = smoothstep(0.5, 0.35, max(abs(c.x), abs(c.y)));
              gl_FragColor = vec4(col * edge * 0.55, 1.0);
            }`,
        }));
        veil.userData.noShadow = true;
        g.add(veil);
        this.doorVeil = veil;
        g.traverse(o => { if (o.isMesh && o !== veil) o.castShadow = o.receiveShadow = true; });
        this.group.add(g);
        const L = d.leaf, leaf = boxMesh(L, this.mat.doorLeaf);
        leaf.castShadow = leaf.receiveShadow = true;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), this.mat.gold);
        knob.position.set(L.h.x - 8, 0, L.h.z + 2);
        leaf.add(knob);
        this.group.add(leaf);
      } else if (d.kind === 'rail') {
        // raíl suspendido de hierro con traviesas doradas
        const len = d.xB - d.xA;
        const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, 2.8), this.mat.iron);
        beam.position.set((d.xA + d.xB) / 2, d.yR - 6, d.zR);
        beam.castShadow = true;
        this.group.add(beam);
        const n = Math.floor(len / 8), sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 0.5, 5), this.mat.gold, n);
        const mm = new THREE.Matrix4();
        for (let k = 0; k < n; k++) sleepers.setMatrixAt(k, mm.makeTranslation(d.xA + 4 + k * 8, d.yR - 5.2, d.zR));
        this.group.add(sleepers);
      } else if (d.kind === 'floatRock') {
        // isla flotante: arena plana encima y roca en punta debajo
        const g = roughen(new THREE.ConeGeometry(d.r, d.r * 1.9, 9, 3).rotateX(Math.PI), d.r * 0.22, Math.floor(d.seed * 1000)).translate(d.c.x, d.c.y - d.r * 0.95, d.c.z);
        rockGeos.push(g);
        capGeos.push(new THREE.SphereGeometry(d.r, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.22, 1).translate(d.c.x, d.c.y, d.c.z));
      }
    }
    // las torres usan su propia copia de la textura, repetida a lo largo
    const towerMat = this.mat.marble.clone();
    towerMat.map = this.mat.marble.map.clone();
    towerMat.map.repeat.set(9, 1);
    towerMat.map.needsUpdate = true;
    const towers = new THREE.Mesh(mergeGeometries(towerGeos.map(g => g.index ? g.toNonIndexed() : g)), towerMat);
    towers.castShadow = towers.receiveShadow = true;
    this.group.add(towers);
    if (rockGeos.length) {
      const rocks = new THREE.Mesh(mergeGeometries(rockGeos.map(g => (g.index ? g.toNonIndexed() : g))), this.mat.rockSmall);
      rocks.castShadow = rocks.receiveShadow = true;
      this.group.add(rocks);
    }
    if (capGeos.length) {
      const caps = new THREE.Mesh(mergeGeometries(capGeos), this.mat.sandTop);
      caps.castShadow = caps.receiveShadow = true;
      this.group.add(caps);
    }
  }

  buildMovers() {
    for (const m of this.track.movers) {
      let obj;
      if (m.kind === 'drawer') {
        obj = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(m.w * 2, m.hh * 2, m.depth * 2), this.mat.wood);
        const front = new THREE.Mesh(new THREE.BoxGeometry(m.w * 2 + 3, m.hh * 2 + 3, 2), this.mat.woodFront);
        front.position.z = m.depth + 1;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 10), this.mat.gold);
        knob.position.z = m.depth + 3;
        obj.add(body, front, knob);
        const hole = new THREE.Mesh(new THREE.PlaneGeometry(m.w * 2 + 2, m.hh * 2 + 2), this.mat.hole);
        hole.position.set(m.x, m.y, CLIFF_FACE_Z + 0.3);
        this.group.add(hole);
      } else if (m.kind === 'stairs') {
        obj = new THREE.Group();
        for (let j = 0; j < m.steps; j++) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(m.run, 4, 30), this.mat.marble);
          st.position.set((j - (m.steps - 1) / 2) * m.run, (j - (m.steps - 1) / 2) * m.rise, 0);
          obj.add(st);
        }
      } else if (m.kind === 'pendulum') {
        obj = new THREE.Group();
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1, 10), this.mat.gold);
        const bob = new THREE.Mesh(new THREE.SphereGeometry(15, 32, 20), this.mat.gold);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 2, 10, 32), this.mat.gold);
        ring.position.copy(v3(m.pivot));
        obj.add(rod, bob);
        this.group.add(ring);
        obj.userData = { rod, bob };
      } else if (m.kind === 'bridge') {
        // dos hojas de papel con pliegues que suben y bajan
        obj = new THREE.Group();
        obj.userData.leaves = m.cols.map(() => {
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(m.Lf, 1.6, m.wide * 2), this.mat.paper);
          leaf.matrixAutoUpdate = false;
          obj.add(leaf);
          return leaf;
        });
      } else if (m.kind === 'train') {
        obj = new THREE.Group();
        obj.userData.cars = m.cols.map((c, k) => {
          const car = new THREE.Group();
          if (k === 0) {
            const boiler = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 11, 18).rotateZ(Math.PI / 2), this.mat.iron);
            boiler.position.set(2.5, 0.5, 0);
            const cab = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 7), this.mat.trainRed);
            cab.position.set(-5.5, 1, 0);
            const roof = new THREE.Mesh(new THREE.BoxGeometry(6, 0.8, 8), this.mat.iron);
            roof.position.set(-5.5, 5.3, 0);
            const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.9, 4, 12), this.mat.iron);
            chimney.position.set(6.5, 5, 0);
            const band = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.8, 18).rotateZ(Math.PI / 2), this.mat.gold);
            band.position.set(6, 0.5, 0);
            car.add(boiler, cab, roof, chimney, band);
          } else {
            const body = new THREE.Mesh(new THREE.BoxGeometry(16, 7, 6.6), this.mat.trainCream);
            const stripe = new THREE.Mesh(new THREE.BoxGeometry(16.1, 1.2, 6.7), this.mat.trainRed);
            stripe.position.y = -1.5;
            const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 16.2, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), this.mat.trainRed);
            roof.position.y = 3.4;
            car.add(body, stripe, roof);
          }
          for (const x of [-5, 5]) for (const z of [-3.2, 3.2]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.8, 12).rotateX(Math.PI / 2), this.mat.iron);
            wheel.position.set(x, -c.h.y + 1.2, z);
            car.add(wheel);
          }
          obj.add(car);
          return car;
        });
      } else if (m.kind === 'whale') {
        obj = new THREE.Group();
        const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24).scale(30, 26, 100), this.mat.whale);
        const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45).scale(29, 25.5, 97), this.mat.whaleBelly);
        belly.position.y = -0.6;
        const tail = new THREE.Group();
        const fluke = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10).scale(42, 3.5, 14), this.mat.whale);
        fluke.position.z = -16;
        tail.add(fluke);
        tail.position.z = -95;
        const fins = [-1, 1].map(sd => {
          const f = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8).scale(26, 2.5, 9), this.mat.whale);
          f.position.set(sd * 36, -10, 22); f.rotation.z = sd * 0.35; f.rotation.y = sd * -0.4;
          return f;
        });
        const eyes = [-1, 1].map(sd => {
          const e = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 8), new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.2 }));
          e.position.set(sd * 22, 4, 62);
          return e;
        });
        obj.add(body, belly, tail, ...fins, ...eyes);
        obj.userData = { tail, fins };
      }
      if (!obj) continue;
      obj.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
      this.group.add(obj);
      this.movers.push({ m, obj });
    }
  }

  // Puertas y anillos de turbo del circuito actual (se rehacen al cambiar de circuito)
  buildGates() {
    const glow = (c, k) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c), emissiveIntensity: k, roughness: 0.4, metalness: 0.2 });
    if (!this.gateMat) {
      this.gateMat = { next: glow('#3ee8ff', 4.5), after: glow('#fff2d6', 1.6), idle: glow('#d9ab52', 0.35), start: glow('#ffffff', 2.2) };
      this.boostMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color('#ff8a2a'), emissiveIntensity: 5, roughness: 0.4 });
      this.boostDisc = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a40').multiplyScalar(0.6), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending });
    }
    if (this.courseGroup) {
      this.courseGroup.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
      this.group.remove(this.courseGroup);
    }
    this.courseGroup = new THREE.Group();
    this.group.add(this.courseGroup);
    this.gates = this.track.gates.map(g => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(g.ring, g.i === 0 ? 1.6 : 1.0, 12, 72), g.i === 0 ? this.gateMat.start : this.gateMat.idle);
      m.position.copy(v3(g.p));
      m.quaternion.setFromUnitVectors(ZV, v3(g.t).normalize());
      this.courseGroup.add(m);
      return m;
    });
    const bm = this.boostMat, disc = this.boostDisc;
    this.boostRings = this.track.boostRings.map(r => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(r.r, 0.7, 10, 48), bm));
      g.add(new THREE.Mesh(new THREE.CircleGeometry(r.r - 0.5, 40), disc));
      g.position.copy(v3(r.p));
      g.quaternion.setFromUnitVectors(ZV, v3(r.t).normalize());
      this.courseGroup.add(g);
      return g;
    });
  }

  // Columnas de aire caliente que suben (se ven como un brillo que asciende)
  buildThermals() {
    this.thermalMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffb070') } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float streak = 0.5 + 0.5 * sin(vUv.x * 50.0 + sin(vUv.y * 9.0 + uTime * 0.8) * 2.5);
          float rise = fract(vUv.y * 4.0 - uTime * 0.45);
          float a = streak * smoothstep(0.0, 0.35, rise) * smoothstep(1.0, 0.55, rise);
          a *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          gl_FragColor = vec4(uColor * a * 0.32, 1.0);
        }`,
    });
    for (const th of this.track.thermals) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(th.r * 1.15, th.r * 0.8, th.top, 28, 1, true), this.thermalMat);
      m.position.set(th.c.x, th.top / 2, th.c.z);
      this.group.add(m);
    }
  }

  // Mesetas en el horizonte (se ven entre la calima; no se llega a ellas)
  buildHorizon() {
    const R = rng(91), geos = [], cx = 500, cz = -900;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + (R() - 0.5) * 0.25, d = 2800 + R() * 2400;
      const r = 160 + R() * 280, h = 120 + R() * 300;
      const g = roughen(new THREE.CylinderGeometry(r * 0.85, r * 1.15, h, 9, 2), r * 0.12, i).translate(cx + Math.cos(a) * d, h / 2 - 5, cz + Math.sin(a) * d);
      geos.push(g.index ? g.toNonIndexed() : g);
    }
    const mat = this.mat.rock.clone();
    mat.map = this.mat.rock.map.clone(); mat.map.repeat.set(3, 1); mat.map.needsUpdate = true;
    mat.normalMap = null;
    const mesas = new THREE.Mesh(mergeGeometries(geos), mat);
    mesas.receiveShadow = true;
    this.group.add(mesas);
  }

  // Resalta la siguiente puerta (cian) y la de después (blanca)
  setNextGate(i) {
    const n = this.gates.length;
    this.gates.forEach((m, k) => {
      m.material = k === i ? this.gateMat.next : k === (i + 1) % n ? this.gateMat.after : k === 0 ? this.gateMat.start : this.gateMat.idle;
    });
  }

  // Chimenea de la locomotora (para el vapor) o null si el tren está escondido en las nubes
  trainChimney() {
    const t = this.movers.find(x => x.m.kind === 'train');
    if (!t) return null;
    const m = t.m;
    if (m.head < m.xA - 20 || m.head > m.xB + 20) return null;
    return new THREE.Vector3(m.head + 6.5, m.yR + 2.5, m.zR);
  }

  update(t) {
    const tmp = new THREE.Vector3(), mtx = new THREE.Matrix4();
    for (const { m, obj } of this.movers) {
      if (m.kind === 'drawer') obj.position.copy(v3(m.cols[0].c));
      else if (m.kind === 'stairs') { obj.position.copy(v3(m.pos)); obj.rotation.y = m.yaw; }
      else if (m.kind === 'pendulum') {
        const { rod, bob } = obj.userData, a = v3(m.pivot), b = v3(m.bob);
        bob.position.copy(b);
        rod.position.copy(a).add(b).multiplyScalar(0.5);
        tmp.subVectors(b, a);
        rod.scale.set(1, tmp.length(), 1);
        rod.quaternion.setFromUnitVectors(UPV, tmp.normalize());
      } else if (m.kind === 'bridge') {
        m.cols.forEach((c, k) => {
          const leaf = obj.userData.leaves[k];
          leaf.matrix.makeBasis(v3(c.ax), v3(c.ay), v3(c.az)).setPosition(c.c.x, c.c.y, c.c.z);
        });
      } else if (m.kind === 'train') {
        m.cols.forEach((c, k) => { obj.userData.cars[k].position.set(c.c.x, c.c.y, c.c.z); });
      } else if (m.kind === 'whale') {
        obj.position.copy(v3(m.pos));
        obj.rotation.y = m.yaw;
        obj.userData.tail.rotation.x = m.sway * 0.25;
        obj.userData.fins.forEach((f, k) => { f.rotation.x = Math.sin(t * 1.2 + k) * 0.15; });
      }
    }
    for (const g of this.boostRings) g.children[1].rotation.z = t * 2;
    if (this.thermalMat) this.thermalMat.uniforms.uTime.value = t;
    if (this.doorVeil) this.doorVeil.material.uniforms.uTime.value = t;
  }
}
