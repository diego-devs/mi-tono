# Mi Tono

PWA para probar canciones MP3 en distintos tonos (−12 a +12 semitonos) y exportarlas a MP3. Todo el audio se procesa en el dispositivo; no hay servidor ni cuentas. Interfaz en español.

## Qué hace

- Abre un MP3 local, lo reproduce y permite buscar una posición.
- Cambia el tono en pasos de semitono mientras suena, **sin cambiar la velocidad**.
- Compara “Original” y “Mi tono” sin perder el ajuste elegido.
- Salta ±10 s y repite un fragmento con el **bucle A–B** (no afecta a la exportación, que es la canción completa).
- Cambia la **velocidad de práctica** (50–125 %) sin alterar el tono; es solo para escuchar: la exportación siempre usa la velocidad original.
- Añade la **letra y los acordes** de cada canción, pegados por ti (notación inglesa o latina, sobre la letra o entre corchetes `[Am]`): se guardan en el dispositivo y los acordes se transponen al instante con el tono elegido, con `♯`/`♭` a elección.
- Recuerda el tono de cada canción (por nombre y tamaño del archivo, solo en este dispositivo; últimas 50).
- Exporta la canción completa (MP3, 192 kbps, mono o estéreo según el original) con el ajuste fijo elegido.
- Funciona sin conexión después de una primera visita con internet.

## Requisitos y versiones

- Node.js ≥ 20 (probado con 26.1.0) y npm (probado con 11.13.0). El gestor es **npm** (`package-lock.json` incluido).
- Dependencias principales (versiones exactas en `package-lock.json`): React 19.3.1, Vite 8.3.7, TypeScript 7.0.2, vite-plugin-pwa 2.0.0, `@soundtouchjs/audio-worklet` 2.1.1, `@breezystack/lamejs` 1.2.7, Vitest 5.1.0, `@playwright/test` 1.65.0.

## Comandos

```bash
npm install                 # instalar
npm run dev                 # desarrollo (http://localhost:5173; sin service worker)
npm run typecheck           # TypeScript estricto
npm test                    # pruebas unitarias (Vitest)
npm run build               # build estático en dist/ (typecheck + vite build)
npm run preview             # sirve dist/ en http://localhost:4173 (con service worker)
npx playwright install chromium webkit   # una sola vez, para pruebas de navegador
npm run test:e2e            # pruebas de navegador (arranca dev y preview solos)
npm run icons               # regenera public/icons (opcional)
```

`dist/` es un sitio estático portable (rutas relativas): se puede alojar en cualquier hosting **HTTPS**, también en una subcarpeta. No se publica nada automáticamente.

## Probar el service worker y el modo sin conexión

El service worker solo existe en el build de producción:

1. `npm run build && npm run preview` y abrir `http://localhost:4173` (localhost cuenta como contexto seguro).
2. Esperar la etiqueta **“Lista para usar sin conexión”**. Solo aparece cuando el service worker controla la página **y** el documento, JS, CSS, iconos, manifest, el procesador AudioWorklet y el worker del codificador MP3 están en la caché (se comprueba con `caches.match`, no con `navigator.onLine`).
3. En DevTools → Network → *Offline* (o detener el servidor), recargar y abrir un MP3, reproducir, cambiar tono y exportar.

`e2e/app.spec.ts` automatiza esta prueba (último test) sobre el build de producción.

## Abrirla en un iPhone (HTTPS)

`http://IP-DE-MI-PC:4173` desde el teléfono **no** sirve: fuera de `localhost`, Safari exige HTTPS para service workers (y por tanto para el modo sin conexión). Opciones sin publicar nada permanente:

- Subir `dist/` a un hosting estático con HTTPS que ya uses (GitHub Pages, Netlify, Cloudflare Pages, tu propio servidor, etc.).
- Para una prueba temporal: un túnel HTTPS hacia el servidor de preview (por ejemplo `cloudflared tunnel --url http://localhost:4173` o `ngrok http 4173`). Esto expone temporalmente tu build (no tus canciones); ciérralo al terminar.

### Añadir a la pantalla de inicio

En Safari: Compartir → **Añadir a pantalla de inicio**. Abre la app una vez con conexión y espera “Lista para usar sin conexión” antes de usarla en modo avión.

## Exportar y guardar

1. Elige el ajuste y pulsa **Exportar MP3** (la pantalla indica qué ajuste se exportará).
2. Se ven las etapas reales: preparando → procesando audio → codificando MP3 → listo. El porcentaje solo aparece cuando es medible. **Cancelar** detiene el trabajo.
3. Pulsa **Guardar o compartir**: usa la hoja nativa de compartir si el navegador admite archivos (iPhone: “Guardar en Archivos”); si no, descarga mediante un enlace Blob. Si cancelas la hoja, el archivo sigue listo para reintentar.

Nombre: `nombre-cancion_-3st.mp3`, `_+2st`, `_0st`.

## Limitaciones conocidas

- La primera visita requiere conexión. Si el sistema o el usuario borra los datos del sitio, hay que repetir la preparación. No hay almacenamiento offline garantizado.
- Los MP3 deben estar descargados en el dispositivo; un archivo solo en iCloud puede requerir internet. Las canciones **no** se guardan en la caché de la app: se abren de nuevo en cada sesión.
- No hay reproducción con pantalla bloqueada ni en segundo plano: al salir de la app la reproducción se pausa; iOS puede suspender una exportación en curso (en ese caso, cancelar y reintentar).
- Los MP3 exportados no llevan etiqueta LAME/Xing: los reproductores añaden ≈ 25 ms de retardo al inicio y hasta una trama (≈ 26 ms) al final. En pruebas, la duración decodificada difiere < 0,1 s de la original.
- Cambiar de tono con WSOLA/SoundTouch introduce ≈ 0,1–0,15 s de retardo interno; se compensa en la comparación y en la exportación (error ≤ ±25 ms). Sonidos con muchos transitorios (batería) pueden sonar algo menos nítidos con cambios grandes.
- Frecuencias de muestreo no admitidas por el codificador (≠ 32/44,1/48 kHz) se convierten a 44,1 kHz al exportar.
- Las pruebas de navegador usan Chromium de escritorio: el WebKit de Playwright para Windows no incluye AudioWorkletNode (la app lo detecta y muestra un aviso en lugar de fallar), así que no sirve para validar Safari.
- Pruebas en iPhone real: **pendientes** (ver `docs/MANUAL_TESTS.md`).

## Estructura

```
src/audio/       motor de reproducción (engine.ts), cambio de tono (pitch.ts), exportación (exporter.ts)
src/workers/     codificación MP3 en un Web Worker
src/pwa/         estado de preparación offline y actualizaciones
src/hooks/       estado de la interfaz (usePlayer)
src/components/  controles
src/utils/       tiempo, nombres de archivo, compartir
tests/           pruebas unitarias   e2e/  pruebas de navegador
docs/            decisiones técnicas y pruebas manuales
```

## Futuro (fuera del alcance entregado)

Detector de la nota de la voz y biblioteca local de canciones.

## Flujo de trabajo y despliegue

- `main` es producción y está protegida: **nunca se sube directo**. Se trabaja en una rama (`feature/...`, `fix/...`), se abre un Pull Request y se hace merge solo con la comprobación **Verificar** en verde.
- En cada PR, `.github/workflows/ci.yml` ejecuta tipos + pruebas unitarias + build (**Verificar**) y las pruebas E2E en Chromium.
- Al hacer merge a `main`, `.github/workflows/deploy.yml` vuelve a verificar y publica en GitHub Pages: <https://diego-devs.github.io/mi-tono/>.
- Para ver la versión instalada en el iPhone: Ayuda → “Versión” (incluye el commit publicado).
- Se subió `package.json` a la versión 1.1.0; súbela cuando publiques cambios relevantes.

## Licencias

Ver `THIRD_PARTY_LICENSES.md` (incluye avisos de SoundTouchJS, MPL-2.0, y lamejs, LGPL-3.0).
