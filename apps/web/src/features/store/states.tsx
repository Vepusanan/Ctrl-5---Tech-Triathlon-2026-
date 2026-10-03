import type { ReactNode } from 'react';
import { Button, LoadingLabel, Skeleton, SkeletonLines } from '../../components/waypoint';
import { Well } from './ui';

/** Prototype I05: the page could not load. Says what is safe, and offers one way forward. */
export function LoadError({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry: () => void;
}) {
  return (
    <section className="wp-card st-state" role="alert">
      <Well icon="wifioff" tone="danger" size={52} />
      <h2>{title}</h2>
      <p>{description}</p>
      <Button variant="secondary" size="md" onClick={onRetry}>
        Retry
      </Button>
    </section>
  );
}

/** A page with nothing to show yet: one icon, what is missing, and what brings it. */
export function Empty({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="wp-card st-state">
      <Well icon={icon} size={52} />
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </section>
  );
}

const lines = (
  <div className="st-skeleton-lines">
    <Skeleton shape="title" width="30%" />
    <SkeletonLines lines={2} />
  </div>
);

/** Prototype I02: the home grid with its cards empty, so nothing jumps when the data arrives. */
export function HomeSkeleton() {
  return (
    <>
      <LoadingLabel label="Loading your store…" />
      <div className="st-head" aria-hidden="true">
        <div className="st-skeleton-lines">
          <Skeleton shape="number" width={260} />
          <Skeleton width={220} />
        </div>
      </div>
      <div className="st-grid st-grid--hero" aria-hidden="true">
        <div className="wp-card st-tall">{lines}</div>
        <div className="wp-card st-tall">{lines}</div>
      </div>
      <div className="st-grid st-grid--three" aria-hidden="true">
        <div className="wp-card st-short" />
        <div className="wp-card st-short" />
        <div className="wp-card st-short" />
      </div>
    </>
  );
}

/** Every order screen is a title over a wide card and a narrow one (S03–S06). */
export function OrderSkeleton() {
  return (
    <>
      <LoadingLabel label="Loading this order…" />
      <div className="st-head" aria-hidden="true">
        <div className="st-skeleton-lines">
          <Skeleton shape="number" width={240} />
          <Skeleton width={320} />
        </div>
      </div>
      <div className="st-grid st-grid--hero" aria-hidden="true">
        <div className="wp-card st-tall">{lines}</div>
        <div className="wp-card st-tall">{lines}</div>
      </div>
      <div className="wp-card st-short" aria-hidden="true">
        {lines}
      </div>
    </>
  );
}
