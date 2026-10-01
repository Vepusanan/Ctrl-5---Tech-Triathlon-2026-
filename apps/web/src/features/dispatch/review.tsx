import { useMutation } from '@tanstack/react-query';
import { describeAssignment } from '@waypoint/planning';
import { publishPlanResponseSchema, validatePlanResponseSchema } from '@waypoint/shared';
import { Button, Card, Tag } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { useBoard } from './board';
import { draftsOf } from './engine';
import { Page, useDispatch } from './workspace';

export function ReviewPublish() {
  const { date } = useDispatch();
  const board = useBoard();
  const localBlocked = board.violations.length > 0 || Boolean(board.inputError);
  const metrics = (() => {
    if (!board.inputs || board.inputError) return null;
    try {
      return describeAssignment(board.inputs.plan, draftsOf(board.slots)).metrics;
    } catch {
      return null;
    }
  })();
  const publish = useMutation({
    mutationFn: async () => {
      const confirmed = await api('/planning/validate', validatePlanResponseSchema, {
        method: 'POST',
        body: JSON.stringify({
          serviceDate: date,
          depotId: board.depotId,
          trips: draftsOf(board.slots),
        }),
      });
      if (confirmed.violations.length > 0 || localBlocked) {
        throw new Error(
          confirmed.violations[0]?.detail ??
            board.inputError ??
            'Hard violations must be cleared before publish.',
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
      description="Publish writes the plan in one step. It stays disabled while any hard violation remains."
    >
      <Card>
        <h2>Plan version {board.version}</h2>
        {metrics ? (
          <ul>
            <li>
              Served {metrics.servedOrders} · deferred {metrics.deferredOrders}
            </li>
            <li>Weight utilisation {(metrics.avgWeightUtilization * 100).toFixed(0)}%</li>
            <li>Volume utilisation {(metrics.avgVolumeUtilization * 100).toFixed(0)}%</li>
            <li>
              Reefer {(metrics.reeferUtilization * 100).toFixed(0)}% · van{' '}
              {(metrics.vanUtilization * 100).toFixed(0)}%
            </li>
            <li>
              Fuel {metrics.fuelUsedL.toFixed(1)} L · tight windows {metrics.tightWindowStops}
            </li>
          </ul>
        ) : (
          <p className="wp-muted">Metrics appear when the planning inputs are complete.</p>
        )}
        {localBlocked ? (
          <Tag kind="blocks-publish">Cannot publish</Tag>
        ) : (
          <Tag kind="observed">No local hard violations</Tag>
        )}
        {board.violations.map((item) => (
          <p key={`${item.rule}:${item.orderId ?? 'plan'}:${item.detail}`}>
            {item.rule}: {item.detail}
          </p>
        ))}
        {board.inputError && <p role="alert">{board.inputError}</p>}
        {publish.error && <p role="alert">{message(publish.error)}</p>}
        {publish.data && (
          <p>
            Published at {publish.data.publishedAt}. Version {publish.data.planVersion}.
          </p>
        )}
        <Button
          disabled={localBlocked || board.published || !board.online}
          busy={publish.isPending}
          onClick={() => publish.mutate()}
        >
          {board.published ? 'Already published' : 'Publish plan'}
        </Button>
      </Card>
    </Page>
  );
}
