# Jettism

Carreras de jets con piruetas en mundos de arte surrealista, para jugar en Chrome.

**Jugar:** https://11diegonavarro-code.github.io/jettism/

## Qué hay

- **Hangar:**
  - Piezas: 4 morros, 4 alas, 4 motores y 4 colas, que cambian velocidad, aceleración, giro, turbo y piruetas. Todas las combinaciones suman lo mismo.
  - Pintura en tres zonas con cuatro acabados.
  - 30 calcomanías en 6 sitios.
  - Humo y llama de color, casco del piloto, y número y nombre en la cola.
  - Cada motor suena distinto, y tu jet llega así a la sala online.

- Vuelo arcade con derrape aéreo, turbo, roces y estampido sónico.
- Diez piruetas, por combo (Espacio + dirección) o hechas a mano, con cadenas de estilo.
- Contrarreloj de 3 vueltas con fantasma de tu mejor vuelta, y vuelo libre.
- **Carreras de hasta 8 jets:** contra bots (fáciles, normales o difíciles) o online con amigos. La sala se crea con un enlace y se espera volando juntos por el mapa.
- **En carrera con más jets:**
  - rebufo: detrás de otro jet vas más rápido y cargas turbo;
  - formaciones: la misma pirueta a la vez puntúa ×2;
  - humo de colores para escribir en el cielo;
  - empujones entre jets;
  - sonido 3D de los demás motores con efecto Doppler.
- Mapa «Desierto de los sueños»:
  - **Recorrido:** bosque de torres de cera, acantilado de cajones con un atajo por dentro de un cajón gigante, escaleras que giran en la horquilla y péndulos colgados de las nubes.
  - **Obstáculos:** una puerta que lleva a la noche, puentes de papel que se pliegan, una ballena de nubes y un tren de vapor sobre el lago espejo.
  - **Clima por tramos:** calima, niebla rosa, viento lateral, corrientes térmicas y noche de remolinos.
- **Modos** (contra bots u online):
  - carrera normal;
  - carrera con objetos: misil teledirigido, escudo, mina y bengalas, mejores cuanto más atrás vas;
  - copa de tres carreras (normal, al revés y de noche) con puntos por puesto y por estilo;
  - combate aéreo todos contra todos, con misiles que se recargan y fijación de blanco;
  - acrobacias: gana quien más estilo consiga en el tiempo.
- **Repetición** de cada carrera con cámaras de cine (automática, persecución, órbita, pie de pista, pasada, desde arriba, morro y ala), cámara lenta y salto a cualquier momento.
- **Modo foto** desde la pausa o la repetición: cámara libre, zoom, inclinación, filtros, viñeta y foto en PNG.
- **Editor de circuitos:** se vuela libre por el mapa y se colocan puertas (tres tamaños) y anillos de turbo. La línea del recorrido sale en verde si está libre, en naranja si pasa muy justa y en rojo si atraviesa algo. Tiene deshacer, se prueba en contrarreloj y se comparte con un enlace que lleva el circuito dentro. Sirve para las carreras contra bots y online: el anfitrión lo manda a la sala.
- Récords y fantasma por circuito: vuelta, carrera, estilo y acrobacias.
- Música generativa opcional, que se anima en carrera, y distorsión de calor detrás de las toberas.
- Teclado y ratón, esquema clásico, mando y pantalla táctil.

## Técnica

HTML y módulos JS sin paso de build, three.js 0.160 desde jsDelivr. El online usa PeerJS (conexión directa entre navegadores) y, si la red la bloquea, servidores MQTT públicos. El anfitrión lleva los bots y el reloj común. La física, el recorrido y el piloto automático son JS puro y se pueden simular en Node.

Para probar en local: `python -m http.server 8767` en esta carpeta y abrir `http://127.0.0.1:8767/`. Con `?debug` se expone `window.jetDebug`.
