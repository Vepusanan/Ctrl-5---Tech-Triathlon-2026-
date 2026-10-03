/** D09 · Live operations and its exception states (Figma 2041:2931, 2042:3151, 2042:3683, 2106:12161). */
import type { z } from 'zod';
import type { LiveLane, LoadingException, liveBoardSchema } from '../../contracts';
import { dispatcher } from './guard';
import { fail, type MockRoute } from './router';

type Board = z.infer<typeof liveBoardSchema>;

/** Live scenario clock: Sat 26 Sep 2026, 04:23, ticking from page load. */
const LIVE_START = Date.parse('2026-09-26T04:23:00+05:30');
const opened = Date.now();
const stamp = (ms: number) =>
  `${new Date(ms + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 19)}+05:30`;
const liveNow = () => stamp(LIVE_START + (Date.now() - opened));
const at = (time: string) => `2026-09-26T${time}:00+05:30`;

type Lane = Omit<LiveLane, 'exceptionId'>;
const summaries: Record<string, string> = {
  'VEH051-1': 'Loading stopped · 3 cartons short',
  'VEH007-1': 'Departed 04:21 · 6 stops',
  'VEH033-1': 'Departed 04:21 · 5 stops',
  'VEH014-1': 'Loading at dock 3',
  'VEH049-1': 'Loading at dock 4',
  'VEH052-1': 'Loads from 05:00',
  'VEH007-2': 'Second trip · leaves 09:24',
  'VEH012-1': 'Loading at dock 1',
};

const lane = (
  vehicleId: string,
  tripNo: 1 | 2,
  status: LiveLane['status'],
  planned: [string, string],
  recordedEnd: string | null,
  predicted: [string, string] | null,
  lateRisk = false,
): Lane => ({
  tripId: `${vehicleId}-${tripNo}`,
  vehicleId,
  tripNo,
  depot: 'Kandy hub',
  status,
  planned: { start: at(planned[0]), end: at(planned[1]) },
  recorded: recordedEnd ? { start: at('03:00'), end: at(recordedEnd) } : null,
  predicted: predicted && { start: at(predicted[0]), end: at(predicted[1]) },
  lateRisk,
  staleSince: null,
  summary: summaries[`${vehicleId}-${tripNo}`] ?? null,
});

// Lanes as drawn in D09 (03:00–11:00 axis).
const lanes: Lane[] = [
  lane('VEH051', 1, 'loading_exception', ['03:20', '08:35'], '04:12', null),
  lane('VEH007', 1, 'departed', ['03:48', '07:24'], '04:21', ['04:21', '07:48'], false),
  lane('VEH033', 1, 'departed', ['03:57', '07:57'], '04:21', null),
  lane('VEH014', 1, 'loading', ['04:07', '07:39'], '04:17', ['04:17', '08:07'], true),
  lane('VEH049', 1, 'loading', ['04:27', '09:06'], '04:07', null),
  lane('VEH052', 1, 'not_started', ['05:00', '08:36'], null, null),
  lane('VEH007', 2, 'allocated', ['09:24', '10:51'], null, null),
  {
    ...lane('VEH012', 1, 'loading', ['04:10', '08:20'], '04:02', null),
    depot: 'Peliyagoda DC',
  },
];

const shortfall = (): LoadingException => ({
  id: 'EX-051',
  vehicleId: 'VEH051',
  tripNo: 1,
  blocking: true,
  status: 'open',
  reportedAt: at('04:21'),
  place: 'Kandy dock 2',
  plannedDeparture: at('04:40'),
  dock: { name: 'dock 2', phone: '+94812200102' },
  evidence: {
    item: 'Set yoghurt 1 kg',
    destination: 'WF-F071 Gampola · stop 1',
    quantity: -3,
    unit: 'cartons',
    temp: 'chilled',
    reporter: 'Kasun Perera',
    reporterPlace: 'dock 2',
    note: 'Cold room stock short at pick.',
    hasPhoto: true,
  },
  timeline: [
    { at: at('04:05'), label: 'Loading started', state: 'done' },
    { at: at('04:21'), label: 'Shortfall reported', state: 'issue' },
    { at: liveNow(), label: 'You are here', state: 'now' },
    { at: at('04:40'), label: 'Planned departure', state: 'upcoming' },
    { at: at('05:30'), label: 'Gampola window opens', state: 'upcoming' },
  ],
  departure: { label: 'Blocked', detail: '04:40 · blocked — a chilled line is short' },
  ruleVerdict: 'This case: chilled yoghurt → blocks Ready until you decide',
  options: [
    {
      id: 'A',
      title: 'Leave on time · top-up 3 cartons on VEH007 T2',
      detail: null,
      recommended: true,
      facts: [
        { tone: 'ok', text: 'Departs 04:40' },
        { tone: 'ok', text: 'Store told before arrival' },
        { tone: 'warn', text: 'VEH007 T2 reefer 88→92%' },
      ],
      effects: [
        { key: 'reefer', label: 'Reefer T2', percent: 92, markerPercent: 88 },
        { key: 'weight', label: 'Weight T2', percent: 66 },
      ],
      reasons: [
        'It is the only option that keeps both the 04:40 departure and the full order.',
        'VEH007 trip 2 passes Gampola and has reefer space for 3 cartons.',
        'The store is told about the split before the first delivery arrives.',
      ],
    },
    {
      id: 'B',
      title: 'Wait for restock · depart 05:10',
      detail: null,
      recommended: false,
      facts: [
        { tone: 'warn', text: 'Departure +30 min' },
        { tone: 'predict', text: 'Late risk on 4 stops ↑' },
      ],
      effects: [],
      reasons: [],
    },
    {
      id: 'C',
      title: 'Deliver short · raise store issue',
      detail: null,
      recommended: false,
      facts: [
        { tone: 'ok', text: 'On time' },
        { tone: 'bad', text: '3 cartons not delivered today' },
      ],
      effects: [],
      reasons: [],
    },
  ],
  waiting: [],
  recovery: null,
});

const minor = (
  id: string,
  vehicleId: string,
  item: string,
  place: string,
  time: string,
): LoadingException => ({
  id,
  vehicleId,
  tripNo: 1,
  blocking: false,
  status: 'open',
  reportedAt: at(time),
  place,
  plannedDeparture: at('05:10'),
  dock: { name: place.replace('Kandy ', ''), phone: '+94812200104' },
  evidence: {
    item,
    destination: 'for WS-S112 Kandy City Centre · stop 1',
    quantity: -1,
    unit: 'tray',
    temp: 'ambient',
    reporter: 'Nimal Silva',
    reporterPlace: `${place.replace('Kandy ', '')} · crushed at pick`,
    note: 'Crushed at pick.',
    hasPhoto: true,
  },
  timeline: [],
  departure: { label: 'On time', detail: '05:10 · not blocked — ambient, not high value' },
  ruleVerdict: 'This case: ambient bread → warning only',
  options: [
    {
      id: 'deliver-short',
      title: 'Deliver short · tell the store',
      detail: 'Credit raised automatically · no route change',
      recommended: true,
      facts: [],
      effects: [],
      reasons: [],
    },
    {
      id: 'replace',
      title: 'Replace from dock stock',
      detail: 'Only if a tray is free before 05:10',
      recommended: false,
      facts: [],
      effects: [],
      reasons: [],
    },
  ],
  waiting: [],
  recovery: null,
});

let exceptions: LoadingException[] = [
  shortfall(),
  minor('EX-033', 'VEH033', 'Bread tray damaged', 'Kandy dock 4', '04:56'),
  {
    ...minor('EX-049', 'VEH049', 'Label missing', 'Kandy dock 3', '04:51'),
    evidence: {
      ...minor('EX-049', 'VEH049', 'Label missing', 'Kandy dock 3', '04:51').evidence,
      unit: 'case',
      reporterPlace: 'dock 3 · label lost at pick',
    },
    ruleVerdict: 'This case: ambient case → warning only',
  },
  {
    ...minor('EX-014', 'VEH014', '1 case dented', 'Peliyagoda dock 1', '04:48'),
    ruleVerdict: 'This case: ambient case → warning only',
  },
];

const waitingTitles: Record<string, [string, string]> = {
  'EX-033': ['VEH033 · bread tray damaged', 'Dock 4 · 04:56'],
  'EX-049': ['VEH049 · label missing', 'Dock 3 · 04:51'],
  'EX-014': ['VEH014 · 1 case dented', 'Peliyagoda · 04:48'],
};

const isOpen = (item: LoadingException) => item.status === 'open';

function detail(id: string): LoadingException | null {
  const found = exceptions.find((item) => item.id === id);
  if (!found) return null;
  return {
    ...found,
    timeline: found.timeline.map((step) =>
      step.state === 'now' ? { ...step, at: liveNow() } : step,
    ),
    waiting: exceptions
      .filter((item) => isOpen(item) && !item.blocking && item.id !== id)
      .map((item) => {
        const [title, where] = waitingTitles[item.id] ?? [item.evidence.item, item.place];
        return { id: item.id, title, detail: where };
      }),
  };
}

function board(): Board {
  const open = exceptions.filter(isOpen);
  const blocking = open.filter((item) => item.blocking);
  const first = blocking[0] ?? open[0];
  return {
    now: liveNow(),
    axis: { start: at('03:00'), end: at('11:00') },
    trips: 58,
    departed: 12,
    loading: 46,
    loadingExceptions: blocking.length,
    lateRisk: 6,
    stops: {
      delivered: 0,
      total: 146,
      deltaPercent: null,
      note: 'No stop is due yet. The first window opens at 05:30.',
    },
    lanes: lanes.map((item) => {
      const exception = blocking.find(
        (entry) => entry.vehicleId === item.vehicleId && entry.tripNo === item.tripNo,
      );
      return {
        ...item,
        // An acknowledged exception returns the trip to loading (SYSTEM_DESIGN §5.3).
        status: item.status === 'loading_exception' && !exception ? 'loading' : item.status,
        exceptionId: exception?.id ?? null,
      };
    }),
    alert: first
      ? {
          exceptionId: first.id,
          blocking: first.blocking,
          title: first.blocking
            ? `Shortfall · ${first.vehicleId} T${first.tripNo}`
            : `Minor exception · ${first.vehicleId} T${first.tripNo}`,
          facts: first.blocking
            ? ['3 cartons', 'Chilled', 'WF-F071 Gampola', 'Dock 2 · 04:21']
            : [first.evidence.item, 'Ambient', first.place],
          note: first.blocking ? 'Departure 04:40 blocked' : 'Does not block departure',
        }
      : null,
    anomaly: {
      where: 'Dock 4',
      title: 'Loading on dock 4 is 2× slower than usual',
      bars: [
        { label: 'Sat', value: 14 },
        { label: 'Sat', value: 16 },
        { label: 'Sat', value: 13 },
        { label: 'Sat', value: 15 },
        { label: 'Sat', value: 17 },
        { label: 'Sat', value: 15 },
        { label: 'Now', value: 31 },
      ],
      evidence: 'Evidence: 31 min per trip vs 15 min median of last 6 Saturdays.',
    },
  };
}

const update = (id: string, change: (item: LoadingException) => LoadingException) => {
  exceptions = exceptions.map((item) => (item.id === id ? change(item) : item));
};
const missing = () => fail(404, 'NOT_FOUND', 'That loading exception no longer exists.');

export const liveRoutes: MockRoute[] = [
  ['GET', '/dashboard/live', dispatcher(board)],
  ['GET', '/loading/issues/:id', dispatcher(({ params }) => detail(params.id ?? '') ?? missing())],
  [
    'POST',
    '/loading/issues/:id/recovery',
    dispatcher(({ params, body }) => {
      const id = params.id ?? '';
      const current = exceptions.find((item) => item.id === id);
      const optionId = (body as { optionId?: string } | null)?.optionId;
      if (!current) return missing();
      if (!current.options.some((option) => option.id === optionId)) {
        return fail(400, 'VALIDATION_ERROR', 'Choose one of the listed recovery options.');
      }
      const now = LIVE_START + (Date.now() - opened);
      update(id, (item) => ({
        ...item,
        status: 'recovered',
        recovery: {
          optionId: optionId ?? 'A',
          by: 'N. Fernando',
          at: stamp(now),
          versionFrom: 'v4',
          versionTo: 'v4.1',
          summary: '2 trips changed · 1 stop added · nothing deleted',
          notice: {
            title: 'Plan v4.1 sent to the 2 affected trips',
            body: 'Only VEH051 T1 and VEH007 T2 changed. Everyone else stays on v4.',
          },
          acknowledgements: [
            {
              name: 'Suresh K.',
              role: 'Driver · VEH051',
              channel: 'phone',
              at: stamp(now + 60_000),
            },
            {
              name: 'Kasun P.',
              role: 'Loader · dock 2',
              channel: 'tablet',
              at: stamp(now + 120_000),
            },
            {
              name: 'WF-F071 Gampola',
              role: 'Store · shortage notice',
              channel: 'store',
              at: stamp(now),
            },
            { name: 'Ruwan D.', role: 'Loader · dock 5 (VEH007)', channel: 'tablet', at: null },
          ],
          changes: [
            {
              vehicleId: 'VEH051',
              tripNo: 1,
              stops: [
                { label: '1 Gampola', change: 'none' },
                { label: '3 cartons yoghurt', change: 'removed' },
                { label: '2 Pilimatalawa', change: 'none' },
                { label: '3 Peradeniya', change: 'none' },
              ],
            },
            {
              vehicleId: 'VEH007',
              tripNo: 2,
              stops: [
                { label: '1 Katugastota', change: 'none' },
                { label: '2 Akurana', change: 'none' },
                { label: '3 Gampola top-up · 09:50', change: 'added' },
              ],
            },
          ],
          audit: [
            { title: `Applied option ${optionId} · v4.1`, at: stamp(now), actor: 'N. Fernando' },
            { title: 'Shortage notice → WF-F071', at: stamp(now), actor: 'System' },
            { title: 'Acknowledged route v4.1', at: stamp(now + 60_000), actor: 'S. Kumar' },
            { title: 'Acknowledged load change', at: stamp(now + 120_000), actor: 'K. Perera' },
          ],
        },
      }));
      return detail(id);
    }),
  ],
  [
    'DELETE',
    '/loading/issues/:id/recovery',
    dispatcher(({ params }) => {
      const id = params.id ?? '';
      if (!exceptions.some((item) => item.id === id)) return missing();
      update(id, (item) => ({ ...item, status: 'open', recovery: null }));
      return detail(id);
    }),
  ],
  [
    'POST',
    '/loading/issues/:id/ack',
    dispatcher(({ params }) => {
      const id = params.id ?? '';
      if (!exceptions.some((item) => item.id === id)) return missing();
      update(id, (item) => ({ ...item, status: 'acknowledged' }));
      return detail(id);
    }),
  ],
];
