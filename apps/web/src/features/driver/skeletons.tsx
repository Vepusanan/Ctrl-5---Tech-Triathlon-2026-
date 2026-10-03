import { LoadingLabel, Skeleton, SkeletonLines } from '../../components/waypoint';
import { DriverHeader, InverseCard } from './shell';

// Phone screens while the first response is on its way. They are built from the same
// `driver-*` classes as the loaded screens, so cards keep their place when the data arrives.

/** Header for a screen whose title comes from the data: the back button is real. */
export function HeaderSkeleton({ back, backLabel }: { back: string; backLabel: string }) {
  return (
    <DriverHeader
      back={back}
      backLabel={backLabel}
      eyebrow={<Skeleton width={128} height={12} />}
      title={<Skeleton shape="title" width={176} height={24} />}
    />
  );
}

function RowsCard({ rows }: { rows: number }) {
  return (
    <section className="driver-card driver-list-card" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => `row-${index.toString()}`).map((key) => (
        <div className="driver-row" key={key}>
          <Skeleton shape="circle" width={44} />
          <span className="driver-row-text">
            <Skeleton width="56%" />
            <Skeleton width="38%" height={12} />
          </span>
        </div>
      ))}
    </section>
  );
}

/** DR01: the hero trip card, then the list of other trips. */
export function TripsSkeleton() {
  return (
    <>
      <LoadingLabel label="Loading your trips…" />
      <section className="driver-card driver-hero" aria-hidden="true">
        <div className="driver-hero-head">
          <Skeleton shape="title" width={112} height={24} />
          <Skeleton width={84} height={24} />
        </div>
        <div className="driver-stats">
          {['stops', 'units', 'km'].map((key) => (
            <div key={key}>
              <Skeleton width={40} height={12} />
              <Skeleton shape="number" width={48} height={28} />
            </div>
          ))}
        </div>
        <Skeleton shape="field" height={32} />
      </section>
      <RowsCard rows={2} />
    </>
  );
}

/** DR02: progress card, then one card per stop. */
export function TripSkeleton() {
  return (
    <>
      <LoadingLabel label="Loading the trip…" />
      <HeaderSkeleton back="/driver" backLabel="My trips" />
      <section className="driver-card driver-progress" aria-hidden="true">
        <div className="driver-progress-head">
          <Skeleton shape="number" width={48} height={46} />
          <Skeleton width={120} />
        </div>
        <Skeleton height={8} />
      </section>
      <div className="driver-stops" aria-hidden="true">
        {['a', 'b', 'c'].map((key) => (
          <section className="driver-card driver-stop" key={key}>
            <div className="driver-stop-head">
              <Skeleton shape="circle" width={32} />
              <Skeleton width="45%" />
            </div>
            <Skeleton width="70%" height={12} />
          </section>
        ))}
      </div>
    </>
  );
}

/** DR03 and DR04: the dark time-window card, then the detail cards. */
export function StopSkeleton({ back, backLabel }: { back: string; backLabel: string }) {
  return (
    <>
      <LoadingLabel label="Loading the stop…" />
      <HeaderSkeleton back={back} backLabel={backLabel} />
      <InverseCard>
        <div className="driver-window-head" aria-hidden="true">
          <div>
            <Skeleton width={40} height={12} on="inverse" />
            <Skeleton shape="number" width={104} height={46} on="inverse" />
          </div>
          <Skeleton width={96} on="inverse" />
        </div>
        <Skeleton height={8} on="inverse" />
      </InverseCard>
      <RowsCard rows={3} />
    </>
  );
}

/** DR07: the count card, then the notice list. */
export function NoticesSkeleton() {
  return (
    <>
      <LoadingLabel label="Loading notices…" />
      <InverseCard>
        <div className="driver-count-hero" aria-hidden="true">
          <Skeleton shape="number" width={40} height={46} on="inverse" />
          <Skeleton width={140} on="inverse" />
        </div>
      </InverseCard>
      <RowsCard rows={3} />
    </>
  );
}

/** DR06: the route version card, then the list of changes. */
export function NoticeSkeleton() {
  return (
    <>
      <LoadingLabel label="Loading the notice…" />
      <HeaderSkeleton back="/driver/notices" backLabel="Notices" />
      <RouteSkeleton />
    </>
  );
}

/** The "Current route" card of a notice, while its trip is still loading. */
export function RouteSkeleton() {
  return (
    <section className="driver-card" aria-hidden="true">
      <Skeleton shape="title" width={128} />
      <SkeletonLines lines={3} />
    </section>
  );
}
