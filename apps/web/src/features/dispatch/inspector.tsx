import { Link, useParams } from 'react-router-dom';
import {
  CapacityBar,
  Card,
  ErrorState,
  LoadingState,
  Tag,
  ViolationPanel,
} from '../../components/waypoint';
import { message } from '../../lib/api';
import { useBoard } from './board';
import { panelItems } from './engine';
import { Page, useDispatch } from './workspace';

export function VehicleInspector() {
  const { vehicleId = '' } = useParams();
  const { date } = useDispatch();
  const board = useBoard();
  if (board.vehicles.isPending || board.trips.isPending) {
    return <LoadingState label="Loading the vehicle…" />;
  }
  if (board.vehicles.error) {
    return (
      <ErrorState
        description={message(board.vehicles.error)}
        onRetry={() => void board.refresh()}
      />
    );
  }
  const vehicle = board.vehicles.data?.items.find((item) => item.id === vehicleId);
  const trips = board.trips.data?.items.filter((trip) => trip.vehicleId === vehicleId) ?? [];
  const slots = board.slots.filter((slot) => slot.vehicleId === vehicleId);
  const violations = board.violations.filter((item) => item.vehicleId === vehicleId);
  return (
    <Page
      title={vehicleId}
      description="Vehicle capability, each trip's load, access rules, and hard violations on this vehicle."
    >
      {!vehicle ? (
        <p>This vehicle is not in the depot fleet for the selected date.</p>
      ) : (
        <Card>
          <div className="wp-between">
            <h2>
              {vehicle.type} · {vehicle.temp}
            </h2>
            <Tag kind={vehicle.temp === 'reefer' ? 'reefer' : 'dry-box'} />
          </div>
          <p>
            Availability {vehicle.availability?.status ?? 'Not dated'} · depot {vehicle.depotId}
            {vehicle.type === 'van' && ' · can serve van-only outlets'}
          </p>
          <p className="wp-muted">
            Weekly fuel quota {vehicle.weeklyFuelQuotaL} L. Weight and volume limits apply to each
            trip, not to the two trips added together. The server rechecks fuel before a placement
            is saved.
          </p>
        </Card>
      )}
      {slots.map((slot) => {
        const orders = slot.orderIds
          .map((id) => board.items.find((item) => item.id === id))
          .filter((item) => item !== undefined);
        const weight = orders.reduce((sum, item) => sum + item.weightKg, 0);
        const volume = orders.reduce((sum, item) => sum + item.volumeM3, 0);
        const recorded = trips.filter((trip) => trip.tripNo === slot.tripNo);
        return (
          <Card key={slot.tripNo}>
            <h2>Trip {slot.tripNo}</h2>
            {vehicle && (
              <>
                <CapacityBar label="Weight" value={weight} max={vehicle.weightCapKg} unit="kg" />
                <CapacityBar label="Volume" value={volume} max={vehicle.volumeCapM3} unit="m³" />
              </>
            )}
            {orders.length === 0 ? (
              <p className="wp-muted">Empty</p>
            ) : (
              <ul className="dispatch-list">
                {orders.map((item) => (
                  <li key={item.id}>
                    <Tag kind={item.temp === 'chilled' ? 'chilled' : 'ambient'} />
                    <div>
                      <strong>{item.outletId}</strong>
                      <p>
                        {item.brand} · {item.weightKg} kg · {item.volumeM3} m³ · window{' '}
                        {item.outlet.window.open}–{item.outlet.window.close}
                      </p>
                      {item.outlet.parkingConstraint === 'van_only' && <Tag kind="van-only" />}
                      {item.outlet.mallWindow && (
                        <Tag kind="mall-window">
                          Mall {item.outlet.mallWindow.open}–{item.outlet.mallWindow.close}
                        </Tag>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {recorded.map((trip) => (
              <p key={trip.id}>
                Recorded status {trip.status} · {trip.plannedKm} km · {trip.plannedMinutes} min ·{' '}
                {trip.stops.length} stops
              </p>
            ))}
          </Card>
        );
      })}
      <div className="dispatch-why">
        <ViolationPanel title="Hard violations" violations={panelItems(violations)} />
      </div>
      <Link to={`/dispatch/allocate?date=${date}`}>Back to allocation</Link>
    </Page>
  );
}
