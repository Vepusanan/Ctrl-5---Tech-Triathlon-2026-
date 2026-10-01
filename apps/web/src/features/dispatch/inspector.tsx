import { Link, useParams } from 'react-router-dom';
import { CapacityBar, Card, Tag } from '../../components/waypoint';
import { useBoard } from './board';
import { Page, useDispatch } from './workspace';

export function VehicleInspector() {
  const { vehicleId = '' } = useParams();
  const { date } = useDispatch();
  const board = useBoard();
  const vehicle = board.vehicles.data?.items.find((item) => item.id === vehicleId);
  const trips = board.trips.data?.items.filter((trip) => trip.vehicleId === vehicleId) ?? [];
  const slots = board.slots.filter((slot) => slot.vehicleId === vehicleId);
  const violations = board.violations.filter((item) => item.vehicleId === vehicleId);
  const weight = slots.reduce((sum, slot) => {
    return (
      sum +
      slot.orderIds.reduce(
        (inner, id) => inner + (board.items.find((item) => item.id === id)?.weightKg ?? 0),
        0,
      )
    );
  }, 0);
  const volume = slots.reduce((sum, slot) => {
    return (
      sum +
      slot.orderIds.reduce(
        (inner, id) => inner + (board.items.find((item) => item.id === id)?.volumeM3 ?? 0),
        0,
      )
    );
  }, 0);
  return (
    <Page
      title={vehicleId}
      description="Vehicle capability, the two trip slots, and any hard violations on this vehicle."
    >
      {!vehicle ? (
        <p>This vehicle is not in the depot fleet for the selected date.</p>
      ) : (
        <Card>
          <div className="wp-between">
            <h2>{vehicle.type}</h2>
            <Tag kind={vehicle.temp === 'reefer' ? 'reefer' : 'dry-box'} />
          </div>
          <p>
            Availability {vehicle.availability?.status ?? 'Not dated'} · depot {vehicle.depotId}
          </p>
          <CapacityBar label="Weight" value={weight} max={vehicle.weightCapKg} unit="kg" />
          <CapacityBar label="Volume" value={volume} max={vehicle.volumeCapM3} unit="m³" />
          <p className="wp-muted">
            Weekly fuel quota {vehicle.weeklyFuelQuotaL} L. The server rechecks the remaining quota
            before a placement is saved.
          </p>
        </Card>
      )}
      {slots.map((slot) => (
        <Card key={slot.tripNo}>
          <h2>Trip {slot.tripNo}</h2>
          <p>{slot.orderIds.length === 0 ? 'Empty' : slot.orderIds.join(', ')}</p>
          {trips
            .filter((trip) => trip.tripNo === slot.tripNo)
            .map((trip) => (
              <p key={trip.id}>
                Status {trip.status} · {trip.plannedKm} km · {trip.plannedMinutes} min
              </p>
            ))}
        </Card>
      ))}
      {violations.length > 0 && (
        <Card>
          <h2>Hard violations</h2>
          {violations.map((item) => (
            <p key={`${item.rule}:${item.orderId ?? 'plan'}:${item.detail}`}>
              <Tag kind="blocks-publish" /> {item.rule}: {item.detail}
            </p>
          ))}
        </Card>
      )}
      <Link to={`/dispatch/allocate?date=${date}`}>Back to allocation</Link>
    </Page>
  );
}
