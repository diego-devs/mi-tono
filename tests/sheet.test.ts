import { describe, expect, it } from 'vitest';
import {
  parseChord,
  parseSheet,
  renderChordLine,
  transposeChord,
  usesFlats,
  type SheetLine,
} from '../src/sheet/chords';
import { loadSheet, saveSheet } from '../src/sheet/store';

function memoryStore() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

function show(text: string, shift: number, spelling: 'auto' | 'sharp' | 'flat' = 'auto'): string[] {
  const lines = parseSheet(text);
  const flats = usesFlats(lines, shift, spelling);
  return lines.map((l) => (l.kind === 'text' ? l.text : renderChordLine(l.items, shift, flats)));
}

describe('parseChord', () => {
  it('reconoce acordes en notación inglesa y latina', () => {
    for (const t of ['C', 'Bb', 'F#m7', 'Cmaj7', 'Gm7b5', 'Csus4', 'Cadd9', 'E5', 'Cm(add9)', 'Am7/G', 'A/C#', 'Do', 'Sib', 'Lam', 'Sol7', 'Rem/La']) {
      expect(parseChord(t), t).not.toBeNull();
    }
  });
  it('rechaza palabras que no son acordes', () => {
    for (const t of ['Be', 'Bad', 'Add', 'Hello', 'the', 'H', 'C/', 'Cx']) {
      expect(parseChord(t), t).toBeNull();
    }
  });
  it('lee la raíz y el bajo', () => {
    expect(parseChord('Bb')?.root).toBe(10);
    expect(parseChord('Sib')?.root).toBe(10);
    expect(parseChord('Am7/G')).toMatchObject({ root: 9, suffix: 'm7', bass: 7 });
    expect(parseChord('Sol')?.root).toBe(7);
  });
});

describe('transposeChord', () => {
  it('sube y baja con sostenidos o bemoles', () => {
    const am = parseChord('Am7')!;
    expect(transposeChord(am, -2, false)).toBe('Gm7');
    expect(transposeChord(am, 1, false)).toBe('A#m7');
    expect(transposeChord(am, 1, true)).toBe('Bbm7');
    expect(transposeChord(parseChord('C/E')!, 2, false)).toBe('D/F#');
    expect(transposeChord(parseChord('Do')!, 0, false)).toBe('C');
  });
  it('da la vuelta a la octava', () => {
    expect(transposeChord(parseChord('B')!, 1, false)).toBe('C');
    expect(transposeChord(parseChord('C')!, -1, false)).toBe('B');
    expect(transposeChord(parseChord('C')!, -12, false)).toBe('C');
  });
});

describe('parseSheet', () => {
  it('distingue líneas de acordes de la letra', () => {
    const lines = parseSheet('[Verse 1]\nC       G\nHello darkness my old friend\nAm | F | x2\n\nI am here');
    expect(lines.map((l) => l.kind)).toEqual(['text', 'chords', 'text', 'chords', 'text', 'text']);
  });
  it('una "A" o "La" sueltas no cuentan como línea de acordes', () => {
    expect(parseSheet('A')[0]?.kind).toBe('text');
    expect(parseSheet('La')[0]?.kind).toBe('text');
    expect(parseSheet('A D')[0]?.kind).toBe('chords');
    expect(parseSheet('G')[0]?.kind).toBe('chords');
  });
  it('convierte ChordPro en acordes sobre la letra y deja las secciones como texto', () => {
    const lines: SheetLine[] = parseSheet('[Intro]\nHel[Am]lo [F]world');
    expect(lines.map((l) => l.kind)).toEqual(['text', 'chords', 'text']);
    expect((lines[2] as { text: string }).text).toBe('Hello world');
    expect(show('Hel[Am]lo [F]world', 0)).toEqual(['   Am F', 'Hello world']);
  });
});

describe('transposición de la hoja', () => {
  const sheet = 'C      G\nHello darkness\nAm     F';
  it('baja 2 semitonos conservando las columnas', () => {
    expect(show(sheet, -2)).toEqual(['Bb     F', 'Hello darkness', 'Gm     Eb']);
  });
  it('en 0 deja los acordes como estaban (y pasa Do-Re-Mi a inglés)', () => {
    expect(show(sheet, 0)).toEqual(['C      G', 'Hello darkness', 'Am     F']);
    expect(show('Do   Sol\nLam  Fa', 0)).toEqual(['C    G', 'Am   F']);
  });
  it('respeta bemoles o sostenidos según se pida', () => {
    expect(show('C   Am', 1, 'sharp')).toEqual(['C#  A#m']);
    expect(show('C   Am', 1, 'flat')).toEqual(['Db  Bbm']);
  });
  it('automático: conserva bemoles escritos, y elige por la tonalidad resultante', () => {
    expect(show('Bb   Eb', 2)).toEqual(['C    F']);
    expect(show('F    C', 0)).toEqual(['F    C']);
    expect(show('G    D', -2)).toEqual(['F    C']);
    expect(show('G    D', 1)).toEqual(['Ab   Eb']);
  });
  it('si el acorde crece, se separa del siguiente con un espacio', () => {
    expect(show('C D', -1)).toEqual(['B C#']);
    expect(show('C D', 1, 'sharp')).toEqual(['C# D#']);
  });
});

describe('almacenamiento de la hoja', () => {
  it('guarda, recupera y borra por canción', () => {
    const s = memoryStore();
    expect(loadSheet(s, 'a|1')).toBe('');
    expect(saveSheet(s, 'a|1', 'C G')).toBe(true);
    saveSheet(s, 'b|2', 'Am');
    expect(loadSheet(s, 'a|1')).toBe('C G');
    saveSheet(s, 'a|1', '   ');
    expect(loadSheet(s, 'a|1')).toBe('');
    expect(loadSheet(s, 'b|2')).toBe('Am');
  });
  it('conserva solo las últimas 50 canciones', () => {
    const s = memoryStore();
    for (let i = 0; i < 55; i++) saveSheet(s, `s${i}`, 'C');
    expect(loadSheet(s, 's0')).toBe('');
    expect(loadSheet(s, 's54')).toBe('C');
  });
});
