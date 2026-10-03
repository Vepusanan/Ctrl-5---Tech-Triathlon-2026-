import { useMutation } from '@tanstack/react-query';
import type { Issue, IssueType } from '@waypoint/shared';
import { useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Banner, Button } from '../../components/waypoint';
import { message } from '../../lib/api';
import { insights, orderName, storeApi } from './data';
import type { OrderScreenProps } from './order-page';
import { PageHead, plural, Stepper, StoreIcon, Strip, ThumbZone, time, usePhone, Well } from './ui';
import { useStore } from './workspace';

// The frames offer four reasons; the API has three types, so "Too warm" travels as damaged
// goods with the reason spelled out in the note.
const kinds = [
  { key: 'short', label: 'Short', word: 'short', icon: 'minus', type: 'missing' },
  { key: 'damaged', label: 'Damaged', word: 'damaged', icon: 'xoct', type: 'damaged' },
  { key: 'wrong', label: 'Wrong item', word: 'wrong', icon: 'refresh', type: 'incorrect' },
  { key: 'warm', label: 'Too warm', word: 'too warm', icon: 'snow', type: 'damaged' },
] as const satisfies readonly {
  key: string;
  label: string;
  word: string;
  icon: string;
  type: IssueType;
}[];
type Kind = (typeof kinds)[number]['key'];

/** S06a and prototype I24–I27: say what is wrong in four taps; planning decides the fix. */
export function IssueReport({ detail, onChanged }: OrderScreenProps) {
  const { writable } = useStore();
  const phone = usePhone();
  const [params] = useSearchParams();
  const { order, delivery } = detail;
  const lines = insights.receiptLines(detail);
  const line = lines.find((item) => item.product.sku === params.get('sku'));
  const handed = line ? line.handedOver : lines.reduce((sum, item) => sum + item.handedOver, 0);
  const [kind, setKind] = useState<Kind | null>(null);
  const [count, setCount] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<Issue | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const chosen = kinds.find((item) => item.key === kind);
  const base = `/store/orders/${order.id}`;
  // On the phone the receipt closes with the issue attached (S06a); on desktop it stays open.
  const closes =
    phone && order.status === 'delivered' && delivery?.status === 'delivered' && !delivery.receipt;
  const summary = chosen && count > 0 ? `${plural(count, 'carton')} ${chosen.word}` : null;
  const note = summary ? `${summary}${line ? ` · ${line.product.name}` : ''}` : null;

  const report = useMutation({
    mutationFn: async () => {
      if (!chosen || !note) throw new Error('Pick a category and a count.');
      const issue = await storeApi.reportIssue({ orderId: order.id, type: chosen.type, note });
      if (closes && delivery) await storeApi.confirmReceipt(delivery.stopId);
      return issue;
    },
    onSuccess: async (issue) => {
      setSent(issue);
      await onChanged();
    },
    onError: (cause) => setError(message(cause)),
  });
  const submit = () => {
    setError('');
    report.mutate();
  };
  const locked = sent !== null;
  const good = Math.max(0, handed - count);
  const result = `${good} good · ${count} ${chosen?.word ?? 'reported'}`;
  const context = [
    orderName(order.id),
    delivery?.vehicleId,
    delivery?.deliveredAt ? `delivered ${time(delivery.deliveredAt)}` : null,
    `${plural(handed, 'carton')} handed over`,
  ]
    .filter(Boolean)
    .join(' · ');

  const chips = (
    <fieldset className="st-kinds" disabled={locked}>
      <legend>What is wrong?</legend>
      {kinds.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={kind === item.key}
          onClick={() => setKind(item.key)}
        >
          <StoreIcon name={item.icon} />
          {item.label}
        </button>
      ))}
    </fieldset>
  );
  const howMany = (
    <div className="st-howmany">
      <p>
        <strong>{phone ? 'How many?' : 'How many cartons?'}</strong>
        {!phone && <small>Of {handed} handed over by the driver</small>}
      </p>
      <Stepper
        label="Cartons affected"
        size={phone ? 48 : 40}
        value={count}
        max={handed}
        disabled={locked}
        onChange={setCount}
      />
    </div>
  );
  // Gap: the issue endpoint takes no file, so the photo is chosen but not uploaded yet.
  const photoTile = (
    <>
      <button
        type="button"
        className="st-photo"
        data-set={photo ? true : undefined}
        disabled={locked}
        onClick={() => file.current?.click()}
      >
        <StoreIcon name={photo ? 'check' : 'camera'} size={20} />
        <small>{photo ?? 'Add photo · optional'}</small>
      </button>
      <input
        ref={file}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => setPhoto(event.target.files?.[0]?.name ?? null)}
      />
    </>
  );
  const feedback = (
    <>
      {error && (
        <Strip tone="danger" icon="xoct">
          {error}
        </Strip>
      )}
      {sent && (
        <Banner
          tone="success"
          title="Issue sent to planning"
          action={
            <Button asChild variant="secondary" size="md">
              <Link to="/store/issues">View issues</Link>
            </Button>
          }
        >
          {sent.note} · linked to {orderName(order.id)}. Dispatcher alerted {time(sent.createdAt)}.
        </Banner>
      )}
    </>
  );

  if (phone) {
    return (
      <>
        <PageHead
          title="Something’s wrong"
          eyebrow={line ? `${line.product.name} · ${plural(handed, 'carton')}` : context}
          back={`${base}/receipt`}
        />
        {feedback}
        <section className="wp-card st-issue-form">
          {chips}
          {howMany}
          <div className="st-photo-row">{photoTile}</div>
        </section>
        <section className="wp-card st-dark st-dark-row">
          <Well icon="boxc" tone="inverse" size={40} />
          <div>
            <strong>{summary ? result : 'Pick a category and a count'}</strong>
            <small>
              {photo ? 'Planning sees this with your photo' : 'Planning sees this on the order'}
            </small>
          </div>
        </section>
        <ThumbZone>
          {sent ? (
            <Button asChild className="st-btn-xl">
              <Link to="/store/issues">View issues</Link>
            </Button>
          ) : (
            <Button
              className="st-btn-xl"
              busy={report.isPending}
              disabled={!writable}
              onClick={submit}
            >
              {closes ? 'Confirm with 1 issue' : 'Send issue'}
            </Button>
          )}
        </ThumbZone>
      </>
    );
  }

  return (
    <>
      <PageHead title="Something’s wrong" sub={context}>
        <Link className="st-quiet-link" to={`${base}/receipt`}>
          {sent ? 'Back to receipt' : 'Cancel'}
        </Link>
        {!sent && (
          <Button size="md" busy={report.isPending} disabled={!writable} onClick={submit}>
            Submit issue
          </Button>
        )}
      </PageHead>
      {feedback}
      <div className="st-grid st-grid--issue">
        <section className="wp-card st-issue-form">
          {chips}
          {howMany}
          <div className="st-photo-row">{photoTile}</div>
        </section>
        <section className="wp-card st-dark st-sees">
          <h2>What planning will see</h2>
          <p className="st-display">{summary ? result : `${handed} good · 0 reported`}</p>
          <small>
            {note ? `“${note}.” · ${orderName(order.id)}` : 'Pick a category and a count'}
          </small>
          <ul>
            <li>
              <StoreIcon name="check" size={14} />
              Linked to this order and delivery
            </li>
            <li>
              <StoreIcon name="check" size={14} />
              Dispatcher gets a Receipt issue alert
            </li>
            <li>
              <StoreIcon name="check" size={14} />
              Planning decides the fix — nothing else for you to do
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
