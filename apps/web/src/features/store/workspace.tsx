import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  currentUserResponseSchema,
  type NotificationFeedItem,
  type NotificationType,
  notificationFeedItemSchema,
  notificationListResponseSchema,
  type StoreWorkspace,
  storeWorkspaceSchema,
  type User,
} from '@waypoint/shared';
import { createContext, useContext, useEffect, useState } from 'react';
import { Link, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, Button, ErrorState, LoadingState, TopBar } from '../../components/waypoint';
import { api, HttpError, message, noContent } from '../../lib/api';
import { replaceSession } from '../../lib/session';
import { StoreSignIn } from './auth';
import { StoreDashboard, StoreIssues, StoreOrders } from './dashboard';
import { StoreOrderPage } from './order-page';
import { PlaceOrder } from './place-order';
import { clockLabel, day, initials, StoreIcon, time, useOnline, useServerNow } from './shared';
import './store.css';

export const storeKey = (userId: string) => ['store', userId] as const;

type Manager = Extract<User, { role: 'store_manager' }>;

interface StoreContextValue {
  data: StoreWorkspace;
  user: Manager;
  now: number;
  writable: boolean;
  refresh: () => Promise<unknown>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('Store workspace required');
  return context;
}

const noteCopy: Record<NotificationType, string> = {
  order_confirmed: 'Order confirmed',
  order_deferred: 'Order deferred',
  plan_published: 'Delivery plan published',
  plan_changed: 'Delivery plan changed',
  loading_shortfall: 'Loading shortfall',
  delivery_failed: 'Delivery failed',
  delivery_issue: 'Delivery issue',
  delivered: 'Delivery recorded',
  receipt_discrepancy: 'Receipt issue sent to planning',
  sync_conflict: 'A field update needs review',
};

export function StoreWorkspaceApp() {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api('/auth/me', currentUserResponseSchema),
    retry: false,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    const expired = () => {
      client.removeQueries({ queryKey: ['store'] });
      client.setQueryData(['session'], null);
    };
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
  if (!session.data) return <StoreSignIn />;
  if (session.data.user.role !== 'store_manager') {
    return (
      <main className="store-signin">
        <ErrorState
          title="Store Manager access required"
          description="This workspace is available only to your store’s assigned manager."
        />
        <SignOut />
      </main>
    );
  }
  return <StoreLayout user={session.data.user} />;
}

function SignOut() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Button
        variant="tertiary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api('/auth/logout', noContent, { method: 'POST' });
            replaceSession(client, null);
          } catch (cause) {
            setError(message(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        Sign out
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function StoreLayout({ user }: { user: Manager }) {
  const workspace = useQuery({
    queryKey: [...storeKey(user.id), 'workspace'],
    queryFn: () => api('/store/workspace', storeWorkspaceSchema),
    retry: false,
    // SYSTEM_DESIGN §11.2: roles other than the dispatcher poll their own views every 30 s.
    refetchInterval: 30_000,
  });
  if (workspace.isPending) {
    return (
      <main className="store-signin">
        <LoadingState label="Loading your store…" />
      </main>
    );
  }
  if (!workspace.data) {
    return (
      <main className="store-signin">
        <ErrorState
          description={message(workspace.error)}
          onRetry={() => void workspace.refetch()}
        />
        <SignOut />
      </main>
    );
  }
  return (
    <StoreContent
      user={user}
      data={workspace.data}
      updatedAt={workspace.dataUpdatedAt}
      error={workspace.error}
      refresh={() => workspace.refetch()}
    />
  );
}

function StoreContent({
  user,
  data,
  updatedAt,
  error,
  refresh,
}: {
  user: Manager;
  data: StoreWorkspace;
  updatedAt: number;
  error: Error | null;
  refresh: () => Promise<unknown>;
}) {
  const now = useServerNow(data.serverNow, updatedAt);
  const online = useOnline();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [notesOpen, setNotesOpen] = useState(false);
  const notes = useQuery({
    queryKey: [...storeKey(user.id), 'notifications'],
    queryFn: () => api('/notifications', notificationListResponseSchema),
    refetchInterval: 30_000,
  });
  const readNote = useMutation({
    mutationFn: async (item: NotificationFeedItem) => {
      await api(`/notifications/${item.id}/read`, notificationFeedItemSchema, { method: 'POST' });
      if (item.actionRequired) {
        await api(`/notifications/${item.id}/acknowledge`, notificationFeedItemSchema, {
          method: 'POST',
        });
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: [...storeKey(user.id), 'notifications'] });
    },
  });
  useEffect(() => {
    if (location.pathname.length === 0) return;
    setSearch('');
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus();
  }, [location.pathname]);
  const path = location.pathname;
  const openIssues = data.issues.filter((issue) => issue.status === 'open').length;
  const activeDeliveries = data.orders.filter((item) =>
    ['allocated', 'loading', 'dispatched', 'deferred', 'delivered'].includes(item.order.status),
  ).length;
  const current = path.endsWith('/receipt')
    ? 'Receipts'
    : path.endsWith('/issue')
      ? 'Issues'
      : path.includes('/orders/new') || path.endsWith('/edit') || path.endsWith('/confirmation')
        ? 'Place order'
        : path.includes('/orders/')
          ? 'Deliveries'
          : path.endsWith('/deliveries')
            ? 'Deliveries'
            : path.endsWith('/receipts')
              ? 'Receipts'
              : path.endsWith('/issues')
                ? 'Issues'
                : 'Store home';
  const nav = [
    { label: 'Store home', href: '/store', icon: 'Home', source: '2176-24573', count: undefined },
    {
      label: 'Place order',
      href: '/store/orders/new',
      icon: 'Plus',
      source: '2176-24573',
      count: undefined,
    },
    {
      label: 'Deliveries',
      href: '/store/deliveries',
      icon: 'Truck',
      source: '2047-5268',
      count: activeDeliveries || undefined,
    },
    {
      label: 'Receipts',
      href: '/store/receipts',
      icon: 'Check',
      source: '2047-5268',
      count: undefined,
    },
    {
      label: 'Issues',
      href: '/store/issues',
      icon: 'Alert',
      source: '2047-5268',
      count: openIssues || undefined,
    },
  ];
  const writable = online && !error && Date.now() - updatedAt < 60_000;
  const unread = notes.data?.items.filter((item) => item.readAt === null).length ?? 0;
  return (
    <StoreContext.Provider value={{ data, user, now, writable, refresh }}>
      <div className="store-workspace">
        <AppShell
          navigation={[
            {
              label: `${data.outlet.id} · ${data.outlet.district}`,
              items: nav.map((item) => ({
                label: item.label,
                href: item.href,
                active: item.label === current,
                ...(item.count !== undefined ? { count: item.count } : {}),
                icon: <StoreIcon source={item.source} name={item.icon} />,
              })),
            },
          ]}
          sidebarFooter={
            <>
              <strong>{user.name}</strong>
              <p className="wp-muted">Store manager · {data.outlet.id}</p>
              <SignOut />
            </>
          }
          topBar={
            <TopBar
              section={`${data.outlet.id} · ${data.outlet.district}`}
              title={current}
              context={clockLabel(now)}
              connectivity={online ? 'online' : 'offline'}
              onSearch={setSearch}
              searchValue={search}
              searchPlaceholder="Search orders"
              searchLabel="Search orders"
              onNotifications={() => setNotesOpen((open) => !open)}
              profile={
                <span className="store-avatar" title={user.name}>
                  {initials(user.name)}
                </span>
              }
            />
          }
        >
          {(!online || error) && (
            <div className="store-banner" role="status">
              <strong>
                {!online ? 'Offline — showing the last received data' : 'Updates unavailable'}
              </strong>
              <p>{error ? message(error) : 'Reconnect before submitting changes.'}</p>
              <Button variant="secondary" onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>
          )}
          {notesOpen && (
            <section className="store-notes" aria-label="Notifications">
              <div className="wp-between">
                <h2>Notifications{unread ? ` · ${unread} new` : ''}</h2>
                <Button variant="tertiary" onClick={() => setNotesOpen(false)}>
                  Close
                </Button>
              </div>
              {!notes.data?.items.length ? (
                <p className="wp-muted">
                  Cutoff, deferral and delivery notices for your outlet appear here.
                </p>
              ) : (
                notes.data.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      void readNote.mutate(item);
                      setNotesOpen(false);
                      if (item.entityType === 'order') {
                        const suffix =
                          item.type === 'order_deferred'
                            ? '/deferred'
                            : item.type === 'delivered'
                              ? '/receipt'
                              : item.type === 'order_confirmed'
                                ? '/confirmation'
                                : '';
                        navigate(`/store/orders/${item.entityId}${suffix}`);
                      } else if (item.entityType === 'issue') {
                        navigate('/store/issues');
                      }
                    }}
                  >
                    <strong>{noteCopy[item.type]}</strong>
                    <small>
                      {day(item.createdAt)} · {time(item.createdAt)}
                      {item.readAt ? '' : ' · New'}
                    </small>
                  </button>
                ))
              )}
            </section>
          )}
          <Routes>
            <Route path="/store" element={<Outlet />}>
              <Route index element={<StoreDashboard search={search} />} />
              <Route path="orders/new" element={<PlaceOrder />} />
              <Route path="orders/:id/edit" element={<PlaceOrder />} />
              <Route path="deliveries" element={<StoreOrders search={search} />} />
              <Route path="receipts" element={<StoreOrders search={search} receiptsOnly />} />
              <Route path="issues" element={<StoreIssues />} />
              <Route path="orders/:id/*" element={<StoreOrderPage />} />
            </Route>
          </Routes>
          <nav className="store-bottom-nav" aria-label="Store navigation">
            {nav
              .filter((item) => item.label !== 'Receipts')
              .map((item) => (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={item.label === current ? 'page' : undefined}
                >
                  <StoreIcon source={item.source} name={item.icon} />
                  <span>
                    {item.label === 'Store home'
                      ? 'Home'
                      : item.label === 'Place order'
                        ? 'Order'
                        : item.label}
                  </span>
                </Link>
              ))}
          </nav>
        </AppShell>
      </div>
    </StoreContext.Provider>
  );
}
