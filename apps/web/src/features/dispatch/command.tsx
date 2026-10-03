import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type DashboardException,
  dashboardExceptionsSchema,
  dashboardSummarySchema,
  loadingIssueSchema,
  planningQueueResponseSchema,
} from '@waypoint/shared';
import { Link, useNavigate } from 'react-router-dom';
import {
  ActionList,
  Button,
  CapacityBar,
  Card,
  ErrorState,
  HeroMetric,
  LoadingState,
  MetricCard,
} from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { Page, useDispatch } from './workspace';

const links: Record<DashboardException['type'], string> = {
  loading_shortfall: '/dispatcher/live',
  failed_delivery: '/dispatcher/live',
  receipt_discrepancy: '/dispatcher/live',
  sync_conflict: '/dispatcher/live',
  vehicle_unavailable: '/dispatcher/allocate',
  repeat_deferral: '/dispatcher/deferrals',
  stale_driver: '/dispatcher/live',
  tight_window: '/dispatcher/conflicts',
};

export function CommandCenter() {
  const { date, pollMs, user } = useDispatch();
  const queue = useQuery({
    queryKey: ['planning', user.depotId ?? '', date, 'queue'],
    queryFn: () => api(`/planning/runs/${date}/queue`, planningQueueResponseSchema),
    enabled: Boolean(user.depotId),
    refetchInterval: pollMs,
  });
  const navigate = useNavigate();
  const summary = useQuery({
    queryKey: ['dashboard', date, 'summary'],
    queryFn: () => api(`/dashboard/summary?date=${date}`, dashboardSummarySchema),
    refetchInterval: pollMs,
  });
  const exceptions = useQuery({
    queryKey: ['dashboard', date, 'exceptions'],
    queryFn: () => api(`/dashboard/exceptions?date=${date}`, dashboardExceptionsSchema),
    refetchInterval: pollMs,
  });
  const client = useQueryClient();
  // A loader cannot mark the load ready until every shortfall is acknowledged here.
  const acknowledge = useMutation({
    mutationFn: (issueId: string) =>
      api(`/loading/issues/${issueId}/ack`, loadingIssueSchema, { method: 'POST' }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['dashboard', date] });
      await client.invalidateQueries({ queryKey: ['trips', date] });
    },
  });
  if (summary.isPending || exceptions.isPending) {
    return <LoadingState label="Loading the command center…" />;
  }
  if (!summary.data || !exceptions.data) {
    return (
      <ErrorState
        description={message(summary.error ?? exceptions.error)}
        onRetry={() => {
          void summary.refetch();
          void exceptions.refetch();
        }}
      />
    );
  }
  const data = summary.data;
  const attention = exceptions.data.items.filter((item) => item.severity === 'high');
  const waiting = queue.data?.items.filter((item) => item.status === 'confirmed') ?? [];
  const districts = [...new Set(waiting.map((item) => item.outlet.district))]
    .map((district) => ({
      district,
      count: waiting.filter((item) => item.outlet.district === district).length,
    }))
    .sort((a, b) => b.count - a.count);
  const largest = Math.max(1, ...districts.map((item) => item.count));
  return (
    <Page
      title="Operations command center"
      description={`Planning ${date} · ${user.depotId ?? 'All depots'}`}
      actions={
        <Button asChild>
          <Link to={`/dispatcher/queue?date=${date}`}>Open planning queue</Link>
        </Button>
      }
    >
      <div className="dispatch-dashboard">
        <div className="dispatch-dashboard-main">
          <Card className="dispatch-orders-chart">
            <div className="wp-between">
              <div>
                <p className="wp-muted">Orders awaiting planning · by district</p>
                <strong className="wp-display">{data.orders.confirmed}</strong>
              </div>
              <Link to={`/dispatcher/queue?date=${date}`}>
                Open queue <span aria-hidden="true">›</span>
              </Link>
            </div>
            {queue.isLoading && <LoadingState label="Loading districts…" />}
            {queue.isError && (
              <ErrorState description={message(queue.error)} onRetry={() => void queue.refetch()} />
            )}
            {queue.data &&
              (districts.length ? (
                <ul className="dispatch-chart" aria-label="Orders awaiting planning by district">
                  {districts.map(({ district, count }) => (
                    <li className="dispatch-chart-column" key={district}>
                      <div className="dispatch-chart-track">
                        <div
                          className="dispatch-chart-bar"
                          style={{ height: `${(count / largest) * 100}%` }}
                        >
                          <span>{count}</span>
                        </div>
                      </div>
                      <span className="dispatch-chart-label">{district}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dispatch-chart-empty wp-muted">No orders waiting for planning.</p>
              ))}
          </Card>
          <div className="store-metrics">
            <MetricCard
              label="Chilled awaiting"
              value={queue.data ? waiting.filter((item) => item.temp === 'chilled').length : '—'}
            />
            <MetricCard label="Allocated" value={data.orders.allocated} />
            <MetricCard label="Repeat-deferral risk" value={data.repeatDeferrals} />
          </div>
          <Card className="dispatch-live-summary">
            <div>
              <strong>
                {data.stops.delivered} delivered stops · {data.activeTrips} active trips
              </strong>
              <p className="wp-muted">
                {data.stops.failed} failed stops · {data.orders.deferred} deferred orders
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link to={`/dispatcher/live?date=${date}`}>Live operations</Link>
            </Button>
          </Card>
        </div>
        <div className="dispatch-dashboard-side">
          <HeroMetric
            label="Reefer capacity"
            value={`${Math.round(data.utilization.reefer * 100)}%`}
            description={`${attention.length} high-severity alerts · ${data.repeatDeferrals} repeat deferrals`}
          >
            <div className="wp-track" aria-hidden="true">
              <span
                className="wp-track-fill"
                style={{ width: `${Math.min(100, data.utilization.reefer * 100)}%` }}
              />
            </div>
          </HeroMetric>
          <ActionList
            title="Needs action"
            items={exceptions.data.items.map((item) => {
              const shortfall = item.type === 'loading_shortfall';
              return {
                id: `${item.type}:${item.entityId}`,
                title: item.title,
                // A loader cannot mark the load ready until the shortfall is acknowledged here.
                description: shortfall ? `${item.reason} · select to acknowledge` : item.reason,
                tone:
                  item.severity === 'high'
                    ? 'danger'
                    : item.severity === 'medium'
                      ? 'warning'
                      : 'neutral',
                disabled: shortfall && acknowledge.isPending,
                onClick: shortfall
                  ? () => acknowledge.mutate(item.entityId)
                  : () => navigate(`${links[item.type]}?date=${date}`),
              };
            })}
            footer={
              acknowledge.error ? <p role="alert">{message(acknowledge.error)}</p> : undefined
            }
          />
        </div>
      </div>
      <div className="store-grid-two">
        <Card>
          <h2>Fleet utilisation</h2>
          <CapacityBar label="Weight" value={data.utilization.weight * 100} unit="%" />
          <CapacityBar label="Volume" value={data.utilization.volume * 100} unit="%" />
          <CapacityBar label="Reefer" value={data.utilization.reefer * 100} unit="%" />
          <CapacityBar label="Van" value={data.utilization.van * 100} unit="%" />
          <p className="wp-muted">
            Fuel used {data.fuelUsedL.toFixed(1)} L · tight windows {data.tightWindowStops}
          </p>
        </Card>
        <Card>
          <h2>Loading and fleet</h2>
          <dl className="dispatch-loading-stats">
            {[
              ['Not started', data.loading.notStarted],
              ['In progress', data.loading.inProgress],
              ['Exceptions', data.loading.exception],
              ['Ready', data.loading.ready],
              ['Departed', data.loading.departed],
              ['Available vehicles', data.fleet.available],
              ['Unavailable vehicles', data.fleet.unavailable],
              ['Pending loading issues', data.pendingLoadingIssues],
              ['Sync conflicts', data.pendingSyncConflicts],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </Page>
  );
}
