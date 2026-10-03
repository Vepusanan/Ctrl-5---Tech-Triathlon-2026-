import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type LoadingState as Load,
  type LoadingIssueType,
  type LoadingStop,
  loadingStateSchema,
  tripListResponseSchema,
  type User,
} from '@waypoint/shared';
import { useEffect, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { SignOut } from '../auth/auth';
import { Notifications } from '../auth/notifications';
import { useOnline } from '../store/shared';
import './loader.css';

type Loader = Extract<User, { role: 'loader' }>;
const icon = (name: string, screen = '4759') => (
  <img alt="" src={`/loader/2045-${screen}-img${name}.svg`} />
);
const status = (value: Load['status']) =>
  value === 'not_started'
    ? 'not-started'
    : value === 'in_progress'
      ? 'loading'
      : value === 'exception'
        ? 'loading-exception'
        : value;
const reverseStops = (stops: LoadingStop[]) => [...stops].sort((a, b) => b.seq - a.seq);
function planDiff(previous: LoadingStop[], current: LoadingStop[]) {
  const changes: string[] = [];
  for (const old of previous) {
    const next = current.find((s) => s.order.id === old.order.id);
    const label = old.order.outletId;
    if (!next) {
      changes.push(`${label}: order removed (${old.order.units} units)`);
      continue;
    }
    if (old.seq !== next.seq) changes.push(`${label}: stop ${old.seq} → ${next.seq}`);
    if (old.order.units !== next.order.units)
      changes.push(`${label}: ${old.order.units} → ${next.order.units} units`);
    if (old.plannedArrival !== next.plannedArrival)
      changes.push(`${label}: arrival ${time(old.plannedArrival)} → ${time(next.plannedArrival)}`);
    if (old.chilled !== next.chilled)
      changes.push(
        `${label}: ${old.chilled ? 'Chilled' : 'Ambient'} → ${next.chilled ? 'Chilled' : 'Ambient'}`,
      );
    if (old.access !== next.access) changes.push(`${label}: access ${old.access} → ${next.access}`);
  }
  for (const next of current)
    if (!previous.some((s) => s.order.id === next.order.id))
      changes.push(`${next.order.outletId}: added at stop ${next.seq}, ${next.order.units} units`);
  return changes;
}
const time = (value: string) =>
  new Date(value).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Colombo',
    hour: '2-digit',
    minute: '2-digit',
  });

export function LoaderWorkspaceApp({ user }: { user: Loader }) {
  const online = useOnline();
  return (
    <div className="loader-workspace">
      <header className="loader-header">
        <Link to="/loader" className="wp-brand" aria-label="Assigned loads">
          <span>W</span>
        </Link>
        <div>
          <strong>{user.depotId} · Loader workspace</strong>
          <small>Own depot · load last stop first</small>
        </div>
        <div className="loader-spacer" />
        <StatusBadge status={online ? 'online' : 'offline'} />
        <strong>{user.name}</strong>
        <SignOut />
      </header>
      <nav aria-label="Loader navigation">
        <Link to="/loader">Assigned loads</Link>
        <Link to="/loader/notifications">Notifications</Link>
      </nav>
      {!online && (
        <p className="loader-notice" role="alert">
          Offline. Reconnect and refresh before updating a load.
        </p>
      )}
      <Routes>
        <Route path="notifications" element={<Notifications user={user} />} />
        <Route path="/" element={<Assigned user={user} />} />
        <Route path="trips/:id/*" element={<TripWorkspace user={user} online={online} />} />
        <Route
          path="*"
          element={
            <main>
              <h1>Page not found</h1>
              <Link to="/loader">Assigned loads</Link>
            </main>
          }
        />
      </Routes>
    </div>
  );
}
function Assigned({ user }: { user: Loader }) {
  const trips = useQuery({
    queryKey: ['loader', user.id, 'trips'],
    queryFn: () => api('/trips', tripListResponseSchema),
    refetchInterval: 10000,
  });
  const [selected, setSelected] = useState('');
  const items =
    trips.data?.items.filter(
      (t) =>
        t.run.depotId === user.depotId &&
        t.run.status === 'published' &&
        ['published', 'loading', 'ready'].includes(t.status),
    ) ?? [];
  const active = items.find((t) => t.id === selected) ?? items[0];
  return (
    <main>
      <div className="loader-title">
        <div>
          <h1>Assigned loads</h1>
          <p>
            {user.depotId} · {items.length} loads · load last stop first
          </p>
        </div>
        <Button variant="secondary" onClick={() => void trips.refetch()}>
          Refresh
        </Button>
      </div>
      {trips.isPending ? (
        <LoadingState label="Loading assigned trips…" />
      ) : trips.error ? (
        <ErrorState description={message(trips.error)} onRetry={() => void trips.refetch()} />
      ) : !active ? (
        <Card>
          <h2>No assigned loads</h2>
          <p>Published trips for your depot will appear here.</p>
        </Card>
      ) : (
        <div className="loader-columns">
          <Card className="loader-next">
            <div className="loader-title">
              <h2>
                {icon('IconTruck1')}
                {active.vehicleId} · Trip {active.tripNo}
              </h2>
              <StatusBadge status={status(active.loadingStatus)} />
            </div>
            <div className="loader-badges">
              <Tag kind={active.vehicle.temp === 'reefer' ? 'reefer' : 'ambient'} />
              <Badge>{active.vehicle.type}</Badge>
              <Badge>
                {icon('IconFile')}Plan v{active.run.planVersion} · trip v{active.version}
              </Badge>
            </div>
            <div className="loader-metrics">
              <div>
                <strong>{active.stops.reduce((sum, s) => sum + s.order.units, 0)}</strong>
                <small>units</small>
              </div>
              <div>
                <strong>{active.stops.length}</strong>
                <small>stops</small>
              </div>
              <div>
                <strong>{active.run.serviceDate}</strong>
                <small>service date</small>
              </div>
            </div>
            <p>Load order</p>
            <div className="loader-sequence">
              {[...active.stops]
                .sort((a, b) => b.seq - a.seq)
                .map((s, i) => (
                  <div key={s.id}>
                    <span className="loader-number">{s.seq}</span>
                    <strong>{s.order.outletId}</strong>
                    <p>
                      {s.order.units} units {i === 0 ? '· load first' : ''}
                    </p>
                  </div>
                ))}
            </div>
            <div className="loader-actions">
              <Button asChild>
                <Link to={`/loader/trips/${active.id}`}>
                  {active.loadingStatus === 'not_started'
                    ? 'View plan & start loading'
                    : 'Open loading plan'}
                </Link>
              </Button>
            </div>
          </Card>
          <aside>
            <Card className="loader-dark">
              <h2>Ready for the road</h2>
              <strong className="loader-hero">
                {items.filter((t) => t.loadingStatus === 'ready').length}
                <small> / {items.length}</small>
              </strong>
              <p>loads ready at {user.depotId}</p>
            </Card>
            {items.map((t) => (
              <button
                type="button"
                className="loader-load-card"
                key={t.id}
                onClick={() => setSelected(t.id)}
                aria-pressed={active.id === t.id}
              >
                <strong>
                  {icon('IconTruck2')}
                  {t.vehicleId} · Trip {t.tripNo}
                </strong>
                <p>
                  {t.run.serviceDate} · {t.stops.length} stops
                </p>
                <StatusBadge status={status(t.loadingStatus)} />
              </button>
            ))}
          </aside>
        </div>
      )}
    </main>
  );
}
function TripWorkspace({ user, online }: { user: Loader; online: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const key = ['loader', user.id, 'loading', id];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api(`/trips/${id}/loading`, loadingStateSchema),
    refetchInterval: 5000,
    retry: false,
  });
  const [view, setView] = useState<'plan' | 'verify' | 'exception' | 'changed'>('plan');
  const [ackVersion, setAckVersion] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const mutation = useMutation({
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
    },
    mutationFn: ({ action, body }: { action: string; body?: unknown }) =>
      api(`/trips/${id}/loading/${action}`, loadingStateSchema, {
        method: 'POST',
        headers: { 'If-Match': String(query.data?.tripVersion) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: (data) => {
      client.setQueryData(key, data);
      void client.invalidateQueries({ queryKey: ['loader', user.id, 'trips'] });
      setNotice(data.status === 'ready' ? 'Load marked Ready.' : 'Saved.');
    },
    onError: () => {
      void query.refetch();
    },
  });
  useEffect(() => {
    if (!id) return;
    setView('plan');
    setAckVersion(null);
    setNotice('');
  }, [id]);
  if (query.isPending) return <LoadingState label="Loading plan…" />;
  if (!query.data || query.data.vehicle.depotId !== user.depotId)
    return (
      <ErrorState
        description={
          query.error ? message(query.error) : 'This load is not available in your depot.'
        }
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data;
  const changed = data.planStale && ackVersion !== data.tripVersion;
  const writable =
    online &&
    !query.error &&
    !mutation.isPending &&
    data.status !== 'ready' &&
    data.status !== 'departed';
  return (
    <main>
      <div className="loader-title">
        <div>
          <Button variant="tertiary" onClick={() => navigate('/loader')}>
            ← Assigned loads
          </Button>
          <h1>
            {changed || view === 'changed'
              ? 'Plan changed'
              : view === 'verify'
                ? 'Verify before Ready'
                : view === 'exception'
                  ? 'Report exception / shortfall'
                  : `${data.vehicle.id} · Loading plan`}
          </h1>
        </div>
        <div className="loader-badges">
          <Badge>
            {icon('IconFile')}Plan v{data.planVersion} · trip v{data.tripVersion}
          </Badge>
          <StatusBadge status={status(data.status)} />
          <Button variant="secondary" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        </div>
      </div>
      {query.error && (
        <p role="alert" className="loader-notice">
          {message(query.error)} Updates are disabled until refresh succeeds.
        </p>
      )}
      {mutation.error && (
        <p role="alert" className="loader-notice">
          {message(mutation.error)}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {changed ? (
        <Changed
          data={data}
          onAcknowledge={() => {
            setAckVersion(data.tripVersion);
            setView('verify');
            setNotice('Plan reviewed. Recheck every stop and verify to save your acknowledgement.');
          }}
        />
      ) : (
        <>
          <nav className="loader-tabs" aria-label="Loading steps">
            {(['plan', 'verify', 'exception'] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? 'primary' : 'secondary'}
                onClick={() => setView(v)}
              >
                {v === 'plan' ? 'Stop sequence' : v === 'verify' ? 'Verification' : 'Exceptions'}
              </Button>
            ))}
          </nav>
          {view === 'exception' && (
            <ExceptionForm
              key={`${id}-${data.tripVersion}`}
              data={data}
              disabled={!writable || data.status === 'not_started'}
              onSend={(body) =>
                mutation.mutate(
                  { action: 'issues', body },
                  {
                    onSuccess: () => {
                      setNotice('Exception sent. Dispatcher notified.');
                      setView('exception');
                    },
                  },
                )
              }
            />
          )}
          <div hidden={view === 'exception'}>
            <Verification
              key={`${id}-${data.tripVersion}`}
              data={data}
              view={view}
              disabled={!writable}
              onStart={() => mutation.mutate({ action: 'start' })}
              onVerify={() =>
                mutation.mutate(
                  { action: 'verify' },
                  {
                    onSuccess: () => {
                      setAckVersion(null);
                      setNotice('Checklist verified and current plan acknowledged.');
                    },
                  },
                )
              }
              onReady={() => mutation.mutate({ action: 'ready' })}
              onException={() => setView('exception')}
              onContinue={() => setView('verify')}
            />
          </div>
        </>
      )}
      <IssueList data={data} />
    </main>
  );
}
function StopBadges({ stop }: { stop: LoadingStop }) {
  return (
    <div className="loader-badges">
      <Tag kind={stop.chilled ? 'chilled' : 'ambient'} />
      <Badge>
        {stop.access === 'van_only'
          ? 'Van only'
          : stop.access === 'mall_dock'
            ? 'Mall dock'
            : 'Normal access'}
      </Badge>
      <Badge>{stop.order.status}</Badge>
    </div>
  );
}
function Verification({
  data,
  view,
  disabled,
  onStart,
  onVerify,
  onReady,
  onException,
  onContinue,
}: {
  data: Load;
  view: string;
  disabled: boolean;
  onStart: () => void;
  onVerify: () => void;
  onReady: () => void;
  onException: () => void;
  onContinue: () => void;
}) {
  const stops = reverseStops(data.stops);
  const [selected, setSelected] = useState(stops[0]?.id);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const stop = stops.find((s) => s.id === selected) ?? stops[0];
  const verified = !!data.verifiedAt && !data.planStale;
  const count = (s: LoadingStop) => counts[s.id] ?? (verified ? s.order.units : 0);
  const total = stops.reduce((n, s) => n + s.order.units, 0);
  const counted = stops.reduce((n, s) => n + count(s), 0);
  const complete =
    stops.length > 0 &&
    stops.every((s) => count(s) === s.order.units) &&
    ['sequence', 'condition', 'temperature'].every((k) => checks[k]);
  const open = data.issues.some((i) => !i.acknowledgedAt);
  const active = data.status === 'in_progress' || data.status === 'exception';
  return (
    <>
      <div className={`loader-columns ${view === 'plan' ? 'loader-plan' : ''}`}>
        <aside>
          {view === 'verify' && (
            <Card className="loader-dark">
              <div
                className="loader-ring"
                style={{
                  background: `conic-gradient(var(--color-data-pos) ${total ? (counted / total) * 100 : 0}%, var(--color-data-track-invert) 0)`,
                }}
              >
                <div>
                  <strong>{counted}</strong>
                  <small>of {total} units match</small>
                </div>
              </div>
              <p>Count every order before Ready</p>
            </Card>
          )}
          {stops.map((s) => (
            <button
              type="button"
              key={s.id}
              className="loader-stop"
              aria-pressed={s.id === stop?.id}
              onClick={() => setSelected(s.id)}
            >
              <span className="loader-number">{s.seq}</span>
              <strong>{s.order.outletId}</strong>
              <small>
                {count(s)} / {s.order.units} units ·{' '}
                {count(s) === s.order.units ? 'Matches plan' : 'To verify'}
              </small>
            </button>
          ))}
          <p className="loader-hint">Last delivery goes in first. Stop 1 stays nearest the door.</p>
        </aside>
        <Card className="loader-detail">
          {stop ? (
            <>
              <div className="loader-title">
                <h2>
                  {stop.order.outletId} · stop {stop.seq}
                </h2>
                <StopBadges stop={stop} />
              </div>
              <p>Order {stop.order.id}</p>
              <p>
                Planned arrival {time(stop.plannedArrival)} · {stop.order.weightKg} kg ·{' '}
                {stop.order.volumeM3} m³
              </p>
              <div className="loader-count-row">
                <div>
                  <h3>
                    {stop.order.brand} · {stop.order.units} units expected
                  </h3>
                  <p>Count the physical load for this order.</p>
                </div>
                <label>
                  Loaded quantity
                  <input
                    aria-label="Loaded quantity"
                    type="number"
                    min="0"
                    max={stop.order.units}
                    step="1"
                    value={count(stop)}
                    disabled={disabled || !active || verified}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setCounts({
                        ...counts,
                        [stop.id]: Math.max(0, Math.min(stop.order.units, Math.trunc(value))),
                      });
                    }}
                  />
                </label>
              </div>
              {count(stop) !== stop.order.units && (
                <p className="loader-short">
                  {stop.order.units - count(stop)} units still to verify. Report any missing,
                  damaged or short load.
                </p>
              )}
              <progress
                max={stop.order.units}
                value={count(stop)}
                aria-label="Order verification progress"
              />
              {view === 'verify' && (
                <fieldset disabled={disabled || !active || verified}>
                  <legend>Verification checklist</legend>
                  {(
                    [
                      ['sequence', 'Loaded in reverse-stop sequence'],
                      ['condition', 'Quantities and packaging checked'],
                      ['temperature', 'Chilled handling and access constraints checked'],
                    ] as const
                  ).map(([k, label]) => (
                    <label className="loader-check" key={k}>
                      <input
                        type="checkbox"
                        checked={verified || !!checks[k]}
                        onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          ) : (
            <p>No stops available. Ready is disabled.</p>
          )}
        </Card>
      </div>
      <footer className="loader-footer">
        <div>
          <strong>
            {counted} of {total} units
          </strong>
          <p>
            {data.planStale
              ? 'Acknowledge the new plan by completing verification.'
              : open
                ? 'Ready blocked: waiting for Dispatcher acknowledgement.'
                : verified
                  ? 'Verification saved for this plan.'
                  : 'Complete the checklist before Ready.'}
          </p>
        </div>
        {data.status === 'not_started' ? (
          <Button disabled={disabled || !stops.length} onClick={onStart}>
            Start loading
          </Button>
        ) : (
          <>
            <Button variant="secondary" disabled={disabled || !active} onClick={onException}>
              Report exception
            </Button>
            {view === 'plan' ? (
              <Button disabled={!active} onClick={onContinue}>
                Verify loading
              </Button>
            ) : !verified ? (
              <Button disabled={disabled || !active || !complete} onClick={onVerify}>
                {data.planStale ? 'Acknowledge & verify plan' : 'Confirm verification'}
              </Button>
            ) : (
              <Button
                disabled={disabled || !active || open || data.planStale || !stops.length}
                onClick={onReady}
              >
                Mark load Ready
              </Button>
            )}
          </>
        )}
      </footer>
    </>
  );
}
function ExceptionForm({
  data,
  disabled,
  onSend,
}: {
  data: Load;
  disabled: boolean;
  onSend: (body: unknown) => void;
}) {
  const [orderId, setOrderId] = useState(data.stops[0]?.order.id ?? '');
  const [type, setType] = useState<LoadingIssueType>('missing');
  const [qty, setQty] = useState('1');
  const [note, setNote] = useState('');
  const stop = data.stops.find((s) => s.order.id === orderId);
  const valid =
    !!stop &&
    Number.isInteger(Number(qty)) &&
    Number(qty) > 0 &&
    Number(qty) <= stop.order.units &&
    !!note.trim();
  return (
    <div className="loader-columns">
      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !disabled) onSend({ orderId, type, qty: Number(qty), note: note.trim() });
          }}
        >
          <label>
            Order / stop
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              {reverseStops(data.stops).map((s) => (
                <option key={s.id} value={s.order.id}>
                  Stop {s.seq} · {s.order.outletId} · {s.order.units} units
                </option>
              ))}
            </select>
          </label>
          {stop && <StopBadges stop={stop} />}
          <fieldset disabled={disabled}>
            <legend>What happened?</legend>
            <div className="loader-badges">
              {(['missing', 'damaged', 'short'] as const).map((value) => (
                <Button
                  key={value}
                  variant={type === value ? 'primary' : 'secondary'}
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                >
                  {value === 'missing'
                    ? 'Missing'
                    : value === 'damaged'
                      ? 'Damaged'
                      : 'Short quantity'}
                </Button>
              ))}
            </div>
            <label>
              Affected quantity
              <input
                type="number"
                required
                min="1"
                max={stop?.order.units}
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label>
              Notes
              <textarea
                required
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Describe what happened and what the Dispatcher needs to know."
              />
            </label>
          </fieldset>
          <Button type="submit" disabled={disabled || !valid}>
            Send to Dispatcher
          </Button>
        </form>
      </Card>
      <Card className="loader-dark">
        <h2>When you send</h2>
        <p>{icon('IconBell1', '5323')} Your depot’s Dispatcher is notified.</p>
        <p>{icon('IconLock', '5323')} Ready waits for their acknowledgement.</p>
        <p>{icon('IconRefresh1', '5323')} Any plan change appears here for review.</p>
        <p>Keep verifying the remaining orders while you wait.</p>
      </Card>
    </div>
  );
}
function IssueList({ data }: { data: Load }) {
  if (!data.issues.length) return null;
  return (
    <section className="loader-issues" aria-label="Dispatcher acknowledgements">
      <h2>Exceptions & Dispatcher acknowledgement</h2>
      {data.issues.map((issue) => (
        <Card key={issue.id}>
          <div className="loader-title">
            <strong>
              {issue.type} · {issue.qty} units ·{' '}
              {data.stops.find((s) => s.order.id === issue.orderId)?.order.outletId ??
                issue.orderId}
            </strong>
            <Badge tone={issue.acknowledgedAt ? 'success' : 'warning'}>
              {issue.acknowledgedAt ? 'Dispatcher acknowledged' : 'Awaiting Dispatcher'}
            </Badge>
          </div>
          <p>{issue.note}</p>
          {issue.acknowledgedAt && (
            <small>
              Acknowledged{' '}
              {new Date(issue.acknowledgedAt).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}{' '}
              · {issue.acknowledgedBy}
            </small>
          )}
        </Card>
      ))}
    </section>
  );
}
function Changed({ data, onAcknowledge }: { data: Load; onAcknowledge: () => void }) {
  const before = data.acceptedPlan;
  const diff = before ? planDiff(before.stops, data.stops) : [];
  return (
    <>
      <div className="loader-notice" role="alert">
        <strong>
          {icon('IconAlert', '5641')}Plan changed · trip v{data.acceptedTripVersion} → v
          {data.tripVersion}
        </strong>
        <p>
          Review the changes, then recheck the load. Ready is blocked until the current plan is
          verified.
        </p>
      </div>
      <div className="loader-columns">
        <Card className="loader-detail">
          <h2>
            {icon('IconLayers', '5641')}What changed for {data.vehicle.id}
          </h2>
          <div className="loader-diff">
            <section>
              <h3>Before · {before ? `plan v${before.planVersion}` : 'previous plan'}</h3>
              {before ? (
                reverseStops(before.stops).map((s) => (
                  <p key={s.id}>
                    Stop {s.seq} · {s.order.outletId} · {s.order.units} units
                  </p>
                ))
              ) : (
                <p>The previous snapshot predates plan history. Recheck every current stop.</p>
              )}
            </section>
            <section>
              <h3>Now · plan v{data.planVersion}</h3>
              {reverseStops(data.stops).map((s) => (
                <p key={s.id}>
                  Stop {s.seq} · {s.order.outletId} · {s.order.units} units
                </p>
              ))}
            </section>
          </div>
          {diff.map((line) => (
            <p className="loader-change" key={line}>
              {line}
            </p>
          ))}
          {before && !diff.length && (
            <p>
              Stop order, quantities, access and arrivals are unchanged. The trip version changed.
            </p>
          )}
        </Card>
        <Card className="loader-dark">
          <h2>Review before continuing</h2>
          <p>Rearrange the load if the stop sequence changed.</p>
          <p>Recount changed quantities and check chilled handling.</p>
          <strong className="loader-hero">v{data.planVersion}</strong>
          <p>Current plan · trip v{data.tripVersion}</p>
        </Card>
      </div>
      <footer className="loader-footer">
        <p>You cannot mark Ready on the old plan.</p>
        <Button onClick={onAcknowledge}>Review complete · reverify load</Button>
      </footer>
    </>
  );
}
