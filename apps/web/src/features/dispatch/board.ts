import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allocationResponseSchema,
  autoAllocateResponseSchema,
  deferralSchema,
  districtTravelListResponseSchema,
  outletListResponseSchema,
  type PlanningQueueItem,
  planningQueueResponseSchema,
  serviceAllowanceListResponseSchema,
  type TripDetail,
  tripListResponseSchema,
  type Violation,
  validatePlanResponseSchema,
  vehicleListResponseSchema,
} from '@waypoint/shared';
import { useMemo, useState } from 'react';
import { api, message } from '../../lib/api';
import { draftsOf, inspectDraft, placeOrder, planningInput, type TripSlot } from './engine';
import { useDispatch } from './workspace';

export function useBoard() {
  const { user, date, online } = useDispatch();
  const depotId = user.depotId ?? '';
  const client = useQueryClient();
  const queue = useQuery({
    queryKey: ['planning', depotId, date, 'queue'],
    queryFn: () => api(`/planning/runs/${date}/queue`, planningQueueResponseSchema),
    enabled: depotId.length > 0,
  });
  const vehicles = useQuery({
    queryKey: ['vehicles', depotId, date],
    queryFn: () => api(`/vehicles?depot=${depotId}&date=${date}`, vehicleListResponseSchema),
    enabled: depotId.length > 0,
  });
  const outlets = useQuery({
    queryKey: ['outlets', depotId],
    queryFn: () => api(`/outlets?depot=${depotId}`, outletListResponseSchema),
    enabled: depotId.length > 0,
  });
  const travel = useQuery({
    queryKey: ['travel', depotId],
    queryFn: () => api(`/district-travel?depot=${depotId}`, districtTravelListResponseSchema),
    enabled: depotId.length > 0,
  });
  const allowances = useQuery({
    queryKey: ['allowances'],
    queryFn: () => api('/service-allowances', serviceAllowanceListResponseSchema),
  });
  const trips = useQuery({
    queryKey: ['trips', date],
    queryFn: () => api(`/trips?date=${date}`, tripListResponseSchema),
  });
  const seed = useMemo(
    () => slotsFromTrips(trips.data?.items ?? [], vehicles.data?.items ?? []),
    [trips.data, vehicles.data],
  );
  const [slots, setSlots] = useState<TripSlot[] | null>(null);
  const activeSlots = slots ?? seed;
  const inputs = useMemo(() => {
    if (!queue.data || !vehicles.data || !outlets.data || !travel.data || !allowances.data)
      return null;
    return planningInput(
      date,
      depotId,
      queue.data.items,
      vehicles.data.items,
      outlets.data.items,
      travel.data.items,
      allowances.data.items,
    );
  }, [queue.data, vehicles.data, outlets.data, travel.data, allowances.data, date, depotId]);
  const local = inputs
    ? inspectDraft(inputs.validator, draftsOf(activeSlots))
    : { violations: [], inputError: null };
  const [serverViolations, setServerViolations] = useState<Violation[]>([]);
  const [error, setError] = useState('');
  const version = queue.data?.planVersion ?? trips.data?.items[0]?.run.planVersion ?? 0;
  const published = trips.data?.items.some((trip) => trip.run.status === 'published') ?? false;
  const refresh = async () => {
    setSlots(null);
    await client.invalidateQueries({ queryKey: ['planning', depotId, date] });
    await client.invalidateQueries({ queryKey: ['trips', date] });
  };
  const persist = useMutation({
    mutationFn: async (next: {
      orderId: string;
      target: { vehicleId: string; tripNo: 1 | 2 } | null;
      slots: TripSlot[];
    }) => {
      if (!inputs) throw new Error('Planning data is still loading.');
      if (!online) throw new Error('Reconnect before changing the plan.');
      if (published) throw new Error('This run is published. Start from review, not a live edit.');
      const check = inspectDraft(inputs.validator, draftsOf(next.slots));
      if (check.inputError) throw new Error(check.inputError);
      if (check.violations.length > 0) {
        setServerViolations([]);
        throw Object.assign(new Error('This placement breaks a hard constraint.'), {
          violations: check.violations,
        });
      }
      const confirmed = await api('/planning/validate', validatePlanResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ serviceDate: date, depotId, trips: draftsOf(next.slots) }),
      });
      if (confirmed.violations.length > 0) {
        setServerViolations(confirmed.violations);
        throw new Error('The server rejected this placement.');
      }
      return api(`/planning/runs/${date}/allocations`, allocationResponseSchema, {
        method: 'PUT',
        headers: { 'If-Match': String(version) },
        body: JSON.stringify({ orderId: next.orderId, target: next.target }),
      });
    },
    onSuccess: async () => {
      setError('');
      setServerViolations([]);
      await refresh();
    },
    onError: (cause) => setError(message(cause)),
  });
  const allocateAll = useMutation({
    mutationFn: async () => {
      if (published) throw new Error('A published run cannot be auto-allocated.');
      return api(`/planning/runs/${date}/auto-allocate`, autoAllocateResponseSchema, {
        method: 'POST',
        headers: { 'If-Match': String(version) },
      });
    },
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (cause) => setError(message(cause)),
  });
  const defer = useMutation({
    mutationFn: (body: {
      orderId: string;
      reasonCode: PlanningQueueItem['previousDeferral'] extends null
        ? never
        : NonNullable<PlanningQueueItem['previousDeferral']>['reasonCode'];
      type: 'unavoidable' | 'prioritized';
      note?: string;
    }) =>
      api('/deferrals', deferralSchema, {
        method: 'POST',
        headers: { 'If-Match': String(version) },
        body: JSON.stringify({
          ...body,
          serviceDate: date,
          ...(body.note ? { note: body.note } : {}),
        }),
      }),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (cause) => setError(message(cause)),
  });

  function assign(orderId: string, target: { vehicleId: string; tripNo: 1 | 2 } | null) {
    const next = placeOrder(activeSlots, orderId, target);
    const check = inputs
      ? inspectDraft(inputs.validator, draftsOf(next))
      : { violations: [], inputError: 'Planning data is still loading.' };
    if (check.inputError || check.violations.length > 0) {
      setServerViolations(check.violations);
      setError(check.inputError ?? 'Hard constraint: this placement is not possible.');
      return;
    }
    setSlots(next);
    persist.mutate({ orderId, target, slots: next });
  }

  return {
    date,
    depotId,
    online,
    published,
    version,
    queue,
    vehicles,
    outlets,
    trips,
    items: queue.data?.items ?? [],
    slots: activeSlots,
    inputs,
    violations: [...local.violations, ...serverViolations],
    inputError: local.inputError,
    error,
    setError,
    assign,
    persist,
    allocateAll,
    defer,
    refresh,
  };
}

function slotsFromTrips(
  trips: TripDetail[],
  vehicles: { id: string; availability: { status: string } | null }[],
): TripSlot[] {
  const slots = new Map<string, TripSlot>();
  for (const vehicle of vehicles) {
    if (vehicle.availability && vehicle.availability.status !== 'available') continue;
    slots.set(`${vehicle.id}:1`, { vehicleId: vehicle.id, tripNo: 1, orderIds: [] });
    slots.set(`${vehicle.id}:2`, { vehicleId: vehicle.id, tripNo: 2, orderIds: [] });
  }
  for (const trip of trips) {
    const key = `${trip.vehicleId}:${trip.tripNo}`;
    const orderIds = [...trip.stops]
      .sort((left, right) => left.seq - right.seq)
      .map((stop) => stop.orderId);
    slots.set(key, { vehicleId: trip.vehicleId, tripNo: trip.tripNo, orderIds });
  }
  return [...slots.values()];
}

export type Board = ReturnType<typeof useBoard>;
