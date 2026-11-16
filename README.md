# Jettism

Carreras de jets con piruetas en mundos de arte surrealista, para jugar en Chrome.

**Jugar:** https://11diegonavarro-code.github.io/jettism/

## Qué hay (parte 1 de 6)

- Vuelo arcade con derrape aéreo, turbo, roces y estampido sónico.
- Diez piruetas, por combo (Espacio + dirección) o hechas a mano, con cadenas de estilo.
- Contrarreloj de 3 vueltas con fantasma de tu mejor vuelta, y vuelo libre.
- Mapa «Desierto de los sueños» (versión en bruto) con torres, cajones, escaleras, péndulos, una puerta y una ballena de nubes.
- Teclado y ratón, esquema clásico, mando y pantalla táctil.

## Técnica

HTML y módulos JS sin paso de build, three.js 0.160 desde jsDelivr. La física, el recorrido y el piloto automático son JS puro y se pueden simular en Node.

Para probar en local: `python -m http.server 8767` en esta carpeta y abrir `http://127.0.0.1:8767/`. Con `?debug` se expone `window.jetDebug`.
