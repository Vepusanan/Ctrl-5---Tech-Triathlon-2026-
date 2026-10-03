import { useQuery } from '@tanstack/react-query';
import { calendarListResponseSchema, orderListResponseSchema, type User } from '@waypoint/shared';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { AppShell, ErrorState, FigmaIcon, LoadingState, TopBar } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { SignOut } from '../auth/auth';
import { Notifications } from '../auth/notifications';
import { StoreIcon, useOnline } from '../store/shared';
import { AllocationWorkspace } from './allocate';
import { CommandCenter } from './command';
import { ConstraintPanel } from './conflicts';
import { DeferralCenter } from './deferrals';
import { VehicleInspector } from './inspector';
import { LiveOperations } from './live';
import { PlanningQueuePage } from './queue';
import { ReviewPublish } from './review';
import { WhatIfSimulator } from './simulate';
import { useDashboardStream } from './stream';
import './dispatch.css';

type Dispatcher = Extract<User, { role: 'dispatcher' }>;

interface DispatchContextValue {
  user: Dispatcher;
  date: string;
  setDate: (date: string) => void;
  dates: string[];
  online: boolean;
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
  const orders = useQuery({
    queryKey: ['dispatcher', user.id, 'service-dates'],
    queryFn: () => api('/orders', orderListResponseSchema),
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
  const operatingDates = (orders.data?.items ?? [])
    .filter(
      (order) => !['cancelled', 'draft', 'submitted', 'receipt_confirmed'].includes(order.status),
    )
    .map((order) => order.requestedDate)
    .filter((date) => dates.includes(date))
    .sort();
  const date =
    requested && dates.includes(requested)
      ? requested
      : (operatingDates.at(-1) ?? dates.at(-1) ?? '');
  const online = useOnline();
  useDashboardStream(date, online && date.length > 0);
  const location = useLocation();
  const setDate = (next: string) => {
    const query = new URLSearchParams(params);
    query.set('date', next);
    setParams(query);
  };
  if (calendar.isPending || orders.isPending)
    return <LoadingState label="Loading the operating calendar…" />;
  if (!calendar.data || !orders.data) {
    return (
      <ErrorState
        description={message(calendar.error ?? orders.error)}
        onRetry={() => {
          void calendar.refetch();
          void orders.refetch();
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
    <DispatchContext.Provider value={{ user, date, setDate, dates, online }}>
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
              <SignOut />
            </>
          }
          topBar={
            <TopBar
              section="Dispatcher"
              title={current?.[0] ?? 'Command center'}
              searchPlaceholder="Planning date"
              connectivity={online ? 'online' : 'offline'}
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
