import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DecodeError, PitchPlayer, StaleLoadError, type LoadedTrack } from '../audio/engine';
import {
  ExportCancelledError,
  startExport,
  type ExportJob,
  type ExportProgress,
  type ExportResult,
} from '../audio/exporter';
import { MAX_SEMITONES, MAX_TEMPO, MIN_LOOP_SEC, MIN_SEMITONES, MIN_TEMPO, clampSemitones, clampTempo, makeLoop } from '../audio/math';
import { getStore, loadPitch, savePitch, songKey } from '../utils/memory';
import { exportFileName, formatSemitones, formatTime } from '../utils/format';
import { canShareFile, shareFile, triggerDownload } from '../utils/share';

export type LoadState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'ready'; track: LoadedTrack }
  | { status: 'error'; message: string };

export type ExportState =
  | { status: 'idle' }
  | { status: 'running'; progress: ExportProgress; semitones: number }
  | { status: 'done'; file: File; url: string; semitones: number }
  | { status: 'error'; message: string };

export function usePlayer() {
  const engineRef = useRef<PitchPlayer | null>(null);
  if (!engineRef.current) engineRef.current = new PitchPlayer();
  const engine = engineRef.current;

  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [semitones, setSemitonesState] = useState(0);
  const [originalPreview, setOriginalPreviewState] = useState(false);
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const jobRef = useRef<ExportJob | null>(null);
  const exportIdRef = useRef(0);
  const loadIdRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const songKeyRef = useRef<string | null>(null);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [tempo, setTempoState] = useState(1);
  const [songId, setSongId] = useState<string | null>(null);

  const releaseResult = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const announce = useCallback((msg: string) => setAnnouncement(msg), []);

  useEffect(() => {
    const off = engine.subscribe((event) => {
      if (event === 'ended') {
        setPlaying(false);
        setPosition(engine.getBuffer()?.duration ?? 0);
        setAnnouncement('Fin de la canción');
      } else if (event === 'interrupted') {
        setPlaying(false);
        setPosition(engine.getPosition());
        setNotice('La reproducción se interrumpió. Pulsa reproducir para continuar.');
      }
    });
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && engine.isPlaying()) {
        engine.pause();
        setPlaying(false);
        setPosition(engine.getPosition());
        setNotice('La reproducción se pausó al salir de la app.');
      }
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onHidden);
      jobRef.current?.cancel();
      releaseResult();
      engine.dispose();
    };
  }, [engine, releaseResult]);

  // El reloj de la interfaz solo lee la posición del motor; no la gobierna.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setPosition(engine.getPosition()), 100);
    return () => clearInterval(id);
  }, [playing, engine]);

  const resetExport = useCallback(() => {
    exportIdRef.current++;
    jobRef.current?.cancel();
    jobRef.current = null;
    releaseResult();
    setExportState({ status: 'idle' });
  }, [releaseResult]);

  const openFile = useCallback(
    async (file: File) => {
      const id = ++loadIdRef.current;
      resetExport();
      setNotice('');
      setPlaying(false);
      setPosition(0);
      setScrub(null);
      setSemitonesState(0);
      setOriginalPreviewState(false);
      setLoopA(null);
      setLoopB(null);
      setTempoState(1);
      songKeyRef.current = null;
      setSongId(null);
      setLoad({ status: 'loading', fileName: file.name });
      try {
        const track = await engine.load(file);
        if (id !== loadIdRef.current) return;
        songKeyRef.current = songKey(file.name, file.size);
        setSongId(songKeyRef.current);
        const saved = loadPitch(getStore(), songKeyRef.current);
        if (saved !== null) {
          const v = clampSemitones(saved);
          engine.setSemitones(v);
          setSemitonesState(v);
          setNotice(`Se restauró tu tono para esta canción: ${formatSemitones(v)}.`);
        }
        setLoad({ status: 'ready', track });
        announce(`Canción lista: ${track.name}`);
      } catch (e) {
        if (e instanceof StaleLoadError || id !== loadIdRef.current) return;
        const message =
          e instanceof DecodeError ? e.message : 'No se pudo abrir el archivo. Intenta con otro MP3.';
        setLoad({ status: 'error', message });
        announce(message);
      }
    },
    [engine, resetExport, announce],
  );

  const unlock = useCallback(() => {
    void engine.unlock().catch(() => undefined);
  }, [engine]);

  const togglePlay = useCallback(async () => {
    if (load.status !== 'ready' || exportState.status === 'running') return;
    setNotice('');
    if (engine.isPlaying()) {
      engine.pause();
      setPlaying(false);
      setPosition(engine.getPosition());
      return;
    }
    try {
      setPlaying(true);
      await engine.play();
      setPlaying(engine.isPlaying());
    } catch {
      setPlaying(false);
      setNotice('No se pudo iniciar el audio. Vuelve a pulsar reproducir.');
    }
  }, [engine, load.status, exportState.status]);

  const scrubRef = useRef<number | null>(null);
  const beginScrub = useCallback((value: number) => {
    scrubRef.current = value;
    setScrub(value);
  }, []);
  const commitScrub = useCallback(() => {
    const target = scrubRef.current;
    scrubRef.current = null;
    setScrub(null);
    if (target !== null) {
      engine.seek(target);
      setPosition(engine.getPosition());
    }
  }, [engine]);

  const setSemitones = useCallback(
    (value: number) => {
      const v = clampSemitones(value);
      setSemitonesState(v);
      setOriginalPreviewState(false);
      engine.setSemitones(v);
      if (songKeyRef.current) savePitch(getStore(), songKeyRef.current, v);
    },
    [engine],
  );

  const setTempo = useCallback(
    (value: number) => {
      const v = clampTempo(value);
      setTempoState(v);
      engine.setTempo(v);
    },
    [engine],
  );

  const skip = useCallback(
    (delta: number) => {
      const buffer = engine.getBuffer();
      if (!buffer) return;
      engine.seek(Math.min(Math.max(0, engine.getPosition() + delta), buffer.duration));
      setPosition(engine.getPosition());
    },
    [engine],
  );

  const markLoopStart = useCallback(() => {
    const a = engine.getPosition();
    setNotice('');
    setLoopA(a);
    if (loopB !== null && makeLoop(a, loopB, engine.getBuffer()?.duration ?? 0)) {
      engine.setLoop({ start: a, end: loopB });
    } else {
      setLoopB(null);
      engine.setLoop(null);
    }
    announce(`Inicio del bucle en ${formatTime(a)}`);
  }, [engine, loopB, announce]);

  const markLoopEnd = useCallback(() => {
    if (loopA === null) {
      setNotice('Marca primero el punto A.');
      return;
    }
    const region = makeLoop(loopA, engine.getPosition(), engine.getBuffer()?.duration ?? 0);
    if (!region) {
      setNotice(`El punto B debe quedar al menos ${MIN_LOOP_SEC} s después de A.`);
      return;
    }
    setNotice('');
    setLoopB(region.end);
    engine.setLoop(region);
    setPosition(engine.getPosition());
    announce(`Bucle activo de ${formatTime(region.start)} a ${formatTime(region.end)}`);
  }, [engine, loopA, announce]);

  const clearLoop = useCallback(() => {
    setLoopA(null);
    setLoopB(null);
    engine.setLoop(null);
    announce('Bucle quitado');
  }, [engine, announce]);

  const setOriginalPreview = useCallback(
    (value: boolean) => {
      setOriginalPreviewState(value);
      engine.setOriginalPreview(value);
    },
    [engine],
  );

  const startExportNow = useCallback(() => {
    const buffer = engine.getBuffer();
    if (load.status !== 'ready' || !buffer || exportState.status === 'running') return;
    engine.pause();
    setPlaying(false);
    setPosition(engine.getPosition());
    releaseResult();
    const chosen = semitones; // copia fija del ajuste seleccionado
    const name = load.track.name;
    const id = ++exportIdRef.current;
    setNotice('');
    setExportState({
      status: 'running',
      semitones: chosen,
      progress: { stage: 'preparing', fraction: null },
    });
    const job = startExport(buffer, chosen, (progress) => {
      if (id === exportIdRef.current) {
        setExportState({ status: 'running', semitones: chosen, progress });
      }
    });
    jobRef.current = job;
    job.promise.then(
      (result: ExportResult) => {
        if (id !== exportIdRef.current) return;
        const fileName = exportFileName(name, chosen);
        const file = new File([result.blob], fileName, { type: 'audio/mpeg' });
        const url = URL.createObjectURL(file);
        urlRef.current = url;
        jobRef.current = null;
        setExportState({ status: 'done', file, url, semitones: chosen });
        announce('Exportación lista. Puedes guardar o compartir el archivo.');
      },
      (e: unknown) => {
        if (id !== exportIdRef.current) return;
        jobRef.current = null;
        if (e instanceof ExportCancelledError) {
          setExportState({ status: 'idle' });
          announce('Exportación cancelada');
        } else {
          setExportState({ status: 'error', message: 'No se pudo exportar. Puedes reintentar.' });
          announce('No se pudo exportar');
        }
      },
    );
  }, [engine, load, exportState.status, semitones, releaseResult, announce]);

  const cancelExport = useCallback(() => {
    exportIdRef.current++;
    jobRef.current?.cancel();
    jobRef.current = null;
    setExportState({ status: 'idle' });
    announce('Exportación cancelada');
  }, [announce]);

  const saveOrShare = useCallback(async () => {
    if (exportState.status !== 'done') return;
    const { file, url } = exportState;
    try {
      if (canShareFile(file)) {
        const outcome = await shareFile(file);
        if (outcome === 'cancelled') setNotice('Compartir cancelado. El archivo sigue listo.');
        else setNotice('Acción completada. Verifica que el archivo quedó donde esperabas.');
        return;
      }
      triggerDownload(url, file.name);
      setNotice('Descarga iniciada. Revisa tu carpeta de descargas.');
    } catch {
      triggerDownload(url, file.name);
      setNotice('No se pudo abrir compartir; se intentó la descarga.');
    }
  }, [exportState]);

  const duration = load.status === 'ready' ? load.track.duration : 0;
  const shownPosition = scrub ?? position;

  return useMemo(
    () => ({
      load,
      playing,
      duration,
      position: shownPosition,
      semitones,
      originalPreview,
      loopA,
      loopB,
      tempo,
      songId,
      canSlower: tempo > MIN_TEMPO,
      canFaster: tempo < MAX_TEMPO,
      setTempo,
      exportState,
      notice,
      announcement,
      canDecrease: semitones > MIN_SEMITONES,
      canIncrease: semitones < MAX_SEMITONES,
      unlock,
      openFile,
      togglePlay,
      skip,
      markLoopStart,
      markLoopEnd,
      clearLoop,
      beginScrub,
      commitScrub,
      setSemitones,
      setOriginalPreview,
      startExport: startExportNow,
      cancelExport,
      saveOrShare,
    }),
    [
      load, playing, duration, shownPosition, semitones, originalPreview, loopA, loopB, tempo, songId, setTempo, exportState, notice,
      announcement, unlock, openFile, togglePlay, skip, markLoopStart, markLoopEnd, clearLoop, beginScrub, commitScrub, setSemitones,
      setOriginalPreview, startExportNow, cancelExport, saveOrShare,
    ],
  );
}
