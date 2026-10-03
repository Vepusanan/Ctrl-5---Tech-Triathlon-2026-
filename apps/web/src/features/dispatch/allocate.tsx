// D03 · Allocation + advisor (Figma 2039:1225)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoveAllocationRequest } from '@waypoint/shared';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Banner,
  Button,
  Checkbox,
  DeltaBadge,
  Dropdown,
  ErrorState,
  Icon,
  IconButton,
  LoadingState,
  Popover,
  ProgressBar,
  Ring,
  SegmentedControl,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { AutomaticRun } from './allocate-auto';
import {
  adviceSchema,
  allocationBoardSchema,
  type BoardVehicle,
  type Candidate,
  type QueueOrder,
} from './contracts';
import { api, message, noContent } from './data/client';
import { tagKinds } from './queue-filters';
import { CardHead, Stat } from './ui';
import { Page, useDispatch } from './workspace';
import './allocate.css';

type Mode = 'manual' | 'assisted' | 'automatic';
const modes = [
  { value: 'manual', label: 'Manual' },
  { value: 'assisted', label: 'Assisted' },
  { value: 'automatic', label: 'Automatic' },
] as const;

const sorts = [
  { value: 'reefer', label: 'Reefer first' },
  { value: 'free', label: 'Most free space' },
  { value: 'id', label: 'Vehicle ID' },
] as const;
type Sort = (typeof sorts)[number]['value'];

const free = (vehicle: BoardVehicle) =>
  vehicle.trips.length === 0 ? 100 : 100 - Math.min(...vehicle.trips.map((t) => t.loadPercent));
const sorters: Record<Sort, (a: BoardVehicle, b: BoardVehicle) => number> = {
  reefer: (a, b) => Number(b.temp === 'reefer') - Number(a.temp === 'reefer'),
  free: (a, b) => free(b) - free(a),
  id: (a, b) => a.id.localeCompare(b.id),
};

/** Same thresholds as the shared CapacityBar: amber from 90%, red above 100%. */
const loadTone = (percent: number) =>
  percent > 100 ? 'danger' : percent >= 90 ? 'warning' : 'neutral';

function OrderTags({ order }: { order: QueueOrder }) {
  return (
    <>
      <Tag kind={order.temp === 'chilled' ? 'chilled' : 'ambient'} />
      {order.tags.map((tag) => (
        <Tag key={tag} kind={tagKinds[tag]} />
      ))}
    </>
  );
}

export function AllocationWorkspace() {
  const { date } = useDispatch();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const requested = params.get('mode');
  const mode: Mode = requested === 'manual' || requested === 'automatic' ? requested : 'assisted';
  const setMode = (next: Mode) => {
    const query = new URLSearchParams(params);
    query.set('mode', next);
    setParams(query);
  };

  const board = useQuery({
    queryKey: ['planning', date, 'board'],
    queryFn: () => api(`/planning/runs/${date}/board`, allocationBoardSchema),
    enabled: mode !== 'automatic',
  });
  const unallocated = board.data?.unallocated ?? [];
  const preset = params.get('orders')?.split(',')[0];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Assisted mode always has an order in focus: the one asked for, else the first in the pane.
  const selected =
    unallocated.find((order) => order.id === selectedId) ??
    (mode === 'assisted' && !dismissed
      ? (unallocated.find((order) => order.id === preset) ?? unallocated[0])
      : undefined);

  const advice = useQuery({
    queryKey: ['planning', date, 'advice', selected?.id],
    queryFn: () => api(`/planning/runs/${date}/advice?orderId=${selected?.id}`, adviceSchema),
    enabled: mode === 'assisted' && selected !== undefined,
  });
  const [rejected, setRejected] = useState<readonly string[]>([]);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const keyOf = (candidate: Candidate) => `${candidate.vehicleId}-${candidate.tripNo}`;
  const candidates = (advice.data?.candidates ?? []).filter(
    (candidate) => !rejected.includes(`${selected?.id}:${keyOf(candidate)}`),
  );
  const proposal = candidates.find((candidate) => keyOf(candidate) === pickedKey) ?? candidates[0];

  const [depot, setDepot] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('reefer');
  const [fitsOnly, setFitsOnly] = useState(false);
  const depots = [...new Set(board.data?.vehicles.map((vehicle) => vehicle.depot))].sort();
  const shownDepot = depot ?? selected?.outlet.depot ?? depots[0] ?? '';
  // Follow the selected order to its depot's fleet.
  const selectedDepot = selected?.outlet.depot;
  useEffect(() => {
    if (selectedDepot) setDepot(selectedDepot);
  }, [selectedDepot]);

  const assign = useMutation({
    mutationFn: (request: MoveAllocationRequest) =>
      api(`/planning/runs/${date}/allocations`, noContent, {
        method: 'PUT',
        body: JSON.stringify(request),
      }),
    onSuccess: async () => {
      setSelectedId(null);
      setPickedKey(null);
      await client.invalidateQueries({ queryKey: ['planning', date] });
      await client.invalidateQueries({ queryKey: ['dashboard', date] });
    },
  });
  const place = (orderId: string, vehicleId: string, tripNo: 1 | 2) =>
    assign.mutate({ orderId, target: { vehicleId, tripNo } });

  const header = {
    title: 'Allocation',
    description: 'Drag orders onto trips · advisor ranks only feasible options',
  };
  const modeControl = (
    <SegmentedControl label="Allocation mode" value={mode} options={modes} onChange={setMode} />
  );
  if (mode === 'automatic') return <AutomaticRun modeControl={modeControl} setMode={setMode} />;

  const actions = (
    <>
      {modeControl}
      <Button asChild size="md">
        <Link to={`/dispatcher/validation?date=${date}`}>Validate plan</Link>
      </Button>
    </>
  );
  if (board.isPending) {
    return (
      <Page {...header} actions={actions}>
        <LoadingState label="Loading the allocation board…" rows={6} />
      </Page>
    );
  }
  if (!board.data) {
    return (
      <Page {...header} actions={actions}>
        <ErrorState description={message(board.error)} onRetry={() => void board.refetch()} />
      </Page>
    );
  }

  const data = board.data;
  const blocked = new Set(advice.data?.blocked.map((item) => item.vehicleId));
  const feasible = new Set(candidates.map((candidate) => candidate.vehicleId));
  const vehicles = data.vehicles
    .filter((vehicle) => vehicle.depot === shownDepot)
    .filter((vehicle) => !fitsOnly || !selected || mode !== 'assisted' || feasible.has(vehicle.id))
    .sort(sorters[sort]);

  return (
    <Page {...header} actions={actions}>
      <section className="wp-card al-strip" aria-label="Plan summary">
        <Ring size={56} stroke={6} percent={data.quality.score}>
          <strong className="al-ring-value">{data.quality.score}</strong>
        </Ring>
        <div className="al-quality">
          <strong>Plan quality</strong>
          {data.quality.delta !== null && <DeltaBadge value={data.quality.delta} />}
        </div>
        <span className="al-divider" aria-hidden="true" />
        <div className="al-allocated">
          <p>
            <span>Allocated</span>
            <strong>
              {data.allocated} / {data.orders}
            </strong>
          </p>
          <ProgressBar
            label="Orders allocated"
            tone="positive"
            value={data.orders > 0 ? (data.allocated / data.orders) * 100 : 0}
          />
        </div>
        <Stat icon="xoct" value={data.violations} label="Violations" tone="danger" />
        <Stat icon="alert" value={data.risks} label="Risks" tone="warning" />
        <Stat
          icon="truck"
          value={data.tripLimitOk ? '✓' : '✕'}
          label="Trips ≤ 2"
          tone={data.tripLimitOk ? 'success' : 'danger'}
        />
        <Stat icon="history" value={data.deferred} label="Deferred" />
      </section>
      {assign.isError && (
        <Banner tone="danger" title="That placement breaks a hard rule">
          {message(assign.error)}
        </Banner>
      )}
      <div className="al-workspace" data-mode={mode}>
        <section className="wp-card al-pane" aria-label="Unallocated orders">
          <CardHead title="Unallocated">
            <StatusBadge status="planning" label={String(unallocated.length)} />
          </CardHead>
          {unallocated.length === 0 && <p className="wp-muted">Every order has a trip.</p>}
          <ul className="wp-list al-orders">
            {unallocated.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  className="al-order"
                  draggable
                  aria-pressed={order.id === selected?.id}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', order.id)}
                  onClick={() => {
                    setSelectedId(order.id);
                    setDismissed(false);
                    setPickedKey(null);
                  }}
                >
                  <span>
                    <Icon name="grip" size={14} />
                    <strong>{order.outlet.name}</strong>
                    <small>{order.weightKg} kg</small>
                  </span>
                  <span className="al-tags">
                    <OrderTags order={order} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="wp-card al-pane al-lanes" aria-label="Trip lanes">
          <CardHead title={`${shownDepot} fleet`}>
            <Dropdown label="Sort vehicles" value={sort} options={sorts} onChange={setSort} />
            <Popover icon="sliders" label="Fleet options" active={fitsOnly}>
              <div className="dq-filter">
                <span>Depot</span>
                <Dropdown
                  label="Depot"
                  value={shownDepot}
                  options={depots.map((value) => ({ value, label: value }))}
                  onChange={setDepot}
                />
              </div>
              <Checkbox
                label="Only vehicles that fit the selected order"
                checked={fitsOnly}
                onChange={(event) => setFitsOnly(event.target.checked)}
              />
            </Popover>
          </CardHead>
          {vehicles.length === 0 && <p className="wp-muted">No vehicles to show.</p>}
          {vehicles.map((vehicle) => {
            const open: (1 | 2)[] = vehicle.trips.length < 2 ? [1, 2] : [];
            const next = open.find((no) => !vehicle.trips.some((trip) => trip.tripNo === no));
            return (
              <article
                key={vehicle.id}
                className="al-vehicle"
                data-blocked={(mode === 'assisted' && blocked.has(vehicle.id)) || undefined}
              >
                <header>
                  <Icon name="truck" />
                  <strong className="al-vehicle-id">{vehicle.id}</strong>
                  <span>
                    {vehicle.kind}
                    {vehicle.driver && ` · ${vehicle.driver}`}
                  </span>
                  <span className="al-tags">
                    <Tag kind={vehicle.temp === 'reefer' ? 'reefer' : 'dry-box'} />
                    {vehicle.type === 'van' && <Tag kind="van" />}
                  </span>
                </header>
                {[...vehicle.trips, ...(next ? [{ tripNo: next, stops: [], loadPercent: 0 }] : [])]
                  .sort((a, b) => a.tripNo - b.tripNo)
                  .map((trip) => {
                    const insert =
                      proposal?.vehicleId === vehicle.id && proposal.tripNo === trip.tripNo
                        ? proposal
                        : undefined;
                    if (trip.stops.length === 0 && !insert && mode !== 'manual') return null;
                    const tone = loadTone(insert ? insert.loadPercentAfter : trip.loadPercent);
                    return (
                      // biome-ignore lint/a11y/noStaticElementInteractions: drop target only; the same action is on the Place and Assign buttons
                      <div
                        key={trip.tripNo}
                        className="al-trip"
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                          event.preventDefault();
                          const id = event.dataTransfer.getData('text/plain');
                          if (id) place(id, vehicle.id, trip.tripNo);
                        }}
                      >
                        <b>T{trip.tripNo}</b>
                        {trip.stops.map((stop, index) => (
                          <span key={stop.orderId}>
                            {index + 1} {stop.name}
                          </span>
                        ))}
                        {insert && selected && (
                          <span data-proposed>
                            {insert.seq} {selected.outlet.name}
                          </span>
                        )}
                        {mode === 'manual' && selected && (
                          <button
                            type="button"
                            className="d-link"
                            disabled={assign.isPending}
                            onClick={() => place(selected.id, vehicle.id, trip.tripNo)}
                          >
                            Place here
                          </button>
                        )}
                        <span className="al-load" data-tone={tone}>
                          <ProgressBar
                            label={`${vehicle.id} trip ${trip.tripNo} load`}
                            track="muted"
                            tone={tone}
                            value={insert ? insert.loadPercentAfter : trip.loadPercent}
                          />
                          {insert
                            ? `${Math.round(trip.loadPercent)}→${Math.round(insert.loadPercentAfter)}%`
                            : `${Math.round(trip.loadPercent)}%`}
                        </span>
                      </div>
                    );
                  })}
              </article>
            );
          })}
        </section>
        {mode === 'assisted' && (
          <section className="wp-card al-advisor" aria-label="Advisor">
            <CardHead title="Advisor" icon="bulb">
              {selected && (
                <IconButton
                  icon="x"
                  label="Close the advisor"
                  onClick={() => {
                    setSelectedId(null);
                    setDismissed(true);
                  }}
                />
              )}
            </CardHead>
            {!selected && (
              <p className="wp-muted">
                Select an order. The advisor ranks the trips it can go on and explains the ones it
                cannot.
              </p>
            )}
            {selected && (
              <div className="al-subject">
                <span className="wp-mono">{selected.reference}</span>
                <span className="al-tags">
                  <OrderTags order={selected} />
                </span>
              </div>
            )}
            {selected && advice.isPending && (
              <p className="wp-muted" role="status">
                Ranking feasible trips…
              </p>
            )}
            {selected && advice.isError && (
              <Banner
                tone="danger"
                title="Could not load the advice"
                action={
                  <button type="button" className="d-link" onClick={() => void advice.refetch()}>
                    Try again
                  </button>
                }
              >
                {message(advice.error)}
              </Banner>
            )}
            {selected && advice.data && !proposal && (
              <Banner tone="warning" title="No feasible vehicle">
                No trip can take this order without breaking a hard rule. Decide a deferral.
              </Banner>
            )}
            {selected && advice.data && !proposal && (
              <Button asChild size="md">
                <Link to={`/dispatcher/deferrals?date=${date}&orders=${selected.id}`}>
                  Open deferrals
                </Link>
              </Button>
            )}
            {selected && proposal && (
              <div className="al-top">
                <div className="d-head">
                  <h3 className="d-title">
                    {proposal.vehicleId} · Trip {proposal.tripNo}
                  </h3>
                  {proposal === advice.data?.candidates[0] && <Tag kind="recommended" />}
                </div>
                <p className="al-score">
                  <strong>{proposal.score}</strong> fit score
                </p>
                <ul className="wp-list al-factors">
                  {proposal.factors.map((factor) => (
                    <li key={factor.text}>
                      <Icon
                        name={factor.ok ? 'check' : 'alert'}
                        size={14}
                        className={factor.ok ? 'al-factor-ok' : 'al-factor-watch'}
                      />
                      <span className="wp-sr-only">{factor.ok ? 'Met:' : 'Watch:'}</span>
                      {factor.text}
                    </li>
                  ))}
                </ul>
                <div className="al-actions">
                  <Button
                    size="md"
                    busy={assign.isPending}
                    onClick={() => place(selected.id, proposal.vehicleId, proposal.tripNo)}
                  >
                    Assign
                  </Button>
                  <Button
                    variant="tertiary"
                    size="md"
                    disabled={candidates.length < 2}
                    onClick={() => {
                      const index = candidates.indexOf(proposal);
                      const other = candidates[(index + 1) % candidates.length];
                      if (other) setPickedKey(keyOf(other));
                    }}
                  >
                    Modify
                  </Button>
                  <Button
                    variant="tertiary"
                    size="md"
                    onClick={() => {
                      setRejected([...rejected, `${selected.id}:${keyOf(proposal)}`]);
                      setPickedKey(null);
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
            {selected && candidates.length > 1 && (
              <>
                <h3 className="d-label">Other feasible</h3>
                <ul className="wp-list">
                  {candidates
                    .filter((candidate) => candidate !== proposal)
                    .map((candidate) => (
                      <li key={keyOf(candidate)}>
                        <button
                          type="button"
                          className="al-other"
                          onClick={() => setPickedKey(keyOf(candidate))}
                        >
                          <b>{candidate.score}</b>
                          <span className="al-other-text">
                            <strong>
                              {candidate.vehicleId} · Trip {candidate.tripNo}
                            </strong>
                            <small>{candidate.summary}</small>
                          </span>
                          <Icon name="cr" className="d-chevron" />
                        </button>
                      </li>
                    ))}
                </ul>
              </>
            )}
            {selected && advice.data && advice.data.blocked.length > 0 && (
              <div className="al-blocked">
                <h3>
                  <Icon name="lock" size={14} />
                  Why not possible
                </h3>
                <ul className="wp-list">
                  {advice.data.blocked.map((item) => (
                    <li key={item.vehicleId}>
                      <strong className="al-blocked-id">{item.vehicleId}</strong>
                      <span>{item.reason}</span>
                      <Tag kind="blocks-publish">Blocked</Tag>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </Page>
  );
}
