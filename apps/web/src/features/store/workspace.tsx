import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationFeedItem, StoreWorkspace, User } from '@waypoint/shared';
import { createContext, useContext, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Banner, Button } from '../../components/waypoint';
import { message } from '../../lib/api';
import { storeApi } from './data';
import { StoreHome } from './home';
import { StoreIssues } from './issues';
import { StoreNotifications } from './notifications';
import { CurrentDelivery, CurrentReceipt, StoreOrderPage } from './order-page';
import { PlaceOrder } from './place-order';
import { StoreShell } from './shell';
import { HomeSkeleton, LoadError } from './states';
import { day, time, useOnline, useServerNow } from './ui';
import './store.css';

export const storeKey = (userId: string) => ['store', userId] as const;

type Manager = Extract<User, { role: 'store_manager' }>;

interface StoreContextValue {
  data: StoreWorkspace;
  user: Manager;
  /** The server's clock in epoch milliseconds, ticking between refreshes. */
  now: number;
  /** False while offline or stale: buttons that send something are disabled. */
  writable: boolean;
  refresh: () => Promise<unknown>;
  notes: NotificationFeedItem[];
  unread: boolean;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('Store workspace required');
  return context;
}

const ACTIVE = ['allocated', 'loading', 'dispatched', 'deferred', 'delivered'];

export function StoreWorkspaceApp({ user }: { user: Manager }) {
  const workspace = useQuery({
    queryKey: [...storeKey(user.id), 'workspace'],
    queryFn: storeApi.workspace,
    retry: false,
    // SYSTEM_DESIGN §11.2: roles other than the dispatcher poll their own views every 30 s.
    refetchInterval: 30_000,
  });
  const online = useOnline();
  if (!workspace.data) {
    return (
      <StoreShell
        outletLabel={user.outletId}
        userName={user.name}
        context={workspace.isPending ? 'Loading…' : 'Not updated'}
        online={online}
        unread={false}
        deliveries={0}
        orders={[]}
      >
        {workspace.isPending ? (
          <HomeSkeleton />
        ) : (
          <LoadError
            title="Couldn’t load your orders"
            description={`${message(workspace.error)} Nothing you submitted is lost.`}
            onRetry={() => void workspace.refetch()}
          />
        )}
      </StoreShell>
    );
  }
  return (
    <StoreContent
      user={user}
      data={workspace.data}
      updatedAt={workspace.dataUpdatedAt}
      error={workspace.error}
      online={online}
      refresh={() => workspace.refetch()}
    />
  );
}

function StoreContent({
  user,
  data,
  updatedAt,
  error,
  online,
  refresh,
}: {
  user: Manager;
  data: StoreWorkspace;
  updatedAt: number;
  error: Error | null;
  online: boolean;
  refresh: () => Promise<unknown>;
}) {
  const now = useServerNow(data.serverNow, updatedAt);
  const location = useLocation();
  const client = useQueryClient();
  const notes = useQuery({
    queryKey: [...storeKey(user.id), 'notifications'],
    queryFn: storeApi.notifications,
    refetchInterval: 30_000,
  });
  // A new page starts at the top with its title focused, so a screen reader announces it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('#main-content h1')?.focus({ preventScroll: true });
  }, [location.pathname]);
  const items = notes.data ?? [];
  const unread = items.some((item) => item.readAt === null);
  const writable = online && !error && Date.now() - updatedAt < 60_000;
  return (
    <StoreContext.Provider
      value={{
        data,
        user,
        now,
        writable,
        refresh: async () => {
          await Promise.all([
            refresh(),
            client.invalidateQueries({ queryKey: [...storeKey(user.id), 'notifications'] }),
          ]);
        },
        notes: items,
        unread,
      }}
    >
      <StoreShell
        outletLabel={`${data.outlet.id} · ${data.outlet.district}`}
        userName={user.name}
        context={`${day(now)} · ${time(now)}`}
        online={online}
        unread={unread}
        deliveries={data.orders.filter((item) => ACTIVE.includes(item.order.status)).length}
        orders={data.orders}
      >
        {(!online || error) && (
          <Banner
            tone="warning"
            title={!online ? 'Offline — showing the last received data' : 'Updates unavailable'}
            action={
              <Button variant="secondary" size="md" onClick={() => void refresh()}>
                Refresh
              </Button>
            }
          >
            {error ? message(error) : 'Reconnect before submitting changes.'}
          </Banner>
        )}
        <Routes>
          <Route index element={<StoreHome />} />
          <Route path="orders/new" element={<PlaceOrder />} />
          <Route path="orders/:id/edit" element={<PlaceOrder />} />
          <Route path="deliveries" element={<CurrentDelivery />} />
          <Route path="receipts" element={<CurrentReceipt />} />
          <Route path="issues" element={<StoreIssues />} />
          <Route path="notifications" element={<StoreNotifications />} />
          <Route path="orders/:id/*" element={<StoreOrderPage />} />
        </Routes>
      </StoreShell>
    </StoreContext.Provider>
  );
}
