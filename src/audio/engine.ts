import type { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { OUTPUT_GAIN, PROCESSOR_LATENCY_SEC, clampSemitones } from './math';
import { createPitchNode, registerPitchProcessor } from './pitch';

export interface LoadedTrack {
  name: string;
  duration: number;
  channels: number;
  sampleRate: number;
}

export type EngineEvent = 'ended' | 'interrupted' | 'statechange';

/** Interfaz mínima del motor de reproducción; la interfaz de usuario no conoce los detalles internos. */
export interface AudioEngine {
  /** Debe invocarse desde un gesto del usuario (crea/reanuda el AudioContext). */
  unlock(): Promise<void>;
  load(file: File): Promise<LoadedTrack>;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setSemitones(semitones: number): void;
  setOriginalPreview(value: boolean): void;
  getPosition(): number;
  isPlaying(): boolean;
  getBuffer(): AudioBuffer | null;
  subscribe(listener: (event: EngineEvent) => void): () => void;
  dispose(): void;
}

export class DecodeError extends Error {
  constructor(readonly reason: 'empty' | 'unsupported', message: string) {
    super(message);
  }
}

export class StaleLoadError extends Error {
  constructor() {
    super('Carga reemplazada por otra más reciente');
  }
}

interface Chain {
  source: AudioBufferSourceNode;
  keepAlive: ConstantSourceNode;
  pitch: SoundTouchNode;
  direct: GainNode;
  delay: DelayNode;
  processed: GainNode;
  fade: GainNode;
  /** true cuando la ruta procesada es la que se escucha (o está entrando). */
  audible: boolean;
}

const FADE_TC = 0.008;
const MIX_SETTLE_MS = 40;
/** Cola tras el final del audio para vaciar los buffers internos del procesador. */
const END_TAIL_SEC = PROCESSOR_LATENCY_SEC + 0.15;

export class PitchPlayer implements AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private chain: Chain | null = null;
  private semitones = 0;
  private originalPreview = false;
  private playing = false;
  private offset = 0;
  private startedAt = 0;
  private loadId = 0;
  private playToken = 0;
  private mixTimer: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(event: EngineEvent) => void>();
  private disposed = false;

  private emit(event: EngineEvent) {
    for (const l of this.listeners) l(event);
  }

  subscribe(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    const master = ctx.createGain();
    master.gain.value = OUTPUT_GAIN;
    master.connect(ctx.destination);
    ctx.onstatechange = () => {
      if (this.playing && ctx.state !== 'running') {
        this.freezePosition();
        this.teardownChain();
        this.playing = false;
        this.emit('interrupted');
      }
      this.emit('statechange');
    };
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  async unlock(): Promise<void> {
    const ctx = this.ensureContext();
    if (ctx.state !== 'running') await ctx.resume();
    await registerPitchProcessor(ctx);
  }

  async load(file: File): Promise<LoadedTrack> {
    const id = ++this.loadId;
    this.stopAndReset();
    const ctx = this.ensureContext();
    if (file.size === 0) throw new DecodeError('empty', 'El archivo está vacío.');
    const data = await file.arrayBuffer();
    if (id !== this.loadId) throw new StaleLoadError();
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(data);
    } catch {
      if (id !== this.loadId) throw new StaleLoadError();
      throw new DecodeError('unsupported', 'No se pudo leer el audio. Verifica que sea un MP3 válido.');
    }
    if (id !== this.loadId) throw new StaleLoadError();
    if (decoded.length === 0) throw new DecodeError('empty', 'El archivo no contiene audio.');
    this.buffer = decoded;
    this.offset = 0;
    this.semitones = 0;
    this.originalPreview = false;
    return {
      name: file.name,
      duration: decoded.duration,
      channels: decoded.numberOfChannels,
      sampleRate: decoded.sampleRate,
    };
  }

  getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  /** Nodo de salida y contexto, para que las pruebas midan lo que realmente suena. */
  getTap(): { ctx: AudioContext; node: AudioNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, node: this.master } : null;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getPosition(): number {
    if (!this.buffer) return 0;
    if (!this.playing || !this.ctx || !this.chain) return this.offset;
    const pos = this.offset + (this.ctx.currentTime - this.startedAt);
    return Math.min(pos, this.buffer.duration);
  }

  async play(): Promise<void> {
    if (!this.buffer || this.playing || this.disposed) return;
    const ctx = this.ensureContext();
    const token = ++this.playToken;
    this.playing = true; // bloquea pulsaciones repetidas mientras se reanuda el contexto
    try {
      if (ctx.state !== 'running') await ctx.resume();
      await registerPitchProcessor(ctx);
    } catch (e) {
      if (token === this.playToken) this.playing = false;
      throw e;
    }
    if (token !== this.playToken || !this.playing) return;
    if (this.offset >= this.buffer.duration - 0.01) this.offset = 0;
    this.startChain(this.offset);
  }

  pause(): void {
    if (!this.playing) return;
    this.playToken++;
    this.freezePosition();
    this.playing = false;
    this.teardownChain();
  }

  seek(seconds: number): void {
    if (!this.buffer) return;
    const t = Math.min(Math.max(0, seconds), this.buffer.duration);
    this.offset = t;
    if (this.playing && this.ctx && this.chain) {
      this.teardownChain();
      if (t >= this.buffer.duration - 0.01) {
        this.finish();
      } else {
        this.startChain(t);
      }
    }
  }

  setSemitones(semitones: number): void {
    this.semitones = clampSemitones(semitones);
    // Cambiar el tono mientras se escucha el original vuelve al modo modificado.
    this.originalPreview = false;
    this.applyMix(true);
  }

  setOriginalPreview(value: boolean): void {
    this.originalPreview = value;
    this.applyMix(false);
  }

  private useProcessed(): boolean {
    return this.semitones !== 0 && !this.originalPreview;
  }

  private freezePosition() {
    if (this.buffer && this.ctx && this.playing && this.chain) {
      this.offset = Math.min(this.offset + (this.ctx.currentTime - this.startedAt), this.buffer.duration);
    }
  }

  private startChain(offset: number) {
    const ctx = this.ctx!;
    const buffer = this.buffer!;
    const master = this.master!;
    this.teardownChain();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const keepAlive = ctx.createConstantSource();
    keepAlive.offset.value = 0;
    const pitch = createPitchNode(ctx, this.semitones, buffer.numberOfChannels);
    const direct = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = PROCESSOR_LATENCY_SEC;
    const processed = ctx.createGain();
    const fade = ctx.createGain();
    const procOn = this.useProcessed();
    direct.gain.value = procOn ? 0 : 1;
    processed.gain.value = procOn ? 1 : 0;
    const now = ctx.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.setTargetAtTime(1, now, FADE_TC);

    source.connect(delay).connect(direct).connect(fade);
    source.connect(pitch);
    keepAlive.connect(pitch); // mantiene activa la entrada para vaciar la cola del procesador
    pitch.connect(processed).connect(fade);
    fade.connect(master);

    const when = ctx.currentTime;
    source.start(when, offset);
    keepAlive.start(when);
    this.startedAt = when;
    this.offset = offset;
    this.chain = { source, keepAlive, pitch, direct, delay, processed, fade, audible: procOn };

    const remaining = buffer.duration - offset;
    keepAlive.stop(when + remaining + END_TAIL_SEC);
    const token = this.playToken;
    keepAlive.onended = () => {
      if (token === this.playToken && this.playing && this.chain?.keepAlive === keepAlive) this.finish();
    };
  }

  private finish() {
    this.playToken++;
    this.playing = false;
    this.offset = this.buffer?.duration ?? 0;
    this.teardownChain();
    this.emit('ended');
  }

  private teardownChain() {
    clearTimeout(this.mixTimer);
    const c = this.chain;
    if (!c) return;
    this.chain = null;
    c.keepAlive.onended = null;
    for (const node of [c.source, c.keepAlive]) {
      try {
        node.stop();
      } catch {
        /* ya detenido */
      }
    }
    for (const node of [c.source, c.keepAlive, c.pitch, c.direct, c.delay, c.processed, c.fade]) {
      node.disconnect();
    }
  }

  /** Cambia entre ruta directa y procesada con un fundido corto; la última petición prevalece. */
  private applyMix(pitchChanged: boolean) {
    const c = this.chain;
    const ctx = this.ctx;
    if (!c || !ctx) return;
    clearTimeout(this.mixTimer);
    const target = this.semitones;
    const want = this.useProcessed();
    const wasAudible = c.audible;
    c.audible = want;

    const fadeTo = (processed: number, direct: number) => {
      const t = ctx.currentTime;
      c.processed.gain.cancelScheduledValues(t);
      c.direct.gain.cancelScheduledValues(t);
      c.processed.gain.setTargetAtTime(processed, t, FADE_TC);
      c.direct.gain.setTargetAtTime(direct, t, FADE_TC);
    };

    if (pitchChanged && wasAudible) {
      // Se silencia la ruta procesada antes de cambiar el parámetro para evitar saltos audibles.
      fadeTo(0, want ? 0 : 1);
      this.mixTimer = setTimeout(() => {
        if (this.chain !== c) return;
        c.pitch.pitchSemitones.value = target;
        if (want) fadeTo(1, 0);
      }, MIX_SETTLE_MS);
      return;
    }

    c.pitch.pitchSemitones.value = target;
    if (want) {
      this.mixTimer = setTimeout(() => {
        if (this.chain === c) fadeTo(1, 0);
      }, pitchChanged ? MIX_SETTLE_MS : 0);
    } else {
      fadeTo(0, 1);
    }
  }
  private stopAndReset() {
    this.playToken++;
    this.playing = false;
    this.teardownChain();
    this.buffer = null;
    this.offset = 0;
    this.semitones = 0;
    this.originalPreview = false;
  }

  dispose(): void {
    this.disposed = true;
    this.loadId++;
    this.stopAndReset();
    this.listeners.clear();
    if (this.ctx) {
      this.ctx.onstatechange = null;
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }
}
