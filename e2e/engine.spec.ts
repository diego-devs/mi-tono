import { expect, test } from '@playwright/test';
import { ANALYSIS_JS } from './analysis';

const DEV = 'http://localhost:5173/';

// Mide, con el mismo render que usa la exportación, frecuencia, duración y retardo del procesador.
async function measure(page: import('@playwright/test').Page, semitones: number, sr = 44100) {
  return page.evaluate(`(async () => {
    ${ANALYSIS_JS}
    const mod = await import('/src/audio/exporter.ts');
    const input = makeBuffer(${sr}, 8, [440, 660], 5);
    const { buffer, skipFrames } = await mod.renderPitched(input, ${semitones}, ${sr});
    const L = buffer.getChannelData(0), R = buffer.getChannelData(1);
    const a = skipFrames + Math.round(1 * ${sr}), b = skipFrames + Math.round(4 * ${sr});
    const rawEdges = envelopeEdges(L, ${sr});
    const trimmed = L.subarray(skipFrames);
    const edges = envelopeEdges(trimmed, ${sr});
    return {
      freqL: estimateFreq(L, ${sr}, a, b),
      freqR: estimateFreq(R, ${sr}, a, b),
      rawStart: rawEdges[0], rawEnd: rawEdges[1],
      start: edges[0], end: edges[1],
      channels: buffer.numberOfChannels, frames: buffer.length - skipFrames, inFrames: input.length,
    };
  })()`) as Promise<{
    freqL: number; freqR: number; rawStart: number; rawEnd: number;
    start: number; end: number; channels: number; frames: number; inFrames: number;
  }>;
}

test.describe('pitch engine (shared by playback and export)', () => {
  for (const semitones of [-12, -5, -3, -1, 1, 3, 12]) {
    test(`${semitones} semitones: frequency, tempo and channels`, async ({ page }) => {
      await page.goto(DEV);
      const m = await measure(page, semitones);
      const ratio = 2 ** (semitones / 12);
      console.log(`st=${semitones}`, JSON.stringify(m));
      // Ambos canales conservan su propia señal y la frecuencia queda a < 0,1 semitono.
      expect(Math.abs(12 * Math.log2(m.freqL / (440 * ratio)))).toBeLessThan(0.1);
      expect(Math.abs(12 * Math.log2(m.freqR / (660 * ratio)))).toBeLessThan(0.1);
      expect(m.channels).toBe(2);
      // Tempo: el final de la ráfaga (5 s) no se mueve más de 40 ms tras compensar el retardo.
      expect(Math.abs(m.end - 5)).toBeLessThan(0.04);
      expect(Math.abs(m.start - 0)).toBeLessThan(0.04);
      expect(m.frames).toBe(m.inFrames);
    });
  }
});
