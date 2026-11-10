export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatSemitones(value: number): string {
  const abs = Math.abs(value);
  const unit = abs === 1 ? 'semitono' : 'semitonos';
  if (value === 0) return `0 ${unit}`;
  const sign = value > 0 ? '+' : '−';
  return `${sign}${abs} ${unit}`;
}

/** "+2", "-3", "0": formato ASCII usado en el nombre del archivo exportado. */
export function semitonesSuffix(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${Math.abs(value)}st`;
}

export function sanitizeBaseName(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]{1,5}$/, '');
  const cleaned = withoutExt
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)
    .trim();
  return cleaned || 'cancion';
}

export function exportFileName(sourceName: string, semitones: number): string {
  return `${sanitizeBaseName(sourceName)}_${semitonesSuffix(semitones)}.mp3`;
}
