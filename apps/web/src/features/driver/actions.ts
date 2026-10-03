import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type TripDetail, tripDetailSchema } from '@waypoint/shared';
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
