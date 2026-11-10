import { useRef } from 'react';
import { ExportPanel } from './components/ExportPanel';
import { Header } from './components/Header';
import { Help } from './components/Help';
import { LoopControl } from './components/LoopControl';
import { PitchControl } from './components/PitchControl';
import { Transport } from './components/Transport';
import { usePlayer } from './hooks/usePlayer';
import { isPitchEngineSupported } from './audio/pitch';
import { useOfflineStatus } from './pwa/useOfflineStatus';
import { formatTime } from './utils/format';

export function App() {
  const player = usePlayer();
  const offline = useOfflineStatus();
  const fileInput = useRef<HTMLInputElement>(null);

  const supported = isPitchEngineSupported();
  const ready = player.load.status === 'ready';
  const loading = player.load.status === 'loading';
  const exporting = player.exportState.status === 'running';
  const idle = !player.playing && !exporting && !loading;
  const controlsDisabled = !ready || exporting;
  const trackName = player.load.status === 'ready' ? player.load.track.name : '';

  return (
    <main className="app">
      <Header
        status={offline.status}
        needRefresh={offline.needRefresh}
        idle={idle}
        onRetry={offline.retry}
        onUpdate={offline.applyUpdate}
      />

      <section className="file" aria-label="Canción">
        <input
          ref={fileInput}
          type="file"
          accept=".mp3,audio/mpeg,audio/*"
          hidden
          data-testid="file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void player.openFile(file);
          }}
        />
        <button
          type="button"
          className="primary big"
          disabled={exporting || !supported}
          onClick={() => {
            player.unlock();
            fileInput.current?.click();
          }}
        >
          Abrir MP3
        </button>
        {!supported && (
          <p role="alert" className="error">
            Este navegador no admite el procesamiento de audio necesario. Usa Safari en iOS 14.5 o posterior, o un
            navegador actualizado.
          </p>
        )}
        {loading && <p role="status">Preparando audio…</p>}
        {ready && (
          <p className="track">
            <span className="track-name">{trackName}</span>
            <span className="track-duration">{formatTime(player.duration)}</span>
          </p>
        )}
        {player.load.status === 'error' && (
          <p role="alert" className="error">
            {player.load.message}
          </p>
        )}
        {player.load.status === 'idle' && (
          <p className="hint">Elige un MP3 guardado en tu dispositivo.</p>
        )}
      </section>

      <Transport
        duration={player.duration}
        position={player.position}
        playing={player.playing}
        disabled={controlsDisabled}
        loopA={player.loopA}
        loopB={player.loopB}
        onToggle={() => void player.togglePlay()}
        onSkip={player.skip}
        onScrub={player.beginScrub}
        onCommit={player.commitScrub}
      />

      <LoopControl
        loopA={player.loopA}
        loopB={player.loopB}
        disabled={controlsDisabled}
        onMarkA={player.markLoopStart}
        onMarkB={player.markLoopEnd}
        onClear={player.clearLoop}
      />

      <PitchControl
        semitones={player.semitones}
        originalPreview={player.originalPreview}
        canDecrease={player.canDecrease}
        canIncrease={player.canIncrease}
        disabled={controlsDisabled}
        onChange={player.setSemitones}
        onOriginalPreview={player.setOriginalPreview}
      />

      <ExportPanel
        state={player.exportState}
        semitones={player.semitones}
        fileName={trackName}
        disabled={!ready}
        onExport={player.startExport}
        onCancel={player.cancelExport}
        onSave={() => void player.saveOrShare()}
      />

      {player.notice && <p className="notice">{player.notice}</p>}
      <div className="sr-only" role="status" aria-live="polite">
        {player.announcement}
      </div>
      <Help />
    </main>
  );
}
