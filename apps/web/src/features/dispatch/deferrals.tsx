import type { ReasonCode } from '@waypoint/shared';
import { useState } from 'react';
import { Button, Card, StatusBadge, Tag } from '../../components/waypoint';
import { useBoard } from './board';
import { Page, useDispatch } from './workspace';

const reasons: ReasonCode[] = [
  'REEFER_REQUIRED',
  'VAN_REQUIRED',
  'WEIGHT_CAP',
  'VOLUME_CAP',
  'FUEL_QUOTA',
  'WINDOW_MISSED',
  'TRIP_LIMIT',
  'VEHICLE_UNAVAILABLE',
  'FRESH_TIME_BUDGET',
  'DAY_TIME_BUDGET',
  'MIXED_BRAND_DISTRICT',
  'WRONG_DEPOT',
];

export function DeferralCenter() {
  const { date } = useDispatch();
  const board = useBoard();
  const placed = new Set(board.slots.flatMap((slot) => slot.orderIds));
  const open = board.items.filter((item) => !placed.has(item.id));
  const [reason, setReason] = useState<ReasonCode>('WEIGHT_CAP');
  const [kind, setKind] = useState<'unavoidable' | 'prioritized'>('unavoidable');
  const [note, setNote] = useState('');
  const [orderId, setOrderId] = useState('');
  return (
    <Page
      title="Deferral center"
      description={`${date}. A deferral needs a reason. Previous skips stay visible so the same outlet is not dropped by accident.`}
    >
      <Card>
        <h2>Defer an unallocated order</h2>
        <form
          className="store-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!orderId) return;
            board.defer.mutate({
              orderId,
              reasonCode: reason,
              type: kind,
              ...(note.trim() ? { note: note.trim() } : {}),
            });
          }}
        >
          <label>
            Order
            <select value={orderId} onChange={(event) => setOrderId(event.target.value)} required>
              <option value="">Choose</option>
              {open.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.outletId} · {item.brand} · {item.temp}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as ReasonCode)}
            >
              {reasons.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value === 'prioritized' ? 'prioritized' : 'unavoidable')
              }
            >
              <option value="unavoidable">Unavoidable</option>
              <option value="prioritized">Planning choice</option>
            </select>
          </label>
          <label>
            Note
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {board.error && <p role="alert">{board.error}</p>}
          <Button
            type="submit"
            busy={board.defer.isPending}
            disabled={board.published || !board.online}
          >
            Record deferral
          </Button>
        </form>
      </Card>
      <Card>
        <h2>History on this queue</h2>
        <ul className="dispatch-list">
          {board.items
            .filter((item) => item.previousDeferral || item.deferredYesterday)
            .map((item) => (
              <li key={item.id}>
                <StatusBadge status="deferred" />
                <div>
                  <strong>{item.outletId}</strong>
                  <p>
                    {item.deferredYesterday ? 'Skipped yesterday. ' : ''}
                    {item.previousDeferral
                      ? `${item.previousDeferral.reasonCode} · ${item.previousDeferral.type} · ${item.previousDeferral.serviceDate}`
                      : 'No recorded reason yet.'}
                  </p>
                  {item.daysSinceLastServed > 0 && (
                    <Tag kind="repeat-deferral">
                      {item.daysSinceLastServed} days since last served
                    </Tag>
                  )}
                </div>
              </li>
            ))}
        </ul>
      </Card>
    </Page>
  );
}
