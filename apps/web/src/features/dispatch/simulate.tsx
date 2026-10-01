import { useMutation, useQuery } from '@tanstack/react-query';
import {
  planningQueueResponseSchema,
  simulatePlanResponseSchema,
  vehicleListResponseSchema,
} from '@waypoint/shared';
import { useState } from 'react';
import { Button, Card } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { Page, useDispatch } from './workspace';

export function WhatIfSimulator() {
  const { user, date } = useDispatch();
  const depotId = user.depotId ?? '';
  const vehicles = useQuery({
    queryKey: ['vehicles', depotId, date],
    queryFn: () => api(`/vehicles?depot=${depotId}&date=${date}`, vehicleListResponseSchema),
    enabled: depotId.length > 0,
  });
  const [vehicleId, setVehicleId] = useState('');
  const [factor, setFactor] = useState('1.2');
  const [scenario, setScenario] = useState<'vehicle_unavailable' | 'extra_reefer' | 'fresh_demand'>(
    'vehicle_unavailable',
  );
  const [version, setVersion] = useState<number | null>(null);
  const run = useMutation({
    mutationFn: async () => {
      const before = await api(`/planning/runs/${date}/queue`, planningQueueResponseSchema);
      const body =
        scenario === 'vehicle_unavailable'
          ? { changes: [{ type: 'vehicle_unavailable' as const, vehicleId }] }
          : scenario === 'extra_reefer'
            ? { changes: [{ type: 'extra_reefer' as const }] }
            : { changes: [{ type: 'fresh_demand' as const, factor: Number(factor) }] };
      const result = await api(`/planning/runs/${date}/simulate`, simulatePlanResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const after = await api(`/planning/runs/${date}/queue`, planningQueueResponseSchema);
      return { result, before: before.planVersion, after: after.planVersion };
    },
    onSuccess: (data) => setVersion(data.after),
  });
  return (
    <Page
      title="What-if simulator"
      description="This compares a copy of the plan. It does not allocate, defer, or publish."
    >
      <form
        className="store-form"
        onSubmit={(event) => {
          event.preventDefault();
          run.mutate();
        }}
      >
        <label>
          Scenario
          <select
            value={scenario}
            onChange={(event) => setScenario(event.target.value as typeof scenario)}
          >
            <option value="vehicle_unavailable">Vehicle unavailable</option>
            <option value="extra_reefer">One extra reefer</option>
            <option value="fresh_demand">Higher Fresh demand</option>
          </select>
        </label>
        {scenario === 'vehicle_unavailable' && (
          <label>
            Vehicle
            <select
              value={vehicleId}
              required
              onChange={(event) => setVehicleId(event.target.value)}
            >
              <option value="">Choose</option>
              {(vehicles.data?.items ?? []).map((vehicle) => (
                <option key={vehicle.id}>{vehicle.id}</option>
              ))}
            </select>
          </label>
        )}
        {scenario === 'fresh_demand' && (
          <label>
            Demand factor
            <input
              value={factor}
              onChange={(event) => setFactor(event.target.value)}
              inputMode="decimal"
            />
          </label>
        )}
        <Button type="submit" busy={run.isPending}>
          Run simulation
        </Button>
      </form>
      {run.error && <p role="alert">{message(run.error)}</p>}
      {run.data && (
        <div className="store-grid-two">
          <Card>
            <h2>Baseline</h2>
            <Metrics metrics={run.data.result.baseline} />
          </Card>
          <Card>
            <h2>Scenario</h2>
            <Metrics metrics={run.data.result.scenario} />
          </Card>
          <p className="wp-muted">
            Plan version stayed {run.data.before} → {version}. The active plan was not changed.
          </p>
        </div>
      )}
    </Page>
  );
}

function Metrics({
  metrics,
}: {
  metrics: {
    servedOrders: number;
    deferredOrders: number;
    servedVolumeM3: number;
    deferredVolumeM3: number;
    fuelUsedL: number;
    tightWindowStops: number;
  };
}) {
  return (
    <ul>
      <li>Served orders {metrics.servedOrders}</li>
      <li>Deferred orders {metrics.deferredOrders}</li>
      <li>Served volume {metrics.servedVolumeM3.toFixed(2)} m³</li>
      <li>Deferred volume {metrics.deferredVolumeM3.toFixed(2)} m³</li>
      <li>Fuel {metrics.fuelUsedL.toFixed(1)} L</li>
      <li>Tight windows {metrics.tightWindowStops}</li>
    </ul>
  );
}
