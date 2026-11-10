import { formatTime } from '../utils/format';
import { MarkerIcon } from './MarkerIcon';

interface Props {
  loopA: number | null;
  loopB: number | null;
  disabled: boolean;
  onMarkA: () => void;
  onMarkB: () => void;
  onClear: () => void;
}

export function LoopControl({ loopA, loopB, disabled, onMarkA, onMarkB, onClear }: Props) {
  const active = loopA !== null && loopB !== null;
  return (
    <section className="loop" aria-label="Bucle A–B">
      <div className="row">
        <button
          type="button"
          className="secondary marker-button"
          aria-label="Marcar A (inicio del bucle)"
          title="Marcar inicio del bucle"
          disabled={disabled}
          onClick={onMarkA}
        >
          <MarkerIcon kind="a" size={26} />
        </button>
        <button
          type="button"
          className="secondary marker-button"
          aria-label="Marcar B (final del bucle)"
          title="Marcar final del bucle"
          disabled={disabled || loopA === null}
          onClick={onMarkB}
        >
          <MarkerIcon kind="b" size={26} />
        </button>
        <button type="button" className="secondary" disabled={disabled || loopA === null} onClick={onClear}>
          Quitar bucle
        </button>
      </div>
      <p className="hint" data-testid="loop-status">
        {active
          ? `Repitiendo de ${formatTime(loopA)} a ${formatTime(loopB)}`
          : loopA !== null
            ? `A en ${formatTime(loopA)}; marca B para repetir`
            : 'Marca A y B para repetir un fragmento'}
      </p>
    </section>
  );
}
