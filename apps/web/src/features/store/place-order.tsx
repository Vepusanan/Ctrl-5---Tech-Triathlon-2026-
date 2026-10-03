import { useMutation } from '@tanstack/react-query';
import type { Order, TemperatureRequirement } from '@waypoint/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Banner, Button, IconButton, SegmentedControl, Tabs } from '../../components/waypoint';
import { message } from '../../lib/api';
import { weekDay } from '../../lib/format';
import type { Product } from './contracts';
import {
  catalogueFor,
  clearDraft,
  linesFor,
  orderName,
  readDraft,
  rememberLines,
  saveDraft,
  storeApi,
  totals,
} from './data';
import { Empty } from './states';
import {
  CardHead,
  canEdit,
  day,
  kg,
  PageHead,
  Pill,
  plural,
  remaining,
  Stepper,
  StoreIcon,
  Strip,
  TempRow,
  TempTag,
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

type Tab = TemperatureRequirement | 'usual';

export function PlaceOrder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data, now, writable, refresh } = useStore();
  const navigate = useNavigate();
  const phone = usePhone();
  const editing = data.orders.find((item) => item.order.id === id);
  const targetDate =
    editing?.order.requestedDate ?? data.eligibleServiceDate ?? data.nextServiceDate;
  // The run the store wanted has closed, so a new order goes on the one after (S02a).
  const runClosed =
    !editing &&
    data.nextServiceDate !== null &&
    data.eligibleServiceDate !== data.nextServiceDate &&
    (data.cutoffAt === null || now >= Date.parse(data.cutoffAt));
  const temps = tempsFor(data.outlet.brand);
  const catalogue = useMemo(() => catalogueFor(data.outlet.brand), [data.outlet.brand]);
  const slots = useMemo(
    () =>
      temps.map((temp) => {
        const existing =
          data.orders.find(
            (item) =>
              item.order.requestedDate === targetDate &&
              item.order.temp === temp &&
              item.order.status !== 'cancelled',
          ) ?? null;
        return { temp, existing, locked: existing ? !canEdit(existing, now) : false };
      }),
    [data.orders, now, targetDate, temps],
  );
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    const draft = targetDate ? readDraft(data.outlet.id, targetDate) : {};
    const sent = new Map(
      slots.flatMap((slot) =>
        slot.existing
          ? linesFor(slot.existing.order).map((line) => [line.product.sku, line.qty] as const)
          : [],
      ),
    );
    return Object.fromEntries(
      catalogue.map((product) => {
        const slot = slots.find((item) => item.temp === product.temp);
        return [
          product.sku,
          slot?.existing ? (sent.get(product.sku) ?? 0) : (draft[product.sku] ?? 0),
        ];
      }),
    );
  });
  const asked = params.get('temp');
  const [tab, setTab] = useState<Tab>(
    temps.find((temp) => temp === asked) ?? editing?.order.temp ?? temps[0] ?? 'ambient',
  );
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const linesOf = (temp: TemperatureRequirement) =>
    catalogue
      .filter((product) => product.temp === temp)
      .map((product) => ({ product, qty: quantities[product.sku] ?? 0 }));
  const sums = slots.map((slot) => {
    const items = linesOf(slot.temp);
    return { ...slot, items, ...totals(items) };
  });
  const total = sums.reduce(
    (sum, slot) => ({
      lines: sum.lines + slot.lines,
      weightKg: sum.weightKg + slot.weightKg,
      volumeM3: sum.volumeM3 + slot.volumeM3,
    }),
    { lines: 0, weightKg: 0, volumeM3: 0 },
  );
  const sending = sums.filter((slot) => slot.units > 0 && !slot.locked);
  // A usual item left at zero is flagged before sending, once that order has any line.
  const forgotten = catalogue.filter((product) => {
    const slot = sums.find((item) => item.temp === product.temp);
    return (
      product.usual > 0 &&
      (quantities[product.sku] ?? 0) === 0 &&
      slot &&
      slot.units > 0 &&
      !slot.locked
    );
  });
  const cutoff =
    slots.find((slot) => slot.existing)?.existing?.cutoffAt ??
    data.serviceDates.find((item) => item.date === targetDate)?.cutoffAt ??
    data.cutoffAt;

  const save = useMutation({
    mutationFn: async () => {
      if (!targetDate) throw new Error('No operating day is open for a new order.');
      if (!writable) throw new Error('Reconnect before submitting an order.');
      const saved: Order[] = [];
      for (const slot of sums) {
        if (slot.locked) continue;
        const size = { units: slot.units, weightKg: slot.weightKg, volumeM3: slot.volumeM3 };
        if (slot.units === 0) {
          if (slot.existing) {
            throw new Error(
              `The ${tempName(slot.temp).toLowerCase()} order already exists. Keep at least one line on it.`,
            );
          }
          continue;
        }
        const current = slot.existing?.order;
        const order = !current
          ? await storeApi.createOrder({ requestedDate: targetDate, temp: slot.temp, ...size })
          : current.units === size.units &&
              current.weightKg === size.weightKg &&
              current.volumeM3 === size.volumeM3
            ? current
            : await storeApi.updateOrder(current, size);
        rememberLines(order.id, slot.items);
        saved.push(order);
      }
      if (!saved.length) throw new Error('Add at least one line before you submit.');
      return saved;
    },
    onSuccess: async (orders) => {
      if (targetDate) clearDraft(data.outlet.id, targetDate);
      await refresh();
      const first = orders[0];
      if (first) navigate(`/store/orders/${first.id}/${runClosed ? 'held' : 'confirmation'}`);
    },
    onError: (cause) => setError(message(cause)),
  });
  const submit = () => {
    setError('');
    save.mutate();
  };

  if (!targetDate) {
    return (
      <>
        <PageHead title="Place order" />
        <Empty
          icon="cal"
          title="No delivery day is open"
          description="The calendar has no upcoming operating day for a new order."
        />
      </>
    );
  }
  if (editing && !canEdit(editing, now)) {
    return (
      <>
        <PageHead
          title="This order is locked"
          sub={`${orderName(editing.order.id)} · planning has this run`}
          back="/store"
        />
        <Empty
          icon="lock"
          title={`${orderName(editing.order.id)} can no longer be edited`}
          description={
            editing.cutoffAt
              ? `The cutoff was ${time(editing.cutoffAt)} on ${day(editing.cutoffAt)}.`
              : 'Planning has locked it.'
          }
        >
          <Button asChild variant="secondary" size="md">
            <Link to={`/store/orders/${editing.order.id}`}>View status</Link>
          </Button>
        </Empty>
      </>
    );
  }

  const wanted = query.trim().toLowerCase();
  const shown = catalogue.filter(
    (product) =>
      (tab === 'usual' ? product.usual > 0 : product.temp === tab) &&
      (!wanted || `${product.name} ${product.sku}`.toLowerCase().includes(wanted)),
  );
  const isLocked = (product: Product) =>
    slots.find((slot) => slot.temp === product.temp)?.locked ?? false;
  const setQty = (sku: string, qty: number) => {
    setSavedAt(null);
    setQuantities((current) => ({ ...current, [sku]: qty }));
  };
  const tabs = [
    ...sums.map((slot) => ({
      value: slot.temp as Tab,
      label: `${tempName(slot.temp)} · ${slot.lines}`,
    })),
    ...(phone ? [] : [{ value: 'usual' as Tab, label: `Usual ${weekdayName(targetDate)}` }]),
  ];
  const submitLabel = error
    ? 'Retry'
    : editing
      ? 'Save changes'
      : sending.length > 1
        ? 'Submit both orders'
        : 'Submit order';
  const cutoffLabel = `Cutoff ${time(cutoff)} · ${remaining(cutoff, now).toLowerCase()}`;
  const searchField = searching && (
    <input
      className="st-search-field"
      type="search"
      aria-label="Search the catalogue"
      placeholder="Search by product or code"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
    />
  );
  const searchButton = (
    <IconButton
      icon="search"
      label="Search the catalogue"
      active={searching}
      onClick={() => {
        setSearching((value) => !value);
        setQuery('');
      }}
    />
  );
  const failure = error && (
    <Banner tone="danger" title="Couldn’t submit your order">
      {error} Your lines are kept.
    </Banner>
  );
  const usualChip = (product: Product) => {
    const missed = forgotten.includes(product);
    return (
      <span className="st-usual" data-missed={missed || undefined}>
        <StoreIcon name="history" size={12} />
        usual {product.usual}
      </span>
    );
  };

  if (phone) {
    return (
      <>
        <PageHead
          title={`Order for ${weekDay(targetDate)}`}
          eyebrow={runClosed ? `Held for ${day(targetDate)}` : cutoffLabel}
          phoneAction={searchButton}
        />
        {tabs.length > 1 && (
          <SegmentedControl
            label="Order"
            value={tab}
            options={tabs}
            onChange={(value) => setTab(value)}
          />
        )}
        {searchField}
        {failure}
        <section className="wp-card st-lines-phone">
          {shown.length === 0 && <p className="st-caption">No product matches that search.</p>}
          {shown.map((product) => (
            <div key={product.sku} className="st-line-phone">
              <div>
                <strong>{product.name}</strong>
                {usualChip(product)}
              </div>
              <Stepper
                label={product.name}
                size={44}
                value={quantities[product.sku] ?? 0}
                disabled={isLocked(product)}
                onChange={(qty) => setQty(product.sku, qty)}
              />
            </div>
          ))}
        </section>
        <ThumbZone>
          <p className="st-thumb-note">
            <strong>
              {kg(total.weightKg)} · {plural(total.lines, 'line')}
            </strong>
            <small>{sums.map((slot) => tempName(slot.temp).toLowerCase()).join(' + ')}</small>
          </p>
          <Button className="st-btn-xl" busy={save.isPending} disabled={!writable} onClick={submit}>
            {save.isPending ? 'Submitting…' : submitLabel}
          </Button>
        </ThumbZone>
      </>
    );
  }

  return (
    <>
      <PageHead
        title={runClosed ? `Order held for ${day(targetDate)}` : `Order for ${day(targetDate)}`}
        sub={
          runClosed
            ? 'The cutoff has passed, so this order goes on the next run'
            : temps.length > 1
              ? 'Chilled and dry are sent as two orders'
              : `${data.outlet.brand} · window ${data.outlet.window.open}–${data.outlet.window.close}`
        }
      >
        {runClosed ? (
          <Pill tone="hold" icon="pause">
            Held · next run
          </Pill>
        ) : (
          <span className="st-chip">
            <StoreIcon name="clock" size={14} />
            {cutoffLabel}
          </span>
        )}
      </PageHead>
      {failure}
      <form
        className="st-grid st-grid--hero st-fill"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <section className="wp-card st-catalogue">
          <div className="st-catalogue-head">
            <Tabs label="Order" value={tab} options={tabs} onChange={(value) => setTab(value)} />
            {searchField}
            {searchButton}
          </div>
          {shown.some(isLocked) && (
            <Pill tone="hold" icon="lock">
              Locked after cutoff
            </Pill>
          )}
          {shown.length === 0 && <p className="st-caption">No product matches that search.</p>}
          <ul className="st-lines">
            {shown.map((product) => (
              <li key={product.sku}>
                <Well icon={tempIcon(product.temp)} size={48} />
                <div className="st-line-text">
                  <strong>{product.name}</strong>
                  <span>
                    <code>{product.sku}</code>
                    <TempTag temp={product.temp} />
                  </span>
                </div>
                {usualChip(product)}
                <Stepper
                  label={product.name}
                  value={quantities[product.sku] ?? 0}
                  disabled={isLocked(product)}
                  onChange={(qty) => setQty(product.sku, qty)}
                />
              </li>
            ))}
          </ul>
        </section>
        <section className="wp-card st-summary">
          <CardHead icon="list" title="Summary" />
          {sums.map((slot) => (
            <TempRow
              key={slot.temp}
              temp={slot.temp}
              lines={plural(slot.lines, 'line')}
              value={slot.units > 0 ? kg(slot.weightKg) : 'not sent'}
            />
          ))}
          {forgotten[0] && (
            <Strip tone="warning" icon="alert">
              {forgotten[0].name} is at 0 — you usually order {forgotten[0].usual}.
              {forgotten.length > 1 && ` ${forgotten.length - 1} more usual items are at 0.`}
            </Strip>
          )}
          <span className="st-spacer" />
          <p className="st-caption">
            Volume {total.volumeM3.toFixed(2)} m³ · requested {day(targetDate)}
          </p>
          <p className="st-figure st-figure--lg">
            <b>{Number(total.weightKg.toFixed(1)).toLocaleString('en-GB')}</b>
            <span>kg total</span>
          </p>
          <Button type="submit" size="md" busy={save.isPending} disabled={!writable}>
            {save.isPending ? 'Submitting…' : submitLabel}
          </Button>
          {!editing && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                saveDraft(data.outlet.id, targetDate, quantities);
                setSavedAt(now);
              }}
            >
              {savedAt ? `Draft saved ${time(savedAt)}` : 'Save draft'}
            </Button>
          )}
          <Link
            className="st-quiet-link"
            to={editing ? `/store/orders/${editing.order.id}` : '/store'}
          >
            Cancel
          </Link>
        </section>
      </form>
    </>
  );
}
