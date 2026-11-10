import { describe, expect, it } from 'vitest';
import { MAX_SEMITONES, MIN_SEMITONES, clampSemitones, pitchRatio } from '../src/audio/math';
import { exportSampleRate } from '../src/audio/math';
import { Mp3Encoder } from '@breezystack/lamejs';
import { makeSineMp3 } from './helpers/makeMp3';

describe('pitch math', () => {
  it('uses 2^(n/12)', () => {
    expect(pitchRatio(0)).toBe(1);
    expect(pitchRatio(12)).toBe(2);
    expect(pitchRatio(-12)).toBe(0.5);
    expect(pitchRatio(-3)).toBeCloseTo(0.8409, 4);
  });

  it('clamps and rounds to the allowed range', () => {
    expect(clampSemitones(99)).toBe(MAX_SEMITONES);
    expect(clampSemitones(-99)).toBe(MIN_SEMITONES);
    expect(clampSemitones(2.6)).toBe(3);
    expect(clampSemitones(Number.NaN)).toBe(0);
  });

  it('keeps supported sample rates and converts others explicitly', () => {
    expect(exportSampleRate(48000)).toBe(48000);
    expect(exportSampleRate(44100)).toBe(44100);
    expect(exportSampleRate(96000)).toBe(44100);
    expect(exportSampleRate(22050)).toBe(44100);
  });
});

describe('mp3 encoder (lamejs)', () => {
  it('produces MPEG audio frames with the expected size for 192 kbps', () => {
    const seconds = 3;
    const mp3 = makeSineMp3({ seconds, freqs: [440, 660], kbps: 192 });
    // Cabecera de trama MPEG: 11 bits de sincronía.
    expect(mp3[0]).toBe(0xff);
    expect((mp3[1]! & 0xe0)).toBe(0xe0);
    const expected = (192_000 / 8) * seconds;
    expect(mp3.length).toBeGreaterThan(expected * 0.95);
    expect(mp3.length).toBeLessThan(expected * 1.1);
  });

  it('supports mono', () => {
    const enc = new Mp3Encoder(1, 44100, 128);
    const out = enc.encodeBuffer(new Int16Array(1152 * 4));
    expect(out.length + enc.flush().length).toBeGreaterThan(0);
  });
});
