import { type DeliveryStop, deliveryStopSchema, podSchema } from '@waypoint/shared';
import { useRef, useState } from 'react';
import { Button } from '../../components/waypoint';
import { api, HttpError } from '../../lib/api';
import { DriverIcon, ThumbZone } from './shell';
import { SignatureField, type SignatureHandle } from './signature';
import { useDriver } from './workspace';

// SYSTEM_DESIGN §9.4: each image must be under 2 MB. Photos above PHOTO_TARGET are re-encoded.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const PHOTO_TARGET = 900 * 1024;
const PHOTO_EDGE = 1600;
const RECIPIENT_MAX = 120;

/**
 * Uploads the proof of delivery and returns its id. An upload that the API already holds (a
 * 422, or a network failure after the server saved it) is recovered from GET /stops/:id rather
 * than asking the driver to sign again.
 */
export async function ensurePod(stopId: string, build: () => Promise<FormData>): Promise<string> {
  try {
    const pod = await api(`/stops/${stopId}/pod`, podSchema, {
      method: 'POST',
      body: await build(),
    });
    return pod.id;
  } catch (cause) {
    if (!(cause instanceof HttpError) || (cause.status !== 422 && cause.status !== 0)) throw cause;
    const stop = await api(`/stops/${stopId}`, deliveryStopSchema).catch(() => null);
    if (stop?.pod) return stop.pod.id;
    throw cause;
  }
}

// DR04. Recipient, signature and an optional photo, then the caller sends the delivered event.
// The form is display: contents so its thumb zone sits at the foot of the screen.
export function DeliveryForm({
  stop,
  busy,
  onSubmit,
}: {
  stop: DeliveryStop;
  busy: boolean;
  onSubmit: (build: () => Promise<FormData>) => void;
}) {
  const { stamp } = useDriver();
  const signature = useRef<SignatureHandle>(null);
  const [recipient, setRecipient] = useState('');
  const [unsigned, setUnsigned] = useState(true);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [preparing, setPreparing] = useState(false);
  const name = recipient.trim();
  const ready = name.length > 0 && name.length <= RECIPIENT_MAX && !unsigned && !preparing;

  return (
    <form
      className="driver-form"
      aria-label="Proof of delivery"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        onSubmit(async () => {
          const pad = signature.current;
          if (!pad || pad.isEmpty()) throw new Error('Ask the recipient to sign first.');
          const form = new FormData();
          form.append('recipientName', name);
          form.append('clientTime', stamp());
          form.append('signature', await pad.toPng(), 'signature.png');
          if (photo) form.append('photo', photo, 'photo.jpg');
          return form;
        });
      }}
    >
      <label className="driver-field">
        <span>Received by</span>
        <input
          autoComplete="off"
          maxLength={RECIPIENT_MAX}
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="Recipient's name"
        />
      </label>
      <div className="driver-tiles">
        <div
          className={`driver-tile driver-tile--signature${unsigned ? ' driver-tile--empty' : ''}`}
        >
          <SignatureField ref={signature} onEmptyChange={setUnsigned} disabled={busy} />
          <span className="driver-tile-caption" aria-hidden="true">
            {unsigned ? 'Sign here' : 'Signature'}
          </span>
        </div>
        <label className={`driver-tile driver-tile--photo${photo ? ' driver-tile--done' : ''}`}>
          <input
            className="wp-sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setPhoto(null);
              setPhotoNote('');
              if (!file) return;
              setPreparing(true);
              try {
                const prepared = await preparePhoto(file);
                setPhoto(prepared);
                setPhotoNote(`Photo ready · ${Math.round(prepared.size / 1024)} KB`);
              } catch (cause) {
                event.target.value = '';
                setPhotoNote(
                  cause instanceof Error ? cause.message : 'The photo could not be used.',
                );
              } finally {
                setPreparing(false);
              }
            }}
          />
          <span className="driver-round driver-round--small">
            <DriverIcon name={photo ? 'check-success' : 'plus'} size={20} />
          </span>
          <span className="driver-tile-caption">
            {preparing ? 'Preparing…' : photo ? 'Photo' : 'Photo (optional)'}
          </span>
        </label>
      </div>
      {photoNote && (
        <p className="driver-note" role="status">
          {photoNote}
        </p>
      )}
      <section className="driver-card driver-count" aria-label="Units">
        <div>
          <span>Units handed over</span>
          <strong>
            {stop.order.units} of {stop.order.units} planned
          </strong>
        </div>
      </section>
      {ready ? (
        <p className="driver-note">
          <DriverIcon name="check" size={16} />
          Proof complete
        </p>
      ) : (
        !busy && (
          <p className="driver-note">
            {name.length === 0
              ? `Enter who received the goods at ${stop.order.outletId}.`
              : unsigned
                ? 'Ask the recipient to sign in the box.'
                : 'Preparing the photo…'}
          </p>
        )
      )}
      <ThumbZone>
        <Button type="submit" className="driver-cta" busy={busy} disabled={!ready}>
          Complete delivery
        </Button>
      </ThumbZone>
    </form>
  );
}

// Re-encodes a camera photo as JPEG no larger than PHOTO_EDGE px so it stays under the API limit.
async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const plain = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (plain && file.size <= PHOTO_TARGET) return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('This photo format cannot be read. Try another photo.');
  const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
  }
  throw new Error('The photo is too large even after compression. Try another photo.');
}
