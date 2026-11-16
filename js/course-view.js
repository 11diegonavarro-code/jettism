// Lo que se ve del mapa: torres, acantilado con cajones, escaleras, péndulos, la puerta, la ballena,
// la plataforma y las puertas del recorrido. Se construye a partir de los datos de track.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { noiseTexture, checkerTexture } from './textures.js';
import { CLIFF_FACE_Z } from './track.js';

const v3 = p => new THREE.Vector3(p.x, p.y, p.z);
const UPV = new THREE.Vector3(0, 1, 0), ZV = new THREE.Vector3(0, 0, 1);

export class CourseView {
  constructor(scene, track) {
    this.track = track;
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
    };
    this.movers = [];
    this.buildStatics();
    this.buildMovers();
    this.buildGates();
  }

  buildStatics() {
    const T = this.track, towerGeos = [];
    for (const d of T.decor) {
      if (d.kind === 'tower') {
        const curve = new THREE.CatmullRomCurve3(d.pts.map(v3));
        towerGeos.push(new THREE.TubeGeometry(curve, 20, d.r, 12, false));
        // gota de cera en lo alto y base más ancha
        const top = d.pts[d.pts.length - 1];
        towerGeos.push(new THREE.SphereGeometry(d.r * 1.25, 14, 10).scale(1, 1.6, 1).translate(top.x, top.y, top.z));
        towerGeos.push(new THREE.CylinderGeometry(d.r * 1.05, d.r * 2.2, 26, 14, 1, true).translate(d.pts[0].x, 13, d.pts[0].z));
      } else if (d.kind === 'platform') {
        const c = d.col;
        const box = new THREE.Mesh(new THREE.BoxGeometry(c.h.x * 2, c.h.y * 2, c.h.z * 2), this.mat.marble);
        box.position.copy(v3(c.c));
        box.castShadow = box.receiveShadow = true;
        // línea de salida a cuadros
        const line = new THREE.Mesh(new THREE.PlaneGeometry(c.h.x * 2, 4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: checkerTexture(16), roughness: 0.6 }));
        line.material.map.repeat.set(4, 0.25);
        line.position.set(c.c.x, c.c.y + c.h.y + 0.05, c.c.z - c.h.z + 22);
        // pilar que la sostiene sobre el lago, estrechándose hacia abajo
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(9, 3, c.c.y - c.h.y, 24), this.mat.marble);
        pillar.position.set(c.c.x, (c.c.y - c.h.y) / 2, c.c.z);
        pillar.castShadow = true;
        this.group.add(box, line, pillar);
      } else if (d.kind === 'cliff') {
        const c = d.col, geo = new THREE.BoxGeometry(c.h.x * 2, c.h.y * 2, c.h.z * 2, 1, 1, 1);
        // estratos más finos en la cara grande
        const mats = [this.mat.rock, this.mat.rock, this.mat.sandTop, this.mat.rock, this.mat.rock, this.mat.rock];
        this.mat.rock.map.repeat.set(12, 1.1); this.mat.rock.normalMap.repeat.set(12, 1.1);
        const cliff = new THREE.Mesh(geo, mats);
        cliff.position.copy(v3(c.c));
        cliff.castShadow = cliff.receiveShadow = true;
        this.group.add(cliff);
      } else if (d.kind === 'door') {
        const g = new THREE.Group();
        g.position.copy(v3(d.p)); g.rotation.y = d.yaw;
        const frame = this.mat.doorFrame;
        for (const sd of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(12, (d.tall + 6) * 2, 12), frame);
          post.position.x = sd * (d.half + 6);
          g.add(post);
        }
        for (const sd of [-1, 1]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry((d.half + 12) * 2, 12, 12), frame);
          bar.position.y = sd * (d.tall + 6);
          g.add(bar);
        }
        // pomo dorado en la hoja
        g.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
        this.group.add(g);
        const L = d.leaf, leaf = new THREE.Mesh(new THREE.BoxGeometry(L.h.x * 2, L.h.y * 2, L.h.z * 2), this.mat.doorLeaf);
        leaf.position.copy(v3(L.c)); leaf.rotation.y = L.yaw;
        leaf.castShadow = leaf.receiveShadow = true;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), this.mat.gold);
        knob.position.set(L.h.x - 8, 0, L.h.z + 2);
        leaf.add(knob);
        this.group.add(leaf);
      }
    }
    // las torres usan su propia copia de la textura, repetida a lo largo
    const towerMat = this.mat.marble.clone();
    towerMat.map = this.mat.marble.map.clone();
    towerMat.map.repeat.set(9, 1);
    towerMat.map.needsUpdate = true;
    const towers = new THREE.Mesh(mergeGeometries(towerGeos), towerMat);
    towers.castShadow = towers.receiveShadow = true;
    this.group.add(towers);
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
        // hueco oscuro en la pared
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

  buildGates() {
    const glow = (c, k) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(c), emissiveIntensity: k, roughness: 0.4, metalness: 0.2 });
    this.gateMat = { next: glow('#3ee8ff', 4.5), after: glow('#fff2d6', 1.6), idle: glow('#d9ab52', 0.35), start: glow('#ffffff', 2.2) };
    this.gates = this.track.gates.map(g => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(g.ring, g.i === 0 ? 1.6 : 1.0, 12, 72), g.i === 0 ? this.gateMat.start : this.gateMat.idle);
      m.position.copy(v3(g.p));
      m.quaternion.setFromUnitVectors(ZV, v3(g.t).normalize());
      this.group.add(m);
      return m;
    });
    const bm = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color('#ff8a2a'), emissiveIntensity: 5, roughness: 0.4 });
    const disc = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a40').multiplyScalar(0.6), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.boostRings = this.track.boostRings.map(r => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TorusGeometry(r.r, 0.7, 10, 48), bm));
      g.add(new THREE.Mesh(new THREE.CircleGeometry(r.r - 0.5, 40), disc));
      g.position.copy(v3(r.p));
      g.quaternion.setFromUnitVectors(ZV, v3(r.t).normalize());
      this.group.add(g);
      return g;
    });
  }

  // Resalta la siguiente puerta (cian) y la de después (blanca)
  setNextGate(i) {
    const n = this.gates.length;
    this.gates.forEach((m, k) => {
      m.material = k === i ? this.gateMat.next : k === (i + 1) % n ? this.gateMat.after : k === 0 ? this.gateMat.start : this.gateMat.idle;
    });
  }

  update(t) {
    const tmp = new THREE.Vector3();
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
      } else if (m.kind === 'whale') {
        obj.position.copy(v3(m.pos));
        obj.rotation.y = m.yaw;
        obj.userData.tail.rotation.x = m.sway * 0.25;
        obj.userData.fins.forEach((f, k) => { f.rotation.x = Math.sin(t * 1.2 + k) * 0.15; });
      }
    }
    for (const g of this.boostRings) g.children[1].rotation.z = t * 2;
  }
}
