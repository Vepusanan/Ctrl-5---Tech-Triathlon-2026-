import * as Dialog from '@radix-ui/react-dialog';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { ConnectivityBadge } from './badges';
export interface NavGroup {
  label: string;
  items: {
    label: string;
    href: string;
    active?: boolean;
    count?: number;
    icon?: ReactNode;
    disabled?: boolean;
  }[];
}
function AppSidebar({
  groups,
  footer,
  onNavigate,
}: {
  groups: NavGroup[];
  footer?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <div className="wp-sidebar">
      <a className="wp-brand" href="/" aria-label="Waypoint home">
        <span>W</span>Waypoint
      </a>
      <nav aria-label="Main navigation">
        {groups.map((group) => (
          <div className="wp-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) =>
              item.disabled ? (
                <span key={item.href} className="wp-nav-item" aria-disabled="true">
                  {item.icon}
                  {item.label}
                </span>
              ) : (
                <a
                  key={item.href}
                  className="wp-nav-item"
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.count !== undefined && <small>{item.count}</small>}
                </a>
              ),
            )}
          </div>
        ))}
      </nav>
      <div className="wp-sidebar-footer">
        {footer ?? (
          <p>
            Waypoint
            <br />
            <small>Design system · v1.0</small>
          </p>
        )}
      </div>
    </div>
  );
}
export function AppShell({
  children,
  navigation,
  topBar,
  sidebarFooter,
}: {
  children: ReactNode;
  navigation: NavGroup[];
  topBar: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="wp-shell">
      <a href="#main-content" className="wp-skip">
        Skip to content
      </a>
      <aside className="wp-desktop-sidebar">
        <AppSidebar groups={navigation} footer={sidebarFooter} />
      </aside>
      <div className="wp-main-column">
        <div className="wp-shell-header">
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <Button variant="secondary" className="wp-menu" aria-label="Open navigation">
                <img src="/waypoint/panel.svg" alt="" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="wp-overlay" />
              <Dialog.Content className="wp-mobile-sidebar">
                <Dialog.Title className="wp-sr-only">Waypoint navigation</Dialog.Title>
                <Dialog.Description className="wp-sr-only">
                  Navigate between design system sections.
                </Dialog.Description>
                <Dialog.Close asChild>
                  <Button variant="secondary" className="wp-close" aria-label="Close navigation">
                    ×
                  </Button>
                </Dialog.Close>
                <AppSidebar
                  groups={navigation}
                  footer={sidebarFooter}
                  onNavigate={() => setOpen(false)}
                />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {topBar}
        </div>
        <main id="main-content" tabIndex={-1} className="wp-main">
          {children}
        </main>
      </div>
    </div>
  );
}
export function TopBar({
  section,
  title,
  context,
  onSearch,
  searchValue,
  searchPlaceholder = 'Search components',
  searchLabel = 'Search components',
  onNotifications,
  notificationCount = 0,
  profile,
  connectivity = 'online',
}: {
  section: string;
  title: string;
  context?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
  searchPlaceholder?: string;
  searchLabel?: string;
  onNotifications?: () => void;
  /** Unread items shown on the bell; 0 hides the count. */
  notificationCount?: number;
  profile?: ReactNode;
  connectivity?: 'online' | 'offline' | 'stale';
}) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (!onSearch) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSearch]);
  return (
    <header className="wp-topbar">
      <div className="wp-breadcrumb">
        <span>{section}</span>
        <span aria-hidden="true">›</span>
        <strong>{title}</strong>
      </div>
      {onSearch && (
        <div className="wp-search">
          <img src="/waypoint/search.svg" alt="" />
          <label htmlFor={id} className="wp-sr-only">
            {searchLabel}
          </label>
          <input
            ref={input}
            id={id}
            type="search"
            value={searchValue}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
      )}
      {context && (
        <span className="wp-context">
          <ConnectivityBadge state={connectivity} />
          {context}
        </span>
      )}
      {onNotifications && (
        <Button
          variant="secondary"
          className="wp-icon-button"
          aria-label={
            notificationCount > 0 ? `Notifications, ${notificationCount} unread` : 'Notifications'
          }
          onClick={onNotifications}
        >
          <img src="/waypoint/bell.svg" alt="" />
          {notificationCount > 0 && (
            <span className="wp-bell-count" aria-hidden="true">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </Button>
      )}
      {profile}
    </header>
  );
}
