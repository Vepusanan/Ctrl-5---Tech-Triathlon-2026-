import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import SignaturePad from 'signature_pad';
import { Button } from '../../components/waypoint';

export interface SignatureHandle {
  isEmpty: () => boolean;
  toPng: () => Promise<Blob>;
}

// Finger signature for proof of delivery. The canvas takes touch input without scrolling the
// page (touch-action: none in driver.css) and exports a PNG for the multipart upload.
export const SignatureField = forwardRef<
  SignatureHandle,
  { onEmptyChange: (empty: boolean) => void; disabled: boolean }
>(function SignatureField({ onEmptyChange, disabled }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pad = useRef<SignaturePad | null>(null);
  // The constructor already listens, so only a change of `disabled` toggles the listeners.
  const listening = useRef(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const ink = getComputedStyle(element).getPropertyValue('--color-text-primary').trim();
    const instance = new SignaturePad(element, {
      minWidth: 1,
      maxWidth: 2.8,
      ...(ink ? { penColor: ink } : {}),
    });
    pad.current = instance;
    listening.current = true;
    // Match the bitmap to the displayed size and pixel ratio, keeping strokes already drawn.
    const resize = () => {
      const strokes = instance.toData();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      element.width = element.offsetWidth * ratio;
      element.height = element.offsetHeight * ratio;
      element.getContext('2d')?.scale(ratio, ratio);
      instance.clear();
      instance.fromData(strokes);
    };
    resize();
    const ended = () => onEmptyChange(instance.isEmpty());
    instance.addEventListener('endStroke', ended);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      instance.removeEventListener('endStroke', ended);
      instance.off();
      pad.current = null;
    };
  }, [onEmptyChange]);

  useEffect(() => {
    const instance = pad.current;
    if (!instance || listening.current === !disabled) return;
    if (disabled) instance.off();
    else instance.on();
    listening.current = !disabled;
  }, [disabled]);

  useImperativeHandle(ref, () => ({
    isEmpty: () => pad.current?.isEmpty() ?? true,
    toPng: () =>
      new Promise<Blob>((resolve, reject) => {
        const element = canvas.current;
        if (!element) {
          reject(new Error('The signature pad is not ready.'));
          return;
        }
        element.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('The signature could not be saved.'))),
          'image/png',
        );
      }),
  }));

  return (
    <div className="driver-signature">
      <canvas
        ref={canvas}
        aria-label="Signature. Sign with your finger inside the box."
        role="img"
      />
      <Button
        variant="tertiary"
        className="driver-signature-clear"
        aria-label="Clear signature"
        disabled={disabled}
        onClick={() => {
          pad.current?.clear();
          onEmptyChange(true);
        }}
      >
        Clear
      </Button>
    </div>
  );
});
