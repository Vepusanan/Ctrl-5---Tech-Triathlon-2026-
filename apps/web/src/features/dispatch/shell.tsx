import * as Dialog from '@radix-ui/react-dialog';
import { type MouseEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Avatar, Button, ConnectivityBadge, shortName } from '../../components/waypoint';
import './shell.css';

// The Figma web shell (sidebar 2034:673, top bar 2034:768). It lives with the Dispatcher so the
// shared shell in components/waypoint keeps serving the other workspaces unchanged.
export interface NavGroup {
  label: string;
  items: {
    label: string;
    href: string;
    active?: boolean;
    count?: number;
    /** The count needs attention. The tablet rail shows it as a dot. */
    alert?: boolean;
    icon?: ReactNode;
    disabled?: boolean;
  }[];
}
export interface ShellTab {
  label: string;
  href: string;
  icon: ReactNode;
  active?: boolean;
}
/** Hands a plain left click to the app's router, so the page does not reload. */
const follow =
  (href: string, onLink: ((href: string) => void) | undefined, after?: () => void) =>
  (event: MouseEvent<HTMLAnchorElement>) => {
    const plain =
      event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
    if (onLink && plain && !event.defaultPrevented) {
      event.preventDefault();
      onLink(href);
    }
    after?.();
  };
function AppSidebar({
  groups,
  footer,
  onNavigate,
  onCollapse,
  onLink,
}: {
  groups: NavGroup[];
  footer?: ReactNode;
  onNavigate?: () => void;
  onCollapse?: (() => void) | undefined;
  onLink?: ((href: string) => void) | undefined;
}) {
  return (
    <div className="wp-sidebar">
      <div className="wp-brand-row">
        <a className="wp-brand" href="/" aria-label="Waypoint home">
          <span>W</span>Waypoint
        </a>
        {onCollapse && (
          <button
            type="button"
            className="wp-collapse"
            aria-label="Hide navigation"
            onClick={onCollapse}
          >
            <img src="/waypoint/panel.svg" alt="" />
          </button>
        )}
      </div>
      <nav aria-label="Main navigation">
        {groups.map((group) => (
          <div className="wp-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) =>
              item.disabled ? (
                <span key={item.href} className="wp-nav-item" aria-disabled="true">
                  {item.icon}
                  <span>{item.label}</span>
                </span>
              ) : (
                <a
                  key={item.href}
                  className="wp-nav-item"
                  href={item.href}
                  title={item.label}
                  aria-current={item.active ? 'page' : undefined}
                  onClick={follow(item.href, onLink, onNavigate)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.count !== undefined && (
                    <small data-alert={item.alert || undefined}>{item.count}</small>
                  )}
                </a>
              ),
            )}
          </div>
        ))}
      </nav>
      <div className="wp-sidebar-footer">
        {footer ?? (
          <p className="wp-sidebar-note">
            Waypoint
            <br />
            <small>Design system · v1.0</small>
          </p>
        )}
      </div>
    </div>
  );
}
/** Sidebar user card. Children become the account menu behind the "more" button. */
export function SidebarUser({
  name,
  detail,
  children,
}: {
  name: string;
  detail: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="wp-sidebar-user" ref={card}>
      <Avatar name={name} size={32} />
      <div className="wp-sidebar-user-text">
        <strong title={name}>{shortName(name)}</strong>
        <span className="wp-sidebar-user-detail">{detail}</span>
      </div>
      {children && (
        <>
          <button
            type="button"
            className="wp-sidebar-user-more"
            aria-label="Account menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <img src="/waypoint/shell/2034-673-imgIconMore.svg" alt="" />
          </button>
          {open && <div className="wp-sidebar-user-menu">{children}</div>}
        </>
      )}
    </div>
  );
}
export function AppShell({
  children,
  navigation,
  topBar,
  sidebarFooter,
  rail,
  tabs,
  onLink,
}: {
  children: ReactNode;
  navigation: NavGroup[];
  topBar: ReactNode;
  sidebarFooter?: ReactNode;
  /** On tablet widths the sidebar becomes a 72px icon rail instead of a drawer. */
  rail?: boolean;
  /** Bottom tab bar for phone widths. */
  tabs?: ShellTab[];
  /** Client-side navigation. Without it the links load the page again. */
  onLink?: (href: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div
      className="wp-shell"
      data-collapsed={collapsed || undefined}
      data-rail={rail || undefined}
      data-tabs={tabs ? true : undefined}
    >
      <a href="#main-content" className="wp-skip">
        Skip to content
      </a>
      <aside className="wp-desktop-sidebar">
        <AppSidebar
          groups={navigation}
          footer={sidebarFooter}
          onCollapse={() => setCollapsed(true)}
          onLink={onLink}
        />
      </aside>
      <div className="wp-main-column">
        <div className="wp-shell-header">
          {collapsed && (
            <Button
              variant="secondary"
              className="wp-menu wp-expand"
              aria-label="Show navigation"
              onClick={() => setCollapsed(false)}
            >
              <img src="/waypoint/panel.svg" alt="" />
            </Button>
          )}
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
                  Navigate between workspace sections.
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
                  onLink={onLink}
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
      {tabs && (
        <nav className="wp-tabbar" aria-label="Sections">
          {tabs.map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              aria-current={tab.active ? 'page' : undefined}
              onClick={follow(tab.href, onLink)}
            >
              {tab.icon}
              {tab.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
export function TopBar({
  section,
  title,
  context,
  onSearch,
  onSearchSubmit,
  searchValue,
  searchPlaceholder = 'Search components',
  searchLabel = 'Search components',
  onNotifications,
  unread = false,
  profile,
  connectivity = 'online',
}: {
  section: string;
  title: string;
  context?: string | undefined;
  onSearch?: (query: string) => void;
  onSearchSubmit?: (query: string) => void;
  searchValue?: string;
  searchPlaceholder?: string;
  searchLabel?: string;
  onNotifications?: () => void;
  /** Shows the unread dot on the bell. */
  unread?: boolean;
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
        <img src="/waypoint/shell/2034-768-imgIconCr.svg" alt="" />
        <strong>{title}</strong>
        {context && (
          <small className="wp-topbar-sub">
            {connectivity === 'offline' ? 'Offline · ' : connectivity === 'stale' ? 'Stale · ' : ''}
            {context}
          </small>
        )}
      </div>
      {onSearch && (
        <form
          className="wp-search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchSubmit?.(input.current?.value.trim() ?? '');
          }}
        >
          <label htmlFor={id} className="wp-search-label">
            <img src="/waypoint/search.svg" alt="" />
            <span className="wp-sr-only">{searchLabel}</span>
          </label>
          <input
            ref={input}
            id={id}
            type="search"
            value={searchValue}
            placeholder={searchPlaceholder}
            onChange={(e) => onSearch(e.target.value)}
          />
          <kbd>⌘K</kbd>
        </form>
      )}
      {context && (
        <span className="wp-context">
          {connectivity === 'online' ? (
            <i className="wp-context-dot" aria-hidden="true" />
          ) : (
            <ConnectivityBadge state={connectivity} />
          )}
          {context}
        </span>
      )}
      {onNotifications && (
        <button
          type="button"
          className="wp-icon-button"
          aria-label={unread ? 'Notifications, unread' : 'Notifications'}
          onClick={onNotifications}
        >
          <img
            src={unread ? '/waypoint/bell.svg' : '/waypoint/shell/2034-768-imgIconBellIdle.svg'}
            alt=""
          />
        </button>
      )}
      {profile}
    </header>
  );
}
