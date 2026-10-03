// D04a · Trip record · view only (Figma 2106:11293): what the loader and driver recorded.
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { z } from 'zod';
import {
  Avatar,
  Banner,
  Button,
  ErrorState,
  Field,
  Icon,
  LoadingState,
  Overlay,
  SegmentedControl,
  type Status,
  StatusBadge,
  TextArea,
  type Tone,
} from '../../components/waypoint';
import { clock } from '../../lib/format';
import {
  correctionRequestSchema,
  correctionResponseSchema,
  type RecordStopState,
  tripRecordSchema,
} from './contracts';
import { api, message } from './data/client';
import { DarkCard } from './ui';
import { Page, useDispatch } from './workspace';
import './record.css';

type TripRecord = z.infer<typeof tripRecordSchema>;
type Target = z.infer<typeof correctionRequestSchema>['target'];

const stopLooks: Record<RecordStopState, { status: Status; icon: string; tone?: Tone }> = {
  'not-started': { status: 'not-started', icon: 'clock' },
  arrived: { status: 'arrived', icon: 'pin', tone: 'info' },
  delivered: { status: 'delivered', icon: 'check', tone: 'success' },
  failed: { status: 'failed', icon: 'xoct', tone: 'danger' },
  conflict: { status: 'conflict', icon: 'alert', tone: 'danger' },
};
const targets = [
  { value: 'loading', label: 'Loading' },
  { value: 'delivery', label: 'Delivery' },
] as const;

/** Signature or photo tile. It shows whether proof exists; the proof itself is in the audit. */
function Proof({ kind, captured }: { kind: 'Signature' | 'Photo'; captured: boolean }) {
  return (
    <span
      className="tr-proof"
      role="img"
      aria-label={captured ? `${kind} captured` : `No ${kind.toLowerCase()} yet`}
      data-captured={captured || undefined}
    >
      <Icon name={captured ? (kind === 'Signature' ? 'pen' : 'camera') : 'minus'} />
    </span>
  );
}

function Correction({
  record,
  path,
  onClose,
  onSent,
}: {
  record: TripRecord;
  path: string;
  onClose: () => void;
  onSent: (owner: string) => void;
}) {
  const [target, setTarget] = useState<Target>('loading');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();
  const owner = target === 'loading' ? record.loading.loader : record.delivery.driver;
  const send = useMutation({
    mutationFn: () =>
      api(`${path}/corrections`, correctionResponseSchema, {
        method: 'POST',
        body: JSON.stringify(correctionRequestSchema.parse({ target, note })),
      }),
    onSuccess: (data) => onSent(data.sentTo),
  });
  const submit = () => {
    if (!note.trim()) setError('Say what is wrong, so the owner knows what to fix.');
    else send.mutate();
  };
  return (
    <Overlay
      variant="modal"
      open
      onClose={onClose}
      title="Request a correction"
      icon="pen"
      footer={
        <>
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button size="md" busy={send.isPending} onClick={submit}>
            Send request
          </Button>
        </>
      }
    >
      <p className="tr-confirm">
        You cannot change this record. The request goes to {owner ?? 'the depot supervisor'} and is
        written to the audit log.
      </p>
      <SegmentedControl
        label="Which record"
        value={target}
        options={targets}
        onChange={setTarget}
      />
      <TextArea
        label="What needs correcting"
        value={note}
        maxLength={500}
        error={error}
        hint="For example: stop 2 shows 8 cartons but plan v5 says 6."
        onChange={(event) => {
          setNote(event.target.value);
          setError(undefined);
        }}
      />
      {send.isError && (
        <Banner tone="danger" title="The request was not sent">
          {message(send.error)}
        </Banner>
      )}
    </Overlay>
  );
}

export function TripRecordPage() {
  const { vehicleId = '', tripNo = '' } = useParams();
  const { date } = useDispatch();
  const [asking, setAsking] = useState(false);
  const [sentTo, setSentTo] = useState<string>();
  const path = `/planning/runs/${date}/vehicles/${vehicleId}/trips/${tripNo}/record`;
  const record = useQuery({
    queryKey: ['planning', date, 'record', vehicleId, tripNo],
    queryFn: () => api(path, tripRecordSchema),
    // Loaders and drivers keep recording while this page is open.
    refetchInterval: 30_000,
  });

  const title = `${vehicleId} · Trip ${tripNo} record`;
  if (record.isPending) {
    return (
      <Page title={title}>
        <LoadingState label="Loading the trip record…" rows={5} />
      </Page>
    );
  }
  if (record.isError) {
    return (
      <Page title="Trip record">
        <ErrorState description={message(record.error)} onRetry={() => void record.refetch()} />
      </Page>
    );
  }

  const { loading, delivery, owners } = record.data;
  const visited = delivery.stops.filter((stop) => stop.state !== 'not-started').length;
  const finished = delivery.stops.filter((stop) =>
    ['delivered', 'failed', 'conflict'].includes(stop.state),
  ).length;
  return (
    <Page
      title={title}
      description={`Loading by ${loading.loader ?? 'no one yet'} · delivery by ${delivery.driver ?? 'no one yet'}`}
      actions={
        <>
          <span className="wp-chip tr-viewonly">
            <Icon name="lock" size={14} />
            View only
          </span>
          <Button variant="secondary" size="md" onClick={() => setAsking(true)}>
            Request a correction
          </Button>
        </>
      }
    >
      {sentTo && (
        <Banner tone="success" title="Correction requested">
          Sent to {sentTo}. The request is in the audit log.
        </Banner>
      )}
      <div className="tr-row">
        <section className="wp-card tr-card" aria-label="Loading record">
          <div className="tr-head">
            <h2 className="d-title">Loading</h2>
            {loading.loader && <Avatar name={loading.loader} size={28} />}
            <span className="tr-owner">
              {[loading.loader ?? 'No loader assigned yet', loading.dock]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <StatusBadge
              status={loading.state}
              label={
                loading.state === 'ready' && loading.readyAt
                  ? `Ready ${clock(loading.readyAt)}`
                  : undefined
              }
            />
          </div>
          <div className="tr-scroll">
            <table className="wp-rows tr-table">
              <caption className="wp-sr-only">
                Cartons planned and loaded for each stop. Read only.
              </caption>
              <thead>
                <tr>
                  <th className="tr-col-stop">Stop</th>
                  <th className="tr-col-num wp-num">Planned</th>
                  <th className="tr-col-num wp-num">Loaded</th>
                  <th className="tr-col-exception">Exception</th>
                  <th>
                    <span className="wp-sr-only">Access</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading.stops.map((stop) => (
                  <tr key={stop.seq}>
                    <td>
                      <strong>
                        {stop.seq} · {stop.outlet.name}
                      </strong>
                      <small>{stop.outlet.code}</small>
                    </td>
                    <td className="wp-num">{stop.planned}</td>
                    <td className="wp-num">{stop.loaded ?? '–'}</td>
                    <td>
                      {stop.exception && (
                        <StatusBadge status="loading-exception" label={stop.exception} />
                      )}
                    </td>
                    <td>
                      <Icon name="lock" size={14} className="tr-lock" />
                      <span className="wp-sr-only">Read only</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <DarkCard title="Who owns this record" icon="lock">
          <ul className="wp-list tr-owners">
            {owners.map((owner) => (
              <li key={owner.name} data-you={owner.you || undefined}>
                <Avatar name={owner.name} size={32} />
                <span className="tr-owner-text">
                  <strong>{owner.you ? 'You' : owner.name}</strong>
                  {owner.role} · {owner.permission}
                </span>
                {owner.events === null ? (
                  <span aria-hidden="true">—</span>
                ) : (
                  <span>
                    {owner.events} {owner.events === 1 ? 'event' : 'events'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </DarkCard>
      </div>
      <section className="wp-card tr-card tr-delivery" aria-label="Delivery record">
        <div className="tr-head">
          <h2 className="d-title">Delivery</h2>
          {delivery.driver && <Avatar name={delivery.driver} size={28} />}
          <span className="tr-owner">
            {delivery.driver ?? 'No driver assigned yet'} · {vehicleId}
          </span>
          {delivery.stops.length > 0 && (
            <StatusBadge
              status={
                visited === 0
                  ? 'not-started'
                  : finished === delivery.stops.length
                    ? 'completed'
                    : 'in-progress'
              }
              label={visited === 0 ? undefined : `${finished} of ${delivery.stops.length}`}
            />
          )}
        </div>
        <ol className="wp-list tr-stops">
          {delivery.stops.map((stop) => {
            const look = stopLooks[stop.state];
            return (
              <li key={stop.seq}>
                <div className="tr-stop-head">
                  <span className="tr-seq">{stop.seq}</span>
                  <strong>{stop.outletName}</strong>
                  <StatusBadge status={look.status} />
                </div>
                <p className="tr-stop-note">
                  <span className={`wp-icon-well tr-well ${look.tone ? `tone-${look.tone}` : ''}`}>
                    <Icon name={look.icon} />
                  </span>
                  {stop.note}
                </p>
                <div className="tr-proofs">
                  <Proof kind="Signature" captured={stop.signature} />
                  <Proof kind="Photo" captured={stop.photo} />
                </div>
              </li>
            );
          })}
        </ol>
        {delivery.fields.length > 0 && (
          <div className="tr-fields">
            {delivery.fields.map((field) => (
              <Field
                key={field.key}
                locked
                label={field.label}
                value={field.value}
                hint={field.hint ?? undefined}
              />
            ))}
          </div>
        )}
      </section>
      {asking && (
        <Correction
          record={record.data}
          path={path}
          onClose={() => setAsking(false)}
          onSent={(owner) => {
            setAsking(false);
            setSentTo(owner);
          }}
        />
      )}
    </Page>
  );
}
