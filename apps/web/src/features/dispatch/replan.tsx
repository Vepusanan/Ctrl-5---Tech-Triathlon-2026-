// D12 · Vehicle unavailable · replan (Figma 2044:3828): a lost vehicle's orders, moved and checked.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { z } from 'zod';
import {
  Banner,
  Button,
  ErrorState,
  Icon,
  LoadingState,
  Overlay,
  ProgressBar,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { clock } from '../../lib/format';
import { replanSchema } from './contracts';
import { api, message } from './data/client';
import { CardHead, capacityTone, DarkCard, Row } from './ui';
import { Page, useDispatch } from './workspace';
import './replan.css';

type Replan = z.infer<typeof replanSchema>;

const checkLooks: Record<Replan['checks'][number]['state'], { icon: string; text: string }> = {
  pass: { icon: 'check', text: 'Passed' },
  warn: { icon: 'alert', text: 'Warning' },
  fail: { icon: 'xoct', text: 'Failed' },
};
const ackIcons: Record<Replan['acknowledge'][number]['key'], string> = {
  loaders: 'panel',
  drivers: 'phone',
  stores: 'store',
};
const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** One dot per order. The count is always written next to the dots. */
function Dots({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        // The dots are identical, so the index is the identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: identical decorative dots
        <i key={index} />
      ))}
    </>
  );
}

export function ReplanPage() {
  const { vehicleId = '' } = useParams();
  const { date } = useDispatch();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const key = ['planning', date, 'replan', vehicleId];
  const replan = useQuery({
    queryKey: key,
    queryFn: () => api(`/planning/runs/${date}/replans/${vehicleId}`, replanSchema),
    // Acknowledgements keep arriving after the new version is published.
    refetchInterval: (query) => (query.state.data?.published ? 15_000 : false),
  });
  const publish = useMutation({
    mutationFn: () =>
      api(`/planning/runs/${date}/replans/${vehicleId}/publish`, replanSchema, { method: 'POST' }),
    onSuccess: async (data) => {
      setConfirming(false);
      client.setQueryData(key, data);
      await client.invalidateQueries({ queryKey: ['dashboard', date] });
    },
  });

  const title = `${vehicleId} is off the road`;
  if (replan.isPending) {
    return (
      <Page title={title}>
        <LoadingState label="Loading the replan…" rows={5} />
      </Page>
    );
  }
  if (replan.isError) {
    return (
      <Page title="Replan">
        <ErrorState description={message(replan.error)} onRetry={() => void replan.refetch()} />
      </Page>
    );
  }

  const data = replan.data;
  const version = `v${data.nextVersion}`;
  const { impact, lateRisk, published } = data;
  return (
    <Page
      title={title}
      description={`Marked unavailable ${clock(data.markedAt)} · ${data.reason} · ${data.phase}`}
      actions={
        <>
          {published ? (
            <StatusBadge status="resolved" label={`Plan ${version} published`} />
          ) : (
            <StatusBadge status="blocked" />
          )}
          <Button asChild variant="secondary" size="md">
            <Link to={`/dispatcher/allocate?date=${date}`}>Edit manually</Link>
          </Button>
          {!published && (
            <Button size="md" disabled={!data.feasible} onClick={() => setConfirming(true)}>
              Publish plan {version}
            </Button>
          )}
        </>
      }
    >
      {published && (
        <Banner tone="success" title={`Plan ${version} is published`}>
          Published {clock(published.at)} by {published.by}. Loaders, drivers and stores must
          acknowledge the change before they carry on.
        </Banner>
      )}
      {!published && !data.feasible && (
        <Banner tone="danger" title="This replan breaks a hard rule">
          It cannot be published. Move the orders yourself in the allocation workspace.
        </Banner>
      )}
      <div className="rp-row">
        <section className="wp-card rp-flow" aria-label="Replan proposal">
          <CardHead title={`Where its ${plural(data.orders, 'order')} go`}>
            <Tag kind={data.feasible ? 'recommended' : 'blocks-publish'}>
              {data.feasible ? 'Replan · all feasible' : 'Replan · not feasible'}
            </Tag>
          </CardHead>
          <div className="rp-flow-body">
            <div className="rp-lost">
              <span className="rp-lost-icon">
                <Icon name="truck" size={20} />
              </span>
              <strong>{data.vehicleId}</strong>
              <span>{plural(data.orders, 'order')}</span>
              <span className="rp-matrix" aria-hidden="true">
                <Dots count={data.orders} />
              </span>
            </div>
            <Icon name="arrow" size={24} className="rp-arrow" />
            <ul className="wp-list rp-moves">
              {data.moves.map((move, index) => {
                const tone = capacityTone(move.loadPercent);
                return (
                  <li key={`${move.vehicleId}-${move.tripNo}`} data-tone={tone}>
                    <span className="rp-dots" data-cat={(index % 4) + 1} aria-hidden="true">
                      <Dots count={move.orders} />
                    </span>
                    <strong>
                      {move.vehicleId} · T{move.tripNo}
                      <span className="wp-sr-only"> takes {plural(move.orders, 'order')}</span>
                    </strong>
                    <span className="rp-bar">
                      <ProgressBar
                        label={`${move.vehicleId} trip ${move.tripNo} load after the replan`}
                        track="muted"
                        tone={tone}
                        value={move.loadPercent}
                      />
                    </span>
                    <span className="rp-percent">
                      {tone !== 'neutral' && (
                        <span className="wp-sr-only">
                          {tone === 'danger' ? 'Over limit: ' : 'Near limit: '}
                        </span>
                      )}
                      {Math.round(move.loadPercent)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          {data.insight && <p className="rp-note">{data.insight}</p>}
        </section>
        <DarkCard title="Affected" icon="alert">
          <p className="d-hero">
            <strong>{data.orders}</strong>
            <span>{data.orders === 1 ? 'order' : 'orders'}</span>
          </p>
          <p>
            {plural(impact.tripsRemoved, 'trip')} removed · {impact.deferred} deferred ·{' '}
            {impact.secondTrips === 1 ? '1 vehicle takes' : `${impact.secondTrips} vehicles take`} a
            second trip.
          </p>
        </DarkCard>
      </div>
      <div className="rp-row rp-row--three">
        <section className="wp-card rp-card" aria-label="Checks">
          <CardHead title="Checks" icon="shield">
            <StatusBadge
              status={data.feasible ? 'ready' : 'blocked'}
              label={data.feasible ? 'Feasible' : 'Not feasible'}
            />
          </CardHead>
          <ul className="wp-list rp-checks">
            {data.checks.map((check) => (
              <li key={check.key} data-state={check.state}>
                <Icon name={checkLooks[check.state].icon} />
                <span className="wp-sr-only">{checkLooks[check.state].text}:</span>
                {check.label}
              </li>
            ))}
          </ul>
        </section>
        <section className="wp-card rp-card" aria-label="Predicted late risk">
          <CardHead title="Late risk">
            <Tag kind="predicted">after replan</Tag>
          </CardHead>
          <p className="rp-risk">
            <strong>
              <span aria-hidden="true">
                {lateRisk.before} → {lateRisk.after}
              </span>
              <span className="wp-sr-only">
                From {lateRisk.before} to {lateRisk.after}
              </span>
            </strong>
            stops
          </p>
          {lateRisk.note && <p className="rp-note rp-note--wrap">{lateRisk.note}</p>}
        </section>
        <section className="wp-card rp-acks" aria-label="Who must acknowledge the new version">
          <CardHead title={`Acknowledge ${version}`} icon="bell" />
          {data.acknowledge.map((group) => (
            <Row key={group.key} icon={ackIcons[group.key]} title={group.label}>
              <strong className="d-count">
                {published ? `${group.acknowledged}/${group.count}` : group.count}
              </strong>
            </Row>
          ))}
        </section>
      </div>
      <Overlay
        variant="modal"
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Publish plan ${version}?`}
        icon="cc"
        footer={
          <>
            <Button variant="secondary" size="md" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button size="md" busy={publish.isPending} onClick={() => publish.mutate()}>
              Publish plan {version}
            </Button>
          </>
        }
      >
        <p className="rp-confirm">
          {plural(data.orders, 'order')} from {data.vehicleId} move to{' '}
          {plural(data.moves.length, 'other trip')}. Plan v{data.planVersion} is replaced, and these
          people must acknowledge {version} before they carry on.
        </p>
        <div className="rp-acks">
          {data.acknowledge.map((group) => (
            <Row key={group.key} icon={ackIcons[group.key]} title={group.label}>
              <strong className="d-count">{group.count}</strong>
            </Row>
          ))}
        </div>
        {publish.isError && (
          <Banner tone="danger" title="The plan was not published">
            {message(publish.error)}
          </Banner>
        )}
      </Overlay>
    </Page>
  );
}
