import type { PlanningQueueItem, Violation } from '@waypoint/shared';
import { type DragEvent, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  CapacityBar,
  ErrorState,
  LoadingState,
  RecommendationCard,
  Tag,
  ViolationPanel,
} from '../../components/waypoint';
import { message } from '../../lib/api';
import { useBoard } from './board';
import { draftsOf, inspectDraft, panelItems, placeOrder, recommendation } from './engine';
import { Page, useDispatch } from './workspace';

type Target = { vehicleId: string; tripNo: 1 | 2 };

export function AllocationWorkspace() {
  const { date } = useDispatch();
  const board = useBoard();
  const [selected, setSelected] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Violation[]>([]);
  const dragged = useRef(false);
  const placed = new Set(board.slots.flatMap((slot) => slot.orderIds));
  const queue = board.items.filter((item) => !placed.has(item.id));
  if (board.queue.isPending || board.vehicles.isPending || board.trips.isPending) {
    return <LoadingState label="Loading the allocation board…" />;
  }
  if (!board.queue.data || !board.vehicles.data || !board.inputs) {
    return (
      <ErrorState
        description={message(board.queue.error ?? board.vehicles.error)}
        onRetry={() => void board.refresh()}
      />
    );
  }
  const inputs = board.inputs;
  const chosen = queue.find((item) => item.id === selected) ?? null;
  const outlet = chosen ? inputs.plan.outlets[chosen.outletId] : undefined;
  const hint = chosen ? recommendation(chosen, outlet, board.slots, inputs.validator) : null;
  const hard = attempt.length > 0 ? attempt : board.violations;
  const vehicleById = new Map(board.vehicles.data.items.map((vehicle) => [vehicle.id, vehicle]));

  function tryAssign(item: PlanningQueueItem, target: Target | null) {
    const next = placeOrder(board.slots, item.id, target);
    const check = inspectDraft(inputs.validator, draftsOf(next));
    setAttempt(check.violations);
    if (check.inputError || check.violations.length > 0) {
      board.setError(
        check.inputError ?? 'Why not possible: a hard constraint blocks this placement.',
      );
      return;
    }
    setAttempt([]);
    board.assign(item.id, target);
  }

  function readDrop(event: DragEvent, target: Target | null) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const item = board.items.find((row) => row.id === id);
    if (item) tryAssign(item, target);
  }

  return (
    <Page
      title="Allocation workspace"
      description={`${date} · drag an order onto a vehicle trip, or select it and use Place here. A recommendation never overrides a hard constraint.`}
    >
      <div className="dispatch-toolbar">
        <Button
          busy={board.allocateAll.isPending}
          disabled={board.published || !board.online}
          onClick={() => board.allocateAll.mutate()}
        >
          Auto-allocate feasible plan
        </Button>
        <Link to={`/dispatcher/conflicts?date=${date}`}>Constraint conflicts</Link>
        <Link to={`/dispatcher/review?date=${date}`}>Review and publish</Link>
        {board.published && <Tag kind="blocks-publish">Published — edits are closed</Tag>}
      </div>
      <div className="dispatch-why">
        <ViolationPanel title="Why not possible?" violations={panelItems(hard)} />
        {board.error && <p role="alert">{board.error}</p>}
        {board.inputError && <p role="alert">{board.inputError}</p>}
      </div>
      <div className="dispatch-board">
        <section
          className="dispatch-queue"
          aria-label="Unallocated orders"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => readDrop(event, null)}
        >
          <h2>Queue · {queue.length}</h2>
          {queue.map((item) => (
            <article
              key={item.id}
              className={item.id === selected ? 'dispatch-order is-selected' : 'dispatch-order'}
              draggable={!board.published}
              onDragStart={(event) => {
                dragged.current = true;
                event.dataTransfer.setData('text/plain', item.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                window.setTimeout(() => {
                  dragged.current = false;
                }, 0);
              }}
            >
              <header>
                <strong>{item.outletId}</strong>
                <Tag kind={item.temp === 'chilled' ? 'chilled' : 'ambient'} />
                {item.outlet.parkingConstraint === 'van_only' && <Tag kind="van-only" />}
                {item.outlet.mallWindow && <Tag kind="mall-window" />}
              </header>
              <p>
                {item.brand} · {item.weightKg} kg · {item.volumeM3} m³ · {item.outlet.window.open}–
                {item.outlet.window.close}
              </p>
              <Button
                variant={item.id === selected ? 'primary' : 'secondary'}
                aria-pressed={item.id === selected}
                onClick={() => {
                  if (dragged.current) return;
                  setSelected(item.id);
                }}
              >
                {item.id === selected ? 'Selected' : 'Select'}
              </Button>
              <label>
                Keyboard placement
                <select
                  value=""
                  aria-label={`Assign ${item.outletId}`}
                  onFocus={() => setSelected(item.id)}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === 'queue') tryAssign(item, null);
                    else if (value) {
                      const [vehicleId, trip] = value.split(':');
                      if (vehicleId && (trip === '1' || trip === '2')) {
                        tryAssign(item, { vehicleId, tripNo: trip === '1' ? 1 : 2 });
                      }
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
                onDrop={(event) =>
                  readDrop(event, { vehicleId: slot.vehicleId, tripNo: slot.tripNo })
                }
              >
                <header>
                  <Link to={`/dispatcher/vehicles/${slot.vehicleId}?date=${date}`}>
                    {slot.vehicleId}
                  </Link>
                  <span>Trip {slot.tripNo}</span>
                  {vehicle?.temp === 'reefer' && <Tag kind="reefer" />}
                  {vehicle?.type === 'van' && <Tag kind="van" />}
                  {vehicle?.temp === 'ambient' && <Tag kind="dry-box" />}
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
                <Button
                  variant="secondary"
                  disabled={!chosen || board.published || !board.online}
                  onClick={() => {
                    if (chosen)
                      tryAssign(chosen, { vehicleId: slot.vehicleId, tripNo: slot.tripNo });
                  }}
                >
                  Place selected here
                </Button>
                {orders.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="dispatch-chip"
                    draggable={!board.published}
                    onDragStart={(event) => {
                      dragged.current = true;
                      event.dataTransfer.setData('text/plain', item.id);
                    }}
                    onClick={() => {
                      if (dragged.current) return;
                      tryAssign(item, null);
                    }}
                  >
                    {item.outletId} · {item.temp === 'chilled' ? 'chilled' : 'dry'} ·{' '}
                    {item.weightKg} kg
                    {item.outlet.parkingConstraint === 'van_only' ? ' · van only' : ''}
                  </button>
                ))}
              </section>
            );
          })}
        </div>
      </div>
      {chosen && hint && (
        <div className="dispatch-recommendation">
          <RecommendationCard
            title={`Recommendation for ${chosen.outletId}`}
            description={
              hint.feasible
                ? `Priority score ${hint.score.total.toFixed(0)}. ${hint.checked} trips pass every hard constraint. Accepting still re-checks the plan before anything is saved.`
                : `Priority score ${hint.score.total.toFixed(0)}. No trip passes validation, so this score cannot place the order.`
            }
            reasons={[
              `Deferred yesterday ${hint.score.deferredYesterday}`,
              `Days since served ${hint.score.daysSinceLastServed}`,
              `Chilled ${hint.score.chilled}`,
              `Fresh before 08:00 ${hint.score.freshBefore8}`,
              `Tight window ${hint.score.tightWindow}`,
              'These weights rank the queue. They are not an exception to a hard constraint.',
            ]}
            {...(hint.feasible && !board.published && board.online
              ? {
                  onAccept: () => {
                    const target = hint.feasible;
                    if (target) {
                      tryAssign(chosen, { vehicleId: target.vehicleId, tripNo: target.tripNo });
                    }
                  },
                }
              : {})}
            onReject={() => setSelected(null)}
          />
        </div>
      )}
    </Page>
  );
}
