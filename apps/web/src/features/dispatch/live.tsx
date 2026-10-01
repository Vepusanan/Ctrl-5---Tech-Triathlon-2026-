import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dashboardSummarySchema,
  loadingIssueSchema,
  type TripStatus,
  tripListResponseSchema,
} from '@waypoint/shared';
import type { Status } from '../../components/waypoint';
import {
  Button,
  Card,
  ErrorState,
  LoadingState,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { time } from '../store/shared';
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
  const { date, online } = useDispatch();
  const client = useQueryClient();
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
  const acknowledge = useMutation({
    mutationFn: (issueId: string) =>
      api(`/loading/issues/${issueId}/ack`, loadingIssueSchema, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['trips', date] });
      await client.invalidateQueries({ queryKey: ['dashboard', date] });
    },
  });
  if (summary.isPending || trips.isPending) {
    return <LoadingState label="Loading live operations…" />;
  }
  if (!summary.data || !trips.data) {
    return (
      <ErrorState
        description={message(summary.error ?? trips.error)}
        onRetry={() => {
          void summary.refetch();
          void trips.refetch();
        }}
      />
    );
  }
  const openIssues = trips.data.items.flatMap((trip) =>
    trip.exceptions
      .filter((issue) => issue.acknowledgedAt === null)
      .map((issue) => ({ trip, issue })),
  );
  return (
    <Page
      title="Live delivery operations"
      description="Progress comes from recorded stop events. A quiet departed trip stays offline, not live movement. The dashboard stream refreshes this page; polling continues if the stream drops."
    >
      <div className="store-grid-two">
        {summary.data.drivers.length === 0 ? (
          <Card>
            <h2>No departed trips</h2>
            <p className="wp-muted">Drivers appear here after departure, with last sync time.</p>
          </Card>
        ) : (
          summary.data.drivers.map((driver) => (
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
                {' · last seen '}
                {time(driver.lastSeenAt)}
                {' · pending sync '}
                {driver.pendingSyncCount}
              </p>
            </Card>
          ))
        )}
      </div>
      <Card>
        <h2>Loading shortfalls</h2>
        {openIssues.length === 0 ? (
          <p className="wp-muted">No unacknowledged loading issues on this date.</p>
        ) : (
          <ul className="dispatch-list">
            {openIssues.map(({ trip, issue }) => (
              <li key={issue.id}>
                <Tag kind="blocks-publish" />
                <div>
                  <strong>
                    {trip.vehicleId} · trip {trip.tripNo}
                  </strong>
                  <p>
                    {issue.type} · qty {issue.qty}
                    {issue.note ? ` · ${issue.note}` : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={!online}
                  busy={acknowledge.isPending}
                  onClick={() => acknowledge.mutate(issue.id)}
                >
                  Acknowledge
                </Button>
              </li>
            ))}
          </ul>
        )}
        {acknowledge.error && <p role="alert">{message(acknowledge.error)}</p>}
      </Card>
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
                  {trip.lastEvent ? ` · last event ${time(trip.lastEvent.serverTime)}` : ''}
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
