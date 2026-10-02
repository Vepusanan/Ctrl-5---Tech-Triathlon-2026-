import { useMutation, useQuery } from '@tanstack/react-query';
import { deliveryStopSchema } from '@waypoint/shared';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, LoadingState } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { time } from '../store/shared';
import { useDriverRefresh, useSendStopEvent } from './actions';
import { FAILURE_REASONS, reasonIcon } from './labels';
import { DeliveryForm, ensurePod } from './pod';
import { DriverHeader, DriverIcon, Strip, ThumbZone } from './shell';
import { useDriverOutlets } from './trip';
import { useDriver } from './workspace';

type Outcome = 'delivered' | 'failed';

const minutes = (clock: string) => {
  const [hours = 0, mins = 0] = clock.split(':').map(Number);
  return hours * 60 + mins;
};

// DR04 + DR04a. Recorded only from an arrived stop. Delivered needs a POD, uploaded first and then
// referenced by the delivered event; failed needs a reason from the list. Partial is not an
// outcome the API records, so the control offers the two it does.
export function StopOutcome() {
  const { stopId = '' } = useParams();
  const { user, online, eventFor, stamp } = useDriver();
  const navigate = useNavigate();
  const refresh = useDriverRefresh();
  const send = useSendStopEvent();
  const [outcome, setOutcome] = useState<Outcome>('delivered');
  const [reason, setReason] = useState('');
  const stop = useQuery({
    queryKey: queryKeys.driver.stop(user.id, stopId),
    queryFn: () => api(`/stops/${stopId}`, deliveryStopSchema),
  });
  const outlets = useDriverOutlets(user.id);
  // A failed attempt keeps its event, so pressing the same button again replays it unchanged.
  const action = useMutation({
    mutationFn: (run: () => Promise<void>) => run(),
    onSuccess: () => navigate(`/driver/stops/${stopId}`, { replace: true }),
    onSettled: refresh,
  });
  const status = stop.data?.status;
  const { reset } = action;
  useEffect(() => {
    if (status !== undefined) reset();
  }, [status, reset]);

  if (stop.isPending) return <LoadingState label="Loading the stop…" />;
  if (!stop.data) {
    return <ErrorState description={message(stop.error)} onRetry={() => void stop.refetch()} />;
  }
  const detail = stop.data;
  // Outcomes follow an arrival; any other status belongs on the stop screen.
  if (detail.status !== 'arrived') return <Navigate to={`/driver/stops/${detail.id}`} replace />;
  const outlet = outlets.data?.items.find((item) => item.id === detail.order.outletId);
  const busy = action.isPending;
  const base = { stopId: detail.id, tripVersion: detail.tripVersion };

  // POD first, then the event that references it. A POD already on the stop is reused, so a
  // delivered event that failed after the upload never asks for a second signature.
  const deliver = (build: () => Promise<FormData>) =>
    action.mutate(async () => {
      const podId = detail.pod?.id ?? (await ensurePod(detail.id, build));
      await send(eventFor({ ...base, type: 'delivered', payload: { podId } }));
    });
  const completeWithSavedPod = (podId: string) =>
    action.mutate(() => send(eventFor({ ...base, type: 'delivered', payload: { podId } })));
  const fail = () =>
    action.mutate(() => send(eventFor({ ...base, type: 'failed', payload: { reason } })));

  const now = time(stamp());
  const close = detail.windowClose.slice(0, 5);
  const inside = minutes(now) <= minutes(close);

  return (
    <>
      <DriverHeader
        back={`/driver/stops/${detail.id}`}
        backLabel="Stop"
        eyebrow={`Stop ${detail.seq} · ${detail.order.units} ${detail.order.units === 1 ? 'unit' : 'units'}`}
        title={`${outlet?.district ?? detail.order.outletId} · outcome`}
      />

      <fieldset className="driver-segments">
        <legend className="wp-sr-only">Outcome</legend>
        {(['delivered', 'failed'] as const).map((option) => (
          <label
            key={option}
            className={`driver-segment${outcome === option ? ' driver-segment--active' : ''}`}
          >
            <input
              className="wp-sr-only"
              type="radio"
              name="stop-outcome"
              value={option}
              checked={outcome === option}
              disabled={busy}
              onChange={() => setOutcome(option)}
            />
            {option === 'delivered' ? 'Delivered' : 'Failed'}
          </label>
        ))}
      </fieldset>

      {action.error && (
        <div className="driver-banner driver-banner--danger" role="alert">
          <strong>Not saved</strong>
          <p>{message(action.error)}</p>
          <p className="wp-muted">
            Press the same button again to retry. It will not be recorded twice.
          </p>
        </div>
      )}

      {outcome === 'delivered' && detail.pod && (
        <>
          <Strip tone="info" icon={<DriverIcon name="info-info" size={16} />}>
            Proof of delivery already saved for {detail.pod.recipientName}. Complete the delivery to
            finish.
          </Strip>
          <ThumbZone>
            <Button
              className="driver-cta"
              busy={busy}
              disabled={!online}
              onClick={() => detail.pod && completeWithSavedPod(detail.pod.id)}
            >
              Complete delivery
            </Button>
          </ThumbZone>
        </>
      )}
      {/* Once a POD is saved the form is not shown again, so the driver never re-signs. */}
      {outcome === 'delivered' && !detail.pod && (
        <DeliveryForm stop={detail} busy={busy || !online} onSubmit={deliver} />
      )}

      {outcome === 'failed' && (
        <form
          className="driver-form"
          aria-label="Failed delivery"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason) fail();
          }}
        >
          <fieldset className="driver-reasons">
            <legend>What happened?</legend>
            {FAILURE_REASONS.map((option) => (
              <label
                key={option}
                className={`driver-reason${reason === option ? ' driver-reason--active' : ''}`}
              >
                <input
                  className="wp-sr-only"
                  type="radio"
                  name="failure-reason"
                  value={option}
                  checked={reason === option}
                  disabled={busy}
                  onChange={() => setReason(option)}
                />
                <DriverIcon name={reasonIcon[option]} size={18} />
                {option}
              </label>
            ))}
          </fieldset>
          <section className="driver-tile driver-tile--time" aria-label="Delivery window">
            <DriverIcon name="clock-large" size={20} />
            <strong>{now}</strong>
            <span>inside window?</span>
            <span className={inside ? 'driver-yes' : 'driver-no'}>
              {inside ? `Yes · closes ${close}` : `No · closed ${close}`}
            </span>
          </section>
          <Strip tone="info" icon={<DriverIcon name="info-info" size={16} />}>
            No proof of delivery for a failed stop. Goods return to the depot.
          </Strip>
          <ThumbZone>
            <Button type="submit" className="driver-cta" busy={busy} disabled={!reason || !online}>
              Record failed delivery
            </Button>
          </ThumbZone>
        </form>
      )}
    </>
  );
}
