import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ANALYSIS_JS } from './analysis';
import { makeSineMp3 } from '../tests/helpers/makeMp3';

const PROD = 'http://localhost:4173/';

function mp3File(name: string, seconds: number, freqs: number[], sampleRate = 44100, burst?: number) {
  return { name, mimeType: 'audio/mpeg', buffer: Buffer.from(makeSineMp3({ seconds, freqs, sampleRate, burst })) };
}

/** Decodifica el MP3 descargado en el navegador y mide frecuencia, duración y canales. */
async function analyzeMp3(page: Page, bytes: Buffer) {
  return page.evaluate(`(async () => {
    ${ANALYSIS_JS}
    const bin = atob('${bytes.toString('base64')}');
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(u.buffer);
    const sr = buf.sampleRate;
    const L = buf.getChannelData(0);
    const R = buf.getChannelData(buf.numberOfChannels - 1);
    const edges = envelopeEdges(L, sr);
    return {
      duration: buf.duration, channels: buf.numberOfChannels, sampleRate: sr,
      freqL: estimateFreq(L, sr, Math.round(sr), Math.round(sr * 3)),
      freqR: estimateFreq(R, sr, Math.round(sr), Math.round(sr * 3)),
      start: edges[0], end: edges[1], peak: L.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
    };
  })()`) as Promise<{
    duration: number; channels: number; sampleRate: number; freqL: number; freqR: number;
    start: number; end: number; peak: number;
  }>;
}

async function openSong(page: Page, file: ReturnType<typeof mp3File>) {
  await page.getByTestId('file-input').setInputFiles(file);
  await expect(page.getByText('Preparando audio…')).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.track-name')).toHaveText(file.name);
}

async function exportAndDownload(page: Page) {
  await page.getByRole('button', { name: 'Exportar MP3' }).click();
  const save = page.getByRole('button', { name: 'Guardar o compartir' });
  await expect(save).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
  const path = await download.path();
  return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

const semitoneError = (m: number, e: number) => Math.abs(12 * Math.log2(m / e));

test.beforeEach(async ({ page }) => {
  // Fuerza la ruta de descarga por Blob URL (en escritorio navigator.share abriría un diálogo nativo).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await page.goto(PROD);
});

test('auto-heal: if the app script fails to load, it clears caches and recovers on its own', async ({ page }) => {
  let blocked = false;
  await page.route('**/assets/index-*.js', (route) => {
    if (!blocked) {
      blocked = true;
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(PROD);
  await expect(page.getByRole('heading', { name: 'Mi Tono' })).toBeVisible({ timeout: 15000 });
  expect(blocked).toBe(true);
});

test('UI: controls, limits, compare, reset', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mi Tono' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reproducir' })).toBeDisabled();
  await openSong(page, mp3File('demo.mp3', 8, [440, 660]));
  await expect(page.locator('.track-duration')).toHaveText('0:08');
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('0 semitonos');

  const down = page.getByRole('button', { name: 'Bajar un semitono' });
  const up = page.getByRole('button', { name: 'Subir un semitono' });
  for (let i = 0; i < 3; i++) await down.click();
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('−3 semitonos');
  const slower = page.getByRole('button', { name: 'Más lento' });
  await expect(page.getByLabel('Velocidad de práctica')).toHaveText('100 %');
  await slower.click();
  await slower.click();
  await expect(page.getByLabel('Velocidad de práctica')).toHaveText('90 %');
  for (let i = 0; i < 8; i++) await slower.click();
  await expect(page.getByLabel('Velocidad de práctica')).toHaveText('50 %');
  await expect(slower).toBeDisabled();
  await page.getByRole('button', { name: 'Velocidad normal' }).click();
  await expect(page.getByLabel('Velocidad de práctica')).toHaveText('100 %');
  for (let i = 0; i < 9; i++) await down.click();
  await expect(down).toBeDisabled();
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('−12 semitonos');
  for (let i = 0; i < 24; i++) await up.click();
  await expect(up).toBeDisabled();
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('+12 semitonos');
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('0 semitonos');

  await down.click();
  await down.click();
  await page.getByRole('button', { name: 'Original' }).click();
  await expect(page.getByRole('button', { name: 'Original' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('−2 semitonos'); // no se borra el ajuste
  await page.getByRole('button', { name: 'Mi tono' }).click();
  await expect(page.getByRole('button', { name: 'Mi tono' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Original' }).click();
  await up.click(); // cambiar semitonos vuelve al modo modificado
  await expect(page.getByRole('button', { name: 'Mi tono' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Reproducir' }).click();
  await expect(page.getByRole('button', { name: 'Pausa' })).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Pausa' }).click();
  await expect(page.locator('.times span').first()).not.toHaveText('0:00');
  await expect(page.locator('body')).not.toHaveJSProperty('scrollWidth', 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('practice: skip ±10 s, A–B loop UI, remembered pitch per song', async ({ page }) => {
  const file = mp3File('practica.mp3', 30, [440, 660]);
  await openSong(page, file);
  const time = page.locator('.times span').first();
  await page.getByRole('button', { name: 'Adelantar 10 segundos' }).click();
  await expect(time).toHaveText('0:10');
  await page.getByRole('button', { name: 'Retroceder 10 segundos' }).click();
  await page.getByRole('button', { name: 'Retroceder 10 segundos' }).click();
  await expect(time).toHaveText('0:00');

  const status = page.getByTestId('loop-status');
  await expect(page.getByRole('button', { name: 'Marcar B' })).toBeDisabled();
  await page.getByRole('button', { name: 'Adelantar 10 segundos' }).click();
  await page.getByRole('button', { name: 'Marcar A' }).click();
  await expect(status).toContainText('A en 0:10');
  await page.getByRole('button', { name: 'Marcar B' }).click(); // B = A: demasiado corto
  await expect(page.locator('.notice')).toContainText('al menos');
  await page.getByRole('button', { name: 'Adelantar 10 segundos' }).click();
  await page.getByRole('button', { name: 'Marcar B' }).click();
  await expect(status).toContainText('Repitiendo de 0:10 a 0:20');

  // Las marcas doradas quedan sobre la barra, en la posición exacta (la barra reserva 12 px por lado para el pulgar).
  const bar = await page.getByLabel('Posición de la canción').boundingBox();
  const xOf = async (id: string) => {
    const box = await page.getByTestId(id).boundingBox();
    return box!.x;
  };
  const expected = (t: number) => bar!.x + 12 + (bar!.width - 24) * (t / 30);
  expect(Math.abs((await xOf('marker-a')) - expected(10))).toBeLessThan(3);
  expect(Math.abs((await xOf('marker-b')) - expected(20))).toBeLessThan(3);
  await expect(page.getByTestId('loop-region')).toBeVisible();
  await page.locator('main').screenshot({ path: 'test-results/markers.png' });

  await page.getByRole('button', { name: 'Reproducir' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Quitar bucle' }).click();
  await expect(status).toContainText('Marca A y B');
  await expect(page.getByTestId('marker-a')).toHaveCount(0);
  await expect(page.getByTestId('marker-b')).toHaveCount(0);
  await page.getByRole('button', { name: 'Pausa' }).click();

  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Bajar un semitono' }).click();
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('−4 semitonos');
  await page.reload();
  await openSong(page, file);
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('−4 semitonos');
  await expect(page.locator('.notice')).toContainText('Se restauró tu tono');
  await openSong(page, mp3File('otra.mp3', 5, [300, 300]));
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('0 semitonos');
  await openSong(page, file);
  await page.getByRole('button', { name: 'Restablecer' }).click();
  await page.reload();
  await openSong(page, file);
  await expect(page.getByLabel('Ajuste de tono')).toHaveText('0 semitonos');
});

test('export -3 st: real MP3 with correct pitch, duration, stereo and file name', async ({ page }) => {
  await openSong(page, mp3File('Mi canción.mp3', 8, [440, 660], 44100));
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Bajar un semitono' }).click();
  await expect(page.getByText(/Se exportará la canción completa a/)).toContainText('−3 semitonos');
  const { name, bytes } = await exportAndDownload(page);
  expect(name).toBe('Mi canción_-3st.mp3');
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]! & 0xe0).toBe(0xe0);
  const a = await analyzeMp3(page, bytes);
  const r = 2 ** (-3 / 12);
  console.log('export -3st', JSON.stringify(a));
  expect(a.channels).toBe(2);
  expect(semitoneError(a.freqL, 440 * r)).toBeLessThan(0.1);
  expect(semitoneError(a.freqR, 660 * r)).toBeLessThan(0.1);
  // Duración: 8 s ± retardo/relleno del codificador MP3 (≈ 1105 muestras de retardo + relleno de trama).
  expect(Math.abs(a.duration - 8)).toBeLessThan(0.15);
});

test('export keeps tempo (burst end) and 0 st / +12 st variants', async ({ page }) => {
  await openSong(page, mp3File('rafaga.mp3', 8, [440, 440], 44100, 5));
  const plus = page.getByRole('button', { name: 'Subir un semitono' });
  for (let i = 0; i < 12; i++) await plus.click();
  const up = await exportAndDownload(page);
  expect(up.name).toBe('rafaga_+12st.mp3');
  const a = await analyzeMp3(page, up.bytes);
  expect(semitoneError(a.freqL, 880)).toBeLessThan(0.1);
  expect(Math.abs(a.end - 5)).toBeLessThan(0.1); // la nota final no se trunca ni se desplaza
  expect(Math.abs(a.start)).toBeLessThan(0.1);

  await page.getByRole('button', { name: 'Restablecer' }).click();
  const zero = await exportAndDownload(page);
  expect(zero.name).toBe('rafaga_0st.mp3');
  const z = await analyzeMp3(page, zero.bytes);
  expect(semitoneError(z.freqL, 440)).toBeLessThan(0.1);
  expect(Math.abs(z.end - 5)).toBeLessThan(0.1);
});

test('export mono keeps one channel; 22.05 kHz input is converted to a supported rate', async ({ page }) => {
  await openSong(page, mp3File('mono.mp3', 4, [440]));
  await page.getByRole('button', { name: 'Subir un semitono' }).click();
  const mono = await exportAndDownload(page);
  expect((await analyzeMp3(page, mono.bytes)).channels).toBe(1);

  await openSong(page, mp3File('bajo.mp3', 4, [440, 440], 22050));
  const low = await exportAndDownload(page);
  const idx = (low.bytes[2]! >> 2) & 3;
  expect(((low.bytes[1]! >> 3) & 3)).toBe(3); // MPEG-1
  expect([0, 1, 2]).toContain(idx); // 44,1 / 48 / 32 kHz
});

test('cancel export, then retry succeeds; export blocks other controls', async ({ page }) => {
  await openSong(page, mp3File('larga.mp3', 120, [330, 330]));
  await page.getByRole('button', { name: 'Bajar un semitono' }).click();
  await page.getByRole('button', { name: 'Exportar MP3' }).click();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reproducir' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Abrir MP3' })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('button', { name: 'Cancelar' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Exportar MP3' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Guardar o compartir' })).toBeHidden();

  const retry = await exportAndDownload(page);
  expect(retry.name).toBe('larga_-1st.mp3');
  expect(retry.bytes.length).toBeGreaterThan(120 * 24000 * 0.9);
});

test('offline: prepared app reloads with no network and still plays and exports', async ({ page, context }) => {
  await expect(page.getByText('Lista para usar sin conexión')).toBeVisible({ timeout: 30_000 });
  await context.setOffline(true);
  const failures: string[] = [];
  page.on('requestfailed', (r) => failures.push(r.url()));
  await page.reload();
  await expect(page.getByText('Lista para usar sin conexión')).toBeVisible({ timeout: 30_000 });

  await openSong(page, mp3File('offline.mp3', 6, [440, 660]));
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Bajar un semitono' }).click();
  await page.getByRole('button', { name: 'Reproducir' }).click();
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'Pausa' }).click();
  const out = await exportAndDownload(page);
  expect(out.name).toBe('offline_-3st.mp3');
  const a = await analyzeMp3(page, out.bytes);
  expect(semitoneError(a.freqL, 440 * 2 ** (-3 / 12))).toBeLessThan(0.1);
  expect(failures).toEqual([]);
});
