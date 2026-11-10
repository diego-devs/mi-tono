export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

export function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

/** Abre la hoja nativa de compartir. "shared" solo indica que la acción se completó, no que se guardó en Archivos. */
export async function shareFile(file: File): Promise<ShareOutcome> {
  if (!canShareFile(file)) return 'unsupported';
  try {
    await navigator.share({ files: [file], title: file.name });
    return 'shared';
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    throw e;
  }
}

export function triggerDownload(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
