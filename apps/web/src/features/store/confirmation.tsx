import type { Order, TemperatureRequirement } from '@waypoint/shared';
import { Link } from 'react-router-dom';
import { Button } from '../../components/waypoint';
import { weekDay } from '../../lib/format';
import { insights, linesFor, orderName } from './data';
import type { OrderScreenProps } from './order-page';
import {
  addDays,
  CardHead,
  canEdit,
  day,
  isoDate,
  kg,
  ListRow,
  minutesOfDay,
  OrderPill,
  PageHead,
  Pill,
  plural,
  remaining,
  StoreIcon,
  TempRow,
  ThumbZone,
  tempIcon,
  tempName,
  tempsFor,
  time,
  usePhone,
  Well,
  weekdayName,
} from './ui';
import { useStore } from './workspace';

const dockName = { rear_dock: 'rear dock', street: 'street door', mall_bay: 'mall bay' } as const;

/** This order and the other temperature's order for the same day, in catalogue order. */
function useOrderPair(order: Order) {
  const { data } = useStore();
  const sibling = data.orders.find(
    (item) =>
      item.order.requestedDate === order.requestedDate &&
      item.order.temp !== order.temp &&
      item.order.status !== 'cancelled',
  )?.order;
  return tempsFor(data.outlet.brand).map((temp) => ({
    temp,
    order: order.temp === temp ? order : sibling?.temp === temp ? sibling : null,
  }));
}

function OrderTile({ temp, order }: { temp: TemperatureRequirement; order: Order | null }) {
  return (
    <div className="st-nested st-tile">
      <div className="st-half-head">
        <StoreIcon name={tempIcon(temp)} />
        <strong>{tempName(temp)}</strong>
        {order ? (
          <OrderPill status={order.status} />
        ) : (
          <Pill tone="neutral" icon="minus">
            Not sent
          </Pill>
        )}
      </div>
      {order && <code>{orderName(order.id)}</code>}
      <p className="st-figure st-figure--md">
        <b>{kg(order?.weightKg ?? 0)}</b>
        <span>
          {order
            ? plural(linesFor(order).length, 'line')
            : `no ${tempName(temp).toLowerCase()} lines`}
        </span>
      </p>
    </div>
  );
}

/** S03 and S03m: the order reached planning, and what happens next. */
export function Confirmation({ detail }: OrderScreenProps) {
  const { now } = useStore();
  const phone = usePhone();
  const { order, outlet } = detail;
  const pair = useOrderPair(order);
  const sent = pair.filter((item) => item.order);
  const editable = canEdit(detail, now);
  const title = order.status === 'submitted' ? 'Order received' : 'Order confirmed';
  const editWindow = editable ? remaining(detail.cutoffAt, now) : 'Locked';
  const editNote = editable
    ? `Until the ${time(detail.cutoffAt)} cutoff. After that, planning locks it.`
    : 'Planning has this run. Call planning if stock is critical.';
  const editLink = `/store/orders/${order.id}/edit`;

  if (phone) {
    return (
      <>
        <div className="st-confirm-phone">
          <span className="st-big-check">
            <StoreIcon name="check" size={36} />
          </span>
          <h1 tabIndex={-1}>{title}</h1>
          <p>Received by planning {time(order.submittedAt)}</p>
        </div>
        <div className="st-kpis">
          {pair.map((item) => (
            <div key={item.temp} className="wp-card st-kpi st-kpi--tile">
              <span>
                <StoreIcon name={tempIcon(item.temp)} /> {tempName(item.temp)}
              </span>
              <b>{kg(item.order?.weightKg ?? 0)}</b>
              {item.order ? (
                <OrderPill status={item.order.status} />
              ) : (
                <Pill tone="neutral" icon="minus">
                  Not sent
                </Pill>
              )}
            </div>
          ))}
        </div>
        <section className="wp-card st-dark st-dark-row">
          <Well icon="pen" tone="inverse" size={40} />
          <div>
            <strong>{editable ? `Editable for ${editWindow}` : 'Locked by planning'}</strong>
            <small>ETA window arrives by 18:00</small>
          </div>
        </section>
        <ThumbZone>
          <Button asChild className="st-btn-xl">
            <Link to="/store">Back to home</Link>
          </Button>
          {editable && (
            <Link className="st-quiet-link" to={editLink}>
              Edit order
            </Link>
          )}
        </ThumbZone>
      </>
    );
  }

  const steps = [
    { icon: 'check', at: time(order.submittedAt), text: title, done: true },
    { icon: 'lock', at: time(detail.cutoffAt), text: 'Planning locks orders', done: false },
    { icon: 'clock', at: 'by 18:00', text: 'ETA window sent to you', done: false },
    {
      icon: 'truck',
      at: `${weekDay(order.requestedDate).split(' ')[0]} ${outlet.window.open}`,
      text: `Van arrives · ${dockName[outlet.dockType]}`,
      done: false,
    },
    { icon: 'boxc', at: 'on arrival', text: 'Confirm receipt in 1 tap', done: false },
  ];
  return (
    <>
      <PageHead
        title={title}
        sub={
          sent.length > 1
            ? `Two orders for ${day(order.requestedDate)}`
            : `${orderName(order.id)} · requested ${day(order.requestedDate)}`
        }
      >
        {editable && (
          <Button asChild variant="secondary" size="md">
            <Link to={editLink}>Edit order</Link>
          </Button>
        )}
        <Button asChild size="md">
          <Link to="/store">Back to home</Link>
        </Button>
      </PageHead>
      <div className="st-grid st-grid--hero">
        <section className="wp-card st-mid">
          <div className="st-received">
            <span className="st-big-check" data-size="sm">
              <StoreIcon name="check" size={24} />
            </span>
            <div>
              <h2>Received by planning</h2>
              <p>
                {order.status === 'submitted' ? 'Submitted' : 'Confirmed'} {time(order.submittedAt)}{' '}
                · you will get an ETA window by 18:00
              </p>
            </div>
          </div>
          <div className="st-halves">
            {pair.map((item) => (
              <OrderTile key={item.temp} temp={item.temp} order={item.order} />
            ))}
          </div>
        </section>
        <section className="wp-card st-mid st-dark st-cutoff">
          <div className="st-card-head">
            <h2>{editable ? 'You can still edit' : 'Editing has closed'}</h2>
            <Well icon={editable ? 'pen' : 'lock'} tone="inverse" size={36} />
          </div>
          <div className="st-cutoff-body">
            <p className="st-hero">{editWindow}</p>
            <small>{editNote}</small>
          </div>
        </section>
      </div>
      <section className="wp-card">
        <CardHead icon="route" title="What happens next" />
        <ol className="st-next">
          {steps.map((step) => (
            <li key={step.text}>
              <Well icon={step.icon} size={48} tone={step.done ? 'success' : 'neutral'} />
              <strong>{step.at}</strong>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

const DAY_START = 8 * 60; // Ordering opens at 08:00.
const DAY_SPAN = 13 * 60; // The strip runs to 21:00, as drawn in S02a.
const CUTOFF = 16 * 60;

/** S02a: sent after the cutoff, so it waits for the next run. Not an error. */
export function Held({ detail }: OrderScreenProps) {
  const { data, now } = useStore();
  const { order, outlet } = detail;
  const pair = useOrderPair(order);
  const sentAt = order.submittedAt;
  const sentMin = sentAt ? minutesOfDay(sentAt) : CUTOFF;
  const late = sentMin - CUTOFF;
  const cutoffPct = ((CUTOFF - DAY_START) / DAY_SPAN) * 100;
  // The marker keeps clear of the cutoff tick so both labels stay readable.
  const sentPct = Math.min(96, Math.max(cutoffPct + 8, ((sentMin - DAY_START) / DAY_SPAN) * 100));
  const missedDay = sentAt ? addDays(isoDate(sentAt), 1) : null;
  const skipsSunday =
    sentAt !== null && addDays(isoDate(sentAt), 1) !== order.requestedDate
      ? weekdayName(addDays(order.requestedDate, -1)) === 'Sunday'
      : false;
  const editable = canEdit(detail, now);
  const phoneNumber = insights.planningPhone();
  const dayName = weekdayName(order.requestedDate);
  return (
    <>
      <PageHead
        title={`Order held for ${dayName}`}
        sub={
          sentAt
            ? `Submitted ${time(sentAt)}${late > 0 ? ` · ${plural(late, 'minute')} after cutoff` : ''}`
            : orderName(order.id)
        }
        back="/store"
      >
        <Pill tone="hold" icon="pause">
          Held · next run
        </Pill>
      </PageHead>
      <div className="st-grid st-grid--hero">
        <section className="wp-card st-mid">
          <CardHead icon="clock" title="What happened">
            <Pill tone="info" icon="zap">
              Held automatically
            </Pill>
          </CardHead>
          <div className="st-cutoff-line" aria-hidden="true">
            <span className="st-cutoff-track">
              <i style={{ width: `${cutoffPct}%` }} />
            </span>
            <span className="st-cutoff-tick" style={{ left: `${cutoffPct}%` }}>
              <b>16:00</b>
              <small>Cutoff</small>
            </span>
            <span className="st-cutoff-dot" style={{ left: `${sentPct}%` }}>
              <b>{time(sentAt)}</b>
              <small>You submitted</small>
            </span>
            <span className="st-cutoff-start">
              <b>08:00</b>
              <small>Ordering opens</small>
            </span>
          </div>
          <p className="st-caption">
            Orders after 16:00 go to the next operating day.
            {skipsSunday ? ' There is no Sunday run.' : ''}
          </p>
        </section>
        <section className="wp-card st-mid st-dark st-cutoff">
          <div className="st-card-head">
            <h2>Next delivery</h2>
            <Well icon="cal" tone="inverse" size={36} />
          </div>
          <div className="st-cutoff-body">
            <p className="st-hero">{weekDay(order.requestedDate)}</p>
            <small className="st-on-dark">
              Window {outlet.window.open}–{outlet.window.close}
            </small>
          </div>
        </section>
      </div>
      <div className="st-grid st-grid--two st-fill">
        <section className="wp-card">
          <CardHead icon="list" title="Your choices" />
          <ListRow
            icon="check"
            tone="success"
            title={`Keep it for ${dayName}`}
            sub="Nothing else to do"
            to="/store"
          />
          {editable && (
            <ListRow
              icon="pen"
              title={`Edit before ${dayName}’s cutoff`}
              sub={`Until ${weekDay(detail.cutoffAt ?? order.requestedDate).split(' ')[0]} ${time(detail.cutoffAt)}`}
              to={`/store/orders/${order.id}/edit`}
            />
          )}
          <ListRow
            icon="phone"
            title={`Ask planning for ${missedDay ? weekdayName(missedDay) : 'the earlier run'}`}
            sub={
              phoneNumber
                ? 'Only if stock is critical'
                : 'Only if stock is critical · call your planning desk'
            }
            href={phoneNumber ? `tel:${phoneNumber.replaceAll(' ', '')}` : undefined}
          />
        </section>
        <section className="wp-card">
          <CardHead icon="pkg" title="Held order" />
          {pair.map((item) => (
            <TempRow
              key={item.temp}
              temp={item.temp}
              lines={item.order ? plural(linesFor(item.order).length, 'line') : '0 lines'}
              value={item.order ? kg(item.order.weightKg) : 'not sent'}
            />
          ))}
          <code className="st-mono-note">
            {orderName(order.id)} · held for {day(order.requestedDate)} · {data.outlet.id}
          </code>
        </section>
      </div>
    </>
  );
}
