// Materiales compartidos por los mapas.
// Proyección triplanar: la textura se pega según la posición en el mundo (no según las UV), así un solo material
// sirve para miles de bloques de cualquier tamaño (también instanciados) sin que se estire.
import * as THREE from 'three';

// scale: repeticiones por metro · dark: [altura en la que acaba la penumbra, cuánto oscurece abajo (0..1)]
export function triplanar(mat, { scale = 1 / 9, dark = [0, 0] } = {}) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTpScale = { value: scale };
    sh.uniforms.uTpDark = { value: new THREE.Vector2(dark[0], dark[1]) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos; varying vec3 vTpN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 tpW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          tpW = instanceMatrix * tpW;
        #endif
        tpW = modelMatrix * tpW;
        vTpPos = tpW.xyz;
        vec3 tpN = objectNormal;
        #ifdef USE_INSTANCING
          tpN = mat3(instanceMatrix) * tpN;
        #endif
        vTpN = normalize(mat3(modelMatrix) * tpN);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos; varying vec3 vTpN; uniform float uTpScale; uniform vec2 uTpDark;')
      .replace('#include <map_fragment>', `
        vec3 tpB = pow(abs(vTpN), vec3(4.0));
        tpB /= (tpB.x + tpB.y + tpB.z + 1e-5);
        vec4 tpC = texture2D(map, vTpPos.zy * uTpScale) * tpB.x + texture2D(map, vTpPos.xz * uTpScale) * tpB.y + texture2D(map, vTpPos.xy * uTpScale) * tpB.z;
        diffuseColor *= tpC;
        if (uTpDark.y > 0.0) diffuseColor.rgb *= 1.0 - uTpDark.y * (1.0 - smoothstep(0.0, uTpDark.x, vTpPos.y));`);
  };
  mat.customProgramCacheKey = () => `tp${scale}_${dark.join('_')}`;
  return mat;
}
