import type { StoreOrderDetail } from '@waypoint/shared';
import { Link } from 'react-router-dom';
import { Avatar, Button, ProgressBar } from '../../components/waypoint';
import type { DeliveryExtras } from './contracts';
import { insights, orderName } from './data';
import { OrderPicker, type OrderScreenProps } from './order-page';
import {
  CardHead,
  canEdit,
  day,
  isoDate,
  kg,
  minutesOf,
  minutesOfDay,
  OrderPill,
  PageHead,
  Pill,
  plural,
  StoreIcon,
  Strip,
  ThumbZone,
  tempName,
  time,
  usePhone,
  Well,
} from './ui';
import { useStore } from './workspace';

const pad = (value: number) => String(value).padStart(2, '0');
const label = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * The receiving window on a time axis (S04): the window is a green band, the driver's recorded
 * progress is orange up to the last report, the planned arrival is a ring and now is a red line.
 * Nothing is drawn after the last report, so the gap reads as silence, not as movement.
 */
function WindowTimeline({
  detail,
  extras,
  compact = false,
}: {
  detail: StoreOrderDetail;
  extras: DeliveryExtras;
  compact?: boolean;
}) {
  const delivery = detail.delivery;
  if (!delivery) return null;
  const open = minutesOf(detail.outlet.window.open);
  const close = minutesOf(detail.outlet.window.close);
  const eta = minutesOfDay(delivery.eta);
  const from = extras.recordedFrom ? minutesOfDay(extras.recordedFrom) : null;
  const last = minutesOfDay(delivery.lastUpdatedAt);
  const done = delivery.deliveredAt ? minutesOfDay(delivery.deliveredAt) : null;
  const today = isoDate(detail.serverNow) === delivery.serviceDate && done === null;
  const nowMin = today ? minutesOfDay(detail.serverNow) : null;
  const start = Math.floor((Math.min(open, eta, from ?? open) - 30) / 60) * 60;
  const end = Math.max(
    start + 240,
    Math.ceil(Math.max(close, eta, done ?? close, nowMin ?? close) / 60) * 60,
  );
  const at = (minutes: number) =>
    `${Math.max(0, Math.min(100, ((minutes - start) / (end - start)) * 100))}%`;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, index) => start + index * 60);
  return (
    <div className="st-timeline" data-compact={compact || undefined}>
      <div className="st-timeline-track" aria-hidden="true">
        {from !== null && from < last && (
          <i
            className="st-tl-recorded"
            style={{ left: at(from), right: `calc(100% - ${at(last)})` }}
          />
        )}
        <i
          className="st-tl-window"
          style={{ left: at(open), right: `calc(100% - ${at(close)})` }}
        />
        <i className="st-tl-eta" style={{ left: at(eta) }} />
        {done !== null && <i className="st-tl-done" style={{ left: at(done) }} />}
        {nowMin !== null && <i className="st-tl-now" style={{ left: at(nowMin) }} />}
      </div>
      {!compact && (
        <>
          <div className="st-timeline-axis" aria-hidden="true">
            {hours.map((minutes) => (
              <span key={minutes} style={{ left: at(minutes) }}>
                {label(minutes)}
              </span>
            ))}
          </div>
          <ul className="st-legend">
            {from !== null && from < last && (
              <li data-key="recorded">
                Recorded {label(from)} → {label(last)}
              </li>
            )}
            <li data-key="planned">Planned {label(eta)}</li>
            <li data-key="window">
              Your window {detail.outlet.window.open}–{detail.outlet.window.close}
            </li>
            {done !== null && <li data-key="done">Delivered {label(done)}</li>}
            {done === null && delivery.updateDelayed && (
              <li data-key="silent">No update since {label(last)}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

/** S04 and S04m: where the delivery is, when it should arrive, and what to get ready. */
export function Tracking({ detail }: OrderScreenProps) {
  const { now } = useStore();
  const phone = usePhone();
  const { order, delivery } = detail;
  const extras = insights.delivery(detail);
  const delivered = Boolean(delivery?.deliveredAt);
  const receipted = Boolean(delivery?.receipt);
  const failed = order.status === 'failed';
  const late = delivered && delivery?.late;
  const base = `/store/orders/${order.id}`;
  const editable = canEdit(detail, now);
  const title = !delivery
    ? 'Waiting for the plan'
    : failed
      ? 'Delivery not completed'
      : delivered
        ? receipted
          ? 'Delivered'
          : 'Delivered · awaiting your receipt'
        : delivery.serviceDate === isoDate(now)
          ? 'Today’s delivery'
          : `Delivery for ${day(delivery.serviceDate)}`;
  const stop =
    extras.stopNo && extras.stopCount ? `stop ${extras.stopNo} of ${extras.stopCount}` : null;
  const sub = delivery
    ? [
        delivery.vehicleId,
        stop && !delivered ? `you are ${stop}` : null,
        delivered ? `delivered ${time(delivery.deliveredAt)}` : null,
        !stop ? orderName(order.id) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : `${orderName(order.id)} · ${tempName(order.temp).toLowerCase()} · ${kg(order.weightKg)}`;
  const status = late ? (
    <Pill tone="warning" icon="clock">
      Delivered · late
    </Pill>
  ) : (
    <OrderPill status={order.status} />
  );
  const arrival = delivery ? time(delivered ? delivery.deliveredAt : delivery.eta) : 'By 18:00';
  const source = delivered ? (
    <Pill tone="neutral" icon="file">
      From driver POD
    </Pill>
  ) : (
    <Pill tone="neutral" icon="eye">
      Plan-based
    </Pill>
  );
  const stale = delivery?.updateDelayed && !delivered && (
    <Pill tone="warning" icon="clock">
      Last update {time(delivery.lastUpdatedAt)}
    </Pill>
  );
  const shortage = extras.shortage;
  const shortNote = shortage && (
    <Strip tone="warning" icon="info">
      {shortage.qty} {shortage.label} short
      {shortage.topUp
        ? ` · top-up ${phone ? '' : 'arrives '}${time(shortage.topUp.eta)}${phone ? '' : ` on ${shortage.topUp.vehicleId}`}`
        : ' · planning is arranging a top-up'}
    </Strip>
  );
  const failure = delivery?.failureReason && (
    <Strip tone="danger" icon="xoct">
      Not delivered: {delivery.failureReason}
    </Strip>
  );
  const receiptLabel = receipted
    ? 'Receipt confirmed · view it'
    : delivered
      ? 'Confirm receipt'
      : 'Confirm receipt when the van arrives';

  if (phone) {
    return (
      <>
        <PageHead
          title={title}
          eyebrow={delivery ? [delivery.vehicleId, stop].filter(Boolean).join(' · ') : sub}
          back="/store"
        />
        <section className="wp-card st-eta-phone">
          <div className="st-eta-row">
            <p className="st-hero">{arrival}</p>
            {delivery && source}
          </div>
          <WindowTimeline detail={detail} extras={extras} compact />
          {stale}
          {!delivery && (
            <p className="st-caption">The ETA window is sent when the plan is published.</p>
          )}
        </section>
        {failure}
        <section className="wp-card st-dark st-ready-phone">
          {extras.prepare.slice(0, 2).map((item) => (
            <p key={item.text}>
              <Well icon={item.icon} tone="inverse" size={36} />
              {item.text}
            </p>
          ))}
        </section>
        {shortNote}
        <ThumbZone>
          {delivery ? (
            <Button asChild className="st-btn-xl">
              <Link to={`${base}/receipt`}>
                {receipted
                  ? 'View receipt'
                  : delivered
                    ? 'Confirm receipt'
                    : 'Van is here · confirm receipt'}
              </Link>
            </Button>
          ) : (
            editable && (
              <Button asChild variant="secondary" className="st-btn-xl">
                <Link to={`${base}/edit`}>Edit order</Link>
              </Button>
            )
          )}
        </ThumbZone>
      </>
    );
  }

  const departed = delivery !== null && ['departed', 'completed'].includes(delivery.tripStatus);
  const steps = [
    { name: 'Confirmed', done: order.submittedAt !== null, at: order.submittedAt },
    {
      name: 'Planned',
      done: delivery !== null,
      at: delivery?.publishedAt ?? null,
      extra: delivery?.vehicleId,
    },
    { name: 'Dispatched', done: departed, at: extras.recordedFrom },
    { name: 'Delivered', done: delivered, at: delivery?.deliveredAt ?? null },
  ];
  return (
    <>
      <PageHead title={title} sub={sub}>
        <OrderPicker current={order.id} />
        {status}
        {editable && (
          <Button asChild variant="secondary" size="md">
            <Link to={`${base}/edit`}>Edit order</Link>
          </Button>
        )}
        {delivered && !receipted && (
          <>
            <Button asChild variant="secondary" size="md">
              <Link to={`${base}/issue`}>Report an issue</Link>
            </Button>
            <Button asChild size="md">
              <Link to={`${base}/receipt`}>Confirm receipt</Link>
            </Button>
          </>
        )}
      </PageHead>
      <ol className="wp-card st-steps">
        {steps.map((step) => (
          <li key={step.name} data-done={step.done || undefined}>
            <Well
              icon={step.done ? 'check' : 'clock'}
              tone={step.done ? 'success' : 'neutral'}
              size={36}
            />
            <strong>{step.name}</strong>
            <small>
              {step.done
                ? [
                    step.at ? `${day(step.at).split(' ')[0]} ${time(step.at)}` : 'Recorded',
                    step.extra,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : '—'}
            </small>
          </li>
        ))}
      </ol>
      {failure}
      <div className="st-grid st-grid--hero">
        <section className="wp-card st-eta">
          <div className="st-eta-head">
            <div>
              <small>{delivered ? 'Delivered' : 'Expected arrival'}</small>
              <div className="st-eta-row">
                <p className="st-display">{arrival}</p>
                {delivery && source}
              </div>
            </div>
            {stale}
          </div>
          {delivery ? (
            <WindowTimeline detail={detail} extras={extras} />
          ) : (
            <p className="st-caption">The ETA window is sent when the plan is published.</p>
          )}
        </section>
        <section className="wp-card st-dark st-ready">
          <div className="st-card-head">
            <h2>{delivered ? 'Check and confirm' : 'Get ready'}</h2>
            <Well icon={delivered ? 'list' : 'store'} tone="inverse" size={36} />
          </div>
          <ul>
            {extras.prepare.map((item) => (
              <li key={item.text}>
                <Well icon={item.icon} tone="inverse" size={36} />
                {item.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="st-grid st-grid--three st-fill">
        <section className="wp-card">
          <CardHead icon="pkg" title="What is coming" />
          {shortage ? (
            <>
              <p className="st-figure st-figure--md">
                <b>{order.units - shortage.qty}</b>
                <span>of {plural(order.units, 'carton')}</span>
              </p>
              <ProgressBar
                label="Cartons on the van"
                value={((order.units - shortage.qty) / order.units) * 100}
                tone="positive"
                size={8}
              />
              {shortNote}
            </>
          ) : (
            <p className="st-figure st-figure--md">
              <b>{order.units}</b>
              <span>
                cartons · {kg(order.weightKg)} · {tempName(order.temp).toLowerCase()}
              </span>
            </p>
          )}
        </section>
        <section className="wp-card">
          <CardHead icon="truck" title="Driver" />
          {delivery ? (
            <div className="st-driver">
              <Avatar name={extras.driverName ?? delivery.vehicleId} size={40} />
              <div>
                <strong>{extras.driverName ?? 'Your driver'}</strong>
                <small>
                  {delivery.vehicleId} · {extras.vehicleLabel}
                </small>
              </div>
              {extras.driverPhone && (
                <a
                  className="wp-icon-well"
                  href={`tel:${extras.driverPhone.replaceAll(' ', '')}`}
                  aria-label={`Call ${extras.driverName ?? 'the driver'}`}
                >
                  <StoreIcon name="phone" />
                </a>
              )}
            </div>
          ) : (
            <p className="st-caption">Assigned when the plan is published.</p>
          )}
        </section>
        <Link className="st-receipt-slot" to={`${base}/receipt`}>
          <Well icon="boxc" size={44} />
          {receiptLabel}
        </Link>
      </div>
    </>
  );
}
