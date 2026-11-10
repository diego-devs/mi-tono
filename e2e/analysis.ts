/** Funciones de análisis de audio que se inyectan como texto en la página (se ejecutan en el navegador). */
export const ANALYSIS_JS = `
function makeBuffer(sr, seconds, freqs, burstSeconds) {
  const len = Math.round(sr * seconds);
  const buf = new AudioBuffer({ numberOfChannels: freqs.length, length: len, sampleRate: sr });
  freqs.forEach((f, c) => {
    const d = buf.getChannelData(c);
    const burst = burstSeconds === undefined ? len : Math.round(burstSeconds * sr);
    for (let i = 0; i < burst; i++) d[i] = 0.5 * Math.sin(2 * Math.PI * f * i / sr);
  });
  return buf;
}
// Frecuencia por cruces ascendentes por cero con interpolación lineal.
function estimateFreq(data, sr, from, to) {
  const cross = [];
  for (let i = Math.max(1, from); i < Math.min(to, data.length); i++) {
    if (data[i - 1] < 0 && data[i] >= 0) {
      cross.push(i - 1 + (-data[i - 1]) / (data[i] - data[i - 1]));
    }
  }
  if (cross.length < 3) return 0;
  return (cross.length - 1) * sr / (cross[cross.length - 1] - cross[0]);
}
// Instantes (s) en que la envolvente RMS (ventanas de 10 ms) cruza 50 % del máximo: [inicio, fin].
function envelopeEdges(data, sr) {
  const win = Math.round(sr * 0.01);
  const env = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) s += data[i + j] * data[i + j];
    env.push(Math.sqrt(s / win));
  }
  const max = Math.max(...env);
  const thr = max * 0.5;
  const first = env.findIndex((v) => v >= thr);
  let last = env.length - 1;
  while (last > 0 && env[last] < thr) last--;
  return [first * 0.01, (last + 1) * 0.01];
}
function rms(data, from, to) {
  let s = 0;
  for (let i = from; i < to; i++) s += data[i] * data[i];
  return Math.sqrt(s / Math.max(1, to - from));
}
function semitoneError(measured, expected) {
  return Math.abs(12 * Math.log2(measured / expected));
}
`;
