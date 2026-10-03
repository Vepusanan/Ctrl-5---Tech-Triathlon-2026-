// D09 · Live operations (Figma 2041:2931): exception first, from recorded events only.
import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_POLL_INTERVAL_MS } from '@waypoint/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { z } from 'zod';
import {
  Button,
  DeltaBadge,
  Dropdown,
  EmptyState,
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  MetricCard,
  ProgressBar,
  SegmentedControl,
  type Status,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { clock } from '../../lib/format';
import { useMedia } from '../../lib/use-media';
import { type LiveLane, liveBoardSchema } from './contracts';
import { api, message } from './data/client';
import { CardHead } from './ui';
import { Page, useDispatch } from './workspace';
import './live.css';

type Board = z.infer<typeof liveBoardSchema>;

const lanestatus: Record<LiveLane['status'], Status> = {
  allocated: 'allocated',
  not_started: 'not-started',
  loading: 'loading',
  loading_exception: 'loading-exception',
  ready: 'ready',
  departed: 'departed',
  completed: 'completed',
};

const views = [
  { value: 'exceptions', label: 'Exceptions' },
  { value: 'all', label: 'All trips' },
] as const;

/** One trip's bar: the plan, what was recorded, the prediction and the current time. */
function Track({ lane, board }: { lane: LiveLane; board: Board }) {
  const from = Date.parse(board.axis.start);
  const length = Date.parse(board.axis.end) - from;
  const pos = (time: string) =>
    Math.max(0, Math.min(100, ((Date.parse(time) - from) / length) * 100));
  const bar = (start: string, end: string) => ({
    left: `${pos(start)}%`,
    width: `${Math.max(0, pos(end) - pos(start))}%`,
  });
  return (
    <div
      className="lv-track"
      role="img"
      aria-label={`Planned ${clock(lane.planned.start)} to ${clock(lane.planned.end)}. ${
        lane.recorded ? `Recorded up to ${clock(lane.recorded.end)}.` : 'Nothing recorded yet.'
      }${lane.predicted ? ` Predicted to finish ${clock(lane.predicted.end)}.` : ''}`}
    >
      <i data-kind="plan" style={bar(lane.planned.start, lane.planned.end)} />
      {lane.recorded && (
        <i data-kind="recorded" style={bar(lane.recorded.start, lane.recorded.end)} />
      )}
      {/* A stale trip: nothing is known between the last event and now, so nothing is filled. */}
      {lane.staleSince && lane.recorded && (
        <i data-kind="unknown" style={bar(lane.recorded.end, board.now)} />
      )}
      {lane.predicted && (
        <i data-kind="predicted" style={bar(lane.predicted.start, lane.predicted.end)} />
      )}
      <i data-kind="now" style={{ left: `${pos(board.now)}%` }} />
    </div>
  );
}

/** The one exception the dispatcher should open first. */
function AlertCard({ alert, to }: { alert: NonNullable<Board['alert']>; to: string }) {
  return (
    <article className="wp-card wp-inverse lv-alert">
      <div className="d-head">
        <h2 className="d-title">Needs you now</h2>
        {alert.blocking ? (
          <StatusBadge status="loading-exception" label="Critical" />
        ) : (
          <Tag kind="risk">Warning</Tag>
        )}
      </div>
      <h3>{alert.title}</h3>
      <ul className="wp-list lv-facts">
        {alert.facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
      <div className="lv-alert-actions">
        <Button asChild variant="secondary" size="md">
          <Link to={to}>{alert.blocking ? 'Open recovery' : 'Review'}</Link>
        </Button>
        <span>{alert.note}</span>
      </div>
    </article>
  );
}

/**
 * D09-M · phone (Figma 2045:4609): stops delivered, two KPIs, what needs attention, then every
 * trip as a short row. The phone is for watching the run, so it has no board to scan.
 */
function PhoneBoard({ board, lanes }: { board: Board; lanes: LiveLane[] }) {
  const { date } = useDispatch();
  const stale = board.lanes.filter((lane) => lane.staleSince);
  const { stops } = board;
  const vehicle = (lane: LiveLane) =>
    `/dispatcher/vehicles/${lane.vehicleId}?date=${date}&trip=${lane.tripNo}`;
  return (
    <div className="lvm">
      <section className="wp-card lvm-stops" aria-label="Stops delivered">
        <p className="lvm-headline">
          <strong>{stops.delivered}</strong>
          <span>of {stops.total} stops</span>
          {stops.deltaPercent !== null && <DeltaBadge value={stops.deltaPercent} unit="%" />}
        </p>
        <ProgressBar
          label="Stops delivered"
          size={8}
          tone="accent"
          value={stops.total > 0 ? (stops.delivered / stops.total) * 100 : 0}
        />
        {stops.note && <p className="d-note">{stops.note}</p>}
      </section>
      <div className="lvm-kpis">
        <MetricCard
          label={stale.length === 1 ? 'Stale trip' : 'Stale trips'}
          value={stale.length}
          icon={<Icon name="wifioff" />}
          iconTone={stale.length > 0 ? 'warning' : undefined}
        />
        <MetricCard
          label="Late risk"
          value={<span className="lv-predicted">{board.lateRisk}</span>}
          icon={<Icon name="trend" />}
          iconTone="predict"
        />
      </div>
      {board.alert && (
        <AlertCard
          alert={board.alert}
          to={`/dispatcher/live/exceptions/${board.alert.exceptionId}?date=${date}`}
        />
      )}
      {stale.map((lane) => (
        <Link key={lane.tripId} className="wp-card wp-inverse lvm-stale" to={vehicle(lane)}>
          <span className="lvm-stale-head">
            <span className="wp-icon-well">
              <Icon name="wifioff" />
            </span>
            <span className="lvm-trip-text">
              <strong>
                {lane.vehicleId} · T{lane.tripNo}
              </strong>
              {lane.summary ?? `Last event ${clock(lane.staleSince ?? board.now)}`}
            </span>
            <StatusBadge status="stale" />
          </span>
          <Track lane={lane} board={board} />
          <span className="lvm-stale-note">
            Driver is offline. Progress is not drawn past the last recorded event.
          </span>
        </Link>
      ))}
      <section className="wp-card lvm-trips" aria-label="Trips">
        {lanes.length === 0 && <p className="wp-muted">No trips to show.</p>}
        <ul className="wp-list">
          {lanes
            .filter((lane) => !lane.staleSince)
            .map((lane) => (
              <li key={lane.tripId}>
                <Link className="lvm-trip-text" to={vehicle(lane)}>
                  <strong>
                    {lane.vehicleId} · T{lane.tripNo}
                  </strong>
                  {lane.summary ?? lane.depot}
                </Link>
                <StatusBadge status={lanestatus[lane.status]} />
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

export function LiveOperations() {
  const { date } = useDispatch();
  const phone = useMedia('(max-width: 800px)');
  const [view, setView] = useState<(typeof views)[number]['value']>('all');
  const [depot, setDepot] = useState<string | null>(null);
  const board = useQuery({
    queryKey: ['dashboard', date, 'live'],
    queryFn: () => api(`/dashboard/live?date=${date}`, liveBoardSchema),
    refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  });

  const header = {
    inShell: true,
    title: 'Live operations',
    description: 'From recorded events · loading, departure, arrival, POD',
  };
  if (board.isPending) {
    return (
      <Page {...header}>
        <LoadingState label="Loading live operations…" rows={6} />
      </Page>
    );
  }
  if (!board.data) {
    return (
      <Page {...header}>
        <ErrorState description={message(board.error)} onRetry={() => void board.refetch()} />
      </Page>
    );
  }

  const data = board.data;
  const depots = [...new Set(data.lanes.map((lane) => lane.depot))].sort();
  const shown = depot ?? depots[0] ?? '';
  const lanes = data.lanes.filter(
    (lane) =>
      lane.depot === shown && (view === 'all' || lane.exceptionId !== null || lane.staleSince),
  );
  const from = Date.parse(data.axis.start);
  const length = Date.parse(data.axis.end) - from;
  // Axis labels every two hours.
  const ticks = Array.from(
    { length: Math.floor(length / 7_200_000) + 1 },
    (_, index) => from + index * 7_200_000,
  );
  const peak = Math.max(1, ...(data.anomaly?.bars.map((item) => item.value) ?? []));
  const exceptionLink = (id: string) => `/dispatcher/live/exceptions/${id}?date=${date}`;

  if (phone) {
    const attention = view === 'exceptions';
    return (
      <Page
        {...header}
        actions={
          <IconButton
            icon="filter"
            className="lvm-filter"
            label={attention ? 'Show all trips' : 'Show only trips that need attention'}
            active={attention}
            onClick={() => setView(attention ? 'all' : 'exceptions')}
          />
        }
      >
        <PhoneBoard
          board={data}
          lanes={data.lanes.filter(
            (lane) => !attention || lane.exceptionId !== null || lane.staleSince,
          )}
        />
      </Page>
    );
  }

  return (
    <Page
      {...header}
      actions={
        <>
          <SegmentedControl label="Trips shown" value={view} options={views} onChange={setView} />
          <Dropdown
            label="Depot"
            value={shown}
            options={depots.map((value) => ({ value, label: value }))}
            onChange={setDepot}
          />
        </>
      }
    >
      <div className="d-kpis lv-kpis">
        <MetricCard
          label="Departed"
          value={`${data.departed}/${data.trips}`}
          icon={<Icon name="truck" />}
        >
          <ProgressBar
            label="Trips departed"
            tone="positive"
            value={data.trips > 0 ? (data.departed / data.trips) * 100 : 0}
          />
        </MetricCard>
        <MetricCard label="Loading at docks" value={data.loading} icon={<Icon name="pkg" />} />
        <MetricCard
          label="Loading exception"
          value={
            data.alert?.blocking ? (
              <Link to={exceptionLink(data.alert.exceptionId)}>{data.loadingExceptions}</Link>
            ) : (
              data.loadingExceptions
            )
          }
          icon={<Icon name="xoct" />}
          iconTone={data.loadingExceptions > 0 ? 'danger' : undefined}
        />
        <MetricCard
          label="Late risk (predicted)"
          value={<span className="lv-predicted">{data.lateRisk}</span>}
          icon={<Icon name="trend" />}
          iconTone="predict"
        />
      </div>
      <div className="lv-row">
        <section className="wp-card lv-board" aria-label="Planned against recorded">
          <div className="d-head">
            <h2 className="d-title">Planned vs recorded</h2>
            <p className="lv-legend">
              <span>
                <i data-kind="plan" />
                Plan
              </span>
              <span>
                <i data-kind="recorded" />
                Recorded
              </span>
              <span>
                <i data-kind="predicted" />
                Predicted
              </span>
              <span>
                <i data-kind="now" />
                Now
              </span>
            </p>
          </div>
          <div className="lv-lane lv-axis" aria-hidden="true">
            <span />
            <p>
              {ticks.map((tick) => (
                <span key={tick}>{clock(tick)}</span>
              ))}
            </p>
          </div>
          {lanes.length === 0 && (
            <EmptyState
              title={view === 'exceptions' ? 'No open exceptions' : 'No trips for this depot'}
              description={
                view === 'exceptions'
                  ? 'Every trip at this depot is running without a reported problem.'
                  : 'Trips appear here once the plan is published.'
              }
            />
          )}
          <ul className="wp-list">
            {lanes.map((lane) => (
              <li key={lane.tripId} className="lv-lane">
                <div className="lv-lane-name">
                  <Link
                    to={`/dispatcher/vehicles/${lane.vehicleId}?date=${date}&trip=${lane.tripNo}`}
                  >
                    {lane.vehicleId} · T{lane.tripNo}
                  </Link>
                  {lane.staleSince ? (
                    <StatusBadge
                      status="stale"
                      label={`Last seen ${clock(lane.staleSince)} · may be offline`}
                    />
                  ) : (
                    <StatusBadge status={lanestatus[lane.status]} />
                  )}
                </div>
                <Track lane={lane} board={data} />
                <span className="lv-flag">
                  {lane.exceptionId ? (
                    <Link
                      className="wp-icon-well tone-danger"
                      to={exceptionLink(lane.exceptionId)}
                      aria-label={`Open the loading exception on ${lane.vehicleId}`}
                    >
                      <Icon name="xoct" size={14} />
                    </Link>
                  ) : (
                    lane.lateRisk && (
                      <span className="wp-icon-well tone-predict" title="Predicted late risk">
                        <Icon name="trend" size={14} />
                        <span className="wp-sr-only">Predicted late risk</span>
                      </span>
                    )
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="d-note lv-foot">
            Bars show only what was recorded. No GPS: position between events is never drawn.
          </p>
        </section>
        <div className="lv-side">
          {data.alert ? (
            <AlertCard alert={data.alert} to={exceptionLink(data.alert.exceptionId)} />
          ) : (
            <article className="wp-card lv-clear">
              <CardHead title="Needs you now" />
              <p className="wp-muted">Nothing needs you. No open loading exceptions.</p>
            </article>
          )}
          {data.anomaly && (
            <section className="wp-card lv-anomaly" aria-label="Anomaly">
              <CardHead title="Anomaly" icon="pulse">
                <Tag kind="risk">{data.anomaly.where}</Tag>
              </CardHead>
              <h3>{data.anomaly.title}</h3>
              <ol className="wp-list lv-bars" aria-label="Loading time per trip, in minutes">
                {data.anomaly.bars.map((item, index, all) => (
                  // History bars repeat their label ("Sat"), so position is the identity.
                  // biome-ignore lint/suspicious/noArrayIndexKey: ordered history
                  <li key={index}>
                    <span
                      data-now={index === all.length - 1 || undefined}
                      style={{ height: Math.round((item.value / peak) * 106) }}
                      title={`${item.value} min`}
                    />
                    <small>{item.label}</small>
                    <span className="wp-sr-only">{item.value} minutes</span>
                  </li>
                ))}
              </ol>
              <p className="d-note">{data.anomaly.evidence}</p>
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}
