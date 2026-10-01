import { useQuery } from '@tanstack/react-query';
import {
  type DashboardException,
  dashboardExceptionsSchema,
  dashboardSummarySchema,
} from '@waypoint/shared';
import { Link } from 'react-router-dom';
import {
  CapacityBar,
  Card,
  ErrorState,
  HeroMetric,
  LoadingState,
  MetricCard,
  Tag,
} from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { Page, useDispatch } from './workspace';

const links: Record<DashboardException['type'], string> = {
  loading_shortfall: '/dispatch/live',
  failed_delivery: '/dispatch/live',
  receipt_discrepancy: '/dispatch/live',
  sync_conflict: '/dispatch/live',
  vehicle_unavailable: '/dispatch/allocate',
  repeat_deferral: '/dispatch/deferrals',
  stale_driver: '/dispatch/live',
  tight_window: '/dispatch/conflicts',
};

export function CommandCenter() {
  const { date } = useDispatch();
  const summary = useQuery({
    queryKey: ['dashboard', date, 'summary'],
    queryFn: () => api(`/dashboard/summary?date=${date}`, dashboardSummarySchema),
    refetchInterval: 15_000,
  });
  const exceptions = useQuery({
    queryKey: ['dashboard', date, 'exceptions'],
    queryFn: () => api(`/dashboard/exceptions?date=${date}`, dashboardExceptionsSchema),
    refetchInterval: 15_000,
  });
  if (summary.isPending || exceptions.isPending)
    return <LoadingState label="Loading the command center…" />;
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
  return (
    <Page
      title="Operations command center"
      description={`Service date ${date}. Counts come from the live plan, not a forecast.`}
    >
      <div className="store-split">
        <div className="store-metrics">
          <MetricCard label="Confirmed orders" value={data.orders.confirmed} />
          <MetricCard label="Allocated" value={data.orders.allocated} />
          <MetricCard label="Deferred" value={data.orders.deferred} />
          <MetricCard label="Active trips" value={data.activeTrips} />
          <MetricCard label="Delivered stops" value={data.stops.delivered} />
          <MetricCard label="Failed stops" value={data.stops.failed} />
        </div>
        <HeroMetric
          label="Needs action"
          value={attention.length}
          description={`${exceptions.data.total} exceptions · ${data.repeatDeferrals} repeat deferrals`}
        >
          <Link to={`/dispatch/conflicts?date=${date}`}>Open conflicts</Link>
        </HeroMetric>
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
          <p>
            Not started {data.loading.notStarted} · in progress {data.loading.inProgress} ·
            exception {data.loading.exception}
          </p>
          <p>
            Ready {data.loading.ready} · departed {data.loading.departed}
          </p>
          <p>
            Available vehicles {data.fleet.available} · unavailable {data.fleet.unavailable}
          </p>
          <p>
            Pending loading issues {data.pendingLoadingIssues} · sync conflicts{' '}
            {data.pendingSyncConflicts}
          </p>
        </Card>
      </div>
      <Card>
        <h2>Exceptions</h2>
        {exceptions.data.items.length === 0 ? (
          <p className="wp-muted">Nothing needs a decision on this date.</p>
        ) : (
          <ul className="dispatch-list">
            {exceptions.data.items.map((item) => (
              <li key={`${item.type}:${item.entityId}`}>
                <Tag
                  kind={
                    item.severity === 'high'
                      ? 'blocks-publish'
                      : item.severity === 'medium'
                        ? 'risk'
                        : 'observed'
                  }
                />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.reason}</p>
                </div>
                <Link to={`${links[item.type]}?date=${date}`}>
                  {item.type.replaceAll('_', ' ')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="wp-muted">
        <Tag kind="blocks-publish" /> hard violations stay separate from <Tag kind="recommended" />{' '}
        ranked suggestions.
      </p>
    </Page>
  );
}
