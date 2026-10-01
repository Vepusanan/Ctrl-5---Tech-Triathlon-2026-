import { type ReactNode, useState } from 'react';
import {
  ActionList,
  AppShell,
  Badge,
  Button,
  CapacityBar,
  Card,
  type Column,
  ConnectivityBadge,
  DataTable,
  DeadlineCard,
  EmptyState,
  ErrorState,
  FigmaIcon,
  HeroMetric,
  LoadingState,
  MetricCard,
  RecommendationCard,
  type Status,
  StatusBadge,
  SyncBadge,
  statusMap,
  Tag,
  type TagKind,
  type Tone,
  TopBar,
  tagMap,
  ViolationPanel,
} from '../../components/waypoint';

const rows = [
  { id: 'ORD-260926-0587', outlet: 'Peradeniya', weight: 286, status: 'planning' as Status },
  { id: 'ORD-260926-0712', outlet: 'Gampola', weight: 344, status: 'allocated' as Status },
  { id: 'ORD-260926-1042', outlet: 'Kiribathgoda', weight: 720, status: 'held' as Status },
];
const sections = [
  ['foundations', 'Foundations'],
  ['metrics', 'Metrics & capacity'],
  ['badges', 'Status & tags'],
  ['intelligence', 'Recommendations'],
  ['operations', 'Actions & validation'],
  ['tables', 'Data tables'],
  ['feedback', 'Feedback states'],
  ['deadlines', 'Deadlines'],
  ['controls', 'Controls'],
];
function Section({
  id,
  title,
  description,
  children,
  query,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
  query: string;
}) {
  if (query && !`${title} ${description}`.toLowerCase().includes(query.toLowerCase())) return null;
  return (
    <section className="ds-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="ds-section-heading">
        <h2 id={`${id}-title`}>{title}</h2>
        <small>{description}</small>
      </div>
      {children}
    </section>
  );
}

export function DesignSystem() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(['ORD-260926-0587']);
  const [recommendation, setRecommendation] = useState<'pending' | 'accepted' | 'rejected'>(
    'pending',
  );
  const [notice, setNotice] = useState('');
  const [retried, setRetried] = useState(false);
  const [resolved, setResolved] = useState(false);
  const columns: Column<(typeof rows)[number]>[] = [
    { id: 'id', header: 'Order', cell: (row) => row.id, sortValue: (row) => row.id },
    { id: 'outlet', header: 'Outlet', cell: (row) => row.outlet, sortValue: (row) => row.outlet },
    {
      id: 'weight',
      header: 'Weight kg',
      cell: (row) => row.weight,
      sortValue: (row) => row.weight,
      numeric: true,
    },
    { id: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
    {
      id: 'action',
      header: 'Action',
      cell: (row) => (
        <Button
          variant="tertiary"
          onClick={() => setNotice(`Preview: ${row.id} · ${row.outlet} · ${row.weight} kg`)}
        >
          View
        </Button>
      ),
    },
  ];
  const preview = () => setNotice('Example action completed. This gallery uses local sample data.');
  return (
    <AppShell
      navigation={[
        {
          label: 'Workspace',
          items: [{ label: 'Design system', href: '/dev/design-system', active: true, count: 18 }],
        },
        {
          label: 'Component library',
          items: sections.map(([id, label]) => ({ label: label ?? '', href: `#${id}` })),
        },
      ]}
      topBar={
        <TopBar
          section="Development"
          title="Design system"
          context="Component library"
          onSearch={setQuery}
          searchValue={query}
        />
      }
    >
      <div className="ds-header">
        <div>
          <div className="ds-eyebrow">Waypoint / Interface foundations</div>
          <h1>A shared language for every journey.</h1>
          <p className="wp-muted">Soft Bento · reusable components · all states, one place.</p>
        </div>
        <Badge tone="neutral">Library v1.0</Badge>
      </div>
      {query && (
        <div className="wp-actions">
          <p role="status">Filtering sections by “{query}”</p>
          <Button variant="tertiary" onClick={() => setQuery('')}>
            Show all sections
          </Button>
        </div>
      )}
      <Section
        query={query}
        id="foundations"
        title="Foundations"
        description="Neutral canvas. Purposeful color. 4px rhythm."
      >
        <Card>
          <div className="ds-swatches">
            {[
              ['Canvas', 'var(--color-bg-canvas)'],
              ['Card', 'var(--color-bg-surface)'],
              ['Emphasis', 'var(--color-bg-inverse)'],
              ['Observed', 'var(--color-data-accent)'],
              ['Success', 'var(--color-status-success)'],
              ['Warning', 'var(--color-status-warning)'],
              ['Prediction', 'var(--color-intel-predict)'],
              ['Recommend', 'var(--color-intel-recommend)'],
              ['Chilled', 'var(--color-temp-chilled)'],
            ].map(([label, color]) => (
              <div key={label}>
                <div className="ds-swatch" style={{ background: color }} />
                <small>{label}</small>
              </div>
            ))}
          </div>
          <div className="wp-between">
            <p>
              <strong>Geist</strong> for headings and numerals. <strong>Inter</strong> for the
              details.
            </p>
            <small>28px cards · 20px nested surfaces · 44px touch targets</small>
          </div>
        </Card>
      </Section>
      <Section
        query={query}
        id="metrics"
        title="Metrics & capacity"
        description="MetricCard · HeroMetric · CapacityBar"
      >
        <div className="ds-grid">
          <Card>
            <div className="wp-between">
              <h3>Observed & predicted</h3>
              <Tag kind="observed" />
            </div>
            <strong className="wp-display">146</strong>
            <div
              className="ds-chart"
              role="img"
              aria-label="Weekly trips: W35 52, W36 55, W37 61, W38 58; predicted W39 approximately 66 and W40 approximately 63"
            >
              {[52, 55, 61, 58, 66, 63].map((value, i) => (
                <div className="ds-bar" data-predicted={i > 3} key={value}>
                  <small>
                    {i > 3 ? '~' : ''}
                    {value}
                  </small>
                  <span style={{ height: value * 1.5 }} />
                  <small>W{35 + i}</small>
                </div>
              ))}
            </div>
            <p className="wp-muted">
              Solid coral records observations. Dashed violet indicates an estimate.
            </p>
          </Card>
          <HeroMetric
            label="Reefer capacity"
            value="94%"
            description="2 chilled orders need a second trip."
            icon={<FigmaIcon source="2037-843" name="Snow" />}
          >
            <CapacityBar label="Reefer load" value={940} max={1000} unit="kg" />
          </HeroMetric>
          <div className="ds-stack">
            <MetricCard
              label="Unallocated"
              value="18"
              delta="+9%"
              icon={<FigmaIcon source="2037-729" name="Layers" />}
            />
            <MetricCard label="Delivery performance" value="96.4%" delta="−2.1%" trend="danger" />
          </div>
        </div>
        <div className="ds-grid" style={{ marginTop: 'var(--space-16)' }}>
          <MetricCard label="No baseline available" value="—" />
          <HeroMetric
            inverse={false}
            label="Observed orders"
            value="146"
            description="Light emphasis variant."
          />
          <Card>
            <h3>Capacity boundaries</h3>
            {[0, 78, 90, 100, 103].map((value) => (
              <CapacityBar
                key={value}
                label={value === 103 ? 'Over limit' : 'Weight'}
                value={value}
                unit="kg"
              />
            ))}
            <CapacityBar label="Proposed load" value={88} projected={97} unit="kg" />
            <CapacityBar label="Unknown capacity" value={0} max={0} />
          </Card>
        </div>
      </Section>
      <Section
        query={query}
        id="badges"
        title="Status & tags"
        description="StatusBadge · Tag · ConnectivityBadge · SyncBadge"
      >
        <div className="ds-stack">
          <Card>
            <h3>One status map across every workflow</h3>
            <div className="wp-inline">
              {(Object.keys(statusMap) as Status[]).map((status) => (
                <StatusBadge key={status} status={status} />
              ))}
            </div>
          </Card>
          <Card>
            <h3>Attributes & provenance</h3>
            <div className="wp-inline">
              {(Object.keys(tagMap) as TagKind[]).map((kind) => (
                <Tag key={kind} kind={kind} />
              ))}
            </div>
          </Card>
          <Card>
            <h3>Connectivity & synchronization</h3>
            <div className="wp-inline">
              {(['online', 'offline', 'stale'] as const).map((state) => (
                <ConnectivityBadge
                  key={state}
                  state={state}
                  lastSeen={state === 'stale' ? '04:12' : undefined}
                />
              ))}
              {(['pending', 'syncing', 'synced', 'conflict'] as const).map((state) => (
                <SyncBadge key={state} state={state} pendingCount={4} />
              ))}
            </div>
          </Card>
        </div>
      </Section>
      <Section
        query={query}
        id="intelligence"
        title="Recommendations"
        description="RecommendationCard · pending, applying, accepted, rejected"
      >
        <div className="ds-grid-two ds-grid">
          <RecommendationCard
            title="Assign to VEH051 · Trip 1"
            description="Reefer, van and depot match. Weight reaches 98% of limit."
            reasons={[
              'Compatible chilled vehicle.',
              'Fits the outlet delivery window.',
              'Adds only 8 minutes to the route.',
            ]}
            state={recommendation}
            onAccept={() => setRecommendation('accepted')}
            onModify={() =>
              setNotice('Example modification: choose a different compatible vehicle.')
            }
            onReject={() => setRecommendation('rejected')}
          />
          <RecommendationCard
            title="Applying assignment"
            description="Checking the updated route and capacity."
            state="applying"
          />
          <RecommendationCard
            title="Assignment accepted"
            description="The recommendation has been added to the draft."
            state="accepted"
          />
          <RecommendationCard
            title="Recommendation rejected"
            description="The current allocation was retained."
            state="rejected"
          />
        </div>
        <Button variant="tertiary" onClick={() => setRecommendation('pending')}>
          Reset recommendation example
        </Button>
      </Section>
      <Section
        query={query}
        id="operations"
        title="Actions & validation"
        description="ActionList · ViolationPanel · actionable, disabled and clear"
      >
        <div className="ds-grid-two ds-grid">
          <ActionList
            items={[
              {
                id: 'weight',
                title: 'VEH014 trip 2 over weight',
                description: '103% · blocks publish',
                tone: 'danger',
                icon: <FigmaIcon source="2037-861" name="Xoct" />,
                onClick: preview,
              },
              {
                id: 'deferred',
                title: 'WF-F023 deferred twice',
                description: 'Repeat deferral · needs reason',
                tone: 'warning',
                icon: <FigmaIcon source="2037-861" name="History" />,
                onClick: preview,
              },
              {
                id: 'disabled',
                title: 'Waiting for the latest update',
                description: 'Action unavailable while syncing',
                onClick: preview,
                disabled: true,
              },
            ]}
          />
          <ViolationPanel
            violations={
              resolved
                ? []
                : [
                    {
                      id: 'hard',
                      title: 'Vehicle exceeds weight capacity',
                      description: 'Move 30 kg to another vehicle before publishing.',
                      severity: 'danger',
                      action: { label: 'Resolve example', onClick: () => setResolved(true) },
                    },
                    {
                      id: 'soft',
                      title: 'Tight delivery window',
                      description: 'Review the estimated arrival before proceeding.',
                      severity: 'warning',
                    },
                  ]
            }
          />
          <ActionList items={[]} />
          <ViolationPanel title="All checks passed" violations={[]} />
        </div>
        <Button variant="tertiary" onClick={() => setResolved(false)}>
          Reset validation example
        </Button>
      </Section>
      <Section
        query={query}
        id="tables"
        title="Data tables"
        description="DataTable · sortable, selectable, empty, loading and error"
      >
        <div className="ds-stack">
          <DataTable
            caption="Sample orders"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            selection={selected}
            onSelectionChange={setSelected}
          />
          <div className="ds-grid">
            <DataTable
              caption="Empty orders"
              rows={[]}
              columns={columns}
              rowKey={(row) => row.id}
            />
            <DataTable
              caption="Orders"
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              loading
            />
            <DataTable
              caption="Orders"
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              error="Sample request failed."
              onRetry={preview}
            />
          </div>
        </div>
      </Section>
      <Section
        query={query}
        id="feedback"
        title="Feedback states"
        description="EmptyState · ErrorState · LoadingState"
      >
        <div className="ds-grid">
          <EmptyState
            title="No orders yet"
            description="New orders will appear here when submitted."
            action={
              <Button variant="secondary" onClick={preview}>
                Create example order
              </Button>
            }
          />
          {retried ? (
            <EmptyState
              title="Connection restored"
              description="The retry example completed successfully."
              action={
                <Button variant="secondary" onClick={() => setRetried(false)}>
                  Reset error
                </Button>
              }
            />
          ) : (
            <ErrorState onRetry={() => setRetried(true)} />
          )}
          <LoadingState />
          <ErrorState title="Retry in progress" retrying onRetry={preview} />
          <ErrorState
            title="Access unavailable"
            description="Contact your workspace administrator."
          />
          <LoadingState label="Loading summary…" rows={1} />
        </div>
      </Section>
      <Section
        query={query}
        id="deadlines"
        title="Deadlines"
        description="DeadlineCard · upcoming, urgent, overdue and complete"
      >
        <div className="ds-grid-two ds-grid">
          <DeadlineCard
            title="Publish by 18:00"
            remaining="55 min"
            progress={54}
            deadline="Today · 18:00"
          />
          <DeadlineCard title="Order cutoff" remaining="8 min" progress={94} state="urgent" />
          <DeadlineCard
            title="Publish deadline"
            remaining="12 min overdue"
            progress={100}
            state="overdue"
          />
          <DeadlineCard
            title="Plan published"
            remaining="Complete"
            progress={100}
            state="complete"
          />
        </div>
      </Section>
      <Section
        query={query}
        id="controls"
        title="Controls"
        description="Waypoint styling · accessible primitives · keyboard focus"
      >
        <Card>
          <div className="wp-inline">
            <Button onClick={preview}>Primary action</Button>
            <Button variant="secondary" onClick={preview}>
              Secondary
            </Button>
            <Button variant="tertiary" onClick={preview}>
              View details
            </Button>
            <Button variant="destructive" onClick={preview}>
              Remove example
            </Button>
            <Button disabled>Unavailable</Button>
            <Button busy>Publishing…</Button>
          </div>
          <p className="wp-muted">
            Unavailable while syncing. Tab through the controls to inspect focus. On smaller
            screens, open the navigation menu and press Escape to close it.
          </p>
          <div className="wp-inline">
            {(
              [
                'neutral',
                'success',
                'warning',
                'danger',
                'info',
                'hold',
                'predict',
                'recommend',
                'chilled',
              ] as Tone[]
            ).map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </div>
        </Card>
      </Section>
      {notice && (
        <div className="ds-notice">
          <p role="status">{notice}</p>
          <Button variant="secondary" onClick={() => setNotice('')}>
            Dismiss
          </Button>
        </div>
      )}
    </AppShell>
  );
}
