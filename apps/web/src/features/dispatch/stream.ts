import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

const streamEvents = [
  'plan.published',
  'order.deferred',
  'allocation.changed',
  'trip.changed',
  'trip.departed',
  'loading.started',
  'loading.verified',
  'loading.issue_recorded',
  'loading.issue_acknowledged',
  'loading.ready',
  'stop.arrived',
  'stop.delivered',
  'stop.failed',
  'stop.pod_recorded',
  'receipt.confirmed',
  'issue.reported',
  'sync.conflict',
] as const;

/** Invalidates dashboard queries when the dispatcher stream is up. Polling remains the fallback. */
export function useDashboardStream(date: string, enabled: boolean) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled || date.length === 0) return;
    const source = new EventSource('/api/v1/dashboard/stream', { withCredentials: true });
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['dashboard', date] });
      void client.invalidateQueries({ queryKey: ['trips', date] });
      void client.invalidateQueries({ queryKey: ['planning'] });
    };
    for (const name of streamEvents) source.addEventListener(name, refresh);
    return () => {
      for (const name of streamEvents) source.removeEventListener(name, refresh);
      source.close();
    };
  }, [client, date, enabled]);
}
