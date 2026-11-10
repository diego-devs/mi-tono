import mp3WorkerUrl from '../workers/mp3.worker.ts?worker&url';
import type { WorkerRequest, WorkerResponse } from '../workers/mp3.worker';
import { OUTPUT_GAIN, PROCESSOR_LATENCY_SEC, exportSampleRate } from './math';
import { createPitchNode, registerPitchProcessor } from './pitch';

export { mp3WorkerUrl };

export const MP3_KBPS = 192;
const FRAMES_PER_CHUNK = 1152 * 40;
const RENDER_STEPS = 20;
const QUANTUM = 128;

export type ExportStage = 'preparing' | 'processing' | 'encoding' | 'done';

export interface ExportProgress {
  stage: ExportStage;
  /** Fracción 0–1 cuando es medible; `null` cuando la etapa es indeterminada. */
  fraction: number | null;
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Exportación cancelada');
  }
}

export interface ExportResult {
  blob: Blob;
  semitones: number;
  sampleRate: number;
  channels: number;
  /** Duración musical esperada en segundos (sin retardo del codificador). */
  duration: number;
}

export interface ExportJob {
  promise: Promise<ExportResult>;
  cancel(): void;
}

/**
 * Renderiza `input` con el cambio de tono fijo en un OfflineAudioContext, usando el mismo
 * nodo y parámetros que la reproducción, y descarta el retardo inicial del procesador.
 * El contexto se mantiene vivo hasta terminar; `onProgress` recibe fracciones medibles.
 */
export async function renderPitched(
  input: AudioBuffer,
  semitones: number,
  sampleRate: number,
  onProgress?: (fraction: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<{ buffer: AudioBuffer; skipFrames: number }> {
  const outFrames = Math.round(input.duration * sampleRate);
  const latencyFrames = Math.round(PROCESSOR_LATENCY_SEC * sampleRate);
  const totalFrames = outFrames + latencyFrames;
  const channels = Math.min(2, input.numberOfChannels);
  const ctx = new OfflineAudioContext(channels, totalFrames, sampleRate);
  await registerPitchProcessor(ctx);

  const pitch = createPitchNode(ctx, semitones, channels);
  const source = ctx.createBufferSource();
  source.buffer = input;
  const keepAlive = ctx.createConstantSource();
  keepAlive.offset.value = 0;
  source.connect(pitch);
  keepAlive.connect(pitch); // mantiene activa la entrada para vaciar la cola del procesador
  pitch.connect(ctx.destination);
  source.start(0);
  keepAlive.start(0);

  if (onProgress) {
    for (let i = 1; i < RENDER_STEPS; i++) {
      const frame = Math.floor((totalFrames * i) / RENDER_STEPS / QUANTUM) * QUANTUM;
      if (frame <= 0 || frame >= totalFrames) continue;
      const fraction = i / RENDER_STEPS;
      ctx.suspend(frame / sampleRate).then(() => {
        onProgress(fraction);
        if (!isCancelled()) return ctx.resume();
      }, () => undefined);
    }
  }
  const buffer = await ctx.startRendering();
  return { buffer, skipFrames: latencyFrames };
}

function peakOf(buffer: AudioBuffer, from: number, to: number): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = from; i < to; i++) {
      const v = Math.abs(data[i] ?? 0);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

export function startExport(
  input: AudioBuffer,
  semitones: number,
  onProgress: (p: ExportProgress) => void,
): ExportJob {
  let cancelled = false;
  let worker: Worker | null = null;
  let rejectOuter: ((e: unknown) => void) | null = null;

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    worker?.terminate();
    worker = null;
    rejectOuter?.(new ExportCancelledError());
  };

  const run = async (): Promise<ExportResult> => {
    const guard = () => {
      if (cancelled) throw new ExportCancelledError();
    };
    onProgress({ stage: 'preparing', fraction: null });
    const sampleRate = exportSampleRate(input.sampleRate);
    const channels = Math.min(2, input.numberOfChannels) as 1 | 2;
    const expectedFrames = Math.round(input.duration * sampleRate);

    let source: AudioBuffer;
    let skip = 0;
    if (semitones === 0 && sampleRate === input.sampleRate) {
      source = input;
    } else {
      onProgress({ stage: 'processing', fraction: 0 });
      const rendered = await renderPitched(
        input,
        semitones,
        sampleRate,
        (fraction) => onProgress({ stage: 'processing', fraction }),
        () => cancelled,
      );
      guard();
      source = rendered.buffer;
      skip = rendered.skipFrames;
    }
    const end = Math.min(source.length, skip + expectedFrames);
    const peak = peakOf(source, skip, end);
    const scale = peak * OUTPUT_GAIN > 0.999 ? 0.999 / peak : OUTPUT_GAIN;

    guard();
    onProgress({ stage: 'encoding', fraction: 0 });
    const w = new Worker(mp3WorkerUrl, { type: 'module' });
    worker = w;
    const send = (msg: WorkerRequest, transfer: Transferable[] = []) => w.postMessage(msg, transfer);
    const next = () =>
      new Promise<WorkerResponse>((resolve, reject) => {
        w.onmessage = (e: MessageEvent<WorkerResponse>) => resolve(e.data);
        w.onerror = (e) => reject(new Error(e.message || 'Error en el codificador'));
      });
    const expect = async <T extends WorkerResponse['type']>(type: T) => {
      const res = await next();
      guard();
      if (res.type === 'error') throw new Error(res.message);
      if (res.type !== type) throw new Error('Respuesta inesperada del codificador');
      return res as Extract<WorkerResponse, { type: T }>;
    };

    send({ type: 'init', channels, sampleRate, kbps: MP3_KBPS });
    await expect('ready');

    const total = end - skip;
    for (let pos = 0; pos < total; pos += FRAMES_PER_CHUNK) {
      const count = Math.min(FRAMES_PER_CHUNK, total - pos);
      const make = (ch: number) => {
        const out = new Float32Array(count);
        source.copyFromChannel(out, Math.min(ch, source.numberOfChannels - 1), skip + pos);
        for (let i = 0; i < count; i++) out[i] = (out[i] ?? 0) * scale;
        return out;
      };
      const left = make(0);
      const right = channels === 2 ? make(1) : undefined;
      send(
        { type: 'chunk', left, right },
        right ? [left.buffer, right.buffer] : [left.buffer],
      );
      await expect('ack');
      onProgress({ stage: 'encoding', fraction: Math.min(1, (pos + count) / total) });
    }

    send({ type: 'finish' });
    const done = await expect('done');
    w.terminate();
    worker = null;
    onProgress({ stage: 'done', fraction: 1 });
    return {
      blob: done.blob,
      semitones,
      sampleRate,
      channels,
      duration: expectedFrames / sampleRate,
    };
  };

  const promise = new Promise<ExportResult>((resolve, reject) => {
    rejectOuter = reject;
    run().then(resolve, (e) => {
      worker?.terminate();
      worker = null;
      reject(cancelled ? new ExportCancelledError() : e);
    });
  });

  return { promise, cancel };
}
