const KEY = 'mi-tono:v1:pitch';
const MAX_ENTRIES = 50;

type Reader = Pick<Storage, 'getItem'>;
type Writer = Reader & Pick<Storage, 'setItem'>;

/** Identifica una canción por nombre y tamaño del archivo (no se lee su contenido). */
export function songKey(name: string, size: number): string {
  return `${name}|${size}`;
}

function read(store: Reader): [string, number][] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is [string, number] => Array.isArray(e) && typeof e[0] === 'string' && Number.isInteger(e[1]),
    );
  } catch {
    return [];
  }
}

export function loadPitch(store: Reader | null, key: string): number | null {
  if (!store) return null;
  const found = read(store).find(([k]) => k === key);
  return found ? found[1] : null;
}

/** Guarda el tono de la canción; 0 borra la entrada. Conserva solo las últimas 50 canciones. */
export function savePitch(store: Writer | null, key: string, semitones: number): void {
  if (!store) return;
  try {
    const entries = read(store).filter(([k]) => k !== key);
    if (semitones !== 0) entries.push([key, semitones]);
    store.setItem(KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* almacenamiento lleno o bloqueado: la función es opcional */
  }
}

export function getStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
