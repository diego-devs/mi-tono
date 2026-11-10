import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { processorUrl } from '../audio/pitch';
import { mp3WorkerUrl } from '../audio/exporter';

export type OfflineStatus = 'checking' | 'ready' | 'failed' | 'unsupported';

function essentialUrls(): string[] {
  const urls = new Set<string>([processorUrl, mp3WorkerUrl, new URL('index.html', document.baseURI).pathname]);
  document
    .querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src], link[rel="stylesheet"], link[rel="manifest"], link[rel="apple-touch-icon"]')
    .forEach((el) => {
      const url = el instanceof HTMLScriptElement ? el.src : el.href;
      if (url) urls.add(new URL(url, location.href).pathname);
    });
  return [...urls].map((u) => new URL(u, location.href).href);
}

async function waitForController(timeoutMs: number): Promise<boolean> {
  if (navigator.serviceWorker.controller) return true;
  return new Promise((resolve) => {
    const done = (value: boolean) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', onChange);
      resolve(value);
    };
    const onChange = () => done(!!navigator.serviceWorker.controller);
    const timer = setTimeout(() => done(!!navigator.serviceWorker.controller), timeoutMs);
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
  });
}

/** Comprueba que el service worker controla la página y que los recursos esenciales están en caché. */
export async function verifyOfflineReady(): Promise<OfflineStatus> {
  if (!('serviceWorker' in navigator) || !('caches' in window) || import.meta.env.DEV) {
    return 'unsupported';
  }
  try {
    await navigator.serviceWorker.ready;
    if (!(await waitForController(8000))) return 'failed';
    for (const url of essentialUrls()) {
      if (!(await caches.match(url, { ignoreSearch: true }))) return 'failed';
    }
    return 'ready';
  } catch {
    return 'failed';
  }
}

export function useOfflineStatus() {
  const [status, setStatus] = useState<OfflineStatus>('checking');
  const [needRefresh, setNeedRefresh] = useState(false);
  const updateRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);
  const runId = useRef(0);

  const check = useCallback(async () => {
    const id = ++runId.current;
    setStatus('checking');
    const result = await verifyOfflineReady();
    if (id === runId.current) setStatus(result);
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      updateRef.current = registerSW({
        immediate: true,
        onNeedRefresh: () => setNeedRefresh(true),
        onOfflineReady: () => void check(),
        onRegisterError: () => setStatus('failed'),
      });
    }
    void check();
  }, [check]);

  const applyUpdate = useCallback(() => {
    void updateRef.current?.(true);
  }, []);

  return { status, needRefresh, applyUpdate, retry: check };
}
