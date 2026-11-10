# PICO

Roguelite de identificación de frecuencias para entrenar el oído de técnico de sonido. Suena una pista con un pico de EQ oculto (+12 dB, Q 2) y tienes que localizarlo: por zonas, octavas, tercios o con un intervalo libre. Puntúas en bits de información, con comodines, mejoras de zona y jefes al estilo Balatro.

Funciona en el navegador, sin servidor, en el ordenador y en el móvil (en horizontal). Se puede instalar como app y funciona sin conexión.

## Publicarlo en GitHub Pages
1. Crea un repositorio en GitHub (por ejemplo `pico`) y sube **el contenido de esta carpeta** a la raíz (index.html tiene que quedar arriba del todo).
   - Desde la web: *Add file → Upload files* y arrastra todos los archivos y las carpetas `fuentes` e `iconos`.
   - O desde Terminal: `git init && git add . && git commit -m "PICO" && git branch -M main && git remote add origin https://github.com/TU_USUARIO/pico.git && git push -u origin main`
2. En el repositorio: *Settings → Pages → Build and deployment → Source: Deploy from a branch*, rama `main`, carpeta `/ (root)`. Guarda.
3. En un minuto estará en `https://TU_USUARIO.github.io/pico/`.

Cada vez que subas cambios, la app se actualiza sola la próxima vez que la abras con conexión.

## Instalarlo en el iPhone
1. Abre la dirección en **Safari** → botón Compartir → **Añadir a pantalla de inicio**.
2. Ábrelo desde el icono: pantalla completa, en horizontal, y funciona sin conexión.
3. **Canciones**: Colección → Añadir canciones (se abren Archivos). Se guardan en el teléfono.

Avisos físicos:
- El altavoz del móvil apenas reproduce por debajo de ~150–200 Hz: para Peso y Cuerpo usa **auriculares**.
- En iOS anteriores a 16.4 el audio web se silencia con el interruptor de silencio. En los actuales PICO pide la sesión de audio de reproducción y suena igualmente; si no oyes nada, revisa el interruptor.
- Safari puede borrar los datos de webs que no visitas en semanas; instalada en la pantalla de inicio es mucho más estable. Exporta una copia de vez en cuando.

## Canciones
No subas canciones al repositorio (derechos y tamaño; el `.gitignore` ya las excluye). En los niveles de canciones salen de tu banco local; las que aún no conoces aparecen como «???» y se desbloquean al jugarlas en una ciega que superas. Una buena fuente de mezclas reales es la biblioteca de multipistas de Cambridge Music Technology (*Mixing Secrets*), de uso educativo.

## Archivos
`index.html` · `main.js` (interfaz y flujo) · `contenido.js` (reglas, comodines, jefes, puntuación) · `audio.js` (ruido rosa, filtro peaking RBJ, compensación de potencia, análisis espectral) · `stats.js` · `iconos.js` · `almacen.js` (IndexedDB) · `sw.js` (sin conexión) · `manifest.webmanifest` · `estilo.css` · `movil.css` · `fuentes/` (DSEG, licencia OFL) · `iconos/`

## Cómo se juega
- Cada ciega te da **manos** (intentos) y **descartes**. Tienes una mano de 5 pistas; cada una lleva un pico oculto.
- Seleccionas una pista (clic o teclas 1–5), escuchas y marcas un **intervalo** en el eje. Si el pico cae dentro, puntúas:
  **fichas × mult**, donde fichas = bits × fichas/bit de la zona **real** del pico, y bits = log₂(8,23 oct / anchura útil). Los picos solo salen entre 50 Hz y 15 kHz (el eje muestra 20 Hz–20 kHz, con las franjas de fuera sombreadas); la anchura útil es la parte de tu intervalo dentro de ese rango.
  Cubrir todo el rango de juego vale 0 bits; cada vez que divides la anchura por dos, +1 bit.
- Con unos errores de dispersión σ, la anchura que maximiza lo esperado es ~3σ: tu mejor estrategia es declarar tu incertidumbre real.
- Las pistas que no te convengan se marcan (M) y se descartan (D). Elegir qué pista jugar ya es entrenamiento: tienes que saber de oído en qué zona está.
- Zonas: **Peso** 20–80 Hz · **Cuerpo** 80–250 · **Barro** 250–800 · **Nasal** 800–2,5k · **Presencia** 2,5–6k · **Brillo** 6–20k.
- Entre ciegas, tienda: **comodines**, **mejoras de zona** y consumibles. Las fichas de los comodines van por bit: un intervalo que no informa nunca puntúa.
- **54 comodines** en 4 rarezas (normal, especial, raro, legendario; en la tienda ~65/25/8,5/1,5 %). Color del arte = qué hacen: azul fichas, rojo +mult, morado ×mult, verde dinero, gris utilidad.
  Casi todos se activan por un acto de escucha (zona, acierto, anchura, racha, selección de pista).
- **Especialistas**, 4 por zona: Especialista (+10 mult) · Experto (+2 mult permanente por acierto en su zona) · Maestro (×2) · Leyenda (×(1 + 0,5 × nivel de la zona)).
- Sidechain copia al comodín de su derecha y Bus al primero del rack (no se encadenan).
- **El orden de los comodines importa**: se aplican de izquierda a derecha (pon los +mult antes de los ×mult). Reordénalos arrastrándolos en el rack o con las flechas ‹ › que aparecen al pasar el ratón.
- Barajas: de estudio (neutra) y del **Barro** (mejoras de Barro ×4, del resto ×0,5).
- **Escalera de 8 niveles por baraja** (ganar un nivel abre el siguiente; puedes rejugar cualquiera abierto):
  1 Ruido · Zonas · 2 Ruido · Octavas · 3 Ruido · Tercios · 4 Ruido · Libre ·
  5 Canciones · Zonas · 6 Canciones · Octavas · 7 Canciones · Tercios · 8 Canciones · Libre.
  El sonido es idéntico en todos (+12 dB, Q 2, 50 Hz–15 kHz); cambian la fuente y la rejilla de respuesta.
  En zonas/octavas/tercios eliges una banda (clic, ←→ banda vecina); octavas y tercios son las bandas ISO.
- Cada partida tiene **5 antes** (15 rondas); dentro de un nivel solo suben objetivos y jefes. El ante 1 da una mano extra.

## Comparar con tu respuesta
Tras revelar el pico, **Comparar con tu respuesta** (tecla C) alterna un pico idéntico en el centro de tu respuesta (LED «TÚ», curva discontinua ámbar) y el real (LED «REAL», curva cian). En los niveles de bandas usa el centro de la banda que elegiste. Funciona también en el modo medición.

## Nueva partida
Una sola pantalla: ← → cambia de baraja, ↑ ↓ (o 1–8) elige nivel entre los abiertos, ↵ juega.

## Escucha
- **A/B automático**: cada pista alterna 1,2 s plana y 1,2 s con el pico, igualadas en potencia. El LED **EQ IN** se enciende en la fase con pico. El oído se adapta a una coloración fija en pocos segundos; lo audible es el cambio.
- Al pasar de una pista a otra hay 1 s de silencio, y una pista se para sola tras 15 s seguidos (espacio para seguir).
- El jefe **La Costumbre** quita el A/B: bucle continuo, como el ejercicio de Ableton.
- A los 20 minutos de escucha aparece un aviso para descansar un par de minutos.
- Escucha a nivel moderado (unos 70–75 dB SPL): a más nivel, la adaptación y la fatiga llegan antes.

## Teclas (ordenador)
espacio escuchar/parar · B (mantener) bypass · 1–5 elegir pista · M marcar · D descartar · ↵ jugar/continuar
arrastrar un borde: abre o cierra el intervalo con el centro fijo · arrastrar dentro: moverlo · ← → mover el intervalo (⇧ en tercios de octava) · ↑ ↓ ensanchar/estrechar · rueda del ratón: anchura · clic simple: ⅓ de octava

## Datos
- Todo se guarda **en el navegador de cada dispositivo** (IndexedDB): progreso, historial y canciones. Nada se sube a ningún sitio.
- **Copia de seguridad** (menú): exporta un `.json` con progreso e historial; impórtalo en otro dispositivo para continuar allí. Las canciones no van en la copia.
- Para traer los datos de la versión de escritorio con servidor: Copia de seguridad → Importar y selecciona a la vez `datos/estado.json` y `datos/historial.jsonl`.
- Estadísticas → Exportar CSV.

## Notas técnicas
- Vúmetro: 0 VU = −18 dBFS RMS (el nivel de trabajo de todas las fuentes), integración de ~300 ms.
- RTA: solo aparece tras revelar el pico; lleva +3 dB/octava para que el ruido rosa se vea plano.
- Tipografías DSEG (Keshikan, licencia OFL), en web/fuentes.
- El pico es un filtro peaking biquad con la definición de Q del Audio EQ Cookbook (RBJ), la misma que usa Web Audio. No sé si la Q de EQ Eight se define igual: compáralo antes de extrapolar números entre ambos.
- El bypass iguala **potencia** (no sonoridad percibida) con y sin pico, calculada sobre el espectro por tercios de octava de la fuente.
- En canciones, la frecuencia solo se sortea en bandas con energía (no más de 25 dB por debajo de la banda más fuerte del fragmento).
- Notación: Do4 = 261,6 Hz, La4 = 440 Hz.
