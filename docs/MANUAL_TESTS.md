# Pruebas manuales en iPhone 16 Pro (pendientes)

No se pudo acceder a un iPhone real durante el desarrollo. Las pruebas automáticas se ejecutaron en Chromium y WebKit de escritorio, que **no** equivalen a Safari en iOS. Marcar cada punto en Safari y también en la app instalada (pantalla de inicio).

Preparación: abrir la app por HTTPS con conexión, esperar “Lista para usar sin conexión”, añadir a pantalla de inicio.

- [ ] Abrir un MP3 desde Archivos (descargado en el dispositivo). Se muestra nombre y duración; no suena solo.
- [ ] Canción de 2 min y de 5 min: carga y reproducción estables.
- [ ] Reproducir y aplicar −1, −3 y −5 semitonos: el tono baja y la velocidad no cambia.
- [ ] Cambios rápidos de tono (pulsar “−” varias veces seguidas): sin clics fuertes ni bloqueos.
- [ ] Buscar posición con la barra (en reproducción y en pausa): en pausa sigue en pausa; el tono se conserva.
- [ ] Comparar Original / Mi tono durante la reproducción: sin saltos de volumen ni desfase; el ajuste se conserva.
- [ ] Final de canción: se detiene, se muestra el final y “Reproducir de nuevo” empieza desde 0:00.
- [ ] Exportar a −3 en la canción de 2 min y en la de 5 min; anotar tiempo real y si la app se mantuvo en primer plano.
- [ ] Cancelar una exportación y reintentar.
- [ ] “Guardar o compartir” → hoja nativa → “Guardar en Archivos”; abrir el MP3 resultante y comprobar tono (−3) y duración.
- [ ] Cancelar la hoja de compartir y volver a pulsar: el archivo sigue disponible, sin mensaje de error de procesamiento.
- [ ] Modo avión: cerrar por completo la app, activar modo avión, reabrir (Safari y app instalada), abrir un MP3, reproducir, cambiar tono y exportar.
- [ ] Interrupciones: llamada/Siri/alarma durante la reproducción → al volver debe quedar en pausa con aviso; bloquear pantalla y volver durante una exportación → reintentar si no continúa.
- [ ] Rotación y tamaño de texto grande: sin scroll horizontal; botones ≥ 44 pt; zonas seguras respetadas.
- [ ] Saltar ±10 s en reproducción y en pausa.
- [ ] Bucle A–B: marcar A y B durante la reproducción; el fragmento se repite sin huecos largos ni clics fuertes; cambiar el tono dentro del bucle; “Quitar bucle” continúa la canción.
- [ ] Recordar tono: ajustar −3, cerrar la app, reabrir el mismo archivo → se restaura con aviso; con otro archivo empieza en 0.
- [ ] Actualización: publicar una versión nueva; la app ofrece “Actualizar la app” solo en reposo; Ayuda → Versión cambia.
