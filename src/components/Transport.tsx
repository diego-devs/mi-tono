import { formatTime } from '../utils/format';

interface Props {
  duration: number;
  position: number;
  playing: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onScrub: (value: number) => void;
  onCommit: () => void;
}

export function Transport({ duration, position, playing, disabled, onToggle, onSkip, onScrub, onCommit }: Props) {
  const ended = duration > 0 && position >= duration - 0.05 && !playing;
  return (
    <section className="transport" aria-label="Reproducción">
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
