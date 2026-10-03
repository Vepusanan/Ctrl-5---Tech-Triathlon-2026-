import { useQuery } from '@tanstack/react-query';
import {
  notificationListResponseSchema,
  type TripDetail,
  type TripStatus,
  tripListResponseSchema,
  type User,
} from '@waypoint/shared';
import { createContext, useContext } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { day, useOnline } from '../store/shared';
import { AssignedLoads } from './assigned';
import { LoadDetail } from './load';
import { TabletAppBar } from './shell';
import { SwitchUser } from './switch';
import './loader.css';

type Loader = Extract<User, { role: 'loader' }>;

export const loaderKey = (userId: string) => ['loader', userId] as const;

// Trips the loader still has to act on. Planned trips are unpublished drafts.
export const TO_LOAD: readonly TripStatus[] = ['published', 'loading', 'ready', 'blocked'];

export function byRun(left: TripDetail, right: TripDetail): number {
  return (
    left.run.serviceDate.localeCompare(right.run.serviceDate) ||
    left.vehicleId.localeCompare(right.vehicleId) ||
    left.tripNo - right.tripNo
  );
}

const LoaderContext = createContext<{ user: Loader; online: boolean } | null>(null);

export function useLoader() {
  const value = useContext(LoaderContext);
  if (!value) throw new Error('Loader workspace required');
  return value;
}

/** The depot's published trips, shared by the app bar, L01 and the "Meanwhile" list (L04a). */
export function useLoaderTrips() {
  const { user } = useLoader();
  return useQuery({
    queryKey: [...loaderKey(user.id), 'trips'],
    queryFn: () => api('/trips', tripListResponseSchema),
    refetchInterval: 30_000,
  });
}

export function LoaderWorkspaceApp({ user }: { user: Loader }) {
  return <LoaderLayout user={user} />;
}

function LoaderLayout({ user }: { user: Loader }) {
  const online = useOnline();
  return (
    <LoaderContext.Provider value={{ user, online }}>
      <div className="loader-app">
        <a href="#main-content" className="wp-skip">
          Skip to content
        </a>
        <LoaderAppBar />
        <main className="loader-main" id="main-content" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<AssignedLoads />} />
            <Route path="trips/:tripId/*" element={<LoadDetail />} />
            <Route path="switch" element={<SwitchUser />} />
            <Route path="*" element={<Navigate to="/loader" replace />} />
          </Routes>
        </main>
      </div>
    </LoaderContext.Provider>
  );
}

function LoaderAppBar() {
  const { user, online } = useLoader();
  const location = useLocation();
  const trips = useLoaderTrips();
  const notices = useQuery({
    queryKey: [...loaderKey(user.id), 'notifications'],
    queryFn: () => api('/notifications', notificationListResponseSchema),
    refetchInterval: 30_000,
  });
  const published = (trips.data?.items ?? []).filter((trip) => trip.run.status === 'published');
  // The open trip's plan, else the plan of the next load in the queue.
  const openId = /^\/loader\/trips\/([^/]+)/.exec(location.pathname)?.[1];
  const current =
    published.find((trip) => trip.id === openId) ??
    published.filter((trip) => TO_LOAD.includes(trip.status)).sort(byRun)[0];
  return (
    <TabletAppBar
      title={`${user.depotId} depot`}
      subtitle={current ? `${day(current.run.serviceDate)} · loading dock` : 'Loading dock'}
      planVersion={current?.run.planVersion ?? null}
      online={online}
      name={user.name}
      notices={(notices.data?.items ?? []).filter((item) => item.actionRequired).length}
    />
  );
}
