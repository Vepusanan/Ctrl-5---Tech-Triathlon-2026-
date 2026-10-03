import type { StoreOrder } from '@waypoint/shared';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Avatar, Icon, Popover, shortName } from '../../components/waypoint';
import { useAuth } from '../auth/auth';
import { orderName } from './data';
import { day, orderPath, orderStatusLabel, tempName } from './ui';

export type Section = 'Store home' | 'Place order' | 'Deliveries' | 'Receipts' | 'Issues';

const nav: { label: Section; tab: string | null; href: string; icon: string }[] = [
  { label: 'Store home', tab: 'Home', href: '/store', icon: 'home' },
  { label: 'Place order', tab: 'Order', href: '/store/orders/new', icon: 'plus' },
  { label: 'Deliveries', tab: 'Deliveries', href: '/store/deliveries', icon: 'truck' },
  // The phone tab bar (frames S01m–S07m) has no Receipts tab: the receipt opens from tracking.
  { label: 'Receipts', tab: null, href: '/store/receipts', icon: 'boxc' },
  { label: 'Issues', tab: 'Issues', href: '/store/issues', icon: 'alert' },
];

/** The sidebar row and breadcrumb for a path, as the frames name them. */
function locate(path: string): { section: Section; crumb: string } {
  const at = (section: Section, detail?: string) => ({
    section,
    crumb: detail ? `${section} / ${detail}` : section,
  });
  if (path.endsWith('/notifications')) return { section: 'Store home', crumb: 'Notifications' };
  if (path.endsWith('/issue')) return at('Receipts', 'Issue');
  if (path.endsWith('/receipt') || path.endsWith('/receipts')) return at('Receipts');
  if (path.endsWith('/held')) return at('Place order', 'Held');
  if (path.endsWith('/confirmation')) return at('Place order', 'Confirmed');
  if (path.endsWith('/orders/new') || path.endsWith('/edit')) return at('Place order');
  if (path.endsWith('/deferred')) return at('Deliveries', 'Notice');
  if (path.includes('/orders/') || path.endsWith('/deliveries')) return at('Deliveries');
  if (path.endsWith('/issues')) return at('Issues');
  return at('Store home');
}

function Search({ orders }: { orders: StoreOrder[] }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const location = useLocation();
  // Leaving the page closes the results.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path is the trigger
  useEffect(() => setQuery(''), [location.pathname]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key === 'Escape') setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const wanted = query.trim().toLowerCase();
  const found = wanted
    ? orders.filter(({ order }) =>
        `${orderName(order.id)} ${order.id} ${orderStatusLabel(order.status)} ${tempName(order.temp)} ${day(order.requestedDate)}`
          .toLowerCase()
          .includes(wanted),
      )
    : [];
  return (
    <div className="st-search">
      <Icon name="search" />
      <label htmlFor={id} className="wp-sr-only">
        Search orders
      </label>
      <input
        ref={input}
        id={id}
        type="search"
        placeholder="Search orders"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <kbd>⌘K</kbd>
      {wanted && (
        <div className="st-search-results">
          {found.length === 0 ? (
            <p>No order matches “{query.trim()}”.</p>
          ) : (
            found.slice(0, 6).map((item) => (
              <Link key={item.order.id} to={orderPath(item)}>
                <strong>{orderName(item.order.id)}</strong>
                <small>
                  {day(item.order.requestedDate)} · {tempName(item.order.temp)} ·{' '}
                  {orderStatusLabel(item.order.status)}
                </small>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function StoreShell({
  outletLabel,
  userName,
  context,
  online,
  unread,
  deliveries,
  orders,
  children,
}: {
  /** "WF-F071 · Gampola" */
  outletLabel: string;
  userName: string;
  /** "Fri 25 Sep · 11:40" */
  context: string;
  online: boolean;
  unread: boolean;
  deliveries: number;
  orders: StoreOrder[];
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const { section, crumb } = locate(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const auth = useAuth();
  return (
    <div className="st-shell" data-collapsed={collapsed || undefined}>
      <a href="#main-content" className="wp-skip">
        Skip to content
      </a>
      <aside className="st-side">
        <div className="st-brand">
          <span>W</span>
          <strong>Waypoint</strong>
          <button
            type="button"
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Icon name="panel" size={18} />
          </button>
        </div>
        <nav aria-label="Store navigation">
          <p className="st-nav-group">{outletLabel}</p>
          {nav.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="st-nav-item"
              title={item.label}
              aria-current={item.label === section ? 'page' : undefined}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.label === 'Deliveries' && deliveries > 0 && <small>{deliveries}</small>}
            </Link>
          ))}
        </nav>
        <div className="st-user">
          <Avatar name={userName} size={32} />
          <div>
            <strong>{shortName(userName)}</strong>
            <small>Store manager</small>
          </div>
          <Popover icon="more" label="Account" bare>
            <button type="button" className="st-menu-item" onClick={() => void auth.logout()}>
              Sign out
            </button>
          </Popover>
        </div>
      </aside>
      <div className="st-main">
        <header className="st-top">
          <p className="st-crumb">
            <span>{outletLabel.replace(' · ', ' ')}</span>
            <Icon name="cr" size={14} />
            <strong>{crumb}</strong>
          </p>
          <Search orders={orders} />
          <span className="st-context" role="status">
            <i data-online={online || undefined} aria-hidden="true" />
            {online ? context : 'Offline'}
          </span>
          <Link
            className="st-bell"
            to="/store/notifications"
            aria-label={unread ? 'Notifications, unread items' : 'Notifications'}
          >
            <Icon name="bell" size={18} />
            {unread && <i aria-hidden="true" />}
          </Link>
          <Avatar name={userName} size={40} />
        </header>
        <main id="main-content" tabIndex={-1} className="st-content">
          {children}
        </main>
      </div>
      <nav className="st-tabs" aria-label="Store navigation">
        {nav.map(
          (item) =>
            item.tab && (
              <Link
                key={item.href}
                to={item.href}
                aria-current={
                  item.label === section || (item.label === 'Deliveries' && section === 'Receipts')
                    ? 'page'
                    : undefined
                }
              >
                <Icon name={item.icon} size={24} />
                <span>{item.tab}</span>
              </Link>
            ),
        )}
      </nav>
    </div>
  );
}

/** Phone only: the bell on the home header, since the phone has no top bar. */
export function PhoneBell({ unread }: { unread: boolean }) {
  return (
    <Link
      className="st-bell"
      to="/store/notifications"
      aria-label={unread ? 'Notifications, unread items' : 'Notifications'}
    >
      <Icon name="bell" size={20} />
      {unread && <i aria-hidden="true" />}
    </Link>
  );
}
