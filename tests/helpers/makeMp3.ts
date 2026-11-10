import { Mp3Encoder } from '@breezystack/lamejs';

/** Genera un MP3 real con una senoide por canal (frecuencias distintas) para pruebas. */
export function makeSineMp3(opts: {
  seconds: number;
  freqs: number[];
  sampleRate?: number;
  kbps?: number;
  amplitude?: number;
  /** Si se indica, la señal se corta tras estos segundos (silencio después). */
  burst?: number;
}): Uint8Array {
  const { seconds, freqs, sampleRate = 44100, kbps = 192, amplitude = 0.5, burst } = opts;
  const channels = freqs.length as 1 | 2;
  const frames = Math.round(seconds * sampleRate);
  const data = freqs.map((f) => {
    const out = new Int16Array(frames);
    const limit = burst === undefined ? frames : Math.round(burst * sampleRate);
    for (let i = 0; i < limit; i++) {
      out[i] = Math.round(Math.sin((2 * Math.PI * f * i) / sampleRate) * amplitude * 32767);
    }
    return out;
  });
  const enc = new Mp3Encoder(channels, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const block = 1152 * 10;
  for (let pos = 0; pos < frames; pos += block) {
    const l = data[0]!.subarray(pos, pos + block);
    const out = channels === 2 ? enc.encodeBuffer(l, data[1]!.subarray(pos, pos + block)) : enc.encodeBuffer(l);
    if (out.length) parts.push(new Uint8Array(out));
  }
  parts.push(new Uint8Array(enc.flush()));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    result.set(p, o);
    o += p.length;
  }
  return result;
}
