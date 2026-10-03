import { useQuery } from '@tanstack/react-query';
import { calendarListResponseSchema, operatingClockSchema, type User } from '@waypoint/shared';
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AppShell, ErrorState, FigmaIcon, LoadingState, TopBar } from '../../components/waypoint';
import { api, HttpError, message } from '../../lib/api';
import { SignOut } from '../auth/auth';
import { Notifications } from '../auth/notifications';
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

export function DispatchWorkspaceApp({ user }: { user: Dispatcher }) {
  const calendar = useQuery({
    queryKey: ['calendar'],
    queryFn: () => api('/calendar', calendarListResponseSchema),
  });
  const clock = useQuery({
    queryKey: ['dispatcher', user.id, 'operating-clock'],
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
      <ErrorState
        description={message(calendar.error)}
        onRetry={() => {
          void calendar.refetch();
        }}
      />
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
    ['Command center', '/dispatcher', 'Home', '2176-24573'],
    ['Planning queue', '/dispatcher/queue', 'List', '2176-24573'],
    ['Allocation', '/dispatcher/allocate', 'Truck', '2047-5268'],
    ['Conflicts', '/dispatcher/conflicts', 'Alert', '2047-5268'],
    ['Deferrals', '/dispatcher/deferrals', 'History', '2176-24573'],
    ['What-if', '/dispatcher/simulate', 'Sliders', 'figma'],
    ['Review', '/dispatcher/review', 'Check', '2047-5268'],
    ['Notifications', '/dispatcher/notifications', 'Bell', '2176-24573'],
    ['Live operations', '/dispatcher/live', 'Route', 'figma'],
  ] as const;
  const current = nav.find((item) =>
    item[1] === '/dispatcher'
      ? location.pathname === '/dispatcher'
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
              <Route path="/" element={<Outlet />}>
                <Route index element={<CommandCenter />} />
                <Route path="notifications" element={<Notifications user={user} />} />
                <Route path="queue" element={<PlanningQueuePage />} />
                <Route path="allocate" element={<AllocationWorkspace />} />
                <Route path="vehicles/:vehicleId" element={<VehicleInspector />} />
                <Route path="conflicts" element={<ConstraintPanel />} />
                <Route path="deferrals" element={<DeferralCenter />} />
                <Route path="simulate" element={<WhatIfSimulator />} />
                <Route path="review" element={<ReviewPublish />} />
                <Route path="live" element={<LiveOperations />} />
                <Route path="*" element={<Navigate to={`/dispatcher?date=${date}`} replace />} />
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
