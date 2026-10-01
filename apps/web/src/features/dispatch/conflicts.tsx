import { Card, ErrorState, LoadingState, Tag, ViolationPanel } from '../../components/waypoint';
import { message } from '../../lib/api';
import { useBoard } from './board';
import { panelItems } from './engine';
import { Page, useDispatch } from './workspace';

export function ConstraintPanel() {
  const { date } = useDispatch();
  const board = useBoard();
  if (board.queue.isPending || board.vehicles.isPending) {
    return <LoadingState label="Checking the draft against the planning rules…" />;
  }
  if (!board.queue.data) {
    return (
      <ErrorState description={message(board.queue.error)} onRetry={() => void board.refresh()} />
    );
  }
  return (
    <Page
      title="Constraint conflicts"
      description={`${date}. Hard violations block publish. A recommendation is a separate rank and cannot clear them.`}
    >
      {board.inputError && <p role="alert">{board.inputError}</p>}
      <div className="dispatch-why">
        <ViolationPanel title="Hard constraints" violations={panelItems(board.violations)} />
      </div>
      <Card className="dispatch-recommendation">
        <h2>
          <Tag kind="recommended" /> Advisory only
        </h2>
        <p>
          Priority scores suggest a trip on the allocation board. Accept stays disabled whenever the
          planning validator reports a violation, on the client and again before the server saves
          the move.
        </p>
      </Card>
    </Page>
  );
}
