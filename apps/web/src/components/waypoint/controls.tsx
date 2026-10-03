import * as Dialog from '@radix-ui/react-dialog';
import {
  type ButtonHTMLAttributes,
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type RefObject,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { MaskIcon } from './primitives';
import './controls.css';

/** Figma icon component by name (`public/waypoint/icons`), tinted with the current text colour. */
export function Icon({
  name,
  size = 16,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return <MaskIcon src={`/waypoint/icons/${name}.svg`} size={size} className={className} />;
}

/** Closes a popover on outside press or Escape. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}

/**
 * Round icon button: 36px well by default, or `bare` for a 16px icon with a 24px hit area.
 * `label` is required because the button has no text.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  {
    icon: string;
    label: string;
    active?: boolean | undefined;
    bare?: boolean | undefined;
  } & ButtonHTMLAttributes<HTMLButtonElement>
>(function IconButton({ icon, label, active, bare, className = '', ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${bare ? 'wp-icon-bare' : 'wp-icon-well'} wp-icon-action ${className}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
});

/** Icon button that opens a small panel below it. */
export function Popover({
  icon,
  label,
  active,
  bare,
  align = 'end',
  children,
}: {
  icon: string;
  label: string;
  active?: boolean;
  bare?: boolean;
  align?: 'start' | 'end';
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  return (
    <div className="wp-popover" ref={ref}>
      <IconButton
        icon={icon}
        label={label}
        active={active || open}
        bare={bare}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="wp-popover-panel" data-align={align}>
          {children}
        </div>
      )}
    </div>
  );
}

/** Text tabs for switching views of the same data. Active tab is ink with a 2px underline. */
export function Tabs<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <div className="wp-tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  label,
  hideLabel,
  indeterminate = false,
  ...props
}: {
  label: string;
  hideLabel?: boolean;
  /** Some, but not all, of the items this box stands for are selected. */
  indeterminate?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <label className="wp-check">
      <input ref={input} type="checkbox" {...props} />
      <span className={hideLabel ? 'wp-sr-only' : undefined}>{label}</span>
    </label>
  );
}

export function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="wp-switch"
      aria-label={label}
      aria-checked={checked}
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

/** Pill chip. `count` shows a bubble before the label; `dashed` is the "add" style. */
export function Chip({
  children,
  icon,
  count,
  accent,
  dashed,
  active,
  onClick,
  onRemove,
}: {
  children: ReactNode;
  icon?: string;
  count?: number | undefined;
  /** Orange count bubble, for views that need attention. */
  accent?: boolean | undefined;
  dashed?: boolean;
  active?: boolean | undefined;
  onClick?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
}) {
  const body = (
    <>
      {count !== undefined && (
        <span className="wp-chip-count" data-accent={accent || undefined}>
          {count}
        </span>
      )}
      {icon && <Icon name={icon} size={dashed ? 14 : 12} />}
      {children}
    </>
  );
  if (!onClick) {
    return (
      <span className="wp-chip" data-dashed={dashed || undefined}>
        {body}
        {onRemove && (
          <button type="button" aria-label="Remove" onClick={onRemove}>
            <Icon name="x" size={12} />
          </button>
        )}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="wp-chip"
      data-dashed={dashed || undefined}
      aria-pressed={active}
      onClick={onClick}
    >
      {body}
    </button>
  );
}

function FieldShell({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
}) {
  const note = error ?? hint;
  return (
    <div className="wp-field" data-invalid={error ? true : undefined}>
      <label htmlFor={id}>{label}</label>
      {children}
      {note && (
        <p id={`${id}-note`} role={error ? 'alert' : undefined}>
          {note}
        </p>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  /** States the cause and the fix. Validate on field exit, not on each keystroke. */
  error?: string | undefined;
  hint?: string | undefined;
}

export function Field({
  label,
  error,
  hint,
  locked,
  ...props
}: FieldProps & {
  /** Read-only value the user may see but not change. Shows a lock, and stays readable. */
  locked?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const input = (
    <input
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={(error ?? hint) ? `${id}-note` : undefined}
      {...props}
      {...(locked ? { readOnly: true } : {})}
    />
  );
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      {locked ? (
        <span className="wp-field-locked">
          {input}
          <Icon name="lock" size={14} />
        </span>
      ) : (
        input
      )}
    </FieldShell>
  );
}

export function TextArea({
  label,
  error,
  hint,
  ...props
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        aria-describedby={(error ?? hint) ? `${id}-note` : undefined}
        {...props}
      />
    </FieldShell>
  );
}

/** Right-hand drawer (`side`) or centred modal over the page, with focus trapping from Radix. */
export function Overlay({
  open,
  onClose,
  title,
  icon,
  variant = 'drawer',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: string;
  variant?: 'drawer' | 'modal';
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="wp-overlay" />
        <Dialog.Content className={`wp-sheet wp-sheet--${variant}`} aria-describedby={undefined}>
          <div className="wp-sheet-head">
            {icon && (
              <span className="wp-icon-well">
                <Icon name={icon} />
              </span>
            )}
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton icon="x" label="Close" />
            </Dialog.Close>
          </div>
          <div className="wp-sheet-body">{children}</div>
          {footer && <div className="wp-sheet-foot">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Deferral history strip: one dot per past run, oldest first. Orange means deferred.
 * The label gives the same information in words.
 */
export function HistoryDots({ runs }: { runs: readonly boolean[] }) {
  const deferred = runs.filter(Boolean).length;
  return (
    <span
      className="wp-dots"
      role="img"
      aria-label={`Deferred in ${deferred} of the last ${runs.length} runs`}
    >
      {runs.map((value, index) => (
        // The strip is positional, so the index is the identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional strip
        <i key={index} data-on={value || undefined} />
      ))}
    </span>
  );
}
