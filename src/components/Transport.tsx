import { formatTime } from '../utils/format';
import { MarkerIcon } from './MarkerIcon';

interface Props {
  duration: number;
  position: number;
  playing: boolean;
  disabled: boolean;
  loopA: number | null;
  loopB: number | null;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onScrub: (value: number) => void;
  onCommit: () => void;
}

export function Transport({ duration, position, playing, disabled, loopA, loopB, onToggle, onSkip, onScrub, onCommit }: Props) {
  const ended = duration > 0 && position >= duration - 0.05 && !playing;
  const at = (t: number) => `calc(12px + (100% - 24px) * ${Math.min(1, Math.max(0, t / (duration || 1)))})`;
  return (
    <section className="transport" aria-label="Reproducción">
      <div className="seek-wrap">
        {loopA !== null && loopB !== null && (
          <div
            className="loop-region"
            data-testid="loop-region"
            style={{ left: at(loopA), width: `calc(${at(loopB)} - ${at(loopA)})` }}
          />
        )}
        {loopA !== null && (
          <div className="marker" data-testid="marker-a" style={{ left: at(loopA) }}>
            <MarkerIcon kind="a" size={20} />
            <span className="tick" />
          </div>
        )}
        {loopB !== null && (
          <div className="marker" data-testid="marker-b" style={{ left: at(loopB) }}>
            <MarkerIcon kind="b" size={20} />
            <span className="tick" />
          </div>
        )}
        <input
          type="range"
          className="seek"
          aria-label="Posición de la canción"
          aria-valuetext={`${formatTime(position)} de ${formatTime(duration)}`}
          min={0}
          max={duration || 1}
          step={0.01}
          value={Math.min(position, duration || 1)}
          disabled={disabled}
          onChange={(e) => onScrub(Number(e.target.value))}
          onPointerUp={onCommit}
          onPointerCancel={onCommit}
          onKeyUp={onCommit}
          onBlur={onCommit}
        />
      </div>
      <div className="times">
        <span>{formatTime(position)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="row">
        <button type="button" className="secondary" disabled={disabled} aria-label="Retroceder 10 segundos" onClick={() => onSkip(-10)}>
          −10 s
        </button>
        <button type="button" className="primary big" onClick={onToggle} disabled={disabled}>
          {playing ? 'Pausa' : ended ? 'Reproducir de nuevo' : 'Reproducir'}
        </button>
        <button type="button" className="secondary" disabled={disabled} aria-label="Adelantar 10 segundos" onClick={() => onSkip(10)}>
          +10 s
        </button>
      </div>
    </section>
  );
}
