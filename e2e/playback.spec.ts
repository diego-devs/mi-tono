import { expect, test, type Page } from '@playwright/test';
import { ANALYSIS_JS } from './analysis';
import { makeSineMp3 } from '../tests/helpers/makeMp3';

const DEV = 'http://localhost:5173/';

const mp3A = Buffer.from(makeSineMp3({ seconds: 8, freqs: [440, 660] })).toString('base64');
const mp3B = Buffer.from(makeSineMp3({ seconds: 3, freqs: [300, 300] })).toString('base64');

// Prepara un reproductor real (mismo motor que la app) y un analizador por canal sobre su salida.
const SETUP = `
${ANALYSIS_JS}
const b64 = (s, name) => {
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new File([u], name, { type: '' });
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { PitchPlayer, StaleLoadError } = await import('/src/audio/engine.ts');
const player = new PitchPlayer();
window.__player = player;
await player.unlock();
const fileA = b64('${mp3A}', 'a.mp3');
const fileB = b64('${mp3B}', 'b.mp3');
function attach() {
  const { ctx, node } = player.getTap();
  const split = ctx.createChannelSplitter(2);
  node.connect(split);
  const mk = (i) => { const a = ctx.createAnalyser(); a.fftSize = 16384; split.connect(a, i); return a; };
  return [mk(0), mk(1)];
}
function listen(an, sr) {
  const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d);
  return { f: estimateFreq(d, sr, 0, d.length), rms: rms(d, 0, d.length) };
}
`;

async function run<T>(page: Page, body: string): Promise<T> {
  return page.evaluate(`(async () => { ${SETUP}\n${body}\n})()`) as Promise<T>;
}

test.describe('real-time playback (dev harness)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEV);
  });

  test('pitch changes while playing, tempo/clock stay real, Original/Mi tono compare', async ({ page }) => {
    const r = await run<{
      f0: number[]; f3: number[]; fo: number[]; fback: number[];
      pos0: number; pos1: number; wall: number; stillPlaying: boolean; sr: number;
    }>(page, `
      await player.load(fileA);
      const sr = player.getBuffer().sampleRate;
      const [al, ar] = attach();
      await player.play();
      await sleep(1000);
      const f0 = [listen(al, sr).f, listen(ar, sr).f];
      const pos0 = player.getPosition(); const t0 = performance.now();
      player.setSemitones(-3);
      await sleep(1500);
      const f3 = [listen(al, sr).f, listen(ar, sr).f];
      player.setOriginalPreview(true);
      await sleep(700);
      const fo = [listen(al, sr).f, listen(ar, sr).f];
      player.setOriginalPreview(false);
      await sleep(700);
      const fback = [listen(al, sr).f, listen(ar, sr).f];
      const pos1 = player.getPosition(); const wall = (performance.now() - t0) / 1000;
      return { f0, f3, fo, fback, pos0, pos1, wall, stillPlaying: player.isPlaying(), sr };
    `);
    const near = (m: number, e: number) => Math.abs(12 * Math.log2(m / e));
    expect(near(r.f0[0]!, 440)).toBeLessThan(0.1);
    expect(near(r.f0[1]!, 660)).toBeLessThan(0.1);
    const ratio = 2 ** (-3 / 12);
    expect(near(r.f3[0]!, 440 * ratio)).toBeLessThan(0.1);
    expect(near(r.f3[1]!, 660 * ratio)).toBeLessThan(0.1);
    expect(near(r.fo[0]!, 440)).toBeLessThan(0.1);
    expect(near(r.fo[1]!, 660)).toBeLessThan(0.1);
    expect(near(r.fback[0]!, 440 * ratio)).toBeLessThan(0.1);
    // El reloj del audio avanza al ritmo real (tempo 1.0) aunque haya cambios de tono.
    expect(Math.abs(r.pos1 - r.pos0 - r.wall)).toBeLessThan(0.15);
    expect(r.stillPlaying).toBe(true);
  });

  test('rapid pitch changes keep the engine stable and land on the last value', async ({ page }) => {
    const r = await run<{ f: number; playing: boolean }>(page, `
      await player.load(fileA);
      const sr = player.getBuffer().sampleRate;
      const [al] = attach();
      await player.play();
      for (let i = 0; i < 24; i++) { player.setSemitones((i % 2 ? 5 : -5)); await sleep(15); }
      player.setSemitones(2);
      await sleep(1500);
      return { f: listen(al, sr).f, playing: player.isPlaying() };
    `);
    expect(Math.abs(12 * Math.log2(r.f / (440 * 2 ** (2 / 12))))).toBeLessThan(0.1);
    expect(r.playing).toBe(true);
  });

  test('A–B loop repeats the region (also pitch-shifted) and clearing it continues playback', async ({ page }) => {
    const r = await run<any>(page, `
      await player.load(fileA);
      const sr = player.getBuffer().sampleRate;
      const [al] = attach();
      let ended = 0;
      player.subscribe((e) => { if (e === 'ended') ended++; });
      player.setSemitones(-3);
      player.setLoop({ start: 2, end: 3 });
      player.seek(2.2);
      await player.play();
      const samples = [];
      for (let i = 0; i < 12; i++) { await sleep(250); samples.push(player.getPosition()); }
      const f = listen(al, sr).f;
      const stillPlaying = player.isPlaying();
      player.setLoop(null);
      const afterClearStart = player.getPosition();
      await sleep(1500);
      const afterClear = player.getPosition();
      player.pause();
      player.setLoop({ start: 1, end: 2 });
      player.seek(5); // fuera del bucle: al reproducir vuelve al inicio del bucle
      await player.play();
      await sleep(300);
      const outside = player.getPosition();
      player.pause();
      return { samples, f, stillPlaying, afterClearStart, afterClear, ended, outside };
    `);
    for (const p of r.samples) {
      expect(p).toBeGreaterThanOrEqual(1.99);
      expect(p).toBeLessThanOrEqual(3.01);
    }
    expect(Math.max(...r.samples) - Math.min(...r.samples)).toBeGreaterThan(0.5); // dio varias vueltas
    expect(r.stillPlaying).toBe(true);
    expect(r.ended).toBe(0);
    expect(Math.abs(12 * Math.log2(r.f / (440 * 2 ** (-3 / 12))))).toBeLessThan(0.1);
    expect(r.afterClear - r.afterClearStart).toBeGreaterThan(1.2);
    expect(r.outside).toBeGreaterThanOrEqual(0.99);
    expect(r.outside).toBeLessThanOrEqual(2.01);
  });

  test('tempo changes speed without changing pitch; Original stays at the same speed', async ({ page }) => {
    const r = await run<any>(page, `
      await player.load(fileA);
      const sr = player.getBuffer().sampleRate;
      const [al] = attach();
      player.setSemitones(-3);
      player.setTempo(0.75);
      await player.play();
      await sleep(1000);
      const p0 = player.getPosition(); const t0 = performance.now();
      const fSlow = listen(al, sr).f;
      await sleep(2000);
      const p1 = player.getPosition(); const wall = (performance.now() - t0) / 1000;
      player.setOriginalPreview(true);
      await sleep(900);
      const fOrig = listen(al, sr).f;
      player.setOriginalPreview(false);
      await sleep(900);
      const fBack = listen(al, sr).f;
      const beforeChange = player.getPosition();
      player.setTempo(1.25);
      const afterChange = player.getPosition();
      await sleep(1500);
      const fFast = listen(al, sr).f;
      player.setTempo(1);
      player.setSemitones(0);
      await sleep(900);
      const fPlain = listen(al, sr).f;
      const playing = player.isPlaying();
      player.pause();
      return { ratio: (p1 - p0) / wall, fSlow, fOrig, fBack, fFast, fPlain, beforeChange, afterChange, playing };
    `);
    const err = (m: number, e: number) => Math.abs(12 * Math.log2(m / e));
    expect(r.ratio).toBeGreaterThan(0.68);
    expect(r.ratio).toBeLessThan(0.82);
    expect(err(r.fSlow, 440 * 2 ** (-3 / 12))).toBeLessThan(0.15);
    expect(err(r.fOrig, 440)).toBeLessThan(0.15);
    expect(err(r.fBack, 440 * 2 ** (-3 / 12))).toBeLessThan(0.15);
    expect(err(r.fFast, 440 * 2 ** (-3 / 12))).toBeLessThan(0.15);
    expect(err(r.fPlain, 440)).toBeLessThan(0.15);
    expect(Math.abs(r.afterChange - r.beforeChange)).toBeLessThan(0.2);
    expect(r.playing).toBe(true);
  });

  test('pause keeps position, seek while paused stays paused, no duplicate playback', async ({ page }) => {
    const r = await run<any>(page, `
      await player.load(fileA);
      const sr = player.getBuffer().sampleRate;
      const [al] = attach();
      player.setSemitones(-3);
      await Promise.all([player.play(), player.play(), player.play()]); // pulsaciones rápidas
      await sleep(1500);
      const one = listen(al, sr).rms;
      player.pause();
      const pausedAt = player.getPosition();
      await sleep(500);
      const afterPause = player.getPosition();
      player.seek(5);
      await sleep(300);
      const pausedSeek = { pos: player.getPosition(), playing: player.isPlaying() };
      await player.play();
      await sleep(800);
      const resumed = { pos: player.getPosition(), playing: player.isPlaying(), rms: listen(al, sr).rms };
      player.seek(1);
      await sleep(600);
      const seekPlaying = { pos: player.getPosition(), playing: player.isPlaying() };
      return { one, pausedAt, afterPause, pausedSeek, resumed, seekPlaying };
    `);
    // Una sola reproducción: 0,9 × 0,5 / √2 ≈ 0,32 (el doble indicaría fuentes duplicadas).
    expect(r.one).toBeGreaterThan(0.25);
    expect(r.one).toBeLessThan(0.4);
    expect(Math.abs(r.afterPause - r.pausedAt)).toBeLessThan(0.001);
    expect(r.pausedAt).toBeGreaterThan(1.2);
    expect(r.pausedSeek.pos).toBeCloseTo(5, 2);
    expect(r.pausedSeek.playing).toBe(false);
    expect(r.resumed.playing).toBe(true);
    expect(r.resumed.pos).toBeGreaterThan(5.6);
    expect(r.resumed.rms).toBeGreaterThan(0.25);
    expect(r.resumed.rms).toBeLessThan(0.4);
    expect(r.seekPlaying.playing).toBe(true);
    expect(r.seekPlaying.pos).toBeGreaterThan(1.4);
    expect(r.seekPlaying.pos).toBeLessThan(2.0);
  });

  test('plays to the end, reports ended, can replay from the start; seek near the end', async ({ page }) => {
    const r = await run<any>(page, `
      await player.load(fileB);
      let ended = 0;
      player.subscribe((e) => { if (e === 'ended') ended++; });
      player.setSemitones(-3);
      await player.play();
      player.seek(2.2);
      await sleep(1800);
      const afterEnd = { pos: player.getPosition(), playing: player.isPlaying(), ended, dur: player.getBuffer().duration };
      await player.play();
      await sleep(400);
      const replay = { pos: player.getPosition(), playing: player.isPlaying() };
      return { afterEnd, replay };
    `);
    expect(r.afterEnd.ended).toBe(1);
    expect(r.afterEnd.playing).toBe(false);
    expect(r.afterEnd.pos).toBeCloseTo(r.afterEnd.dur, 2);
    expect(r.replay.playing).toBe(true);
    expect(r.replay.pos).toBeLessThan(1);
  });

  test('loading another song resets state; a stale load cannot replace a newer one', async ({ page }) => {
    const r = await run<any>(page, `
      await player.load(fileA);
      player.setSemitones(4);
      await player.play();
      await sleep(500);
      const first = player.load(fileA).then(() => 'loaded', (e) => (e instanceof StaleLoadError ? 'stale' : 'error'));
      const second = await player.load(fileB);
      const firstResult = await first;
      return {
        firstResult, duration: second.duration, buffer: player.getBuffer().duration,
        playing: player.isPlaying(), pos: player.getPosition(),
      };
    `);
    expect(r.firstResult).toBe('stale');
    expect(r.buffer).toBeCloseTo(r.duration, 3);
    expect(r.duration).toBeGreaterThan(2.9);
    expect(r.duration).toBeLessThan(3.2);
    expect(r.playing).toBe(false);
    expect(r.pos).toBe(0);
  });

  test('rejects empty and corrupt files with clear errors', async ({ page }) => {
    const r = await run<any>(page, `
      const { DecodeError } = await import('/src/audio/engine.ts');
      const out = {};
      for (const [k, f] of [['empty', new File([], 'x.mp3')], ['junk', new File([new Uint8Array(5000).map((_, i) => (i * 37) & 255)], 'x.mp3')]]) {
        try { await player.load(f); out[k] = 'ok'; } catch (e) { out[k] = e instanceof DecodeError ? e.reason : 'other'; }
      }
      return out;
    `);
    expect(r.empty).toBe('empty');
    expect(r.junk).toBe('unsupported');
  });
});
