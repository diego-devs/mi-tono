# Decisiones técnicas

## Motor de cambio de tono: `@soundtouchjs/audio-worklet` 2.1.1 (MPL-2.0)

Evaluado el paquete actual del repositorio cutterbl/SoundTouchJS: proporciona `SoundTouchNode` (AudioWorkletNode) con `AudioParam`s `pitch` (multiplicador), `pitchSemitones` (semitonos) y `playbackRate`, el procesador autocontenido `soundtouch-processor.js` (sin imports; 73 kB) y `processOffline`. No usa `ScriptProcessorNode`.

- Se usa **solo `pitchSemitones`** (unidad: semitonos; el procesador calcula `2^(n/12)` internamente). `pitch` y `playbackRate` quedan en 1, así que el tempo es 1,0 y la transposición se aplica una sola vez.
- No se usa `processOffline` tal cual: no vacía la cola del procesador (el audio se corta ≈ 0,1 s antes del final) y no compensa su retardo. `exporter.renderPitched` construye el mismo grafo (mismo `createPitchNode`) con un `ConstantSourceNode` en silencio que mantiene activa la entrada hasta vaciar el procesador, renderiza `duración + retardo` y descarta el retardo inicial.
- Reproducción y exportación comparten `createPitchNode` y los mismos parámetros. Las pruebas `e2e/engine.spec.ts` miden el render (el mismo código que exporta) y `e2e/playback.spec.ts` mide lo que suena realmente en el motor de reproducción.

## Codificador MP3: `@breezystack/lamejs` 1.2.7 (LGPL-3.0)

Fork de lamejs con ESM y tipos; el paquete original (1.2.1) tiene el error `MPEGMode is not defined`. Funciona en Web Workers y sin WASM (≈ 160 kB). Probado: genera tramas MPEG válidas, que Chromium decodifica con el tono, duración y canales correctos. No se usa FFmpeg.wasm (decenas de MB, memoria alta en móvil).

## Tiempo real

Cada inicio o búsqueda crea una fuente nueva y un `SoundTouchNode` nuevo (se descarta el estado interno, sin restos del punto anterior), con un fundido de entrada de ~8 ms.

Grafo: `fuente → [retardo → ganancia directa] + [SoundTouch → ganancia procesada] → fundido → ganancia maestra → salida`.

- **Original / 0 semitonos**: se oye la ruta directa (bypass), retardada lo mismo que el procesador (0,125 s) para que la comparación no tenga desfase; el cambio entre rutas es un fundido de ~8 ms.
- Cambiar semitonos con la ruta procesada activa: se silencia la ruta procesada, se cambia el parámetro y se vuelve a entrar (~40 ms); la última petición prevalece ante cambios rápidos.
- El reloj es `AudioContext.currentTime`; la interfaz lo lee cada 100 ms, sin gobernarlo. La barra no lee la posición mientras se arrastra.
- Un identificador de reproducción (`playToken`) descarta continuaciones obsoletas (pulsaciones rápidas, reanudar contextos) y un identificador de carga (`loadId`) descarta decodificaciones tardías.

## Exportación

1. Se toma una referencia al `AudioBuffer` decodificado (inmutable: no se modifica) y el ajuste elegido.
2. `OfflineAudioContext` renderiza con el procesador (en el hilo principal: los AudioWorklet no existen en Workers). El progreso proviene de `suspend()` a intervalos (20 pasos); no se simula.
3. El resultado se envía por trozos (≈ 1 s) con transferencia al Worker de codificación, esperando confirmación (`ack`) de cada trozo; así no se acumulan copias completas. Cancelar termina el Worker y descarta el render (una vez cancelado, el contexto suspendido se libera con el recolector de basura).
4. El Worker convierte a Int16 y codifica; devuelve un `Blob` `audio/mpeg`.

## Duración, latencia y memoria

- Duración musical = duración original (`round(duración × fs)` tramas) tras descartar `0,125 s` de retardo inicial y renderizar `+0,125 s` de cola. Medido: la ráfaga de prueba (5 s) termina en 5,00 ± 0,03 s para −12…+12.
- Padding del codificador: lamejs no escribe etiqueta LAME; se miden ≈ +0,03 s al inicio y ≈ +0,06 s al final al decodificar. Tolerancia en pruebas: 0,15 s.
- Presupuesto para 5 min estéreo a 48 kHz ≈ 115 MB (decodificado) + ≈ 115 MB (render) + trozos de ~0,4 MB. El MP3 no pasa por copias completas adicionales. No se impone un límite de duración; se recomienda ≤ 5 min en iPhone (pendiente de medir en dispositivo real).
- Sample rates: 32/44,1/48 kHz se conservan; cualquier otra se convierte explícitamente a 44,1 kHz (el `OfflineAudioContext` remuestrea).

## Amplitud

Ganancia fija de 0,9 (−0,9 dB) en reproducción (ambas rutas) y exportación, para dejar margen a los picos que puede crear el cambio de tono. Si aun así el pico exportado superara 0,999, se escala todo el archivo para evitar recorte (solo atenúa). Por tanto un archivo exportado a 0 st suena ≈ 0,9 dB más bajo que el original; es coherente con lo que se escucha en la app. No hay compresor ni normalización.

## Offline

- `vite-plugin-pwa` 2.0.0 (Workbox `generateSW`, `registerType: 'prompt'`, `clientsClaim`). Precache: `index.html`, JS, CSS, PNG, manifest, `soundtouch-processor-*.js`, `mp3.worker-*.js` (incluye el codificador). No hay WASM, CDN, fuentes remotas ni `SharedArrayBuffer`.
- Cachés versionadas por revisión de Workbox; el SW nuevo queda en espera (`skipWaiting: false`) y la interfaz ofrece “Actualizar la app” solo cuando está inactiva (sin reproducir, cargar ni exportar).
- “Lista para usar sin conexión” solo se muestra tras `serviceWorker.ready`, comprobar que hay un controlador y que `caches.match` encuentra los recursos esenciales.
- Las canciones nunca se guardan en Cache Storage.

## Riesgos / pendientes

- Validar en iPhone 16 Pro real: Safari y modo instalado, latencia, memoria con 5 min, interrupciones y hoja de compartir (`docs/MANUAL_TESTS.md`).
- `OfflineAudioContext.suspend()` y AudioWorklet en `OfflineAudioContext` están disponibles en Safari ≥ 14.5; si `suspend` fallara, el progreso quedaría sin avance (la etapa seguiría indicando “Procesando audio…”).
- Compatibilidad LGPL: ver `THIRD_PARTY_LICENSES.md`.
