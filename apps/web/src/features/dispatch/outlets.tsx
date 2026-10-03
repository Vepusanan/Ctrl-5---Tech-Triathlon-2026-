// D13 · Outlets (Figma 2106:7017): the outlet directory with one outlet's profile beside it.
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Button,
  Chip,
  Dropdown,
  EmptyState,
  ErrorState,
  HistoryDots,
  Icon,
  IconButton,
  LoadingState,
  type Status,
  StatusBadge,
  Tag,
  type TagKind,
} from '../../components/waypoint';
import { downloadCsv } from '../../lib/csv';
import { clock, weekDay } from '../../lib/format';
import {
  type OutletAccess,
  type OutletDelivery,
  type OutletRow,
  outletDirectorySchema,
  outletProfileSchema,
} from './contracts';
import { api, message } from './data/client';
import { Bars, CardHead } from './ui';
import { Page, useDispatch } from './workspace';
import './outlets.css';

const PAGE_SIZE = 50;
const brands: OutletRow['brand'][] = ['Fresh', 'Style', 'Tech'];
const accessTags: Record<OutletAccess, { kind: TagKind; label: string }> = {
  van_only: { kind: 'van-only', label: 'Van only' },
  mall_window: { kind: 'mall-window', label: 'Mall window' },
  tight_window: { kind: 'tight-window', label: 'Tight window' },
  high_value: { kind: 'high-value', label: 'High value' },
};
const accessFilters: { value: OutletAccess; icon: string }[] = [
  { value: 'van_only', icon: 'truck' },
  { value: 'mall_window', icon: 'clock' },
];
const noteIcons = { access: 'truck', receiving: 'clock', storage: 'snow' } as const;
const deliveryStatus: Record<OutletDelivery['state'], Status> = {
  unallocated: 'confirmed',
  allocated: 'allocated',
  deferred: 'deferred',
  departed: 'departed',
  arrived: 'arrived',
  received: 'receipt-confirmed',
};

const list = (value: string | null) => value?.split(',').filter(Boolean) ?? [];

function Arrivals({ arrivals }: { arrivals: readonly boolean[] }) {
  const onTime = arrivals.filter(Boolean).length;
  return (
    <span
      className="ou-arrivals"
      role="img"
      aria-label={`On time for ${onTime} of the last ${arrivals.length} arrivals`}
    >
      {arrivals.map((value, index) => (
        // The strip is positional, so the index is the identity.
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional strip
        <i key={index} data-late={!value || undefined} />
      ))}
    </span>
  );
}

function OutletProfile({ code }: { code: string }) {
  const { date } = useDispatch();
  const profile = useQuery({
    queryKey: ['outlets', code, 'profile', date],
    queryFn: () =>
      api(`/outlets/${encodeURIComponent(code)}/profile?date=${date}`, outletProfileSchema),
  });
  if (profile.isPending) return <LoadingState label="Loading the outlet…" rows={5} />;
  if (profile.isError) {
    return (
      <ErrorState description={message(profile.error)} onRetry={() => void profile.refetch()} />
    );
  }

  const outlet = profile.data;
  const next = outlet.nextDelivery;
  return (
    <>
      <section className="wp-card ou-profile" aria-label="Outlet profile">
        <div className="ou-profile-head">
          <span className="wp-icon-well ou-profile-icon">
            <Icon name="store" size={20} />
          </span>
          <div className="ou-profile-name">
            <h2>{outlet.name}</h2>
            <p>{[outlet.code, outlet.depot, outlet.manager].filter(Boolean).join(' · ')}</p>
          </div>
          {outlet.phone && (
            <a
              className="wp-icon-well wp-icon-action"
              href={`tel:${outlet.phone.replaceAll(' ', '')}`}
              aria-label={`Call ${outlet.manager ?? 'the outlet'} on ${outlet.phone}`}
              title={`Call ${outlet.phone}`}
            >
              <Icon name="phone" />
            </a>
          )}
        </div>
        <dl className="ou-tiles">
          <div>
            <dt>on time</dt>
            <dd>
              {outlet.onTime.arrivals}/{outlet.onTime.of}
            </dd>
          </div>
          <div>
            <dt>deferred · {outlet.deferred.runs} runs</dt>
            <dd>{outlet.deferred.count}</dd>
          </div>
          <div>
            <dt>avg unload</dt>
            <dd>{outlet.avgUnloadMinutes === null ? '–' : `${outlet.avgUnloadMinutes} m`}</dd>
          </div>
        </dl>
        {outlet.notes.length > 0 && (
          <ul className="wp-list ou-notes">
            {outlet.notes.map((note) => (
              <li key={note.kind}>
                <Icon name={noteIcons[note.kind]} />
                {note.text}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="wp-card ou-volume" aria-label="Weekly volume">
        <CardHead title={`${outlet.volume.weekday} volume · kg`} icon="chart" />
        {outlet.volume.weeks.length === 0 ? (
          <p className="wp-muted">No deliveries have been recorded for this outlet yet.</p>
        ) : (
          <Bars
            label={`Kilograms delivered on each ${outlet.volume.weekday}`}
            height={150}
            bars={outlet.volume.weeks.map((week) => ({ name: week.week, value: week.kg }))}
          />
        )}
        {outlet.volume.insight && <p className="ou-insight">{outlet.volume.insight}</p>}
      </section>
      <section className="wp-card wp-inverse ou-next" aria-label="Next delivery">
        <span className="wp-icon-well">
          <Icon name="truck" />
        </span>
        {next ? (
          <>
            <div className="ou-next-text">
              <Link
                className="ou-next-title"
                to={`/dispatcher/orders?date=${date}&order=${next.orderId}`}
              >
                {weekDay(next.serviceDate)} ·{' '}
                {next.arrivedAt
                  ? `${clock(next.arrivedAt)} arrived`
                  : `due ${outlet.window.open}–${outlet.window.close}`}
              </Link>
              <span>
                {[
                  next.vehicleId && `${next.vehicleId}${next.tripNo ? ` T${next.tripNo}` : ''}`,
                  next.state === 'unallocated' && 'No vehicle yet',
                  next.note,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            <StatusBadge
              status={deliveryStatus[next.state]}
              label={next.state === 'unallocated' ? 'Unallocated' : undefined}
            />
          </>
        ) : (
          <div className="ou-next-text">
            <strong className="ou-next-title">No delivery in this run</strong>
            <span>This outlet has no confirmed order for {weekDay(date)}.</span>
          </div>
        )}
      </section>
    </>
  );
}

export function OutletsPage() {
  const { date } = useDispatch();
  const [params, setParams] = useSearchParams();
  const [limit, setLimit] = useState(PAGE_SIZE);
  const depot = params.get('depot') ?? '';
  const term = params.get('q') ?? '';
  const brand = params.get('brand') ?? '';
  const access = params.get('access') ?? '';
  const [searching, setSearching] = useState(term !== '');
  const directory = useQuery({
    queryKey: ['outlets', 'directory', depot, term, brand, access, limit],
    queryFn: () =>
      api(
        `/outlets/directory?${new URLSearchParams({ depot, q: term, brand, access, limit: String(limit) })}`,
        outletDirectorySchema,
      ),
    placeholderData: (previous) => previous,
  });

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
    if (key !== 'outlet') setLimit(PAGE_SIZE);
  };
  /** Adds the value to a comma-separated filter, or removes it when it is already there. */
  const toggle = (key: 'brand' | 'access', value: string) => {
    const current = list(params.get(key));
    set(
      key,
      (current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
        .sort()
        .join(','),
    );
  };

  if (directory.isPending) {
    return (
      <Page title="Outlets">
        <LoadingState label="Loading outlets…" rows={7} />
      </Page>
    );
  }
  if (directory.isError) {
    return (
      <Page title="Outlets">
        <ErrorState
          description={message(directory.error)}
          onRetry={() => void directory.refetch()}
        />
      </Page>
    );
  }

  const { items, matching, total, depots } = directory.data;
  const selected = params.get('outlet') ?? items[0]?.code;
  const filtered = Boolean(depot || term || brand || access);
  const exportCsv = () =>
    downloadCsv(
      `outlets-${date}.csv`,
      [
        'Code',
        'Outlet',
        'Brand',
        'Depot',
        'Window',
        'Access',
        'On time (last 8)',
        'Deferred (last 4)',
      ],
      items.map((outlet) => [
        outlet.code,
        outlet.name,
        outlet.brand,
        outlet.depot,
        `${outlet.window.open}-${outlet.window.close}`,
        outlet.access ? accessTags[outlet.access].label : '',
        outlet.arrivals.filter(Boolean).length,
        outlet.deferrals.filter(Boolean).length,
      ]),
    );

  return (
    <Page
      title="Outlets"
      description={`${total} outlets · ${depots.join(' + ')}`}
      actions={
        <>
          <Dropdown
            label="Depot"
            value={depot}
            options={[
              { value: '', label: 'All depots' },
              ...depots.map((name) => ({ value: name, label: name })),
            ]}
            onChange={(value) => set('depot', value)}
          />
          <Button variant="secondary" size="md" disabled={items.length === 0} onClick={exportCsv}>
            Export
          </Button>
        </>
      }
    >
      <div className="ou-row">
        <section className="wp-card ou-directory" aria-label="Outlet directory">
          <div className="ou-toolbar">
            <IconButton
              icon="search"
              label={searching ? 'Close the search' : 'Search outlets'}
              aria-expanded={searching}
              onClick={() => {
                if (searching && term) set('q', '');
                setSearching(!searching);
              }}
            />
            {searching && (
              <form
                className="ou-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  set('q', String(new FormData(event.currentTarget).get('q') ?? '').trim());
                }}
              >
                <label className="wp-sr-only" htmlFor="ou-q">
                  Outlet name or code
                </label>
                <input
                  // biome-ignore lint/a11y/noAutofocus: the field opens because the user asked to search
                  autoFocus
                  key={term}
                  id="ou-q"
                  name="q"
                  type="search"
                  defaultValue={term}
                  placeholder="Outlet name or code"
                />
              </form>
            )}
            {brands.map((name) => (
              <Chip
                key={name}
                active={list(brand).includes(name)}
                onClick={() => toggle('brand', name)}
              >
                <i className="ou-brand" data-brand={name} />
                {name}
              </Chip>
            ))}
            {accessFilters.map((filter) => (
              <Chip
                key={filter.value}
                active={list(access).includes(filter.value)}
                onClick={() => toggle('access', filter.value)}
              >
                <Icon name={filter.icon} size={14} />
                {accessTags[filter.value].label}
              </Chip>
            ))}
          </div>
          {items.length === 0 ? (
            <EmptyState
              title="No outlet matches"
              description="Try another name or code, or remove a filter."
              action={
                filtered && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => {
                      setSearching(false);
                      setParams({ date });
                    }}
                  >
                    Clear the filters
                  </Button>
                )
              }
            />
          ) : (
            <div className="ou-scroll">
              <table className="wp-rows ou-table">
                <caption className="wp-sr-only">
                  Outlets with their receiving window, access rule and recent history
                </caption>
                <thead>
                  <tr>
                    <th className="ou-col-brand">
                      <span className="wp-sr-only">Brand</span>
                    </th>
                    <th className="ou-col-outlet">Outlet</th>
                    <th className="ou-col-window">Window</th>
                    <th className="ou-col-access">Access</th>
                    <th className="ou-col-arrivals">Last 8 arrivals</th>
                    <th>Deferrals</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((outlet) => (
                    <tr key={outlet.code} data-selected={outlet.code === selected || undefined}>
                      <td>
                        <i className="ou-brand" data-brand={outlet.brand} />
                        <span className="wp-sr-only">{outlet.brand}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="ou-pick"
                          aria-current={outlet.code === selected || undefined}
                          onClick={() => set('outlet', outlet.code)}
                        >
                          <strong>{outlet.name}</strong>
                          <small>{outlet.code}</small>
                        </button>
                      </td>
                      <td>
                        {outlet.window.open}–{outlet.window.close}
                      </td>
                      <td>{outlet.access && <Tag kind={accessTags[outlet.access].kind} />}</td>
                      <td>
                        <Arrivals arrivals={outlet.arrivals} />
                      </td>
                      <td>
                        <HistoryDots runs={outlet.deferrals} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {matching > items.length && (
            <p className="ou-more">
              Showing {items.length} of {matching}
              <Button
                variant="tertiary"
                size="md"
                busy={directory.isFetching}
                onClick={() => setLimit(limit + PAGE_SIZE)}
              >
                Show {Math.min(PAGE_SIZE, matching - items.length)} more
              </Button>
            </p>
          )}
        </section>
        <div className="ou-stack">
          {selected ? (
            <OutletProfile key={selected} code={selected} />
          ) : (
            <section className="wp-card">
              <p className="wp-muted">Pick an outlet to see its profile.</p>
            </section>
          )}
        </div>
      </div>
    </Page>
  );
}
