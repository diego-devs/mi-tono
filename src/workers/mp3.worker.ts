/// <reference lib="webworker" />
import { Mp3Encoder } from '@breezystack/lamejs';

export type WorkerRequest =
  | { type: 'init'; channels: 1 | 2; sampleRate: number; kbps: number }
  | { type: 'chunk'; left: Float32Array; right?: Float32Array }
  | { type: 'finish' };

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'ack'; frames: number }
  | { type: 'done'; blob: Blob }
  | { type: 'error'; message: string };

let encoder: Mp3Encoder | null = null;
let channels: 1 | 2 = 2;
const parts: Uint8Array<ArrayBuffer>[] = [];

function toInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i] ?? 0));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function keep(data: Uint8Array) {
  if (data.length > 0) parts.push(new Uint8Array(data));
}

const ctx = self as DedicatedWorkerGlobalScope;

ctx.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'init') {
      channels = msg.channels;
      encoder = new Mp3Encoder(msg.channels, msg.sampleRate, msg.kbps);
      parts.length = 0;
      ctx.postMessage({ type: 'ready' } satisfies WorkerResponse);
    } else if (msg.type === 'chunk') {
      if (!encoder) throw new Error('Codificador no inicializado');
      const left = toInt16(msg.left);
      const data =
        channels === 2 && msg.right
          ? encoder.encodeBuffer(left, toInt16(msg.right))
          : encoder.encodeBuffer(left);
      keep(data);
      ctx.postMessage({ type: 'ack', frames: msg.left.length } satisfies WorkerResponse);
    } else if (msg.type === 'finish') {
      if (!encoder) throw new Error('Codificador no inicializado');
      keep(encoder.flush());
      const blob = new Blob(parts, { type: 'audio/mpeg' });
      parts.length = 0;
      encoder = null;
      ctx.postMessage({ type: 'done', blob } satisfies WorkerResponse);
    }
  } catch (e) {
    ctx.postMessage({
      type: 'error',
      message: e instanceof Error ? e.message : String(e),
    } satisfies WorkerResponse);
  }
};
