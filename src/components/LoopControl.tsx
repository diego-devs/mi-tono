import { formatTime } from '../utils/format';

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
        <button type="button" className="secondary" disabled={disabled} onClick={onMarkA}>
          Marcar A
        </button>
        <button type="button" className="secondary" disabled={disabled || loopA === null} onClick={onMarkB}>
          Marcar B
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
