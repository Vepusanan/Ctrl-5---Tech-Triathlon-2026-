import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { StoreOrderDetail } from '@waypoint/shared';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Button, Dropdown } from '../../components/waypoint';
import { message } from '../../lib/api';
import { Confirmation, Held } from './confirmation';
import { orderName, storeApi } from './data';
import { DeferralNotice } from './deferral';
import { IssueReport } from './issue-report';
import { Receipt } from './receipt';
import { Empty, LoadError, OrderSkeleton } from './states';
import { Tracking } from './tracking';
import { day, orderStatusLabel, PageHead, tempName } from './ui';
import { storeKey, useStore } from './workspace';

/** What every order screen receives. `onChanged` re-reads the order and the workspace. */
export interface OrderScreenProps {
  detail: StoreOrderDetail;
  onChanged: () => Promise<void>;
}

const DELIVERY_ORDER = [
  'dispatched',
  'loading',
  'allocated',
  'delivered',
  'failed',
  'deferred',
  'confirmed',
  'submitted',
  'receipt_confirmed',
];
const RECEIPT_ORDER = ['delivered', 'receipt_confirmed', 'failed'];

export function StoreOrderPage() {
  const { id, '*': rest = '' } = useParams();
  if (!id) return <Navigate to="/store" replace />;
  return <OrderScreens id={id} screen={rest.split('/')[0] ?? ''} />;
}

function OrderScreens({ id, screen }: { id: string; screen: string }) {
  const { user, refresh } = useStore();
  const client = useQueryClient();
  const key = [...storeKey(user.id), 'order', id];
  const detail = useQuery({ queryKey: key, queryFn: () => storeApi.order(id) });
  if (detail.isPending) return <OrderSkeleton />;
  if (!detail.data) {
    return (
      <LoadError
        title="Couldn’t load this order"
        description={message(detail.error)}
        onRetry={() => void detail.refetch()}
      />
    );
  }
  const props: OrderScreenProps = {
    detail: detail.data,
    onChanged: async () => {
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: key })]);
    },
  };
  if (screen === 'confirmation') return <Confirmation {...props} />;
  if (screen === 'held') return <Held {...props} />;
  if (screen === 'receipt') return <Receipt {...props} />;
  if (screen === 'issue') return <IssueReport {...props} />;
  if (screen === 'deferred' || detail.data.order.status === 'deferred') {
    return <DeferralNotice {...props} />;
  }
  return <Tracking {...props} />;
}

/** "Deliveries" in the sidebar opens the delivery that matters most right now (frame S04). */
export function CurrentDelivery() {
  const { data } = useStore();
  const current = [...data.orders]
    .filter((item) => DELIVERY_ORDER.includes(item.order.status))
    .sort(
      (a, b) => DELIVERY_ORDER.indexOf(a.order.status) - DELIVERY_ORDER.indexOf(b.order.status),
    )[0];
  if (!current) {
    return (
      <>
        <PageHead title="Deliveries" sub={`${data.outlet.id} · ${data.outlet.district}`} />
        <Empty
          icon="truck"
          title="No deliveries yet"
          description="Once you place an order, its expected arrival appears here."
        >
          <Button asChild size="md">
            <Link to="/store/orders/new">Place order</Link>
          </Button>
        </Empty>
      </>
    );
  }
  return <OrderScreens id={current.order.id} screen="" />;
}

/** "Receipts" opens the delivery waiting for a receipt, or else the last one confirmed (S06). */
export function CurrentReceipt() {
  const { data } = useStore();
  const current = [...data.orders]
    .filter((item) => RECEIPT_ORDER.includes(item.order.status))
    .sort(
      (a, b) => RECEIPT_ORDER.indexOf(a.order.status) - RECEIPT_ORDER.indexOf(b.order.status),
    )[0];
  if (!current) {
    return (
      <>
        <PageHead title="Receipts" sub={`${data.outlet.id} · ${data.outlet.district}`} />
        <Empty
          icon="boxc"
          title="Nothing to confirm yet"
          description="A delivery appears here as soon as the driver records it."
        />
      </>
    );
  }
  return <OrderScreens id={current.order.id} screen="receipt" />;
}

/**
 * Added control, not in Figma: the frames show one delivery, so this lets the store open its
 * other orders from the same page. It shows only when there is more than one to choose from.
 */
export function OrderPicker({ current, receipts }: { current: string; receipts?: boolean }) {
  const { data } = useStore();
  const navigate = useNavigate();
  const orders = data.orders.filter((item) =>
    (receipts ? RECEIPT_ORDER : DELIVERY_ORDER).includes(item.order.status),
  );
  if (orders.length < 2 || !orders.some((item) => item.order.id === current)) return null;
  return (
    <Dropdown
      label="Order"
      value={current}
      options={orders.map(({ order }) => ({
        value: order.id,
        label: `${day(order.requestedDate)} · ${tempName(order.temp)} · ${orderStatusLabel(order.status)} · ${orderName(order.id)}`,
      }))}
      onChange={(id) => navigate(`/store/orders/${id}${receipts ? '/receipt' : ''}`)}
    />
  );
}
