import { formatSemitones } from '../utils/format';

interface Props {
  semitones: number;
  originalPreview: boolean;
  canDecrease: boolean;
  canIncrease: boolean;
  disabled: boolean;
  onChange: (value: number) => void;
  onOriginalPreview: (value: boolean) => void;
}

export function PitchControl({
  semitones,
  originalPreview,
  canDecrease,
  canIncrease,
  disabled,
  onChange,
  onOriginalPreview,
}: Props) {
  return (
    <section className="pitch" aria-label="Tono">
      <div className="stepper">
        <button
          type="button"
          className="step"
          aria-label="Bajar un semitono"
          disabled={disabled || !canDecrease}
          onClick={() => onChange(semitones - 1)}
        >
          −
        </button>
        <output className="semitones" aria-label="Ajuste de tono">
          {formatSemitones(semitones)}
        </output>
        <button
          type="button"
          className="step"
          aria-label="Subir un semitono"
          disabled={disabled || !canIncrease}
          onClick={() => onChange(semitones + 1)}
        >
          +
        </button>
      </div>
      <div className="row">
        <div className="segmented" role="group" aria-label="Qué escuchar">
          <button
            type="button"
            aria-pressed={originalPreview}
            disabled={disabled}
            onClick={() => onOriginalPreview(true)}
          >
            Original
          </button>
          <button
            type="button"
            aria-pressed={!originalPreview}
            disabled={disabled}
            onClick={() => onOriginalPreview(false)}
          >
            Mi tono
          </button>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={disabled || (semitones === 0 && !originalPreview)}
          onClick={() => onChange(0)}
        >
          Restablecer
        </button>
      </div>
    </section>
  );
}
