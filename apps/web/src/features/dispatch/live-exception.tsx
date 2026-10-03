// D09a · Shortfall + recovery (Figma 2042:3151), D09b · Recovery applied (2042:3683),
// D09c · Minor exception · acknowledge (2106:12161)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Avatar,
  Banner,
  Button,
  ErrorState,
  Icon,
  LoadingState,
  Ring,
  StatusBadge,
  shortName,
  Tag,
} from '../../components/waypoint';
import { clock } from '../../lib/format';
import { type LoadingException, loadingExceptionSchema } from './contracts';
import { api, message } from './data/client';
import { CapacityRows, CardHead, DarkCard, Row } from './ui';
import { Page, useDispatch } from './workspace';
import './live.css';

type Recovery = NonNullable<LoadingException['recovery']>;
type Option = LoadingException['options'][number];

const factIcons = { ok: 'check', warn: 'alert', bad: 'xoct', predict: 'trend' };
const channelIcons = { phone: 'phone', tablet: 'panel', store: 'store' };

function useException(id: string) {
  const { date } = useDispatch();
  const client = useQueryClient();
  const key = ['dashboard', date, 'exception', id];
  const save = (data: LoadingException) => {
    client.setQueryData(key, data);
    void client.invalidateQueries({ queryKey: ['dashboard', date, 'live'] });
    void client.invalidateQueries({ queryKey: ['dashboard', date, 'run'] });
  };
  const query = useQuery({
    queryKey: key,
    queryFn: () => api(`/loading/issues/${id}`, loadingExceptionSchema),
    // Acknowledgements arrive while the page is open.
    refetchInterval: (state) => (state.state.data?.status === 'recovered' ? 15_000 : false),
  });
  return { query, save };
}

export function LoadingExceptionPage() {
  const { date } = useDispatch();
  const { exceptionId = '' } = useParams();
  const { query, save } = useException(exceptionId);
  const back = `/dispatcher/live?date=${date}`;

  if (query.isPending) {
    return (
      <Page title="Loading exception">
        <LoadingState label="Loading the exception…" rows={5} />
      </Page>
    );
  }
  if (!query.data) {
    return (
      <Page
        title="Loading exception"
        actions={
          <Button asChild variant="secondary" size="md">
            <Link to={back}>Back to live operations</Link>
          </Button>
        }
      >
        <ErrorState description={message(query.error)} onRetry={() => void query.refetch()} />
      </Page>
    );
  }
  const exception = query.data;
  if (exception.recovery) {
    return <RecoveryApplied exception={exception} recovery={exception.recovery} save={save} />;
  }
  return exception.blocking ? (
    <Shortfall exception={exception} save={save} />
  ) : (
    <MinorException exception={exception} save={save} />
  );
}

interface ViewProps {
  exception: LoadingException;
  save: (data: LoadingException) => void;
}

const trip = (exception: LoadingException) => `${exception.vehicleId} trip ${exception.tripNo}`;
const reported = (exception: LoadingException) =>
  `Reported ${clock(exception.reportedAt)} at ${exception.place} · departure ${clock(exception.plannedDeparture)}`;

function CallDock({ exception }: { exception: LoadingException }) {
  const label = `Call ${exception.dock.name}`;
  return exception.dock.phone ? (
    <Button asChild variant="secondary" size="md">
      <a href={`tel:${exception.dock.phone}`}>{label}</a>
    </Button>
  ) : (
    <Button variant="secondary" size="md" disabled title="No phone number on file for this dock">
      {label}
    </Button>
  );
}

function Evidence({ exception }: { exception: LoadingException }) {
  const { evidence } = exception;
  const minor = !exception.blocking;
  return (
    <section
      className={`wp-card lx-evidence ${minor ? 'lx-minor-evidence' : ''}`}
      aria-label="What the loader recorded"
    >
      <CardHead title="What the loader recorded">
        <Tag kind="observed" />
      </CardHead>
      <div className="lx-item" data-minor={minor || undefined}>
        <span className="lx-item-icon">
          <Icon name={minor ? 'box' : 'boxc'} size={20} />
        </span>
        <div className="lx-item-text">
          {minor ? (
            <>
              <strong className="lx-item-title">{evidence.item}</strong>
              <span className="lx-item-line">
                <Tag kind={evidence.temp === 'chilled' ? 'chilled' : 'ambient'} />
                {evidence.destination}
              </span>
            </>
          ) : (
            <>
              <strong>{evidence.item}</strong>
              For {evidence.destination}
            </>
          )}
        </div>
        <p className="lx-quantity">
          <strong className="lx-quantity-value">
            {evidence.quantity < 0 ? '−' : '+'}
            {Math.abs(evidence.quantity)}
          </strong>
          {evidence.unit}
        </p>
      </div>
      <div className="lx-reporter">
        <span
          className="lx-photo"
          role="img"
          aria-label={evidence.hasPhoto ? 'Photo attached by the loader' : 'No photo attached'}
        >
          <Icon name="camera" size={20} />
        </span>
        <div>
          <span className="lx-who">
            <Avatar name={evidence.reporter} size={28} />
            {shortName(evidence.reporter)} · {evidence.reporterPlace}
          </span>
          {!minor && (
            <>
              <Tag kind={evidence.temp === 'chilled' ? 'chilled' : 'ambient'} />
              {evidence.note}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function Facts({ option }: { option: Option }) {
  if (option.facts.length === 0) return null;
  return (
    <ul className="wp-list lx-option-facts">
      {option.facts.map((fact) => (
        <li key={fact.text}>
          <Icon name={factIcons[fact.tone]} size={14} className={`lx-fact-${fact.tone}`} />
          {fact.text}
        </li>
      ))}
    </ul>
  );
}

function Shortfall({ exception, save }: ViewProps) {
  const [why, setWhy] = useState(false);
  const apply = useMutation({
    mutationFn: (optionId: string) =>
      api(`/loading/issues/${exception.id}/recovery`, loadingExceptionSchema, {
        method: 'POST',
        body: JSON.stringify({ optionId }),
      }),
    onSuccess: save,
  });
  const best = exception.options.find((option) => option.recommended) ?? exception.options[0];
  return (
    <Page
      title={`Shortfall · ${trip(exception)}`}
      description={reported(exception)}
      actions={
        <>
          <StatusBadge status="loading-exception" />
          <CallDock exception={exception} />
          {best && (
            <Button
              size="md"
              busy={apply.isPending && apply.variables === best.id}
              disabled={apply.isPending}
              onClick={() => apply.mutate(best.id)}
            >
              Apply option {best.id}
            </Button>
          )}
        </>
      }
    >
      {apply.isError && (
        <Banner tone="danger" title="The recovery was not applied">
          {message(apply.error)}
        </Banner>
      )}
      <div className="lx-row">
        <div className="lx-stack">
          <Evidence exception={exception} />
          <article className="wp-card wp-inverse lx-timeline">
            <CardHead title="Timeline" icon="clock" />
            <ol className="wp-list">
              {exception.timeline.map((step) => (
                <li key={step.label} data-state={step.state}>
                  <time dateTime={step.at}>{clock(step.at)}</time>
                  {step.label}
                </li>
              ))}
            </ol>
          </article>
        </div>
        <section className="wp-card lx-options" aria-label="Recovery options">
          <div className="d-head">
            <h2 className="d-title">
              <Icon name="bulb" />
              Recovery
              <span className="lx-hint">feasible options only</span>
            </h2>
          </div>
          {exception.options.length === 0 && (
            <p className="wp-muted">
              No feasible recovery was found. Call the dock to agree what to do.
            </p>
          )}
          {exception.options.map((option) => (
            <article
              key={option.id}
              className="lx-option"
              data-recommended={option.recommended || undefined}
            >
              <div className="lx-option-head">
                <span className="d-num">{option.id}</span>
                <h3>{option.title}</h3>
                {option.recommended && <Tag kind="recommended" />}
              </div>
              <Facts option={option} />
              {option.effects.length > 0 && <CapacityRows rows={option.effects} />}
              {why && option.recommended && option.reasons.length > 0 && (
                <ul className="d-fix-reasons">
                  {option.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              <div className="d-fix-actions">
                <Button
                  size="md"
                  variant={option.recommended ? 'primary' : 'secondary'}
                  busy={apply.isPending && apply.variables === option.id}
                  disabled={apply.isPending}
                  onClick={() => apply.mutate(option.id)}
                >
                  {option.recommended ? 'Apply' : `Apply option ${option.id}`}
                </Button>
                {option.recommended && option.reasons.length > 0 && (
                  <Button
                    variant="tertiary"
                    size="md"
                    aria-expanded={why}
                    onClick={() => setWhy(!why)}
                  >
                    Why this?
                  </Button>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
    </Page>
  );
}

function RecoveryApplied({ exception, recovery, save }: ViewProps & { recovery: Recovery }) {
  const { date } = useDispatch();
  const undo = useMutation({
    mutationFn: () =>
      api(`/loading/issues/${exception.id}/recovery`, loadingExceptionSchema, {
        method: 'DELETE',
      }),
    onSuccess: save,
  });
  const done = recovery.acknowledgements.filter((item) => item.at !== null).length;
  const total = recovery.acknowledgements.length;
  const share = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Page
      title="Recovery applied"
      description={`Option ${recovery.optionId} · by ${recovery.by} at ${clock(recovery.at)}`}
      actions={
        <>
          <Button variant="secondary" size="md" busy={undo.isPending} onClick={() => undo.mutate()}>
            Undo
          </Button>
          <Button asChild size="md">
            <Link to={`/dispatcher/live?date=${date}`}>Back to live operations</Link>
          </Button>
        </>
      }
    >
      <Banner title={recovery.notice.title}>{recovery.notice.body}</Banner>
      {undo.isError && (
        <Banner tone="danger" title="The recovery was not undone">
          {message(undo.error)}
        </Banner>
      )}
      <div className="lx-row lx-row--wide lx-row--applied">
        <section className="wp-card lx-acks" aria-label="Acknowledgements">
          <div className="lx-acks-head">
            <p>
              <strong className="lx-acks-count">{done}</strong>
              of {total} acknowledged
            </p>
            <Ring size={56} stroke={6} percent={share}>
              <span className="lx-ring">{share}%</span>
            </Ring>
          </div>
          <ul className="wp-list">
            {recovery.acknowledgements.map((person) => (
              <li key={`${person.name}-${person.role}`} className="lx-ack">
                <span className="lx-ack-who">
                  <strong>{person.name}</strong>
                  {person.role}
                </span>
                <Icon name={channelIcons[person.channel]} />
                {person.at ? clock(person.at) : '—'}
                {person.at ? (
                  <StatusBadge status="completed" label="Acknowledged" />
                ) : (
                  <StatusBadge status="pending" label="Waiting" />
                )}
              </li>
            ))}
          </ul>
        </section>
        <DarkCard title="Plan version" icon="branch">
          <p className="lx-version-jump">
            <span className="lx-version-from">{recovery.versionFrom}</span>
            <Icon name="arrow" size={20} className="lx-version-arrow" />
            <span className="wp-sr-only">to</span>
            <span className="lx-version-to">{recovery.versionTo}</span>
          </p>
          <p>{recovery.summary}</p>
        </DarkCard>
      </div>
      <div className="lx-row lx-row--applied">
        <section className="wp-card lx-changes" aria-label="What changed">
          <CardHead title="What changed" icon="layers" />
          {recovery.changes.map((change) => (
            <div key={`${change.vehicleId}-${change.tripNo}`} className="lx-change">
              <h3>
                <Icon name="truck" />
                {change.vehicleId} · T{change.tripNo}
              </h3>
              <ul className="wp-list">
                {change.stops.map((stop) => (
                  <li key={stop.label} data-change={stop.change}>
                    {stop.change === 'removed' && <Icon name="minus" size={12} />}
                    {stop.change === 'added' && <Icon name="plus" size={12} />}
                    <span className="wp-sr-only">
                      {stop.change === 'removed'
                        ? 'Removed:'
                        : stop.change === 'added'
                          ? 'Added:'
                          : ''}
                    </span>
                    {stop.label}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="wp-card lx-audit" aria-label="Audit">
          <CardHead title="Audit" icon="file">
            <Link
              className="d-link"
              to={`/dispatcher/orders?date=${date}&vehicle=${exception.vehicleId}`}
            >
              All
            </Link>
          </CardHead>
          <ol className="wp-list">
            {recovery.audit.map((entry) => (
              <li key={`${entry.title}-${entry.at}`}>
                <strong>{entry.title}</strong>
                {clock(entry.at)} · {entry.actor}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Page>
  );
}

function MinorException({ exception, save }: ViewProps) {
  const { date } = useDispatch();
  const preferred = exception.options.find((option) => option.recommended) ?? exception.options[0];
  const [chosen, setChosen] = useState(preferred?.id ?? '');
  const acknowledge = useMutation({
    mutationFn: () =>
      api(`/loading/issues/${exception.id}/ack`, loadingExceptionSchema, {
        method: 'POST',
        body: JSON.stringify({ resolution: chosen }),
      }),
    onSuccess: save,
  });
  const acknowledged = exception.status === 'acknowledged';
  return (
    <Page
      title={`Minor exception · ${trip(exception)}`}
      description={reported(exception)}
      actions={
        <>
          <Tag kind="risk">Does not block departure</Tag>
          <CallDock exception={exception} />
          {acknowledged ? (
            <Button asChild size="md">
              <Link to={`/dispatcher/live?date=${date}`}>Back to live operations</Link>
            </Button>
          ) : (
            <Button
              size="md"
              busy={acknowledge.isPending}
              disabled={!chosen}
              onClick={() => acknowledge.mutate()}
            >
              Acknowledge
            </Button>
          )}
        </>
      }
    >
      {acknowledged && (
        <Banner tone="success" title="Acknowledged">
          The loader can mark the load ready. The decision is in the audit log.
        </Banner>
      )}
      {acknowledge.isError && (
        <Banner tone="danger" title="Not acknowledged">
          {message(acknowledge.error)}
        </Banner>
      )}
      <div className="lx-row lx-row--wide">
        <Evidence exception={exception} />
        <DarkCard title="Departure" icon="truck">
          <strong className="lx-departure-label">{exception.departure.label}</strong>
          <p>{exception.departure.detail}</p>
        </DarkCard>
      </div>
      <div className="lx-row lx-row--three">
        <section className="wp-card lx-rule" aria-label="Why it does not block">
          <CardHead title="Why it does not block" icon="shield" />
          <Row
            icon="xoct"
            tone="danger"
            title="Chilled or high-value line short"
            detail="Blocks Ready until you decide"
          />
          <Row
            icon="alert"
            tone="warning"
            title="Any other line short or damaged"
            detail="Warns · needs your acknowledgement"
          />
          <p className="lx-verdict">
            <Icon name="check" size={14} className="lx-fact-ok" />
            {exception.ruleVerdict}
          </p>
        </section>
        <section className="wp-card lx-with" aria-label="Acknowledge with">
          <CardHead title="Acknowledge with" icon="bulb" />
          <div role="radiogroup" aria-label="How to resolve the exception">
            {exception.options.map((option) => (
              // biome-ignore lint/a11y/useSemanticElements: a card-sized choice; native radios cannot hold this layout
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={chosen === option.id}
                className="lx-choice"
                data-recommended={option.recommended || undefined}
                disabled={acknowledged}
                onClick={() => setChosen(option.id)}
              >
                {!option.recommended && (
                  <span className="wp-icon-well">
                    <Icon name="refresh" />
                  </span>
                )}
                <span className="lx-choice-text">
                  <strong>{option.title}</strong>
                  {option.detail}
                </span>
                {option.recommended && <Tag kind="recommended" />}
              </button>
            ))}
          </div>
        </section>
        <section className="wp-card lx-waiting" aria-label="Also waiting">
          <CardHead title="Also waiting">
            <StatusBadge status="pending" label={String(exception.waiting.length)} />
          </CardHead>
          {exception.waiting.length === 0 && (
            <p className="wp-muted">No other minor exceptions are waiting.</p>
          )}
          {exception.waiting.map((item) => (
            <Link key={item.id} to={`/dispatcher/live/exceptions/${item.id}?date=${date}`}>
              <Row icon="box" tone="warning" title={item.title} detail={item.detail}>
                <Icon name="cr" className="d-chevron" />
              </Row>
            </Link>
          ))}
        </section>
      </div>
    </Page>
  );
}
