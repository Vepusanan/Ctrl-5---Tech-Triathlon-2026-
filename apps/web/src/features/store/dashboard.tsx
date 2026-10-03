import type { StoreOrder } from '@waypoint/shared';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  MetricCard,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import {
  CutoffCard,
  day,
  greeting,
  orderName,
  PageHeader,
  StoreIcon,
  StoreLink,
  statusForOrder,
  tempName,
} from './shared';
import { useStore } from './workspace';

export function StoreDashboard({ search }: { search: string }) {
  const { data, user, now } = useStore();
  const first = user.name.split(' ')[0] ?? user.name;
  const next = data.nextServiceDate;
  const focusDate =
    next ??
    data.orders.find((item) => item.order.status !== 'cancelled')?.order.requestedDate ??
    null;
  const upcoming = data.orders.filter(
    (item) => item.order.requestedDate === focusDate && item.order.status !== 'cancelled',
  );
  const locked =
    data.eligibleServiceDate !== null && next !== null && data.eligibleServiceDate !== next;
  const last = data.orders.find((item) =>
    ['delivered', 'receipt_confirmed', 'failed'].includes(item.order.status),
  );
  const openIssues = data.issues.filter((issue) => issue.status === 'open');
  const pending = data.orders.filter((item) => item.order.status === 'delivered');
  const temps =
    data.outlet.brand === 'Fresh' ? (['chilled', 'ambient'] as const) : (['ambient'] as const);
  const placeHref = newOrderHref(data.eligibleServiceDate);
  return (
    <>
      <PageHeader
        title={`${greeting(now)}, ${first}`}
        description={`Waypoint ${data.outlet.brand} · ${data.outlet.district} · ${data.outlet.id}`}
      >
        <StoreLink to={placeHref}>{locked ? 'Order the next run' : 'Place order'}</StoreLink>
      </PageHeader>
      <div className="store-home-top">
        <Card>
          <div className="wp-between">
            <h2>{next ? `Orders for ${day(next)}` : `Latest orders · ${day(focusDate)}`}</h2>
            <Badge tone={upcoming.length ? 'info' : 'neutral'}>
              {upcoming.length ? `${upcoming.length} on this day` : 'Not submitted'}
            </Badge>
          </div>
          <div className="store-grid-two">
            {temps.map((temp) => {
              const item = upcoming.find((order) => order.order.temp === temp);
              return (
                <div key={temp} className="store-nested">
                  <div className="wp-between">
                    <h3>
                      <StoreIcon name={temp === 'chilled' ? 'Snow' : 'Box'} source="2047-5268" />{' '}
                      {tempName(temp)}
                    </h3>
                    <Tag kind={temp === 'chilled' ? 'chilled' : 'ambient'} />
                  </div>
                  <p className="store-big-value">
                    {item ? item.order.units : 'None'}
                    <small>
                      {item
                        ? `${item.order.weightKg} kg · ${item.order.volumeM3} m³`
                        : 'No order submitted'}
                    </small>
                  </p>
                  {item ? (
                    <>
                      <StatusBadge status={statusForOrder[item.order.status]} />
                      <StoreLink secondary to={orderPath(item)}>
                        View order
                      </StoreLink>
                    </>
                  ) : next ? (
                    <StoreLink secondary to={newOrderHref(data.eligibleServiceDate, temp)}>
                      Add {tempName(temp).toLowerCase()} order
                    </StoreLink>
                  ) : (
                    <p className="wp-muted">No {tempName(temp).toLowerCase()} order on this day.</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="wp-muted">
            {data.outlet.brand === 'Fresh'
              ? 'Chilled and dry are separate orders. Both go on the same run.'
              : 'Orders are submitted for your assigned outlet only.'}
            {data.outlet.window.open &&
              ` Delivery window ${data.outlet.window.open}–${data.outlet.window.close}.`}
          </p>
          {data.outlet.parkingConstraint === 'van_only' && <Tag kind="van-only" />}
          {data.outlet.mallWindow && <Tag kind="mall-window" />}
        </Card>
        <CutoffCard cutoff={data.cutoffAt} now={now} nextDate={data.eligibleServiceDate} />
      </div>
      {locked && data.eligibleServiceDate && (
        <div className="store-notice" role="status">
          <div>
            <strong>This run is locked</strong>
            <p>
              The 16:00 cutoff has passed for {day(next)}. New orders are held for{' '}
              {day(data.eligibleServiceDate)}.
            </p>
          </div>
          <StoreLink to={placeHref}>Place that order</StoreLink>
        </div>
      )}
      <div className="store-metrics store-home-metrics">
        <MetricCard
          label="Awaiting your receipt confirmation"
          value={pending.length}
          icon={<StoreIcon name="Boxc" source="2047-5268" />}
        >
          {pending.length > 0 && (
            <StoreLink secondary to="/store/receipts">
              Confirm deliveries
            </StoreLink>
          )}
        </MetricCard>
        <Card>
          <h2>Last delivery</h2>
          {last ? (
            <>
              <p>
                {day(last.order.requestedDate)} · {tempName(last.order.temp)} · {last.order.units}{' '}
                units
              </p>
              <StatusBadge
                status={
                  last.order.status === 'failed' ? 'failed' : statusForOrder[last.order.status]
                }
              />
              <StoreLink secondary to={orderPath(last)}>
                View delivery
              </StoreLink>
            </>
          ) : (
            <p className="wp-muted">No completed deliveries yet.</p>
          )}
        </Card>
        <MetricCard
          label="Open delivery issues"
          value={openIssues.length}
          icon={<StoreIcon name="Alert" source="2047-5268" />}
        >
          <StoreLink secondary to="/store/issues">
            View issues
          </StoreLink>
        </MetricCard>
      </div>
      <OrdersList items={data.orders} search={search} title="Your orders" />
    </>
  );
}

export function StoreOrders({
  search,
  receiptsOnly = false,
}: {
  search: string;
  receiptsOnly?: boolean;
}) {
  const { data } = useStore();
  const items = receiptsOnly
    ? data.orders.filter((item) =>
        ['delivered', 'receipt_confirmed', 'failed'].includes(item.order.status),
      )
    : data.orders;
  return (
    <>
      <PageHeader
        title={receiptsOnly ? 'Receipts' : 'Your deliveries'}
        description={`${data.outlet.id} · ${data.outlet.district}`}
      />
      <OrdersList
        items={items}
        search={search}
        title={receiptsOnly ? 'Delivered orders' : 'Orders and delivery status'}
        receiptsOnly={receiptsOnly}
      />
    </>
  );
}

function orderPath(item: StoreOrder) {
  if (item.order.status === 'deferred') return `/store/orders/${item.order.id}/deferred`;
  if (item.order.status === 'delivered') return `/store/orders/${item.order.id}/receipt`;
  if (item.order.status === 'receipt_confirmed') return `/store/orders/${item.order.id}/receipt`;
  return `/store/orders/${item.order.id}`;
}

function OrdersList({
  items,
  search,
  title,
  receiptsOnly = false,
}: {
  items: StoreOrder[];
  search: string;
  title: string;
  receiptsOnly?: boolean;
}) {
  const filtered = items.filter(({ order }) =>
    `${order.id} ${orderName(order.id)} ${order.status} ${tempName(order.temp)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const target = (item: StoreOrder) =>
    receiptsOnly && item.order.status === 'delivered'
      ? `/store/orders/${item.order.id}/receipt`
      : orderPath(item);
  if (!filtered.length) {
    return (
      <EmptyState
        title={search ? 'No matching orders' : 'No orders yet'}
        description={
          search
            ? 'Try a different order number or status.'
            : 'Your submitted orders will appear here.'
        }
      />
    );
  }
  return (
    <section className="store-order-list" aria-label={title}>
      <div className="store-desktop-table">
        <DataTable
          caption={title}
          rows={filtered}
          rowKey={(item) => item.order.id}
          columns={[
            {
              id: 'order',
              header: 'Order',
              cell: (item) => <Link to={target(item)}>{orderName(item.order.id)}</Link>,
            },
            {
              id: 'date',
              header: 'Requested date',
              cell: (item) => day(item.order.requestedDate),
              sortValue: (item) => item.order.requestedDate,
            },
            {
              id: 'temp',
              header: 'Type',
              cell: (item) => <Tag kind={item.order.temp === 'chilled' ? 'chilled' : 'ambient'} />,
            },
            {
              id: 'weight',
              header: 'Weight kg',
              cell: (item) => item.order.weightKg,
              numeric: true,
              sortValue: (item) => item.order.weightKg,
            },
            {
              id: 'status',
              header: 'Status',
              cell: (item) => <StatusBadge status={statusForOrder[item.order.status]} />,
            },
            {
              id: 'action',
              header: 'Details',
              cell: (item) => (
                <StoreLink secondary to={target(item)}>
                  {receiptsOnly && item.order.status === 'delivered' ? 'Confirm receipt' : 'View'}
                </StoreLink>
              ),
            },
          ]}
        />
      </div>
      <div className="store-mobile-orders">
        {filtered.map((item) => (
          <Card key={item.order.id}>
            <div className="wp-between">
              <h2>{orderName(item.order.id)}</h2>
              <StatusBadge status={statusForOrder[item.order.status]} />
            </div>
            <p>
              {day(item.order.requestedDate)} · {tempName(item.order.temp)} · {item.order.weightKg}{' '}
              kg
            </p>
            <StoreLink secondary to={target(item)}>
              {receiptsOnly && item.order.status === 'delivered' ? 'Confirm receipt' : 'View order'}
            </StoreLink>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function StoreIssues() {
  const { data } = useStore();
  return (
    <>
      <PageHeader
        title="Delivery issues"
        description={`${data.outlet.id} · Reports sent to planning`}
      />
      {!data.issues.length ? (
        <EmptyState
          title="No delivery issues"
          description="Reports for your outlet will appear here."
        />
      ) : (
        <div className="store-grid-two">
          {data.issues.map((issue) => (
            <Card key={issue.id}>
              <div className="wp-between">
                <h2>{orderName(issue.orderId)}</h2>
                <StatusBadge status={issue.status === 'open' ? 'issue-open' : 'resolved'} />
              </div>
              <strong>{issueLabel(issue.type)}</strong>
              <p className="store-prewrap">{issue.note ?? 'No additional note.'}</p>
              <small>Reported {day(issue.createdAt)}</small>
              <Button asChild variant="secondary">
                <Link to={`/store/orders/${issue.orderId}/issue`}>View order report</Link>
              </Button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function newOrderHref(date: string | null, temp?: string) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (temp) params.set('temp', temp);
  const query = params.toString();
  return query ? `/store/orders/new?${query}` : '/store/orders/new';
}

export function issueLabel(type: string) {
  if (type === 'missing') return 'Short delivery';
  if (type === 'incorrect') return 'Wrong item';
  return 'Damaged goods';
}
