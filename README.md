# Jettism

Carreras de jets con piruetas en mundos de arte surrealista, para jugar en Chrome.

**Jugar:** https://11diegonavarro-code.github.io/jettism/

## Qué hay (partes 1 y 2 de 6)

- Vuelo arcade con derrape aéreo, turbo, roces y estampido sónico.
- Diez piruetas, por combo (Espacio + dirección) o hechas a mano, con cadenas de estilo.
- Contrarreloj de 3 vueltas con fantasma de tu mejor vuelta, y vuelo libre.
- Mapa «Desierto de los sueños»:
  - **Recorrido:** bosque de torres de cera, acantilado de cajones con un atajo por dentro de un cajón gigante, escaleras que giran en la horquilla y péndulos colgados de las nubes.
  - **Obstáculos:** una puerta que lleva a la noche, puentes de papel que se pliegan, una ballena de nubes y un tren de vapor sobre el lago espejo.
  - **Clima por tramos:** calima, niebla rosa, viento lateral, corrientes térmicas y noche de remolinos.
- Teclado y ratón, esquema clásico, mando y pantalla táctil.

## Técnica

HTML y módulos JS sin paso de build, three.js 0.160 desde jsDelivr. La física, el recorrido y el piloto automático son JS puro y se pueden simular en Node.

Para probar en local: `python -m http.server 8767` en esta carpeta y abrir `http://127.0.0.1:8767/`. Con `?debug` se expone `window.jetDebug`.
