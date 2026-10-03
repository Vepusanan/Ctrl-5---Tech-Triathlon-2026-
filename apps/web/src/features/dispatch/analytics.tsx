// D10 · Analytics & forecast (Figma 2043:3551): how many trips, and can we run them?
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Chip,
  Dropdown,
  ErrorState,
  Icon,
  LoadingState,
  SegmentedControl,
  Tag,
} from '../../components/waypoint';
import { downloadCsv } from '../../lib/csv';
import { forecastSchema } from './contracts';
import { api, message } from './data/client';
import { CardHead, DarkCard, Headline } from './ui';
import { Page, useDispatch } from './workspace';
import './analytics.css';

const classes = [
  { value: 'reefer', label: 'Reefer' },
  { value: 'dry', label: 'Dry' },
] as const;
type VehicleClass = (typeof classes)[number]['value'];

/** Tallest bar in the forecast chart, in px. The rest of the 230px holds the chip and label. */
const BAR_MAX = 169;

export function AnalyticsForecast() {
  const { date } = useDispatch();
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('reefer');
  const [depot, setDepot] = useState('all');
  const forecast = useQuery({
    queryKey: ['analytics', 'forecast', date, vehicleClass, depot],
    queryFn: () =>
      api(`/analytics/forecast?date=${date}&class=${vehicleClass}&depot=${depot}`, forecastSchema),
    placeholderData: (previous) => previous,
  });

  const title = 'Analytics & forecast';
  if (forecast.isPending) {
    return (
      <Page title={title}>
        <LoadingState label="Loading the forecast…" rows={6} />
      </Page>
    );
  }
  if (!forecast.data) {
    return (
      <Page title={title}>
        <ErrorState description={message(forecast.error)} onRetry={() => void forecast.refetch()} />
      </Page>
    );
  }

  const data = forecast.data;
  const name = data.vehicleClass === 'reefer' ? 'Reefer' : 'Dry';
  const observed = data.weeks.filter((item) => !item.predicted).length;
  const peak = [...data.weeks].sort((a, b) => b.trips - a.trips)[0];
  const top = Math.max(1, data.capacity, ...data.weeks.map((item) => item.trips));
  const px = (trips: number) => Math.round((trips / top) * BAR_MAX);
  const widest = Math.max(1, ...data.balance.rows.map((row) => row.value));
  const worstBar = Math.max(1, ...(data.anomaly?.bars.map((bar) => bar.percent) ?? []));
  const show = (trips: number, predicted: boolean) => `${predicted ? '~' : ''}${trips}`;
  const exportCsv = () =>
    downloadCsv(
      `forecast-${data.vehicleClass}-${depot}.csv`,
      ['Week', 'Trips needed', 'Source'],
      data.weeks.map((item) => [item.week, item.trips, item.predicted ? 'predicted' : 'observed']),
    );

  return (
    <Page
      title={title}
      description={`Trips needed per ${data.weekday} · ${observed} weeks observed, ${
        data.weeks.length - observed
      } weeks predicted`}
      actions={
        <>
          <SegmentedControl
            label="Vehicle class"
            value={vehicleClass}
            options={classes}
            onChange={setVehicleClass}
          />
          <Dropdown
            label="Depot"
            value={depot}
            options={data.depots.map((item) => ({ value: item.id, label: item.name }))}
            onChange={setDepot}
          />
          <Button variant="secondary" size="md" onClick={exportCsv}>
            Export
          </Button>
        </>
      }
    >
      <div className="an-row" aria-busy={forecast.isFetching}>
        <section className="wp-card an-forecast" aria-label={`${name} trips needed per week`}>
          <div className="d-head an-head">
            <Headline
              label={`${name} trips needed · peak`}
              value={
                peak ? (
                  <span className={peak.predicted ? 'an-predicted' : undefined}>
                    {show(peak.trips, peak.predicted)}
                  </span>
                ) : (
                  '—'
                )
              }
            >
              {peak?.predicted && <Tag kind="predicted">{peak.week}</Tag>}
            </Headline>
            <p className="an-legend">
              <span>
                <i />
                Observed
              </span>
              <span>
                <i data-kind="predicted" />
                Predicted
              </span>
              <span>
                <i data-kind="capacity" />
                Fleet can run {data.capacity}
              </span>
            </p>
          </div>
          <div className="an-chart">
            <ol className="wp-list">
              {data.weeks.map((item) => (
                <li key={item.week} data-predicted={item.predicted || undefined}>
                  <span className="d-bar-value">{show(item.trips, item.predicted)}</span>
                  <span className="an-bar" aria-hidden="true" style={{ height: px(item.trips) }} />
                  <span className="an-week">{item.week}</span>
                  <span className="wp-sr-only">
                    {item.predicted ? 'predicted' : 'observed'}
                    {item.trips > data.capacity ? ', above what the fleet can run' : ''}
                  </span>
                </li>
              ))}
            </ol>
            {/* 21px is the week label and its gap under every bar. */}
            <i className="an-capacity" style={{ bottom: 21 + px(data.capacity) }} />
          </div>
          <p className="an-events">
            <Icon name="cal" size={14} />
            {data.events.map((event) => (
              <Chip key={event.label} icon={event.kind === 'payday' ? 'zap' : 'cal'}>
                {event.label}
              </Chip>
            ))}
          </p>
          {data.insight && <p className="d-note">{data.insight}</p>}
        </section>
        <DarkCard title="Largest gap" icon="trend">
          {data.gap ? (
            <>
              <p className="d-hero">
                <strong>+{data.gap.trips}</strong>
                <span>trips</span>
              </p>
              <p>{data.gap.detail}</p>
            </>
          ) : (
            <>
              <p className="d-hero">
                <strong>0</strong>
                <span>trips</span>
              </p>
              <p>The fleet can run every predicted week.</p>
            </>
          )}
        </DarkCard>
      </div>
      <div className="an-row an-row--three">
        <section className="wp-card an-balance" aria-label="Needed against available">
          <CardHead title={`${data.balance.week} · needed vs available`} icon="truck" />
          <ul className="wp-list">
            {data.balance.rows.map((row) => (
              <li key={row.key}>
                {row.label}
                <b
                  data-predicted={row.predicted || undefined}
                  style={{ width: `${(row.value / widest) * 80}%` }}
                >
                  {show(row.value, row.predicted)}
                </b>
              </li>
            ))}
          </ul>
        </section>
        <section className="wp-card an-actions" aria-label="Fleet actions">
          <CardHead title="Fleet actions" icon="bulb" />
          {data.actions.length === 0 && <p className="wp-muted">No action is needed.</p>}
          {data.actions.map((action) => (
            <Link
              key={action.id}
              className="an-action"
              to={`/dispatcher/simulate?date=${date}&action=${action.id}`}
            >
              <Icon name="bulb" className="an-action-icon" />
              <span>
                <strong>{action.title}</strong>
                {action.detail}
              </span>
              <Icon name="cr" className="d-chevron" />
            </Link>
          ))}
        </section>
        <section className="wp-card an-anomaly" aria-label="Anomaly">
          <CardHead title="Anomaly" icon="pulse">
            {data.anomaly && <Tag kind="risk">{data.anomaly.week}</Tag>}
          </CardHead>
          {!data.anomaly && <p className="wp-muted">Demand is tracking the forecast.</p>}
          {data.anomaly && (
            <>
              <h3>{data.anomaly.title}</h3>
              <ol className="wp-list an-anomaly-bars">
                {data.anomaly.bars.map((bar) => (
                  <li key={bar.week}>
                    <span className="d-bar-value">{Math.round(bar.percent)}%</span>
                    <span
                      className="an-anomaly-bar"
                      aria-hidden="true"
                      data-flagged={bar.week === data.anomaly?.week || undefined}
                      style={{ height: Math.round((bar.percent / worstBar) * 66) }}
                    />
                    <span className="an-week">{bar.week}</span>
                  </li>
                ))}
              </ol>
              <p className="d-note">{data.anomaly.evidence}</p>
            </>
          )}
        </section>
      </div>
    </Page>
  );
}
