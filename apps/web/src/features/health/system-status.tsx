import { useHealth } from './use-health.ts';

export function SystemStatus() {
  const health = useHealth();

  return (
    <section className="system-status" aria-labelledby="system-status-heading">
      <h2 id="system-status-heading">System status</h2>
      <div role="status">
        {health.isPending ? (
          <p>Checking…</p>
        ) : health.isError ? (
          <p>API unreachable</p>
        ) : (
          <dl>
            <dt>API</dt>
            <dd>{health.data.status === 'ok' ? 'OK' : 'Unavailable'}</dd>
            <dt>Database</dt>
            <dd>{health.data.database === 'up' ? 'Up' : 'Down'}</dd>
          </dl>
        )}
      </div>
    </section>
  );
}
