import { BrowserRouter } from 'react-router-dom';
import { DesignSystem } from './features/design-system/design-system';
import { DispatchWorkspaceApp } from './features/dispatch/workspace';
import { DriverWorkspaceApp } from './features/driver/workspace';
import { SystemStatus } from './features/health/system-status.tsx';
import { LoaderWorkspaceApp } from './features/loader/workspace';
import { StoreWorkspaceApp } from './features/store/workspace';

export function App() {
  const path = window.location.pathname;
  if (path === '/store' || path.startsWith('/store/')) {
    return (
      <BrowserRouter>
        <StoreWorkspaceApp />
      </BrowserRouter>
    );
  }
  if (path === '/dispatch' || path.startsWith('/dispatch/')) {
    return (
      <BrowserRouter>
        <DispatchWorkspaceApp />
      </BrowserRouter>
    );
  }
  if (path === '/driver' || path.startsWith('/driver/')) {
    return (
      <BrowserRouter>
        <DriverWorkspaceApp />
      </BrowserRouter>
    );
  }
  if (path === '/loader' || path.startsWith('/loader/')) {
    return (
      <BrowserRouter>
        <LoaderWorkspaceApp />
      </BrowserRouter>
    );
  }
  if (path.replace(/\/$/, '') === '/dev/design-system') return <DesignSystem />;
  return (
    <main className="app">
      <h1>Waypoint</h1>
      <p>Delivery planning and operations platform.</p>
      <a href="/dev/design-system">Explore the design system</a>
      <a href="/dispatch">Open Dispatcher workspace</a>
      <a href="/loader">Open Loader workspace</a>
      <a href="/driver">Open Driver workspace</a>
      <a href="/store">Open Store Manager workspace</a>
      <SystemStatus />
    </main>
  );
}
