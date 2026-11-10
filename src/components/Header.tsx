import type { OfflineStatus } from '../pwa/useOfflineStatus';

interface Props {
  status: OfflineStatus;
  needRefresh: boolean;
  idle: boolean;
  onRetry: () => void;
  onUpdate: () => void;
}

const LABELS: Record<OfflineStatus, string> = {
  checking: 'Preparando uso sin conexión…',
  ready: 'Lista para usar sin conexión',
  failed: 'Sin preparar para uso sin conexión',
  unsupported: 'Modo sin conexión no disponible aquí',
};

export function Header({ status, needRefresh, idle, onRetry, onUpdate }: Props) {
  return (
    <header className="header">
      <h1>Mi Tono</h1>
      <p className={`badge badge-${status}`} role="status">
        {LABELS[status]}
      </p>
      {status === 'failed' && (
        <button type="button" className="link-button" onClick={onRetry}>
          Reintentar
        </button>
      )}
      {needRefresh && (
        <button type="button" className="link-button" onClick={onUpdate} disabled={!idle}>
          {idle ? 'Actualizar la app' : 'Actualización disponible (al terminar)'}
        </button>
      )}
    </header>
  );
}
