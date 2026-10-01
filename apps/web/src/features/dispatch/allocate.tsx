import type { PlanningQueueItem, Violation } from '@waypoint/shared';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  CapacityBar,
  Card,
  ErrorState,
  LoadingState,
  Tag,
} from '../../components/waypoint';
import { message } from '../../lib/api';
import { useBoard } from './board';
import { draftsOf, inspectDraft, placeOrder, recommendation } from './engine';
import { Page, useDispatch } from './workspace';

export function AllocationWorkspace() {
  const { date } = useDispatch();
  const board = useBoard();
  const [selected, setSelected] = useState<string | null>(null);
  const [why, setWhy] = useState<Violation[]>([]);
  const placed = new Set(board.slots.flatMap((slot) => slot.orderIds));
  const queue = board.items.filter((item) => !placed.has(item.id));
  const outletById = useMemo(
    () => new Map((board.outlets.data?.items ?? []).map((outlet) => [outlet.id, outlet])),
    [board.outlets.data],
  );
  const vehicleById = useMemo(
    () => new Map((board.vehicles.data?.items ?? []).map((vehicle) => [vehicle.id, vehicle])),
    [board.vehicles.data],
  );
  if (board.queue.isPending || board.vehicles.isPending || board.trips.isPending)
    return <LoadingState label="Loading the allocation board…" />;
  if (!board.queue.data || !board.vehicles.data || !board.inputs) {
    return (
      <ErrorState
        description={message(board.queue.error ?? board.vehicles.error)}
        onRetry={() => void board.refresh()}
      />
    );
  }
  const chosen = queue.find((item) => item.id === selected) ?? queue[0] ?? null;
  const hint =
    chosen && board.inputs
      ? recommendation(chosen, outletById.get(chosen.outletId), board.slots, board.inputs.validator)
      : null;

  function tryAssign(item: PlanningQueueItem, target: { vehicleId: string; tripNo: 1 | 2 } | null) {
    if (!board.inputs) return;
    const {
      placeOrder: move,
      inspectDraft: inspect,
      draftsOf: asDrafts,
    } = {
      placeOrder,
      inspectDraft,
      draftsOf,
    };
    const next = move(board.slots, item.id, target);
    const check = inspect(board.inputs.validator, asDrafts(next));
    setWhy(check.violations);
    if (check.inputError || check.violations.length > 0) {
      board.setError(
        check.inputError ?? 'Why not possible: a hard constraint blocks this placement.',
      );
      return;
    }
    setWhy([]);
    board.assign(item.id, target);
  }

  return (
    <Page
      title="Allocation workspace"
      description={`${date} · drag an order onto a vehicle trip, or choose a trip with the keyboard. Suggestions never override a hard constraint.`}
    >
      <div className="dispatch-toolbar">
        <Button
          busy={board.allocateAll.isPending}
          disabled={board.published || !board.online}
          onClick={() => board.allocateAll.mutate()}
        >
          Auto-allocate feasible plan
        </Button>
        <Link to={`/dispatch/conflicts?date=${date}`}>Why not possible</Link>
        <Link to={`/dispatch/review?date=${date}`}>Review and publish</Link>
        {board.published && <Tag kind="blocks-publish">Published — edits are closed</Tag>}
      </div>
      {(board.error || why.length > 0 || board.violations.length > 0) && (
        <Card>
          <h2>Why not possible?</h2>
          <p className="wp-muted">
            Hard constraints. A recommendation cannot hide or override these.
          </p>
          {board.error && <p role="alert">{board.error}</p>}
          <ul className="dispatch-list">
            {(why.length > 0 ? why : board.violations).map((item) => (
              <li key={`${item.rule}:${item.orderId ?? 'plan'}:${item.tripKey ?? item.detail}`}>
                <Tag kind="blocks-publish" />
                <span>
                  <strong>{item.rule}</strong> {item.detail}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="dispatch-board">
        <section className="dispatch-queue" aria-label="Unallocated orders">
          <h2>Queue · {queue.length}</h2>
          {queue.map((item) => (
            <article
              key={item.id}
              className="dispatch-order"
              draggable={!board.published}
              onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}
            >
              <header>
                <strong>{item.outletId}</strong>
                <Tag kind={item.temp === 'chilled' ? 'chilled' : 'ambient'} />
                {item.outlet.parkingConstraint === 'van_only' && <Tag kind="van-only" />}
              </header>
              <p>
                {item.brand} · {item.weightKg} kg · {item.volumeM3} m³
              </p>
              <label>
                Move with keyboard
                <select
                  value=""
                  aria-label={`Assign ${item.outletId}`}
                  onFocus={() => setSelected(item.id)}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) return;
                    if (value === 'queue') tryAssign(item, null);
                    else {
                      const [vehicleId, trip] = value.split(':');
                      if (vehicleId && (trip === '1' || trip === '2'))
                        tryAssign(item, { vehicleId, tripNo: trip === '1' ? 1 : 2 });
                    }
                    event.target.value = '';
                  }}
                >
                  <option value="">Choose a trip</option>
                  <option value="queue">Return to queue</option>
                  {board.slots.map((slot) => (
                    <option
                      key={`${slot.vehicleId}:${slot.tripNo}`}
                      value={`${slot.vehicleId}:${slot.tripNo}`}
                    >
                      {slot.vehicleId} trip {slot.tripNo}
                    </option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </section>
        <div className="dispatch-columns">
          {board.slots.map((slot) => {
            const vehicle = vehicleById.get(slot.vehicleId);
            const orders = slot.orderIds
              .map((id) => board.items.find((item) => item.id === id))
              .filter((item) => item !== undefined);
            const weight = orders.reduce((sum, item) => sum + item.weightKg, 0);
            const volume = orders.reduce((sum, item) => sum + item.volumeM3, 0);
            return (
              <section
                key={`${slot.vehicleId}:${slot.tripNo}`}
                className="dispatch-column"
                aria-label={`${slot.vehicleId} trip ${slot.tripNo} drop target`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData('text/plain');
                  const item = board.items.find((row) => row.id === id);
                  if (item) tryAssign(item, { vehicleId: slot.vehicleId, tripNo: slot.tripNo });
                }}
              >
                <header>
                  <Link to={`/dispatch/vehicles/${slot.vehicleId}?date=${date}`}>
                    {slot.vehicleId}
                  </Link>
                  <span>Trip {slot.tripNo}</span>
                  {vehicle?.temp === 'reefer' && <Tag kind="reefer" />}
                  {vehicle?.type === 'van' && <Tag kind="van" />}
                </header>
                {vehicle && (
                  <>
                    <CapacityBar
                      label="Weight"
                      value={weight}
                      max={vehicle.weightCapKg}
                      unit="kg"
                    />
                    <CapacityBar
                      label="Volume"
                      value={volume}
                      max={vehicle.volumeCapM3}
                      unit="m³"
                    />
                  </>
                )}
                {orders.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="dispatch-chip"
                    onClick={() => tryAssign(item, null)}
                  >
                    {item.outletId} · {item.weightKg} kg
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </div>
      {chosen && hint && (
        <Card>
          <h2>Recommendation · not a decision</h2>
          <p>
            <Tag kind="recommended" /> Priority score {hint.score.total.toFixed(0)} for{' '}
            {chosen.outletId}. {hint.checked} vehicle trips pass every hard constraint.
          </p>
          {hint.feasible ? (
            <Button
              variant="secondary"
              disabled={board.published}
              onClick={() => {
                const target = hint.feasible;
                if (target)
                  tryAssign(chosen, { vehicleId: target.vehicleId, tripNo: target.tripNo });
              }}
            >
              Use {hint.feasible.vehicleId} trip {hint.feasible.tripNo}
            </Button>
          ) : (
            <p>
              <Tag kind="blocks-publish" /> No feasible trip. The score does not create an
              exception.
            </p>
          )}
        </Card>
      )}
    </Page>
  );
}
