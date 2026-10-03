import type { Issue } from '@waypoint/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Tabs } from '../../components/waypoint';
import type { IssueExtras } from './contracts';
import { insights, orderName } from './data';
import { Empty } from './states';
import {
  CardHead,
  day,
  ListRow,
  PageHead,
  Pill,
  Strip,
  ThumbZone,
  time,
  usePhone,
  Well,
} from './ui';
import { useStore } from './workspace';

type Tab = Issue['status'];

function IssuePill({ status }: { status: Issue['status'] }) {
  return status === 'open' ? (
    <Pill tone="warning" icon="alert">
      Issue open
    </Pill>
  ) : (
    <Pill tone="success" icon="check">
      Resolved
    </Pill>
  );
}

/** Ordered, received and short: the three numbers that come before any text (S07). */
function Numbers({ extras, phone = false }: { extras: IssueExtras; phone?: boolean }) {
  const cell = (label: string, value: number | null, warn = false) => (
    <div className="st-nested st-number" data-warn={warn || undefined}>
      <small>{label}</small>
      <p>
        <b>{value ?? '—'}</b>
        {!phone && <span>{extras.unit}</span>}
      </p>
    </div>
  );
  return (
    <div className="st-numbers">
      {cell('Ordered', extras.ordered)}
      {cell(phone ? 'Got' : 'Received', extras.received)}
      {cell('Short', extras.short, true)}
    </div>
  );
}

/** S07 and S07m: every issue is tied to a delivery, with the fix planning has chosen. */
export function StoreIssues() {
  const { data, user } = useStore();
  const phone = usePhone();
  const open = data.issues.filter((issue) => issue.status === 'open');
  const resolved = data.issues.filter((issue) => issue.status === 'resolved');
  const [tab, setTab] = useState<Tab>(
    open.length > 0 || resolved.length === 0 ? 'open' : 'resolved',
  );
  const [picked, setPicked] = useState<string | null>(null);
  const listed = tab === 'open' ? open : resolved;
  const selected = listed.find((issue) => issue.id === picked) ?? listed[0] ?? null;
  const extrasOf = (issue: Issue) => insights.issue(issue, data, user.id);
  const subOf = (issue: Issue) => `${day(issue.createdAt)} · ${insights.issueOutcome(issue)}`;
  // A new issue belongs to a delivery, so the button opens the report for the latest one.
  const latest = data.orders.find((item) =>
    ['delivered', 'receipt_confirmed', 'failed'].includes(item.order.status),
  );
  const report = latest ? (
    <Button asChild size={phone ? 'lg' : 'md'} className={phone ? 'st-btn-xl' : ''}>
      <Link to={`/store/orders/${latest.order.id}/issue`}>Report an issue</Link>
    </Button>
  ) : null;
  const head = (
    <PageHead
      title="Issues"
      sub="Shortages, damage and wrong items · linked to a delivery"
      eyebrow={`${data.outlet.id} ${data.outlet.district}`}
    >
      {report}
    </PageHead>
  );
  if (data.issues.length === 0) {
    return (
      <>
        {head}
        <Empty
          icon="check"
          title="No delivery issues"
          description="A shortage, damage or wrong item you report appears here with its fix."
        />
        <ThumbZone>{report}</ThumbZone>
      </>
    );
  }

  if (phone) {
    return (
      <>
        {head}
        {open.map((issue) => {
          const extras = extrasOf(issue);
          return (
            <section key={issue.id} className="wp-card st-issue-open">
              <div className="st-issue-head">
                <Well icon="box" tone="warning" size={44} />
                <div>
                  <strong>{extras.title}</strong>
                  <small>{subOf(issue)}</small>
                </div>
                <IssuePill status="open" />
              </div>
              <Numbers extras={extras} phone />
              {extras.fix && (
                <Strip tone="recommend" icon="truck">
                  {extras.fix.title}
                </Strip>
              )}
            </section>
          );
        })}
        {resolved.length > 0 && (
          <section className="wp-card st-list-card">
            {resolved.map((issue) => (
              <ListRow
                key={issue.id}
                title={extrasOf(issue).title}
                sub={subOf(issue)}
                end={<IssuePill status="resolved" />}
              />
            ))}
          </section>
        )}
        <ThumbZone>{report}</ThumbZone>
      </>
    );
  }

  const extras = selected ? extrasOf(selected) : null;
  return (
    <>
      {head}
      <div className="st-grid st-grid--issues st-fill">
        <section className="wp-card st-issue-list">
          <Tabs
            label="Issues"
            value={tab}
            options={[
              { value: 'open', label: `Open · ${open.length}` },
              { value: 'resolved', label: `Resolved · ${resolved.length}` },
            ]}
            onChange={(value) => {
              setTab(value);
              setPicked(null);
            }}
          />
          {listed.length === 0 && (
            <p className="st-caption">
              {tab === 'open'
                ? 'Nothing is open. Planning has closed every issue.'
                : 'No closed issues yet.'}
            </p>
          )}
          {listed.map((issue) => (
            <button
              key={issue.id}
              type="button"
              className="st-issue-item"
              aria-pressed={issue.id === selected?.id}
              onClick={() => setPicked(issue.id)}
            >
              <span>
                <strong>{extrasOf(issue).title}</strong>
                <IssuePill status={issue.status} />
              </span>
              <small>{subOf(issue)}</small>
            </button>
          ))}
        </section>
        {selected && extras && (
          <div className="st-stack">
            <section className="wp-card st-issue-detail">
              <div className="st-issue-head">
                <Well icon="box" tone="warning" size={52} />
                <div>
                  <h2>{extras.summary}</h2>
                  <p>
                    {orderName(selected.orderId)} · reported by {extras.reportedBy}{' '}
                    {time(selected.createdAt)}
                  </p>
                </div>
                <IssuePill status={selected.status} />
              </div>
              <Numbers extras={extras} />
              {extras.fix && (
                <Strip
                  tone="recommend"
                  icon="truck"
                  end={
                    <Pill tone="info" icon="route">
                      {extras.fix.status}
                    </Pill>
                  }
                >
                  <strong>{extras.fix.title}</strong>
                  <small>{extras.fix.detail}</small>
                </Strip>
              )}
            </section>
            <section className="wp-card st-dark st-history">
              <CardHead icon="history" title="Timeline" />
              <ol>
                {extras.timeline.map((event) => (
                  <li key={event.text} data-done={event.done || undefined}>
                    <b>{event.at ? time(event.at) : 'next'}</b>
                    {event.text}
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </div>
    </>
  );
}
