import { useMutation } from '@tanstack/react-query';
import {
  type Order,
  orderSchema,
  type StoreOrder,
  type TemperatureRequirement,
} from '@waypoint/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, HeroMetric, StatusBadge, Tag } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import {
  canEdit,
  cutoffClosed,
  day,
  includesSunday,
  orderName,
  PageHeader,
  StoreIcon,
  StoreLink,
  statusForOrder,
  tempName,
  tempsFor,
  time,
} from './shared';
import { useStore } from './workspace';

interface Draft {
  units: string;
  weightKg: string;
  volumeM3: string;
}

const emptyDraft = (): Draft => ({ units: '', weightKg: '', volumeM3: '' });

function draftFrom(order: Order): Draft {
  return {
    units: String(order.units),
    weightKg: String(order.weightKg),
    volumeM3: String(order.volumeM3),
  };
}

function blank(draft: Draft) {
  return draft.units === '' && draft.weightKg === '' && draft.volumeM3 === '';
}

function parsed(draft: Draft) {
  if (blank(draft)) return { kind: 'empty' as const };
  const units = Number(draft.units);
  const weightKg = Number(draft.weightKg);
  const volumeM3 = Number(draft.volumeM3);
  if (!Number.isInteger(units) || units < 1)
    return { kind: 'invalid' as const, error: 'Units must be a whole number greater than zero.' };
  if (!Number.isFinite(weightKg) || weightKg <= 0)
    return { kind: 'invalid' as const, error: 'Weight must be greater than zero.' };
  if (!Number.isFinite(volumeM3) || volumeM3 <= 0)
    return { kind: 'invalid' as const, error: 'Volume must be greater than zero.' };
  return { kind: 'ok' as const, value: { units, weightKg, volumeM3 } };
}

export function PlaceOrder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, now, writable, refresh } = useStore();
  const navigate = useNavigate();
  const editing = data.orders.find((item) => item.order.id === id);
  const targetDate =
    editing?.order.requestedDate ?? data.eligibleServiceDate ?? data.nextServiceDate;
  const runClosed =
    Boolean(data.nextServiceDate) &&
    data.eligibleServiceDate !== data.nextServiceDate &&
    cutoffClosed(data.cutoffAt, now) &&
    !editing;
  const temps = tempsFor(data.outlet.brand);
  const focus = params.get('temp');
  const slots = useMemo(
    () =>
      temps.map((temp) => {
        const existing = data.orders.find(
          (item) =>
            item.order.requestedDate === targetDate &&
            item.order.temp === temp &&
            item.order.status !== 'cancelled' &&
            (!editing ||
              item.order.id === editing.order.id ||
              item.order.requestedDate === editing.order.requestedDate),
        );
        return { temp, existing: existing ?? null };
      }),
    [data.orders, editing, targetDate, temps],
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      slots.map((slot) => [
        slot.temp,
        slot.existing ? draftFrom(slot.existing.order) : emptyDraft(),
      ]),
    ),
  );
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: async () => {
      if (!targetDate) throw new Error('No operating day is open for a new order.');
      if (!writable) throw new Error('Reconnect before submitting an order.');
      const created: Order[] = [];
      for (const slot of slots) {
        const draft = drafts[slot.temp] ?? emptyDraft();
        const result = parsed(draft);
        if (slot.existing && !canEdit(slot.existing, now)) continue;
        if (result.kind === 'empty') {
          if (slot.existing)
            throw new Error(
              `The ${tempName(slot.temp).toLowerCase()} order already exists. Keep a size or cancel it.`,
            );
          continue;
        }
        if (result.kind === 'invalid') throw new Error(`${tempName(slot.temp)}: ${result.error}`);
        if (slot.existing) {
          const current = slot.existing.order;
          const changed =
            current.units !== result.value.units ||
            current.weightKg !== result.value.weightKg ||
            current.volumeM3 !== result.value.volumeM3;
          if (!changed) {
            created.push(current);
            continue;
          }
          created.push(
            await api(`/orders/${current.id}`, orderSchema, {
              method: 'PATCH',
              headers: { 'If-Match': String(current.version) },
              body: JSON.stringify(result.value),
            }),
          );
        } else {
          created.push(
            await api('/orders', orderSchema, {
              method: 'POST',
              body: JSON.stringify({ requestedDate: targetDate, temp: slot.temp, ...result.value }),
            }),
          );
        }
      }
      if (!created.length)
        throw new Error('Enter units, weight and volume for at least one order.');
      return created;
    },
    onSuccess: async (orders) => {
      await refresh();
      const first = orders[0];
      if (!first) return;
      const companion = orders[1];
      navigate(`/store/orders/${first.id}/confirmation`, {
        state: companion ? { companionId: companion.id } : null,
      });
    },
    onError: (cause) => setError(message(cause)),
  });

  if (!targetDate) {
    return (
      <Card>
        <h1>No delivery day is open</h1>
        <p>The calendar has no upcoming operating day for a new order.</p>
      </Card>
    );
  }

  if (editing && !canEdit(editing, now)) {
    return (
      <>
        <PageHeader
          title="This order is locked"
          description={`${orderName(editing.order.id)} · planning has this run`}
        >
          <StoreLink secondary to={`/store/orders/${editing.order.id}/confirmation`}>
            View order
          </StoreLink>
        </PageHeader>
        <LockedNotice item={editing} nextDate={data.eligibleServiceDate} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={runClosed ? `Order held for ${day(targetDate)}` : `Order for ${day(targetDate)}`}
        description={
          data.outlet.brand === 'Fresh'
            ? 'Chilled and dry are sent as two orders'
            : `${data.outlet.brand} · ${data.outlet.window.open}–${data.outlet.window.close}`
        }
      >
        <Badge tone={runClosed ? 'hold' : 'neutral'}>
          {runClosed
            ? 'Held · next run'
            : `Cutoff ${time(data.cutoffAt)} · ${cutoffClosed(data.cutoffAt, now) ? 'locked' : 'open'}`}
        </Badge>
      </PageHeader>
      {runClosed && (
        <HeldNotice
          date={targetDate}
          closedDate={data.nextServiceDate}
          window={`${data.outlet.window.open}–${data.outlet.window.close}`}
        />
      )}
      <form
        className="store-split store-order-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          save.mutate();
        }}
      >
        <Card>
          <div className="store-stack">
            {slots.map((slot) => (
              <SizeFields
                key={slot.temp}
                temp={slot.temp}
                draft={drafts[slot.temp] ?? emptyDraft()}
                locked={slot.existing ? !canEdit(slot.existing, now) : false}
                highlighted={focus === slot.temp}
                onChange={(draft) => setDrafts((current) => ({ ...current, [slot.temp]: draft }))}
              />
            ))}
          </div>
        </Card>
        <div className="store-stack store-order-summary">
          <Card>
            <h2>Summary</h2>
            {slots.map((slot) => {
              const result = parsed(drafts[slot.temp] ?? emptyDraft());
              const units = result.kind === 'ok' ? result.value.units : slot.existing?.order.units;
              const weight =
                result.kind === 'ok' ? result.value.weightKg : slot.existing?.order.weightKg;
              return (
                <div className="store-row" key={slot.temp}>
                  <span>
                    <StoreIcon source="2047-5268" name={slot.temp === 'chilled' ? 'Snow' : 'Box'} />{' '}
                    {tempName(slot.temp)}
                  </span>
                  <strong>
                    {units ?? '—'} units · {weight ?? '—'} kg
                  </strong>
                </div>
              );
            })}
            <p className="store-figure">
              {slots
                .reduce((total, slot) => {
                  const result = parsed(drafts[slot.temp] ?? emptyDraft());
                  return total + (result.kind === 'ok' ? result.value.weightKg : 0);
                }, 0)
                .toLocaleString()}
              <small>kg total</small>
            </p>
            {error && (
              <p role="alert" className="store-error">
                {error}
              </p>
            )}
            <Button type="submit" busy={save.isPending} disabled={!writable}>
              {save.isPending
                ? 'Submitting…'
                : data.outlet.brand === 'Fresh'
                  ? 'Submit orders'
                  : 'Submit order'}
            </Button>
            <p className="wp-muted">
              Orders lock at 16:00 Asia/Colombo on the day before delivery.
            </p>
          </Card>
          {!runClosed && (
            <CutoffCardLite
              cutoff={
                slots.find((slot) => slot.existing)?.existing?.cutoffAt ??
                data.serviceDates.find((item) => item.date === targetDate)?.cutoffAt ??
                data.cutoffAt
              }
              now={now}
            />
          )}
        </div>
      </form>
    </>
  );
}

function SizeFields({
  temp,
  draft,
  locked,
  highlighted,
  onChange,
}: {
  temp: TemperatureRequirement;
  draft: Draft;
  locked: boolean;
  highlighted: boolean;
  onChange: (draft: Draft) => void;
}) {
  const step = (by: number) => {
    const current = Number(draft.units);
    const next = (Number.isInteger(current) ? current : 0) + by;
    onChange({ ...draft, units: String(Math.max(0, next)) });
  };
  return (
    <fieldset className="store-nested" disabled={locked} data-active={highlighted || undefined}>
      <legend className="store-row">
        <strong>{tempName(temp)}</strong>
        <Tag kind={temp === 'chilled' ? 'chilled' : 'ambient'} />
      </legend>
      {locked && <Badge tone="hold">Locked after cutoff</Badge>}
      <div className="store-field">
        <span>Units</span>
        <div className="store-stepper">
          <button
            type="button"
            aria-label={`Decrease ${tempName(temp)} units`}
            onClick={() => step(-1)}
          >
            −
          </button>
          <input
            inputMode="numeric"
            aria-label={`${tempName(temp)} units`}
            value={draft.units}
            onChange={(event) => onChange({ ...draft, units: event.target.value })}
          />
          <button
            type="button"
            aria-label={`Increase ${tempName(temp)} units`}
            onClick={() => step(1)}
          >
            +
          </button>
        </div>
      </div>
      <label className="store-field">
        Weight kg
        <input
          inputMode="decimal"
          value={draft.weightKg}
          onChange={(event) => onChange({ ...draft, weightKg: event.target.value })}
        />
      </label>
      <label className="store-field">
        Volume m³
        <input
          inputMode="decimal"
          value={draft.volumeM3}
          onChange={(event) => onChange({ ...draft, volumeM3: event.target.value })}
        />
      </label>
    </fieldset>
  );
}

function HeldNotice({
  date,
  closedDate,
  window,
}: {
  date: string;
  closedDate: string | null;
  window: string;
}) {
  return (
    <div className="store-split">
      <Card>
        <div className="wp-between">
          <h2>What happened</h2>
          <Badge tone="hold">Held automatically</Badge>
        </div>
        <p>
          Orders after 16:00 go to the next operating day.
          {closedDate && includesSunday(closedDate, date) ? ' There is no Sunday run.' : ''}
        </p>
        <p className="wp-muted">
          {closedDate ? `${day(closedDate)} is locked.` : 'The closed run is locked.'} This order is
          for {day(date)}.
        </p>
      </Card>
      <HeroMetric
        label="Next delivery"
        value={day(date)}
        description={`Window ${window}`}
        icon={<StoreIcon source="2047-5268" name="Box" />}
      />
    </div>
  );
}

function LockedNotice({ item, nextDate }: { item: StoreOrder; nextDate: string | null }) {
  return (
    <div className="store-split">
      <Card>
        <StatusBadge status={statusForOrder[item.order.status]} />
        <p>
          {orderName(item.order.id)} can no longer be edited.{' '}
          {item.cutoffAt ? `The cutoff was ${time(item.cutoffAt)}.` : 'Planning has locked it.'}
        </p>
        {nextDate && (
          <StoreLink to="/store/orders/new">Place an order for {day(nextDate)}</StoreLink>
        )}
      </Card>
      <Card>
        <h2>Locked order</h2>
        <p>
          {tempName(item.order.temp)} · {item.order.units} units · {item.order.weightKg} kg
        </p>
        <Button asChild variant="secondary">
          <Link to={`/store/orders/${item.order.id}`}>View status</Link>
        </Button>
      </Card>
    </div>
  );
}

function CutoffCardLite({ cutoff, now }: { cutoff: string | null | undefined; now: number }) {
  return (
    <HeroMetric
      label="You can still edit"
      value={cutoff ? (cutoffClosed(cutoff, now) ? 'Locked' : time(cutoff)) : '—'}
      description={
        cutoff && !cutoffClosed(cutoff, now)
          ? `Until the ${time(cutoff)} cutoff. After that, planning locks it.`
          : 'This run is locked.'
      }
      icon={<StoreIcon source="2047-5268" name="Pen" />}
    />
  );
}
