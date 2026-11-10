import { MAX_TEMPO, MIN_TEMPO, TEMPO_STEP } from '../audio/math';

interface Props {
  tempo: number;
  disabled: boolean;
  onChange: (value: number) => void;
}

export function TempoControl({ tempo, disabled, onChange }: Props) {
  return (
    <section className="tempo" aria-label="Velocidad">
      <div className="stepper">
        <button
          type="button"
          className="step"
          aria-label="Más lento"
          disabled={disabled || tempo <= MIN_TEMPO}
          onClick={() => onChange(tempo - TEMPO_STEP)}
        >
          −
        </button>
        <output className="semitones" aria-label="Velocidad de práctica">
          {Math.round(tempo * 100)} %
        </output>
        <button
          type="button"
          className="step"
          aria-label="Más rápido"
          disabled={disabled || tempo >= MAX_TEMPO}
          onClick={() => onChange(tempo + TEMPO_STEP)}
        >
          +
        </button>
      </div>
      <div className="row">
        <p className="hint">Solo para practicar: el tono no cambia y la exportación usa la velocidad original.</p>
        <button type="button" className="secondary" disabled={disabled || tempo === 1} onClick={() => onChange(1)}>
          Velocidad normal
        </button>
      </div>
    </section>
  );
}
