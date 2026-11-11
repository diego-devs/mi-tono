import { useMemo, useState } from 'react';
import { renderChordLine, parseSheet, usesFlats, type Spelling } from '../sheet/chords';
import { MAX_SHEET_CHARS, loadSheet, saveSheet } from '../sheet/store';
import { getStore } from '../utils/memory';
import { formatSemitones } from '../utils/format';

interface Props {
  songId: string;
  /** Semitonos a aplicar a los acordes (0 si se está escuchando el original). */
  shift: number;
}

const SPELLINGS: { value: Spelling; label: string; title: string }[] = [
  { value: 'auto', label: 'Auto', title: 'Elegir automáticamente' },
  { value: 'sharp', label: '♯', title: 'Usar sostenidos' },
  { value: 'flat', label: '♭', title: 'Usar bemoles' },
];

export function SongSheet({ songId, shift }: Props) {
  const [text, setText] = useState(() => loadSheet(getStore(), songId));
  const [draft, setDraft] = useState<string | null>(null);
  const [spelling, setSpelling] = useState<Spelling>('auto');
  const [saveError, setSaveError] = useState(false);

  const lines = useMemo(() => parseSheet(text), [text]);
  const flats = usesFlats(lines, shift, spelling);
  const hasChords = lines.some((l) => l.kind === 'chords');

  const save = () => {
    const next = (draft ?? '').slice(0, MAX_SHEET_CHARS);
    const ok = saveSheet(getStore(), songId, next);
    setSaveError(!ok);
    setText(next.trim() ? next : '');
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <section className="sheet" aria-label="Letra y acordes">
        <h2>Letra y acordes</h2>
        <label className="sheet-label" htmlFor="sheet-text">
          Pega aquí la letra, con o sin acordes. Acordes sobre la letra (C, Bb, F#m7, Do, Lam…) o entre corchetes
          ([Am]).
        </label>
        <textarea
          id="sheet-text"
          className="sheet-editor"
          value={draft}
          maxLength={MAX_SHEET_CHARS}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="row">
          <button type="button" className="secondary" onClick={() => setDraft(null)}>
            Cancelar
          </button>
          <button type="button" className="primary" onClick={save}>
            Guardar
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="sheet" aria-label="Letra y acordes">
      <div className="row">
        <h2>Letra y acordes</h2>
        <button type="button" className="secondary" onClick={() => setDraft(text)}>
          {text ? 'Editar' : 'Añadir'}
        </button>
      </div>
      {saveError && (
        <p role="alert" className="error">
          No se pudo guardar en este dispositivo (almacenamiento lleno o bloqueado).
        </p>
      )}
      {!text && <p className="hint">Añade la letra y los acordes de esta canción; se guardan en tu dispositivo.</p>}
      {text && hasChords && (
        <div className="row sheet-tools">
          <p className="hint" data-testid="sheet-shift">
            Acordes: {shift === 0 ? 'tono original' : formatSemitones(shift)}
          </p>
          <div className="segmented" role="group" aria-label="Notación de alteraciones">
            {SPELLINGS.map((s) => (
              <button
                key={s.value}
                type="button"
                title={s.title}
                aria-label={s.title}
                aria-pressed={spelling === s.value}
                onClick={() => setSpelling(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {text && (
        <pre className="sheet-body" data-testid="sheet-body">
          {lines.map((l, i) =>
            l.kind === 'chords' ? (
              <span key={i} className="chord-line">
                {renderChordLine(l.items, shift, flats)}
                {'\n'}
              </span>
            ) : (
              <span key={i}>
                {l.text}
                {'\n'}
              </span>
            ),
          )}
        </pre>
      )}
    </section>
  );
}
