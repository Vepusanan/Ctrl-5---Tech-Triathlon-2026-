import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  can,
  type DeliveryStop,
  type StopEventInput,
  syncTripDeltaSchema,
  tripDetailSchema,
  type User,
} from '@waypoint/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Badge, Button, Card, ErrorState, LoadingState } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { SignOut } from '../auth/auth';
import { Notifications } from '../auth/notifications';
import { useOnline } from '../store/shared';
import {
  acceptedVersion,
  acceptVersion,
  driverOwner,
  loadStop,
  loadTrips,
  type Pending,
  queueEvent,
  readOutbox,
  syncOutbox,
} from './offline';
import './driver.css';

type Driver = Extract<User, { role: 'driver' }>;
export function DriverWorkspaceApp({ user }: { user: Driver }) {
  const owner = driverOwner(user);
  const online = useOnline();
  const client = useQueryClient();
  const active = useRef(false);
  const lifecycle = useRef(new AbortController());
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const outbox = useQuery({
    queryKey: ['driver', owner, 'outbox'],
    queryFn: () => readOutbox(owner),
    networkMode: 'always',
    refetchInterval: 2000,
  });
  const sync = useCallback(async () => {
    if (active.current || !navigator.onLine || lifecycle.current.signal.aborted) return;
    const signal = lifecycle.current.signal;
    active.current = true;
    setSyncing(true);
    setError('');
    try {
      await syncOutbox(owner, signal);
      if (!signal.aborted) await client.invalidateQueries({ queryKey: ['driver', owner] });
    } catch (cause) {
      if (!signal.aborted) setError(message(cause));
    } finally {
      active.current = false;
      setSyncing(false);
    }
  }, [client, owner]);
  useEffect(() => {
    lifecycle.current = new AbortController();
    const trigger = () => void sync();
    const timer = window.setInterval(trigger, 20_000);
    window.addEventListener('online', trigger);
    window.addEventListener('focus', trigger);
    trigger();
    return () => {
      lifecycle.current.abort();
      clearInterval(timer);
      window.removeEventListener('online', trigger);
      window.removeEventListener('focus', trigger);
    };
  }, [sync]);
  const pending = outbox.data?.filter((row) => row.status === 'queued').length ?? 0;
  return (
    <div className="driver-workspace">
      <header>
        <Link className="wp-brand" to="/driver">
          <span>W</span>Waypoint
        </Link>
        <strong>
          {user.name} · {user.vehicleId}
        </strong>
        <SignOut />
      </header>
      <nav aria-label="Driver navigation">
        <Link to="/driver/trips">My Trips</Link>
        <Link to="/driver/current">Current Trip</Link>
        <Link to="/driver/sync">Sync ({pending})</Link>
        <Link to="/driver/notifications">Notifications</Link>
      </nav>
      <main>
        <p role="status">
          <Badge tone={online ? 'success' : 'warning'}>
            {syncing ? 'Syncing' : online ? 'Online' : 'Offline'}
          </Badge>{' '}
          {pending ? `${pending} pending sync` : 'No pending events'}
        </p>
        {error && <p role="alert">{error}</p>}
        {outbox.error && (
          <ErrorState title="Offline storage unavailable" description={message(outbox.error)} />
        )}
        <Routes>
          <Route path="/" element={<Trips owner={owner} />} />
          <Route path="trips" element={<Trips owner={owner} />} />
          <Route path="current" element={<Trips owner={owner} current />} />
          <Route path="trips/:id" element={<Trip owner={owner} online={online} />} />
          <Route
            path="stops/:id"
            element={<Stop user={user} owner={owner} rows={outbox.data ?? []} sync={sync} />}
          />
          <Route
            path="sync"
            element={
              <>
                <h1>Sync</h1>
                <p>
                  Queued events stay on this device for your account until confirmed by the server.
                </p>
                <Button busy={syncing} disabled={!online} onClick={() => void sync()}>
                  Sync now
                </Button>
                {outbox.data?.map((row) => (
                  <Card key={row.key}>
                    <strong>
                      {row.event.type} · {row.status === 'queued' ? 'Pending sync' : row.status}
                    </strong>
                    <p>
                      {row.detail ||
                        new Date(row.event.clientTime).toLocaleString('en-GB', {
                          timeZone: 'Asia/Colombo',
                        })}
                    </p>
                  </Card>
                ))}
              </>
            }
          />
          <Route path="notifications" element={<Notifications user={user} />} />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <Link to="/driver">My Trips</Link>
              </>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
function useTrips(owner: string) {
  return useQuery({
    queryKey: ['driver', owner, 'trips'],
    queryFn: ({ signal }) => loadTrips(owner, signal),
    networkMode: 'always',
    retry: false,
    refetchInterval: 30_000,
  });
}
function Trips({ owner, current = false }: { owner: string; current?: boolean }) {
  const trips = useTrips(owner);
  if (trips.isPending) return <LoadingState label="Loading your trips…" />;
  if (!trips.data)
    return <ErrorState description={message(trips.error)} onRetry={() => void trips.refetch()} />;
  const activeTrip =
    trips.data.find((t) => t.status === 'departed') ?? trips.data.find((t) => t.status === 'ready');
  if (current && activeTrip) return <Navigate to={`/driver/trips/${activeTrip.id}`} replace />;
  return (
    <>
      <h1>{current ? 'Current Trip' : 'My Trips'}</h1>
      {!trips.data.length || (current && !activeTrip) ? (
        <Card>
          No assigned {current ? 'current ' : ''}trips. Published assignments will appear here.
        </Card>
      ) : (
        trips.data.map((trip) => (
          <Card key={trip.id}>
            <h2>
              {trip.district} · Trip {trip.tripNo}
            </h2>
            <p>
              {trip.run.serviceDate} · {trip.vehicleId} · {trip.status}
            </p>
            <p>{trip.stops.length} stops</p>
            <Link to={`/driver/trips/${trip.id}`}>Open trip</Link>
          </Card>
        ))
      )}
    </>
  );
}
function usePlanChange(
  owner: string,
  tripId: string | undefined,
  version: number | undefined,
  online: boolean,
) {
  return useQuery({
    queryKey: ['driver', owner, 'plan', tripId, version],
    queryFn: async () => {
      if (!tripId || version === undefined) throw new Error('Trip required');
      const since = await acceptedVersion(owner, tripId, version);
      return api(`/sync/trips/${tripId}?since=${since}`, syncTripDeltaSchema);
    },
    enabled: online && !!tripId && version !== undefined,
    retry: false,
    refetchInterval: 20_000,
  });
}
function Trip({ owner, online }: { owner: string; online: boolean }) {
  const { id } = useParams();
  const client = useQueryClient();
  const trips = useTrips(owner);
  const trip = trips.data?.find((t) => t.id === id);
  const delta = usePlanChange(owner, trip?.id, trip?.version, online);
  const depart = useMutation({
    mutationFn: () =>
      api(`/trips/${id}/depart`, tripDetailSchema, {
        method: 'POST',
        headers: { 'If-Match': String(trip?.version) },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['driver', owner] });
    },
  });
  if (trips.isPending) return <LoadingState label="Loading trip…" />;
  if (!trip)
    return (
      <ErrorState
        title="Trip not found"
        description={
          trips.error ? message(trips.error) : 'This trip is not assigned to your vehicle.'
        }
      />
    );
  const changed = delta.data?.changed ? delta.data : null;
  return (
    <>
      <h1>
        {trip.district} · Trip {trip.tripNo}
      </h1>
      <p>
        {trip.status} · {trip.run.serviceDate}
      </p>
      {changed && (
        <Card>
          <h2>Route changed</h2>
          <p>
            {changed.added.length} added · {changed.removed.length} removed ·{' '}
            {changed.reordered.length} reordered
          </p>
          <Button
            onClick={() => {
              void acceptVersion(owner, trip.id, changed.version).then(() =>
                client.invalidateQueries({ queryKey: ['driver', owner] }),
              );
            }}
          >
            Acknowledge updated route
          </Button>
        </Card>
      )}
      {depart.error && (
        <p role="alert">{message(depart.error)} Refresh the trip before trying again.</p>
      )}
      {trip.status === 'ready' && (
        <Button
          disabled={!online || !!changed}
          busy={depart.isPending}
          onClick={() => depart.mutate()}
        >
          Depart
        </Button>
      )}
      {trip.stops.map((stop) => (
        <Card key={stop.id}>
          <h2>
            Stop {stop.seq} · {stop.order.outletId}
          </h2>
          <p>
            {stop.order.units} units · {stop.status}
          </p>
          <p>
            Planned arrival{' '}
            {new Date(stop.plannedArrival).toLocaleTimeString('en-GB', {
              timeZone: 'Asia/Colombo',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          {!changed && trip.status === 'departed' && (
            <Link to={`/driver/stops/${stop.id}`}>Open stop</Link>
          )}
        </Card>
      ))}
    </>
  );
}
function Stop({
  user,
  owner,
  rows,
  sync,
}: {
  user: Driver;
  owner: string;
  rows: Pending[];
  sync: () => Promise<void>;
}) {
  const { id = '' } = useParams();
  const client = useQueryClient();
  const stop = useQuery({
    queryKey: ['driver', owner, 'stop', id],
    queryFn: ({ signal }) => loadStop(owner, id, signal),
    networkMode: 'always',
    retry: false,
  });
  const online = useOnline();
  const delta = usePlanChange(owner, stop.data?.tripId, stop.data?.tripVersion, online);
  const [reason, setReason] = useState('');
  const [recipient, setRecipient] = useState('');
  const [signature, setSignature] = useState<Blob | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const record = useMutation({
    networkMode: 'always',
    mutationFn: async (type: StopEventInput['type']) => {
      if (!stop.data || !can(user, 'delivery:update')) throw new Error('Delivery access required');
      const base = {
        clientEventId: crypto.randomUUID(),
        stopId: id,
        clientTime: new Date().toISOString(),
        tripVersion: stop.data.tripVersion,
      };
      let event: StopEventInput;
      if (type === 'failed') event = { ...base, type, payload: { reason: reason.trim() } };
      else if (type === 'delivered')
        event = { ...base, type, payload: { podId: stop.data.pod?.id ?? crypto.randomUUID() } };
      else event = { ...base, type, payload: {} };
      const entry: Omit<Pending, 'status' | 'detail'> = { owner, event };
      if (type === 'delivered' && !stop.data.pod) {
        if (!signature || !recipient.trim())
          throw new Error('Recipient name and signature are required');
        entry.proof = { recipientName: recipient.trim(), signature, ...(photo ? { photo } : {}) };
      }
      await queueEvent(entry);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['driver', owner, 'outbox'] });
      void sync();
    },
  });
  if (stop.isPending) return <LoadingState label="Loading stop…" />;
  if (!stop.data)
    return <ErrorState description={message(stop.error)} onRetry={() => void stop.refetch()} />;
  const data: DeliveryStop = stop.data;
  const ownRows = rows.filter((row) => row.event.stopId === id);
  const queued = ownRows.filter((row) => row.status === 'queued');
  const last = queued.at(-1);
  const status = last?.event.type ?? data.status;
  const blocked = ownRows.some((row) => row.status === 'conflict' || row.status === 'rejected');
  const enabled =
    data.tripStatus === 'departed' &&
    !blocked &&
    !record.isPending &&
    !delta.data?.changed &&
    (!online || delta.isSuccess);
  return (
    <>
      <Link to={`/driver/trips/${data.tripId}`}>Back to trip</Link>
      <h1>
        Stop {data.seq} · {data.order.outletId}
      </h1>
      <p>
        {data.order.units} units · {status}
        {queued.length ? ' · Pending sync' : ''}
      </p>
      {delta.data?.changed && (
        <p role="alert">
          Route changed. Return to the trip and acknowledge the updated route before continuing.
        </p>
      )}
      {delta.error && <p role="alert">{message(delta.error)}</p>}
      {blocked && (
        <p role="alert">A queued update needs review. Open Sync for the server explanation.</p>
      )}
      {record.error && <p role="alert">{message(record.error)}</p>}
      {status === 'pending' && (
        <Button disabled={!enabled} onClick={() => record.mutate('arrived')}>
          Arrived
        </Button>
      )}
      {status === 'arrived' && (
        <Card>
          <h2>Delivery outcome</h2>
          <form
            className="store-form"
            onSubmit={(e) => {
              e.preventDefault();
              record.mutate('delivered');
            }}
          >
            {!data.pod && (
              <>
                <label>
                  Recipient name
                  <input
                    required
                    maxLength={120}
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                </label>
                <Signature onChange={setSignature} />
                <label>
                  Photo (optional, up to 2 MB)
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              </>
            )}
            <Button
              type="submit"
              disabled={
                !enabled ||
                (!data.pod && (!signature || !recipient.trim())) ||
                (photo?.size ?? 0) > 2 * 1024 * 1024
              }
            >
              Delivered
            </Button>
          </form>
          <form
            className="store-form"
            onSubmit={(e) => {
              e.preventDefault();
              record.mutate('failed');
            }}
          >
            <label>
              Failure reason
              <textarea
                required
                maxLength={200}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button type="submit" variant="secondary" disabled={!enabled || !reason.trim()}>
              Failed
            </Button>
          </form>
        </Card>
      )}
      {data.failureReason && <p>{data.failureReason}</p>}
      {data.tripStatus !== 'departed' && status !== 'delivered' && status !== 'failed' && (
        <p>Depart the ready trip before recording stop events.</p>
      )}
    </>
  );
}
function Signature({ onChange }: { onChange: (blob: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  return (
    <div>
      <p>Recipient signature</p>
      <canvas
        ref={ref}
        width={560}
        height={180}
        aria-label="Recipient signature"
        style={{
          width: '100%',
          maxWidth: 560,
          height: 180,
          touchAction: 'none',
          border: '1px solid var(--border, #aaa)',
        }}
        onPointerDown={(e) => {
          const canvas = e.currentTarget;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          drawing.current = true;
          canvas.setPointerCapture(e.pointerId);
          const rect = canvas.getBoundingClientRect();
          ctx.beginPath();
          ctx.moveTo(((e.clientX - rect.left) * canvas.width) / rect.width, e.clientY - rect.top);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const canvas = e.currentTarget;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;
          const rect = canvas.getBoundingClientRect();
          ctx.lineWidth = 2;
          ctx.lineTo(((e.clientX - rect.left) * canvas.width) / rect.width, e.clientY - rect.top);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          if (!drawing.current) return;
          drawing.current = false;
          e.currentTarget.toBlob(onChange, 'image/png');
        }}
      />
      <Button
        variant="tertiary"
        onClick={() => {
          const canvas = ref.current;
          canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
          onChange(null);
        }}
      >
        Clear signature
      </Button>
    </div>
  );
}
