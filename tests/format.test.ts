import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  formatSemitones,
  formatTime,
  sanitizeBaseName,
  semitonesSuffix,
} from '../src/utils/format';

describe('format', () => {
  it('formats time', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });

  it('formats semitones with sign and plural', () => {
    expect(formatSemitones(-3)).toBe('−3 semitonos');
    expect(formatSemitones(1)).toBe('+1 semitono');
    expect(formatSemitones(0)).toBe('0 semitonos');
  });

  it('builds export file names', () => {
    expect(semitonesSuffix(-3)).toBe('-3st');
    expect(semitonesSuffix(2)).toBe('+2st');
    expect(semitonesSuffix(0)).toBe('0st');
    expect(exportFileName('Mi canción: "Sí"?.mp3', -3)).toBe('Mi canción Sí_-3st.mp3');
    expect(exportFileName('...', 2)).toBe('cancion_+2st.mp3');
  });

  it('sanitizes problematic characters but keeps readability', () => {
    expect(sanitizeBaseName('a/b\\c:d*e.MP3')).toBe('abcde');
    expect(sanitizeBaseName('  hola   mundo  .mp3')).toBe('hola mundo');
  });
});
