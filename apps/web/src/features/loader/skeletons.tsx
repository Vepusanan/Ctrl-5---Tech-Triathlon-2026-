import type { ReactNode } from 'react';
import { LoadingLabel, Skeleton } from '../../components/waypoint';
import { ActionBar, PageHead } from './shell';

// Figma G02 "Assigned loads — loading": the main card stays white with bars where its text will
// be, and the side column is plain subtle blocks. The same `loader-*` layout classes as the loaded
// screens are used, so the cards do not move when the data arrives.

/** L01 body. The heading above it is real and says "refreshing…". */
export function AssignedSkeleton() {
  return (
    <>
      <LoadingLabel label="Loading assigned loads…" />
      <div className="loader-split loader-skeleton" aria-hidden="true">
        <section className="loader-card loader-next">
          <Skeleton shape="title" width={260} />
          <Skeleton shape="title" width={180} />
          <Skeleton shape="block" width={520} height={72} />
          <Skeleton shape="block" width={520} height={72} />
          <Skeleton shape="title" width={320} />
        </section>
        <div className="loader-side">
          <Skeleton shape="block" height={200} />
          <Skeleton shape="block" height={96} />
          <Skeleton shape="block" height={96} />
        </div>
      </div>
    </>
  );
}

/** L02 in the G02 style: stop column as blocks, the stop's lines as the white card. */
export function LoadPlanSkeleton({ title }: { title?: ReactNode }) {
  return (
    <>
      <LoadingLabel label="Loading the load plan…" />
      <PageHead
        leading={<Skeleton shape="circle" width={52} />}
        title={title ?? <Skeleton shape="title" width={220} height={24} />}
        detail={<Skeleton width={300} />}
      />
      <div className="loader-columns loader-skeleton" aria-hidden="true">
        <div className="loader-stops">
          <Skeleton shape="block" height={96} />
          <Skeleton shape="block" height={96} />
          <Skeleton shape="block" height={96} />
          <Skeleton shape="block" height={96} />
        </div>
        <section className="loader-card loader-lines">
          <Skeleton shape="title" width={260} />
          <Skeleton shape="block" height={72} />
          <Skeleton shape="title" width={320} />
        </section>
      </div>
      <ActionBar status={<Skeleton width={200} />}>
        <Skeleton shape="button" width={168} height={52} />
      </ActionBar>
    </>
  );
}
