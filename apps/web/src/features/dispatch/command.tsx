import { useQuery } from '@tanstack/react-query';
import {
  type DashboardException,
  dashboardExceptionsSchema,
  dashboardSummarySchema,
} from '@waypoint/shared';
import { useNavigate } from 'react-router-dom';
import {
  ActionList,
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
  const { date } = useDispatch();
  const navigate = useNavigate();
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
  return (
    <Page
      title="Operations command center"
      description={`Service date ${date}. Counts come from the live plan. Alerts refresh from the dashboard stream, with polling if it drops.`}
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
          label="Reefer utilisation"
          value={`${Math.round(data.utilization.reefer * 100)}%`}
          description={`${attention.length} high-severity alerts · ${data.repeatDeferrals} repeat deferrals`}
        />
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
      <ActionList
        title="Needs action"
        items={exceptions.data.items.map((item) => ({
          id: `${item.type}:${item.entityId}`,
          title: item.title,
          description: item.reason,
          tone:
            item.severity === 'high'
              ? 'danger'
              : item.severity === 'medium'
                ? 'warning'
                : 'neutral',
          onClick: () => navigate(`${links[item.type]}?date=${date}`),
        }))}
      />
      <p className="wp-muted">
        <Tag kind="blocks-publish" /> hard violations stay separate from <Tag kind="recommended" />{' '}
        ranked suggestions. Exception links in the API point at resources, so these rows open the
        matching workspace screen.
      </p>
    </Page>
  );
}
