import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  calendarListResponseSchema,
  currentUserResponseSchema,
  operatingClockSchema,
  type User,
} from '@waypoint/shared';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import {
  AppShell,
  Button,
  ErrorState,
  FigmaIcon,
  LoadingState,
  TopBar,
} from '../../components/waypoint';
import { api, HttpError, message, noContent } from '../../lib/api';
import { replaceSession } from '../../lib/session';
import { StoreIcon, useOnline } from '../store/shared';
import { AllocationWorkspace } from './allocate';
import { CommandCenter } from './command';
import { ConstraintPanel } from './conflicts';
import { DeferralCenter } from './deferrals';
import { DemoClock } from './demo-clock';
import { VehicleInspector } from './inspector';
import { LiveOperations } from './live';
import { DispatchNotifications, useDispatchNotifications } from './notifications';
import { PlanningQueuePage } from './queue';
import { ReviewPublish } from './review';
import { WhatIfSimulator } from './simulate';
import { pollInterval, type StreamState, useDashboardStream } from './stream';
import './dispatch.css';

type Dispatcher = Extract<User, { role: 'dispatcher' }>;

interface DispatchContextValue {
  user: Dispatcher;
  date: string;
  setDate: (date: string) => void;
  dates: string[];
  online: boolean;
  /** Whether dashboard changes arrive over SSE, by polling, or not at all (offline). */
  stream: StreamState;
  /** Refetch interval for dashboard queries: 15 s while the stream is down (§11.2). */
  pollMs: number | false;
}

const DispatchContext = createContext<DispatchContextValue | null>(null);

export function useDispatch() {
  const value = useContext(DispatchContext);
  if (!value) throw new Error('Dispatcher workspace required');
  return value;
}

export function DispatchWorkspaceApp() {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api('/auth/me', currentUserResponseSchema),
    retry: false,
  });
  useEffect(() => {
    const expired = () => client.setQueryData(['session'], null);
    window.addEventListener('waypoint:unauthenticated', expired);
    return () => window.removeEventListener('waypoint:unauthenticated', expired);
  }, [client]);
  if (session.isPending) {
    return (
      <main className="store-signin">
        <LoadingState label="Checking your session…" />
      </main>
    );
  }
  if (session.error && !(session.error instanceof HttpError && session.error.status === 401)) {
    return (
      <main className="store-signin">
        <ErrorState description={message(session.error)} onRetry={() => void session.refetch()} />
      </main>
    );
  }
  if (!session.data) return <DispatchSignIn />;
  if (session.data.user.role !== 'dispatcher') {
    return (
      <main className="store-signin">
        <ErrorState
          title="Dispatcher access required"
          description="This workspace is for planning staff."
        />
        <SignOut />
      </main>
    );
  }
  return <DispatchLayout user={session.data.user} />;
}

function DispatchSignIn() {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="store-signin">
      <a className="wp-brand" href="/">
        <span>W</span>Waypoint
      </a>
      <form
        className="wp-card store-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            const data = await api('/auth/login', currentUserResponseSchema, {
              method: 'POST',
              body: JSON.stringify({ email, password }),
            });
            client.setQueryData(['session'], data);
          } catch (cause) {
            setError(message(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Dispatcher sign in</h1>
        <p className="wp-muted">Plan, allocate and publish the delivery run.</p>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" busy={busy}>
          Sign in
        </Button>
      </form>
    </main>
  );
}

function SignOut() {
  const client = useQueryClient();
  return (
    <Button
      variant="tertiary"
      onClick={async () => {
        await api('/auth/logout', noContent, { method: 'POST' }).catch(() => undefined);
        replaceSession(client, null);
      }}
    >
      Sign out
    </Button>
  );
}

function DispatchLayout({ user }: { user: Dispatcher }) {
  const calendar = useQuery({
    queryKey: ['calendar'],
    queryFn: () => api('/calendar', calendarListResponseSchema),
  });
  const clock = useQuery({
    queryKey: ['operating-clock'],
    queryFn: operatingToday,
    retry: false,
  });
  const dates = useMemo(
    () =>
      (calendar.data?.items ?? [])
        .filter((day) => day.isOperating)
        .map((day) => day.date)
        .sort(),
    [calendar.data],
  );
  const [params, setParams] = useSearchParams();
  const requested = params.get('date');
  // Default to the next run after the operating clock's day, as the store does.
  const today = clock.data?.today;
  const nextRun = today ? dates.find((day) => day > today) : undefined;
  const date = requested && dates.includes(requested) ? requested : (nextRun ?? dates.at(-1) ?? '');
  const online = useOnline();
  const stream = useDashboardStream(date, user.id, online);
  const pollMs = pollInterval(stream);
  const notices = useDispatchNotifications(user.id, pollMs);
  const [noticesOpen, setNoticesOpen] = useState(false);
  const location = useLocation();
  const setDate = (next: string) => {
    const query = new URLSearchParams(params);
    query.set('date', next);
    setParams(query);
  };
  if (calendar.isPending || clock.isPending) {
    return <LoadingState label="Loading the operating calendar…" />;
  }
  if (!calendar.data) {
    return (
      <ErrorState description={message(calendar.error)} onRetry={() => void calendar.refetch()} />
    );
  }
  if (!date) {
    return (
      <ErrorState
        title="No operating day"
        description="The calendar has no operating day to plan."
      />
    );
  }
  const nav = [
    ['Command center', '/dispatch', 'Home', '2176-24573'],
    ['Planning queue', '/dispatch/queue', 'List', '2176-24573'],
    ['Allocation', '/dispatch/allocate', 'Truck', '2047-5268'],
    ['Conflicts', '/dispatch/conflicts', 'Alert', '2047-5268'],
    ['Deferrals', '/dispatch/deferrals', 'History', '2176-24573'],
    ['What-if', '/dispatch/simulate', 'Sliders', 'figma'],
    ['Review', '/dispatch/review', 'Check', '2047-5268'],
    ['Live operations', '/dispatch/live', 'Route', 'figma'],
  ] as const;
  const current = nav.find((item) =>
    item[1] === '/dispatch'
      ? location.pathname === '/dispatch'
      : location.pathname.startsWith(item[1]),
  );
  return (
    <DispatchContext.Provider value={{ user, date, setDate, dates, online, stream, pollMs }}>
      <div className="dispatch-workspace">
        <AppShell
          navigation={[
            {
              label: user.depotId ?? 'All depots',
              items: nav.map(([label, href, icon, source]) => ({
                label,
                href: `${href}?date=${date}`,
                active: current?.[1] === href,
                icon:
                  source === 'figma' ? (
                    <FigmaIcon name={icon} />
                  ) : (
                    <StoreIcon name={icon} source={source} />
                  ),
              })),
            },
          ]}
          sidebarFooter={
            <>
              <strong>{user.name}</strong>
              <p className="wp-muted">Dispatcher · {user.depotId ?? 'no depot'}</p>
              {clock.data?.demoNow && (
                <DemoClock
                  now={clock.data.demoNow}
                  date={date}
                  dates={dates}
                  // Keep the selected run in the URL so a clock move does not switch dates.
                  onMoved={() => setDate(date)}
                />
              )}
              <SignOut />
            </>
          }
          topBar={
            <TopBar
              section="Dispatcher"
              title={current?.[0] ?? 'Command center'}
              searchPlaceholder="Planning date"
              connectivity={online ? 'online' : 'offline'}
              context={streamLabel[stream]}
              onNotifications={() => setNoticesOpen((open) => !open)}
              notificationCount={notices.unread}
              profile={
                <label className="dispatch-date">
                  <span className="wp-sr-only">Service date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
              }
            />
          }
        >
          {noticesOpen && (
            <DispatchNotifications
              userId={user.id}
              date={date}
              feed={notices}
              onClose={() => setNoticesOpen(false)}
            />
          )}
          {!user.depotId && (
            <ErrorState
              title="No depot assigned"
              description="A dispatcher needs a home depot before planning."
            />
          )}
          {user.depotId && (
            <Routes>
              <Route path="/dispatch" element={<Outlet />}>
                <Route index element={<CommandCenter />} />
                <Route path="queue" element={<PlanningQueuePage />} />
                <Route path="allocate" element={<AllocationWorkspace />} />
                <Route path="vehicles/:vehicleId" element={<VehicleInspector />} />
                <Route path="conflicts" element={<ConstraintPanel />} />
                <Route path="deferrals" element={<DeferralCenter />} />
                <Route path="simulate" element={<WhatIfSimulator />} />
                <Route path="review" element={<ReviewPublish />} />
                <Route path="live" element={<LiveOperations />} />
                <Route path="*" element={<Navigate to={`/dispatch?date=${date}`} replace />} />
              </Route>
            </Routes>
          )}
        </AppShell>
      </div>
    </DispatchContext.Provider>
  );
}

const streamLabel: Record<StreamState, string> = {
  live: 'Live updates',
  polling: 'Reconnecting · refreshing every 15 s',
  offline: 'Offline · showing the last loaded data',
};

// The operating clock's Asia/Colombo date. GET /admin/clock exists only in DEMO_MODE; without
// it the server follows the host clock, so the device's time gives the same day.
async function operatingToday(): Promise<{ today: string; demoNow: string | null }> {
  try {
    const clock = await api('/admin/clock', operatingClockSchema);
    return { today: clock.now.slice(0, 10), demoNow: clock.now };
  } catch (cause) {
    if (!(cause instanceof HttpError) || cause.status !== 404) throw cause;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo' }).format(new Date());
    return { today, demoNow: null };
  }
}

export function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <header className="store-page-header">
        <div>
          <h1 tabIndex={-1}>{title}</h1>
          <p className="wp-muted">{description}</p>
        </div>
      </header>
      {children}
    </>
  );
}
