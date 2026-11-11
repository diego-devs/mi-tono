export type Spelling = 'auto' | 'sharp' | 'flat';

export interface Chord {
  root: number;
  suffix: string;
  bass: number | null;
  /** Cómo estaba escrito el acorde (para elegir bemoles o sostenidos en modo automático). */
  flats: boolean;
  sharps: boolean;
}

export interface ChordItem {
  col: number;
  token: string;
  chord: Chord | null;
}

export type SheetLine = { kind: 'text'; text: string } | { kind: 'chords'; items: ChordItem[] };

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const NOTE_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  Do: 0, Re: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11,
};
const FLAT_KEY_PCS = new Set([1, 3, 5, 8, 10]);

const SUFFIX = '(?:maj|min|dim|aug|sus|add|m|M|\\+|°|ø|-|\\d+|[#b♯♭]\\d+|\\([^)\\s]*\\))*';
const NOTE = '(Sol|Do|Re|Mi|Fa|La|Si|[A-G])([#b♯♭]?)';
const CHORD_RE = new RegExp(`^${NOTE}(${SUFFIX})$`);
const BASS_RE = new RegExp(`^${NOTE}$`);

function accidental(a: string | undefined): number {
  return a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0;
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function notePc(name: string | undefined, acc: string | undefined): number {
  return mod12((NOTE_PC[name ?? ''] ?? 0) + accidental(acc));
}

/** Interpreta un acorde en notación inglesa (C, Bb, F#m7, C/E) o latina (Do, Sib, Lam). */
export function parseChord(token: string): Chord | null {
  const slash = token.indexOf('/');
  const main = slash === -1 ? token : token.slice(0, slash);
  const m = CHORD_RE.exec(main);
  if (!m) return null;
  let bass: number | null = null;
  let flats = accidental(m[2]) < 0;
  let sharps = accidental(m[2]) > 0;
  if (slash !== -1) {
    const b = BASS_RE.exec(token.slice(slash + 1));
    if (!b) return null;
    bass = notePc(b[1], b[2]);
    flats ||= accidental(b[2]) < 0;
    sharps ||= accidental(b[2]) > 0;
  }
  return { root: notePc(m[1], m[2]), suffix: m[3] ?? '', bass, flats, sharps };
}
/** Palabras sueltas que también son acordes ("A", "La", "Si"...): solo cuentan si hay más acordes en la línea. */
function isAmbiguous(token: string): boolean {
  return token === 'A' || /^(Sol|Do|Re|Mi|Fa|La|Si)$/.test(token);
}

const FILLER_RE = /^(?:[|/\\\-–—:.]+|x\d+|\d+x|\(?x\d+\)?|%)$/i;

function chordLineItems(raw: string): ChordItem[] | null {
  const items: ChordItem[] = [];
  let chords = 0;
  let bareAmbiguous = 0;
  for (const m of raw.matchAll(/\S+/g)) {
    const token = m[0];
    const chord = parseChord(token);
    if (chord) {
      chords++;
      if (isAmbiguous(token)) bareAmbiguous++;
    } else if (!FILLER_RE.test(token)) {
      return null;
    }
    items.push({ col: m.index ?? 0, token, chord });
  }
  if (chords === 0) return null;
  if (chords === 1 && bareAmbiguous === 1) return null;
  return items;
}

/** Convierte "Hello [Am]world" (ChordPro) en acordes sobre la letra. */
function inlineChordLines(raw: string): SheetLine[] | null {
  if (!raw.includes('[')) return null;
  const items: ChordItem[] = [];
  let lyric = '';
  let last = 0;
  for (const m of raw.matchAll(/\[([^\]]+)\]/g)) {
    const name = (m[1] ?? '').trim();
    const chord = parseChord(name);
    if (!chord) continue;
    lyric += raw.slice(last, m.index);
    items.push({ col: lyric.length, token: name, chord });
    last = (m.index ?? 0) + m[0].length;
  }
  if (items.length === 0) return null;
  lyric += raw.slice(last);
  const lines: SheetLine[] = [{ kind: 'chords', items }];
  if (lyric.trim()) lines.push({ kind: 'text', text: lyric.trimEnd() });
  return lines;
}

export function parseSheet(text: string): SheetLine[] {
  const out: SheetLine[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const inline = inlineChordLines(raw);
    if (inline) {
      out.push(...inline);
      continue;
    }
    const items = chordLineItems(raw);
    out.push(items ? { kind: 'chords', items } : { kind: 'text', text: raw.trimEnd() });
  }
  return out;
}

export function usesFlats(lines: SheetLine[], shift: number, spelling: Spelling): boolean {
  if (spelling !== 'auto') return spelling === 'flat';
  const chords = lines.flatMap((l) => (l.kind === 'chords' ? l.items.flatMap((i) => (i.chord ? [i.chord] : [])) : []));
  if (chords.some((c) => c.flats)) return true;
  if (chords.some((c) => c.sharps)) return false;
  const first = chords[0];
  return first !== undefined && FLAT_KEY_PCS.has(mod12(first.root + shift));
}

export function transposeChord(chord: Chord, shift: number, flats: boolean): string {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  const bass = chord.bass === null ? '' : `/${names[mod12(chord.bass + shift)]}`;
  return `${names[mod12(chord.root + shift)]}${chord.suffix}${bass}`;
}

/** Reescribe una línea de acordes en notación inglesa, transpuesta y conservando las columnas. */
export function renderChordLine(items: ChordItem[], shift: number, flats: boolean): string {
  let out = '';
  for (const item of items) {
    const text = item.chord ? transposeChord(item.chord, shift, flats) : item.token;
    if (out.length < item.col) out += ' '.repeat(item.col - out.length);
    else if (out.length > 0 && !out.endsWith(' ')) out += ' ';
    out += text;
  }
  return out;
}
