import { type StopEventInput, stopEventInputSchema, type User } from '@waypoint/shared';
import { createContext, useContext, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorState, LoadingState } from '../../components/waypoint';
import { message } from '../../lib/api';
import { RoleGate } from '../auth/role-gate';
import { useOnline } from '../store/shared';
import { DriverAccount } from './account';
import { colomboTimestamp, useDriverClock } from './clock';
import { NoticeDetail, Notices } from './notices';
import { StopOutcome } from './outcome';
import { DriverTabBar, OFFLINE_ICON, OfflineBar } from './shell';
import { StopDetail } from './stop';
import { DriverSync } from './sync';
import { TripOverview } from './trip';
import { MyTrips } from './trips';
import './driver.css';

type Driver = Extract<User, { role: 'driver' }>;

// An event without its identity and time, which the workspace adds once per user action.
type EventDraft = StopEventInput extends infer Event
  ? Event extends StopEventInput
    ? Omit<Event, 'clientEventId' | 'clientTime'>
    : never
  : never;

interface DriverContextValue {
  user: Driver;
  online: boolean;
  /** The operating-clock time now, as an ISO timestamp with +05:30. */
  stamp: () => string;
  /**
   * The event for one user action. A retry of the same action gets the same client event id
   * and the same content, so the API replays it instead of recording a second event.
   */
  eventFor: (draft: EventDraft) => StopEventInput;
  /** Forgets an action once the API has recorded it. */
  settle: (event: StopEventInput) => void;
}

const DriverContext = createContext<DriverContextValue | null>(null);

export function useDriver() {
  const value = useContext(DriverContext);
  if (!value) throw new Error('Driver workspace required');
  return value;
}

export function DriverWorkspaceApp() {
  return (
    <RoleGate
      requiredRole="driver"
      title="Driver"
      description="Your trips, stops and proof of delivery."
    >
      {(user) => <DriverLayout user={user} />}
    </RoleGate>
  );
}

function DriverLayout({ user }: { user: Driver }) {
  const online = useOnline();
  const location = useLocation();
  const clock = useDriverClock(user.id);
  const pending = useRef(new Map<string, StopEventInput>());
  // Fetch the offline bar's icon while online; once the connection drops it cannot be loaded.
  const offlineIcon = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const image = new Image();
    image.src = OFFLINE_ICON;
    offlineIcon.current = image;
  }, []);
  if (clock.isPending) {
    return (
      <div className="driver-app driver-app--focus">
        <main className="driver-main">
          <LoadingState label="Checking the operating clock…" />
        </main>
      </div>
    );
  }
  if (!clock.ready) {
    return (
      <div className="driver-app driver-app--focus">
        <main className="driver-main">
          <ErrorState description={message(clock.error)} onRetry={() => void clock.refetch()} />
        </main>
      </div>
    );
  }
  const offset = clock.offset;
  const stamp = () => colomboTimestamp(Date.now() + offset);
  const eventFor = (draft: EventDraft): StopEventInput => {
    const key = `${draft.stopId}:${draft.type}`;
    const earlier = pending.current.get(key);
    if (
      earlier !== undefined &&
      earlier.tripVersion === draft.tripVersion &&
      JSON.stringify(earlier.payload) === JSON.stringify(draft.payload)
    ) {
      return earlier;
    }
    const event = stopEventInputSchema.parse({
      ...draft,
      clientEventId: newEventId(),
      clientTime: stamp(),
    });
    pending.current.set(key, event);
    return event;
  };
  const settle = (event: StopEventInput) => {
    pending.current.delete(`${event.stopId}:${event.type}`);
  };
  // Stop and outcome screens are focus screens without the tab bar (Figma DR03, DR04, DR04a).
  const focus = location.pathname.startsWith('/driver/stops/');
  return (
    <DriverContext.Provider value={{ user, online, stamp, eventFor, settle }}>
      <div className={`driver-app${focus ? ' driver-app--focus' : ''}`}>
        <a href="#main-content" className="wp-skip">
          Skip to content
        </a>
        <main className="driver-main" id="main-content" tabIndex={-1}>
          {!online && <OfflineBar />}
          <Routes>
            <Route path="/driver" element={<MyTrips />} />
            <Route path="/driver/trips/:tripId" element={<TripOverview />} />
            <Route path="/driver/stops/:stopId" element={<StopDetail />} />
            <Route path="/driver/stops/:stopId/outcome" element={<StopOutcome />} />
            <Route path="/driver/notices" element={<Notices />} />
            <Route path="/driver/notices/:noticeId" element={<NoticeDetail />} />
            <Route path="/driver/sync" element={<DriverSync />} />
            <Route path="/driver/account" element={<DriverAccount />} />
            <Route path="*" element={<Navigate to="/driver" replace />} />
          </Routes>
        </main>
        {!focus && <DriverTabBar pathname={location.pathname} />}
      </div>
    </DriverContext.Provider>
  );
}

// crypto.randomUUID needs a secure context; a phone on plain HTTP over the LAN is not one.
function newEventId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
