import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/waypoint';

// SYSTEM_DESIGN §3: the driver and loader apps are installable. Each gets its own manifest so it
// installs as a separate app that opens on its own workspace.
const MANIFESTS: Record<string, string> = {
  '/driver': '/driver.webmanifest',
  '/loader': '/loader.webmanifest',
};

export function linkManifest(pathname: string): void {
  const app = Object.keys(MANIFESTS).find(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!app) return;
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = MANIFESTS[app] ?? '';
  document.head.append(link);
}

const UPDATE_CHECK_MS = 60 * 60_000;

/**
 * A new version waits until the user reloads, so an update never interrupts a delivery or a load.
 * Queued driver events are in IndexedDB, which the service worker never touches, so they survive.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="wp-update" role="status">
      <span className="wp-update-text">
        A new version of Waypoint is ready. Anything saved on this device is kept.
      </span>
      <Button variant="secondary" onClick={() => void updateServiceWorker(true)}>
        Reload
      </Button>
    </div>
  );
}
