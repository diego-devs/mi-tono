import { describe, expect, it } from 'vitest';
import { clampTempo, loopPosition, makeLoop } from '../src/audio/math';
import { loadPitch, savePitch, songKey } from '../src/utils/memory';

function fakeStore(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_k: string, v: string) => {
      value = v;
    },
  };
}

describe('tempo math', () => {
  it('clamps to 50–125 % in 5 % steps', () => {
    expect(clampTempo(1)).toBe(1);
    expect(clampTempo(0.1)).toBe(0.5);
    expect(clampTempo(3)).toBe(1.25);
    expect(clampTempo(0.87)).toBe(0.85);
    expect(clampTempo(1 - 0.05 * 3)).toBe(0.85);
    expect(clampTempo(NaN)).toBe(1);
  });
});

describe('loop math', () => {
  it('validates A < B with a minimum length inside the song', () => {
    expect(makeLoop(1, 3, 10)).toEqual({ start: 1, end: 3 });
    expect(makeLoop(3, 3.2, 10)).toBeNull();
    expect(makeLoop(5, 2, 10)).toBeNull();
    expect(makeLoop(-1, 3, 10)).toBeNull();
    expect(makeLoop(8, 11, 10)).toBeNull();
    expect(makeLoop(NaN, 3, 10)).toBeNull();
  });

  it('wraps the position inside the loop', () => {
    const loop = { start: 2, end: 4 };
    expect(loopPosition(0, 1, loop, 10)).toBeCloseTo(1);
    expect(loopPosition(0, 5, loop, 10)).toBeCloseTo(3);
    expect(loopPosition(3, 3, loop, 10)).toBeCloseTo(2);
    expect(loopPosition(0, 100, null, 10)).toBe(10);
  });
});

describe('remembered pitch', () => {
  it('stores and restores the pitch per song', () => {
    const s = fakeStore();
    const a = songKey('a.mp3', 100);
    const b = songKey('b.mp3', 200);
    savePitch(s, a, -3);
    savePitch(s, b, 2);
    expect(loadPitch(s, a)).toBe(-3);
    expect(loadPitch(s, b)).toBe(2);
    expect(loadPitch(s, songKey('c.mp3', 1))).toBeNull();
  });

  it('forgets a song when reset to 0 and keeps only the latest 50', () => {
    const s = fakeStore();
    savePitch(s, 'x', 5);
    savePitch(s, 'x', 0);
    expect(loadPitch(s, 'x')).toBeNull();
    for (let i = 0; i < 60; i++) savePitch(s, `k${i}`, 1);
    expect(loadPitch(s, 'k0')).toBeNull();
    expect(loadPitch(s, 'k59')).toBe(1);
  });

  it('tolerates corrupt data and missing storage', () => {
    expect(loadPitch(fakeStore('{nope'), 'x')).toBeNull();
    expect(loadPitch(fakeStore('[["x",1.5]]'), 'x')).toBeNull();
    expect(loadPitch(null, 'x')).toBeNull();
    expect(() => savePitch(null, 'x', 1)).not.toThrow();
  });
});
