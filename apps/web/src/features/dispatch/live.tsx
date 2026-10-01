import { useQuery } from '@tanstack/react-query';
import { dashboardSummarySchema, type TripStatus, tripListResponseSchema } from '@waypoint/shared';
import type { Status } from '../../components/waypoint';
import { Card, ErrorState, LoadingState, StatusBadge, Tag } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { Page, useDispatch } from './workspace';

const tripBadge: Record<TripStatus, Status> = {
  planned: 'planning',
  published: 'allocated',
  loading: 'loading',
  ready: 'ready',
  departed: 'departed',
  completed: 'completed',
  blocked: 'blocked',
};

export function LiveOperations() {
  const { date } = useDispatch();
  const summary = useQuery({
    queryKey: ['dashboard', date, 'summary'],
    queryFn: () => api(`/dashboard/summary?date=${date}`, dashboardSummarySchema),
    refetchInterval: 15_000,
  });
  const trips = useQuery({
    queryKey: ['trips', date],
    queryFn: () => api(`/trips?date=${date}`, tripListResponseSchema),
    refetchInterval: 15_000,
  });
  if (summary.isPending || trips.isPending)
    return <LoadingState label="Loading live operations…" />;
  if (!summary.data || !trips.data) {
    return (
      <ErrorState
        description={message(summary.error ?? trips.error)}
        onRetry={() => void summary.refetch()}
      />
    );
  }
  return (
    <Page
      title="Live delivery operations"
      description="Progress comes from recorded stop events. A quiet departed trip is shown as offline, not as live movement."
    >
      <div className="store-grid-two">
        {summary.data.drivers.map((driver) => (
          <Card key={driver.tripId}>
            <div className="wp-between">
              <h2>{driver.vehicleId}</h2>
              <StatusBadge
                status={
                  driver.presence === 'live'
                    ? 'online'
                    : driver.presence === 'offline'
                      ? 'offline'
                      : 'pending'
                }
              />
            </div>
            <p>{driver.driverName ?? 'No driver name'}</p>
            <p className="wp-muted">
              {'label' in driver ? driver.label : `Last stop ${driver.lastStopStatus}`}
              {' · pending sync '}
              {driver.pendingSyncCount}
            </p>
          </Card>
        ))}
      </div>
      <Card>
        <h2>Trips</h2>
        <ul className="dispatch-list">
          {trips.data.items.map((trip) => (
            <li key={trip.id}>
              <Tag kind={trip.vehicle.temp === 'reefer' ? 'reefer' : 'dry-box'} />
              <div>
                <strong>
                  {trip.vehicleId} · trip {trip.tripNo}
                </strong>
                <p>
                  {trip.status} · {trip.stops.length} stops ·{' '}
                  {trip.loadingStatus.replaceAll('_', ' ')}
                </p>
              </div>
              <StatusBadge status={tripBadge[trip.status]} label={trip.status} />
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
