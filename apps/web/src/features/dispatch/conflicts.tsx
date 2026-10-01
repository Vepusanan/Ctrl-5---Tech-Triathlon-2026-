import { Tag } from '../../components/waypoint';
import { useBoard } from './board';
import { Page, useDispatch } from './workspace';

export function ConstraintPanel() {
  const { date } = useDispatch();
  const board = useBoard();
  const grouped = new Map<string, string[]>();
  for (const item of board.violations) {
    const list = grouped.get(item.rule) ?? [];
    list.push(item.detail);
    grouped.set(item.rule, list);
  }
  return (
    <Page
      title="Constraint conflicts"
      description={`${date}. Hard violations block publish. Recommendations are a separate, non-binding rank.`}
    >
      {board.inputError && <p role="alert">{board.inputError}</p>}
      {[...grouped.entries()].length === 0 ? (
        <p className="wp-muted">
          The current draft has no hard violations from the planning validator.
        </p>
      ) : (
        <ul className="dispatch-list">
          {[...grouped.entries()].map(([rule, details]) => (
            <li key={rule}>
              <Tag kind="blocks-publish" />
              <div>
                <strong>{rule}</strong>
                {details.map((detail) => (
                  <p key={detail}>{detail}</p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Tag kind="recommended" /> A feasible suggestion may be shown on the allocation board. It is
        disabled whenever validation reports a violation.
      </p>
    </Page>
  );
}
