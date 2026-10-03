import type { ReasonCode } from '@waypoint/shared';
import { Link } from 'react-router-dom';
import { Button, HistoryDots } from '../../components/waypoint';
import { weekDay } from '../../lib/format';
import { insights, linesFor, orderName } from './data';
import type { OrderScreenProps } from './order-page';
import {
  addDays,
  CardHead,
  day,
  isoDate,
  kg,
  ListRow,
  PageHead,
  Pill,
  plural,
  StoreIcon,
  TempTag,
  ThumbZone,
  tempIcon,
  tempName,
  time,
  usePhone,
  Well,
  weekdayName,
} from './ui';
import { useStore } from './workspace';

/** The dispatcher's structured reason, as one line the store can act on. */
const reasonTitle: Record<ReasonCode, string> = {
  MIXED_BRAND_DISTRICT: 'No compatible route for this brand and district',
  REEFER_REQUIRED: 'Refrigerated vans are full',
  VAN_REQUIRED: 'No van is free for your lane',
  WRONG_DEPOT: 'The free vehicle is at another depot',
  VEHICLE_UNAVAILABLE: 'The vehicle is unavailable',
  WEIGHT_CAP: 'The vehicles are full by weight',
  VOLUME_CAP: 'The vehicles are full by space',
  TRIP_LIMIT: 'The vehicle has reached its daily trips',
  FRESH_TIME_BUDGET: 'The route is too long for fresh goods',
  DAY_TIME_BUDGET: 'The route is too long for the day',
  WINDOW_MISSED: 'The van cannot reach your window',
  FUEL_QUOTA: 'The vehicle is out of fuel quota',
};

/** S05-W and S05: the delivery moved, why, and what the store can do about it. */
export function DeferralNotice({ detail }: OrderScreenProps) {
  const { data } = useStore();
  const phone = usePhone();
  const { order, outlet, deferral } = detail;
  const extras = insights.deferral(detail);
  const was = deferral?.serviceDate ?? order.requestedDate;
  const next = deferral?.nextEligibleDate ?? null;
  const slot = `${outlet.window.open}–${outlet.window.close}`;
  const why = deferral
    ? reasonTitle[deferral.reasonCode]
    : 'Planning has not recorded the reason yet';
  const kind = deferral?.type === 'prioritized' ? 'Prioritised for another order' : 'Unavoidable';
  const lines = linesFor(order).length;
  const sibling = data.orders.find(
    (item) =>
      item.order.requestedDate === order.requestedDate &&
      item.order.temp !== order.temp &&
      item.order.status !== 'cancelled',
  )?.order;
  const otherTemp = order.temp === 'chilled' ? 'ambient' : 'chilled';
  const moves = insights.moves(data);
  const moved = moves.filter(Boolean).length;
  const phoneNumber = insights.planningPhone();
  const call = phoneNumber ? `tel:${phoneNumber.replaceAll(' ', '')}` : undefined;
  const nextName = next ? weekdayName(next) : 'the next run';
  // The strip runs from the day the order was placed to the new delivery day (no Sunday run).
  const placed = order.submittedAt ? isoDate(order.submittedAt) : null;
  const days: { date: string; text: string; kind: 'plain' | 'moved' | 'next' }[] = [
    { date: placed && placed < was ? placed : addDays(was, -1), text: 'Ordered', kind: 'plain' },
    { date: was, text: 'Moved', kind: 'moved' },
  ];
  if (next) {
    for (let date = addDays(was, 1); date < next && days.length < 5; date = addDays(date, 1)) {
      days.push({ date, text: 'No run', kind: 'plain' });
    }
    days.push({ date: next, text: 'Delivery', kind: 'next' });
  }

  if (phone) {
    return (
      <>
        <PageHead
          title="Delivery moved"
          eyebrow={`${outlet.id} ${outlet.district} · ${tempName(order.temp).toLowerCase()} order`}
          back="/store"
        />
        <section className="wp-card st-dark st-move-phone">
          <p>
            <span>{weekDay(was)}</span>
            <StoreIcon name="arrow" size={18} />
            <b>{next ? weekDay(next) : 'Next run'}</b>
          </p>
          <small>Window {slot} · same as usual</small>
        </section>
        <section className="wp-card st-list-card">
          <ListRow
            icon={tempIcon(order.temp)}
            tone={order.temp === 'chilled' ? 'chilled' : 'neutral'}
            title={why}
            sub={`${kind}${deferral ? ` · decided ${time(deferral.createdAt)}` : ''}`}
          />
          <p className="st-nested st-fair-row">
            <StoreIcon name="history" />
            {moved === 1 ? 'First move' : `${moved} moves`} in your last{' '}
            {plural(moves.length, 'order')}
            <HistoryDots runs={moves} />
          </p>
        </section>
        <section className="wp-card st-list-card">
          <ListRow
            icon="pkg"
            title={orderName(order.id)}
            sub={`${kg(order.weightKg)} · ${plural(lines, 'line')} · ${tempName(order.temp).toLowerCase()}`}
          />
          <ListRow
            icon={tempIcon(otherTemp)}
            title={
              sibling
                ? `${tempName(otherTemp)} order not affected`
                : `${tempName(otherTemp)} · no order this time`
            }
            sub={
              sibling
                ? `Arrives ${weekDay(sibling.requestedDate).split(' ')[0]} as planned`
                : 'Nothing to move'
            }
            end={
              sibling && (
                <Pill tone="info" icon="route">
                  {weekDay(sibling.requestedDate).split(' ')[0]}
                </Pill>
              )
            }
          />
        </section>
        <ThumbZone>
          <Button asChild className="st-btn-xl">
            <Link to="/store">Got it</Link>
          </Button>
          {call && (
            <a className="st-quiet-link" href={call}>
              Call planning
            </a>
          )}
        </ThumbZone>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={`Your ${tempName(order.temp).toLowerCase()} delivery moved`}
        sub={`${orderName(order.id)}${deferral ? ` · notice from planning at ${time(deferral.createdAt)}` : ''}`}
      >
        {next && (
          <Pill tone="warning" icon="skip">
            {day(next)}
          </Pill>
        )}
        {call && (
          <Button asChild variant="secondary" size="md">
            <a href={call}>Call planning</a>
          </Button>
        )}
        <Button asChild size="md">
          <Link to="/store">Got it</Link>
        </Button>
      </PageHead>
      <div className="st-grid st-grid--hero">
        <section className="wp-card st-tall">
          <CardHead icon={tempIcon(order.temp)} title={`${tempName(order.temp)} order`}>
            <TempTag temp={order.temp} />
          </CardHead>
          <div className="st-move">
            <div>
              <small>Was</small>
              <s>{weekDay(was)}</s>
              <span>{slot}</span>
            </div>
            <StoreIcon name="arrow" size={28} />
            <div>
              <small>Now</small>
              <b>{next ? weekDay(next) : 'Next run'}</b>
              <span>{slot} · same window</span>
            </div>
          </div>
          <ol className="st-days">
            {days.map((item) => (
              <li key={item.date} data-kind={item.kind}>
                <strong>{weekDay(item.date).split(' ')[0]}</strong>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="wp-card st-tall st-dark st-cutoff">
          <div className="st-card-head">
            <h2>Why</h2>
            <Well icon={tempIcon(order.temp)} tone="inverse" size={36} />
          </div>
          <div className="st-cutoff-body">
            <p className="st-reason">
              {why}
              {deferral && ` on ${weekdayName(was)}`}
            </p>
            <p className="st-dark-chips">
              <span>{kind}</span>
              {extras.code && <span>{extras.code}</span>}
            </p>
            {deferral?.note && <small className="st-on-dark">{deferral.note}</small>}
            <small>
              {deferral
                ? `Decided ${time(deferral.createdAt)} by planning`
                : 'Recorded by planning'}
              {extras.decidedBy ? ` · ${extras.decidedBy}` : ''}
            </small>
          </div>
        </section>
      </div>
      <div className="st-grid st-grid--three st-fill">
        <section className="wp-card">
          <CardHead icon="pkg" title={`Your orders for ${weekdayName(was)}`} />
          <ListRow
            size={36}
            icon={tempIcon(order.temp)}
            tone="warning"
            title={`${tempName(order.temp)} · ${plural(lines, 'line')} · ${kg(order.weightKg)}`}
            sub={next ? `Moves to ${weekDay(next)}` : 'Waiting for the next run'}
            end={
              next && (
                <Pill tone="warning" icon="skip">
                  {weekDay(next)}
                </Pill>
              )
            }
          />
          <ListRow
            size={36}
            icon={tempIcon(otherTemp)}
            tone={sibling ? 'success' : 'neutral'}
            title={
              sibling
                ? `${tempName(otherTemp)} · ${plural(linesFor(sibling).length, 'line')} · ${kg(sibling.weightKg)}`
                : `${tempName(otherTemp)} · no order this time`
            }
            sub={sibling ? 'Not affected' : 'Nothing to move'}
            end={
              sibling && (
                <Pill tone="info" icon="route">
                  {weekDay(sibling.requestedDate)}
                </Pill>
              )
            }
          />
        </section>
        <section className="wp-card">
          <CardHead icon="history" title={`Your last ${plural(moves.length, 'order')}`} />
          <p className="st-fair">
            <HistoryDots runs={moves} />
            <strong>
              {plural(moved, 'move')} in {moves.length}
            </strong>
          </p>
          <p className="st-body">
            {moved <= 1
              ? 'First move in this period. Outlets that waited recently are served first.'
              : 'Planning serves outlets that waited recently first, so your next order has priority.'}
          </p>
        </section>
        <section className="wp-card">
          <CardHead icon="list" title="What you can do" />
          <ListRow
            size={36}
            icon="check"
            title={`Nothing — it arrives ${nextName}`}
            sub="Same window"
          />
          <ListRow
            size={36}
            icon="pen"
            title={`Change ${nextName}’s order`}
            sub="Until the 16:00 cutoff the day before"
            to={`/store/orders/new${next ? `?date=${next}` : ''}`}
          />
          <ListRow
            size={36}
            icon="phone"
            title="Call planning"
            sub="If stock is critical"
            href={call}
          />
        </section>
      </div>
    </>
  );
}
