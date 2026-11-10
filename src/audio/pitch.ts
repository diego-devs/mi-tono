import type { SoundTouchNode as SoundTouchNodeType } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';

export { processorUrl };

const registered = new WeakSet<BaseAudioContext>();
let SoundTouchNode: typeof SoundTouchNodeType | null = null;

/** El módulo del procesador extiende AudioWorkletNode al cargarse; se importa de forma diferida para no romper navegadores sin soporte. */
export function isPitchEngineSupported(): boolean {
  return typeof AudioWorkletNode !== 'undefined' && typeof OfflineAudioContext !== 'undefined';
}

export async function registerPitchProcessor(ctx: BaseAudioContext): Promise<void> {
  if (!isPitchEngineSupported()) throw new Error('AudioWorklet no disponible');
  SoundTouchNode ??= (await import('@soundtouchjs/audio-worklet')).SoundTouchNode;
  if (registered.has(ctx)) return;
  await SoundTouchNode.register(ctx, processorUrl);
  registered.add(ctx);
}

/**
 * Crea el nodo de cambio de tono. Se usa el parámetro `pitchSemitones` (semitonos)
 * y se deja `pitch` y `playbackRate` en 1: el tempo no cambia.
 */
export function createPitchNode(
  ctx: BaseAudioContext,
  semitones: number,
  channels: number,
): SoundTouchNodeType {
  if (!SoundTouchNode) throw new Error('Procesador no registrado');
  const node = new SoundTouchNode({
    context: ctx,
    outputChannelCount: channels === 1 ? 1 : 2,
  });
  node.pitchSemitones.value = semitones;
  return node;
}
