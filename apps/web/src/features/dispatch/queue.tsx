import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  DataTable,
  ErrorState,
  LoadingState,
  MetricCard,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { message } from '../../lib/api';
import { useBoard } from './board';
import { Page, useDispatch } from './workspace';

export function PlanningQueuePage() {
  const { date } = useDispatch();
  const board = useBoard();
  const [brand, setBrand] = useState('all');
  const [temp, setTemp] = useState('all');
  const [district, setDistrict] = useState('all');
  const [prior, setPrior] = useState(false);
  const districts = useMemo(
    () => [...new Set(board.items.map((item) => item.outlet.district))].sort(),
    [board.items],
  );
  if (board.queue.isPending) return <LoadingState label="Loading the planning queue…" />;
  if (!board.queue.data)
    return (
      <ErrorState
        description={message(board.queue.error)}
        onRetry={() => void board.queue.refetch()}
      />
    );
  const rows = board.items.filter((item) => {
    if (brand !== 'all' && item.brand !== brand) return false;
    if (temp !== 'all' && item.temp !== temp) return false;
    if (district !== 'all' && item.outlet.district !== district) return false;
    if (prior && !item.deferredYesterday && !item.previousDeferral) return false;
    return true;
  });
  return (
    <Page
      title="Planning queue"
      description={`${date} · plan version ${board.version} · ${board.depotId}`}
      actions={
        <Button asChild>
          <Link to={`/dispatcher/allocate?date=${date}`}>Open allocation</Link>
        </Button>
      }
    >
      <div className="dispatch-queue-metrics">
        <MetricCard label="Orders in queue" value={board.items.length} />
        <MetricCard
          label="Unallocated"
          value={board.items.filter((item) => item.status === 'confirmed').length}
        />
        <MetricCard
          label="Chilled"
          value={board.items.filter((item) => item.temp === 'chilled').length}
        />
        <MetricCard
          label="Prior deferral"
          value={
            board.items.filter((item) => item.deferredYesterday || item.previousDeferral).length
          }
        />
      </div>
      <Card className="dispatch-queue-table">
        <div className="dispatch-filters">
          <label>
            Brand
            <select value={brand} onChange={(event) => setBrand(event.target.value)}>
              <option value="all">All</option>
              <option>Fresh</option>
              <option>Style</option>
              <option>Tech</option>
            </select>
          </label>
          <label>
            Temperature
            <select value={temp} onChange={(event) => setTemp(event.target.value)}>
              <option value="all">All</option>
              <option value="chilled">Chilled</option>
              <option value="ambient">Dry</option>
            </select>
          </label>
          <label>
            District
            <select value={district} onChange={(event) => setDistrict(event.target.value)}>
              <option value="all">All</option>
              {districts.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="dispatch-check">
            <input
              type="checkbox"
              checked={prior}
              onChange={(event) => setPrior(event.target.checked)}
            />
            Prior deferral
          </label>
        </div>
        <DataTable
          caption="Orders waiting for planning"
          rows={rows}
          rowKey={(item) => item.id}
          columns={[
            {
              id: 'outlet',
              header: 'Outlet',
              cell: (item) => item.outletId,
              sortValue: (item) => item.outletId,
            },
            { id: 'brand', header: 'Brand', cell: (item) => item.brand },
            {
              id: 'temp',
              header: 'Temperature',
              cell: (item) => <Tag kind={item.temp === 'chilled' ? 'chilled' : 'ambient'} />,
            },
            { id: 'district', header: 'District', cell: (item) => item.outlet.district },
            {
              id: 'kg',
              header: 'kg',
              numeric: true,
              cell: (item) => item.weightKg,
              sortValue: (item) => item.weightKg,
            },
            {
              id: 'm3',
              header: 'm³',
              numeric: true,
              cell: (item) => item.volumeM3,
              sortValue: (item) => item.volumeM3,
            },
            {
              id: 'access',
              header: 'Access',
              cell: (item) => (
                <>
                  {item.outlet.parkingConstraint === 'van_only' && <Tag kind="van-only" />}
                  {item.outlet.mallWindow && <Tag kind="mall-window" />}
                </>
              ),
            },
            {
              id: 'defer',
              header: 'Deferral',
              cell: (item) =>
                item.previousDeferral || item.deferredYesterday ? (
                  <StatusBadge
                    status="deferred"
                    label={
                      item.deferredYesterday
                        ? 'Skipped yesterday'
                        : item.previousDeferral?.reasonCode
                    }
                  />
                ) : (
                  '—'
                ),
            },
            { id: 'status', header: 'Status', cell: (item) => item.status },
          ]}
        />
      </Card>
    </Page>
  );
}
