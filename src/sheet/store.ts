const KEY = 'mi-tono:v1:sheet';
const MAX_ENTRIES = 50;
export const MAX_SHEET_CHARS = 20000;

type Reader = Pick<Storage, 'getItem'>;
type Writer = Reader & Pick<Storage, 'setItem'>;

function read(store: Reader): [string, string][] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is [string, string] => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string',
    );
  } catch {
    return [];
  }
}

export function loadSheet(store: Reader | null, key: string): string {
  if (!store) return '';
  return read(store).find(([k]) => k === key)?.[1] ?? '';
}

/** Guarda la hoja de la canción; un texto vacío la borra. Conserva solo las últimas 50 canciones. */
export function saveSheet(store: Writer | null, key: string, text: string): boolean {
  if (!store) return false;
  try {
    const entries = read(store).filter(([k]) => k !== key);
    if (text.trim()) entries.push([key, text.slice(0, MAX_SHEET_CHARS)]);
    store.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    return true;
  } catch {
    return false;
  }
}
