import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type StopEventInput,
  stopEventSchema,
  type TripDetail,
  tripDetailSchema,
} from '@waypoint/shared';
import { api, HttpError } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { useDriver } from './workspace';

/** Refreshes every driver query after a write, so each screen shows the API's state. */
export function useDriverRefresh() {
  const { user } = useDriver();
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: queryKeys.driver.all(user.id) });
}

/** POST /trips/:id/depart with the version the driver saw. */
export function useDepart() {
  const refresh = useDriverRefresh();
  const depart = useMutation({
    mutationFn: (trip: TripDetail) =>
      api(`/trips/${trip.id}/depart`, tripDetailSchema, {
        method: 'POST',
        headers: { 'If-Match': String(trip.version) },
      }),
    onSettled: refresh,
  });
  const stale = depart.error instanceof HttpError && depart.error.code === 'VERSION_CONFLICT';
  return { depart, stale };
}

/**
 * Sends one stop event and forgets it once recorded. The event comes from eventFor, so pressing
 * the same button after a failure replays the same client event id instead of recording twice.
 */
export function useSendStopEvent() {
  const { settle } = useDriver();
  return async (event: StopEventInput) => {
    await api(`/stops/${event.stopId}/events`, stopEventSchema, {
      method: 'POST',
      body: JSON.stringify(event),
    });
    settle(event);
  };
}
