import { useMutation } from '@tanstack/react-query';
import { describeAssignment } from '@waypoint/planning';
import { publishPlanResponseSchema, validatePlanResponseSchema } from '@waypoint/shared';
import { Button, Card, Tag, ViolationPanel } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { useBoard } from './board';
import { draftsOf, panelItems } from './engine';
import { Page, useDispatch } from './workspace';

export function ReviewPublish() {
  const { date } = useDispatch();
  const board = useBoard();
  const ready = Boolean(board.inputs) && !board.queue.isPending && !board.trips.isPending;
  const hardBlocked = board.violations.length > 0 || Boolean(board.inputError);
  const blocked =
    !ready || hardBlocked || board.published || !board.online || board.persist.isPending;
  const described = (() => {
    if (!board.inputs || board.inputError || board.violations.length > 0) return null;
    try {
      return describeAssignment(board.inputs.plan, draftsOf(board.slots));
    } catch {
      return null;
    }
  })();
  const publish = useMutation({
    mutationFn: async () => {
      if (!ready || hardBlocked || board.published) {
        throw new Error('Hard violations must be cleared before publish.');
      }
      const confirmed = await api('/planning/validate', validatePlanResponseSchema, {
        method: 'POST',
        body: JSON.stringify({
          serviceDate: date,
          depotId: board.depotId,
          trips: draftsOf(board.slots),
        }),
      });
      if (confirmed.violations.length > 0) {
        board.noteViolations(confirmed.violations);
        throw new Error(
          confirmed.violations[0]?.detail ?? 'The server still reports a hard violation.',
        );
      }
      return api(`/planning/runs/${date}/publish`, publishPlanResponseSchema, {
        method: 'POST',
        headers: { 'If-Match': String(board.version) },
      });
    },
    onSuccess: () => void board.refresh(),
  });
  return (
    <Page
      title="Review and publish"
      description="Publish writes the saved plan in one step. The button stays off while any hard violation remains."
    >
      <Card>
        <h2>Plan version {board.version}</h2>
        {described ? (
          <ul>
            <li>
              Served {described.metrics.servedOrders} · deferred {described.metrics.deferredOrders}
            </li>
            <li>Weight utilisation {(described.metrics.avgWeightUtilization * 100).toFixed(0)}%</li>
            <li>Volume utilisation {(described.metrics.avgVolumeUtilization * 100).toFixed(0)}%</li>
            <li>
              Reefer {(described.metrics.reeferUtilization * 100).toFixed(0)}% · van{' '}
              {(described.metrics.vanUtilization * 100).toFixed(0)}%
            </li>
            <li>
              Fuel {described.metrics.fuelUsedL.toFixed(1)} L · tight windows{' '}
              {described.metrics.tightWindowStops}
            </li>
          </ul>
        ) : (
          <p className="wp-muted">
            Scorecard stays hidden until the planning inputs load and the draft has no hard
            violations.
          </p>
        )}
        {hardBlocked || !ready ? (
          <Tag kind="blocks-publish">Cannot publish</Tag>
        ) : (
          <Tag kind="observed">No hard violations on this draft</Tag>
        )}
      </Card>
      <div className="dispatch-why">
        <ViolationPanel title="Hard violations" violations={panelItems(board.violations)} />
      </div>
      {board.inputError && <p role="alert">{board.inputError}</p>}
      {described && described.deferred.length > 0 && (
        <Card>
          <h2>Orders the engine would defer</h2>
          <p className="wp-muted">
            These sentences come from the planning package. They are not recommendations and they do
            not waive a hard constraint. Publish records them only when the server accepts the plan.
          </p>
          <ul className="dispatch-list">
            {described.deferred.map((item) => (
              <li key={item.orderId}>
                <Tag kind="repeat-deferral" />
                <span>{item.explain}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {publish.error && <p role="alert">{message(publish.error)}</p>}
      {publish.data && (
        <p>
          Published at {publish.data.publishedAt}. Version {publish.data.planVersion}.
        </p>
      )}
      <Button disabled={blocked} busy={publish.isPending} onClick={() => publish.mutate()}>
        {board.published ? 'Already published' : 'Publish plan'}
      </Button>
    </Page>
  );
}
