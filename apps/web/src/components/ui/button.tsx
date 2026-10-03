import { Slot } from '@radix-ui/react-slot';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

// shadcn composition pattern; all visual styles belong to Waypoint.
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  busy?: boolean;
  /** `md` is the 40px desktop button from the Figma page headers; `lg` keeps the 44px target. */
  size?: 'md' | 'lg';
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    asChild = false,
    variant = 'primary',
    size = 'lg',
    busy,
    disabled,
    className = '',
    children,
    ...props
  },
  ref,
) {
  const Component = asChild ? Slot : 'button';
  return (
    <Component
      ref={ref}
      type={asChild ? undefined : 'button'}
      className={`wp-button wp-button--${variant} wp-button--${size} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {children}
    </Component>
  );
});
