# Licencias de terceros

El código de Mi Tono es MIT. El build distribuido incluye (copias del texto en `public/licenses/`, servidas con la app):

| Componente | Versión | Licencia | Uso |
| --- | --- | --- | --- |
| `@soundtouchjs/audio-worklet` (y `core`, `worklet-base`, `interpolation-strategy-lanczos`) | 2.1.1 | MPL-2.0 | Procesador AudioWorklet de cambio de tono (`assets/soundtouch-processor-*.js`) |
| `@breezystack/lamejs` (fork de lamejs / LAME) | 1.2.7 | LGPL-3.0 | Codificador MP3 (dentro de `assets/mp3.worker-*.js`) |
| React / React DOM | 19.3.1 | MIT | Interfaz |
| workbox-* (vite-plugin-pwa) | — | MIT | Service worker |

## MPL-2.0 (SoundTouchJS)

Se distribuye sin modificar, como archivo propio (`soundtouch-processor-*.js`), con su código fuente sin minificar y comentarios. Código fuente: <https://github.com/cutterbl/SoundTouchJS>. Texto: `public/licenses/MPL-2.0.txt`.

## LGPL-3.0 (lamejs / LAME)

- Texto: `public/licenses/LGPL-3.0.txt` y aviso del proyecto en `public/licenses/lamejs-LGPL-3.0.txt`. Código fuente: <https://github.com/zhuker/lamejs>, fork <https://github.com/shijinyu/lamejs>.
- La biblioteca se usa sin modificar y está aislada en su propio Web Worker (`mp3.worker-*.js`). Para reemplazarla por otra versión: sustituir la dependencia `@breezystack/lamejs` en `package.json`, ejecutar `npm install && npm run build` y publicar el nuevo `dist/`. El código fuente completo de esta aplicación está disponible en este repositorio, lo que permite recompilar con una versión modificada de la biblioteca (LGPL-3.0 §4).
- LAME incorpora, además, las consideraciones de patentes MP3 propias de cada jurisdicción; revisa si te aplican antes de distribuir la app públicamente. Para uso personal no hay obligación adicional conocida.

> Si se distribuye la app a terceros, conviene revisar este apartado con asesoría legal; esto no es asesoría jurídica.
