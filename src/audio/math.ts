export const MIN_SEMITONES = -12;
export const MAX_SEMITONES = 12;

/** Ganancia fija aplicada a la reproducción y a la exportación (≈ −0,9 dB) para dejar margen ante picos del cambio de tono. */
export const OUTPUT_GAIN = 0.9;

/**
 * Retardo (en segundos) que introduce el procesador en su salida; se usa para alinear
 * la ruta "Original" con la ruta procesada y para descartar el silencio inicial al exportar.
 *
 * Medido con e2e/engine.spec.ts: entre 0,10 s (−12) y 0,15 s (+12); se usa el punto medio (error ≤ ±25 ms).
 */
export const PROCESSOR_LATENCY_SEC = 0.125;

const SUPPORTED_EXPORT_RATES = [32000, 44100, 48000];
const FALLBACK_EXPORT_RATE = 44100;

export function clampSemitones(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_SEMITONES, Math.max(MIN_SEMITONES, Math.round(value)));
}

export function pitchRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/** Frecuencia de muestreo admitida por el codificador MP3; las demás se convierten a 44,1 kHz. */
export function exportSampleRate(inputRate: number): number {
  return SUPPORTED_EXPORT_RATES.includes(inputRate) ? inputRate : FALLBACK_EXPORT_RATE;
}
