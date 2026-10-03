// D01 · Command center, operations view (prototype frame 2128:17913): the delivery day so far.
import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_POLL_INTERVAL_MS } from '@waypoint/shared';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import {
  DeltaBadge,
  ErrorState,
  Icon,
  LoadingState,
  MetricCard,
  ProgressBar,
  StatusBadge,
} from '../../components/waypoint';
import { weekDay } from '../../lib/format';
import { operationsSchema } from './contracts';
import { api, message } from './data/client';
import { Bars, CardHead, DarkCard, Row } from './ui';
import { useDispatch } from './workspace';

type Operations = z.infer<typeof operationsSchema>;

/** Icon and destination for each kind of row in the Today list. */
const rows: Record<Operations['today'][number]['kind'], { icon: string; to: string }> = {
  plan: { icon: 'check', to: 'live' },
  sync: { icon: 'refresh', to: 'live' },
  shortage: { icon: 'box', to: 'live' },
  queue: { icon: 'list', to: 'queue' },
};

export function OperationsView() {
  const { date } = useDispatch();
  const query = useQuery({
    queryKey: ['dashboard', date, 'operations'],
    queryFn: () => api(`/dashboard/operations?date=${date}`, operationsSchema),
    refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  });
  if (query.isPending) return <LoadingState label="Loading operations…" />;
  if (!query.data) {
    return (
      <ErrorState
        description={message(query.error)}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  const { stops, loadingExceptions: exceptions, driversOffline, deferred } = query.data;
  const handled = exceptions.open === 0;
  return (
    <div className="cc-bento">
      <div className="cc-column">
        <section className="wp-card co-delivered" aria-label="Stops delivered">
          <p className="co-headline">
            <strong>{stops.delivered}</strong>
            of {stops.total} stops delivered
            {stops.deltaPercent !== null && <DeltaBadge value={stops.deltaPercent} unit="%" />}
          </p>
          {stops.byHour.length > 0 && (
            <Bars
              label="Stops delivered in each hour"
              height={220}
              bars={stops.byHour.map((item) => ({ name: item.hour, value: item.delivered }))}
            />
          )}
          {stops.insight && <p className="cc-note">{stops.insight}</p>}
        </section>
        <div className="cc-kpis">
          <MetricCard
            label={`Loading ${exceptions.count === 1 ? 'exception' : 'exceptions'} · ${handled ? 'handled' : 'open'}`}
            value={handled ? exceptions.count : exceptions.open}
            badge={
              exceptions.count === 0 ? undefined : (
                <StatusBadge status={handled ? 'resolved' : 'issue-open'} />
              )
            }
            icon={<Icon name="box" />}
          />
          <MetricCard
            label="Drivers offline"
            value={driversOffline}
            icon={<Icon name={driversOffline > 0 ? 'wifioff' : 'wifi'} />}
            iconTone={driversOffline > 0 ? 'warning' : 'success'}
          />
          <MetricCard
            label={deferred.until ? `Deferred to ${weekDay(deferred.until)}` : 'Deferred'}
            value={deferred.count}
            icon={<Icon name="history" />}
          />
        </div>
      </div>
      <div className="cc-column co-side">
        <DarkCard title="On time" icon="clock">
          <p className="d-hero">
            <strong>{Math.round(query.data.onTimePercent)}%</strong>
          </p>
          <ProgressBar
            label="Stops delivered on time"
            track="inverse"
            tone="positive"
            value={query.data.onTimePercent}
          />
        </DarkCard>
        <section className="wp-card co-today" aria-label="Today">
          <CardHead title="Today" icon="list" />
          {query.data.today.length === 0 && <p className="wp-muted">Nothing to report yet.</p>}
          {query.data.today.map((item) => (
            <Link key={item.id} to={`/dispatcher/${rows[item.kind].to}?date=${date}`}>
              <Row
                icon={rows[item.kind].icon}
                tone={item.done ? 'success' : undefined}
                title={item.title}
                detail={item.detail}
              >
                <Icon name="cr" className="d-chevron" />
              </Row>
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
