import { SystemStatus } from './features/health/system-status.tsx';

export function App() {
  return (
    <main className="app">
      <h1>Waypoint</h1>
      <p>Delivery planning and operations platform.</p>
      <SystemStatus />
    </main>
  );
}
