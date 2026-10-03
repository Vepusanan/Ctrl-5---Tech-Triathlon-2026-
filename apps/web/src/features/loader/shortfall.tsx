import { type LoadingIssueType, loadingIssueTypeSchema } from '@waypoint/shared';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Tag } from '../../components/waypoint';
import { orderName, time } from '../store/shared';
import { firstArrival, issueTypeIcon, issueTypeLabel, tripName } from './labels';
import type { LoadFlow } from './load';
import { ActionBar, LoaderIcon, PageHead, SharedIcon, Stepper } from './shell';

// L04. Records missing, damaged or short goods before the vehicle leaves. The dispatcher is told
// at once, and Ready waits until they acknowledge it.
export function ShortfallForm({ flow }: { flow: LoadFlow }) {
  const { state, detail } = flow;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const stops = flow.reversed;
  const preset = stops.find((stop) => stop.order.id === params.get('order'));
  const [orderId, setOrderId] = useState(preset?.order.id ?? stops[0]?.order.id ?? '');
  const [type, setType] = useState<LoadingIssueType>('missing');
  const [qty, setQty] = useState(Math.max(1, Number(params.get('qty')) || 1));
  const [note, setNote] = useState('');
  const stop = stops.find((item) => item.order.id === orderId);
  const order = stop?.order;
  const maxQty = order?.units ?? 1;
  const valid = order !== undefined && Number.isInteger(qty) && qty >= 1 && qty <= maxQty;
  const first = firstArrival(state.stops);

  return (
    <form
      className="loader-form"
      aria-label="Report shortfall"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        const trimmed = note.trim();
        flow.report({ orderId, type, qty, ...(trimmed ? { note: trimmed } : {}) }, () =>
          navigate(flow.base, { replace: true }),
        );
      }}
    >
      <PageHead
        back={flow.base}
        backLabel="Loading plan"
        title="Report shortfall"
        detail={`${tripName(detail)}${stop ? ` · ${stop.order.outletId}` : ''}`}
      />
      <div className="loader-split">
        <section className="loader-card loader-shortfall" aria-label="Shortfall">
          <div className="loader-order-card">
            <span className="loader-well loader-well--surface">
              <LoaderIcon name="box" size={12} />
            </span>
            <div className="loader-order-card-text">
              <strong>{order ? orderName(order.id) : 'Choose an order'}</strong>
              {stop && (
                <span className="loader-tags">
                  {stop.chilled ? <Tag kind="chilled" /> : <Tag kind="ambient" />}
                  <span className="loader-faint">
                    Stop {stop.seq} · {stop.order.outletId} · {stop.order.units} units
                  </span>
                </span>
              )}
            </div>
            <label className="loader-change">
              <span className="wp-sr-only">Order</span>
              <select
                value={orderId}
                disabled={flow.busy}
                onChange={(event) => {
                  setOrderId(event.target.value);
                  setQty(1);
                }}
              >
                {stops.map((item) => (
                  <option key={item.order.id} value={item.order.id}>
                    Stop {item.seq} · {item.order.outletId} · {orderName(item.order.id)}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">Change</span>
            </label>
          </div>

          <div className="loader-field">
            <span className="loader-field-label" id="shortfall-qty">
              How many units are affected? (max {maxQty})
            </span>
            <Stepper
              value={qty}
              min={1}
              max={maxQty}
              label="Units affected"
              showMax={false}
              large
              disabled={flow.busy}
              onChange={setQty}
            />
          </div>

          <fieldset className="loader-choice">
            <legend>Why?</legend>
            {loadingIssueTypeSchema.options.map((option) => (
              <label
                key={option}
                className={`loader-chip${type === option ? ' loader-chip--active' : ''}`}
              >
                <input
                  className="wp-sr-only"
                  type="radio"
                  name="shortfall-type"
                  value={option}
                  checked={type === option}
                  disabled={flow.busy}
                  onChange={() => setType(option)}
                />
                <SharedIcon src={issueTypeIcon[option].src} size={issueTypeIcon[option].size} />
                {issueTypeLabel[option]}
              </label>
            ))}
          </fieldset>

          <label className="loader-field">
            <span className="loader-field-label">Note (optional)</span>
            <textarea
              rows={2}
              value={note}
              disabled={flow.busy}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </section>

        <section className="loader-dark loader-consequences" aria-label="When you send">
          <strong>When you send</strong>
          <ul>
            <li>
              <span className="loader-dark-icon">
                <SharedIcon src="driver/tab-notices" size={24} />
              </span>
              The dispatcher is alerted now
            </li>
            <li>
              <span className="loader-dark-icon">
                <SharedIcon src="54-30-imgIconLock" size={14} />
              </span>
              Ready waits for their answer
            </li>
            <li>
              <span className="loader-dark-icon">
                <SharedIcon src="54-30-imgIconRefresh" size={12} />
              </span>
              Their answer and any new plan appear here
            </li>
          </ul>
        </section>
      </div>
      <ActionBar
        status={
          <p className="loader-status-line">
            <SharedIcon src="2037-861-imgIconClock1" size={16} />
            {flow.busy ? 'Sending to dispatcher…' : `First stop at ${time(first)}`}
          </p>
        }
      >
        <Button
          variant="secondary"
          className="loader-cta"
          disabled={flow.busy}
          onClick={() => navigate(flow.base)}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="loader-cta"
          busy={flow.busy}
          disabled={!valid || !flow.online}
        >
          {flow.busy ? 'Sending…' : flow.failed ? 'Retry' : 'Send to dispatcher'}
        </Button>
      </ActionBar>
    </form>
  );
}
