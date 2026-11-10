import type { ExportState } from '../hooks/usePlayer';
import { exportFileName, formatSemitones } from '../utils/format';

interface Props {
  state: ExportState;
  semitones: number;
  fileName: string;
  disabled: boolean;
  onExport: () => void;
  onCancel: () => void;
  onSave: () => void;
}

const STAGES = {
  preparing: 'Preparando…',
  processing: 'Procesando audio…',
  encoding: 'Codificando MP3…',
  done: 'Listo para guardar',
} as const;

export function ExportPanel({ state, semitones, fileName, disabled, onExport, onCancel, onSave }: Props) {
  const running = state.status === 'running';
  return (
    <section className="export" aria-label="Exportar">
      <p className="hint">
        Se exportará la canción completa a <strong>{formatSemitones(semitones)}</strong>.
      </p>
      <button type="button" className="primary" disabled={disabled || running} onClick={onExport}>
        Exportar MP3
      </button>

      {state.status === 'running' && (
        <div className="progress">
          <p>{STAGES[state.progress.stage]}</p>
          {state.progress.fraction === null ? (
            <progress aria-label={STAGES[state.progress.stage]} />
          ) : (
            <progress
              aria-label={STAGES[state.progress.stage]}
              max={1}
              value={state.progress.fraction}
            />
          )}
          <button type="button" className="secondary" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      )}

      {state.status === 'done' && (
        <div className="progress">
          <p>
            Listo para guardar: {exportFileName(fileName, state.semitones)} (
            {(state.file.size / 1_000_000).toFixed(1)} MB)
          </p>
          <button type="button" className="primary" onClick={onSave}>
            Guardar o compartir
          </button>
        </div>
      )}

      {state.status === 'error' && (
        <p role="alert" className="error">
          {state.message}
        </p>
      )}
    </section>
  );
}
