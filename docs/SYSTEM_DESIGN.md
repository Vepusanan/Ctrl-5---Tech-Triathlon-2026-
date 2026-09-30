# Waypoint — System Design

## 1. Overview

Waypoint is a responsive, offline-capable web platform that connects ordering, planning, loading, delivery and receipt for four roles: Store Manager, Dispatcher, Loader and Driver. It replaces spreadsheets, phone calls and printed run sheets with one shared operational record across the Peliyagoda distribution centre and the Kandy hub.

### 1.1 Goals

Every role completes its part of the workflow (order, plan, load, deliver, receive) in the browser, on the device it actually uses.

Every plan respects the hard constraints: weight, volume, refrigeration, van_only access, home depot, delivery and mall windows, weekly fuel quota and the two-trip limit.

On an over-capacity day, the system allocates served orders to vehicle-trips and marks every other order deferred with a recorded reason.

The driver can record stops and proof of delivery offline, and records sync once, with no duplicates, when connectivity returns.

The codebase has clear module boundaries, shared types, automated quality gates and tests, and the full stack starts with a single docker compose up.

### 1.2 Design principles

Feasibility is deterministic and authoritative. A pure validator decides what is allowed; recommendation logic only ranks feasible options and can never override it.

The dispatcher stays in control. Automatic allocation proposes a plan; the dispatcher reviews, adjusts and publishes it.

Offline is a first-class state, not an error. Driver events are written locally first and synchronized later.

Every decision is explainable and audited. Deferrals, overrides and exceptions keep actor, time and reason.

One source of truth for types. Schemas live in a shared package used by the API, the web app and the offline queue.

Consistent by design. One design system and one status vocabulary across all four roles.

Reproducible by default. Deterministic seed data and a controllable operating clock start every environment in the same state.

### 1.3 Scope

In scope: the four role workspaces, order capture with the 4 PM cutoff, planning queue, validated and assisted allocation, deferral management, loading verification and shortfalls, driver trip execution with POD, offline sync, store receipt and issues, dispatcher dashboard, in-app notifications and audit log.

Out of scope: live GPS, native apps, external ERP integration, SMS or push notifications, full vehicle routing optimization, and splitting orders across vehicles. Service-time, lateness and demand predictions can be added later through a predictions table without changing the core workflow.

### 1.4 Key assumptions

| ID | Assumption | Rationale |
| --- | --- | --- |
| A1 | Orders are editable until the 4 PM cutoff, then locked; later changes go through the dispatcher and are audited | Protects the plan once planning starts |
| A2 | POD = recipient name + signature image, with an optional photo | Enough to settle disputes without heavy storage |
| A3 | ETA = planned arrival, shifted by recorded stop events; no GPS | Live tracking is not required for the first release |
| A4 | Fuel use per trip = estimated route km ÷ vehicle km_per_l | No route-level fuel data is available at planning time |
| A5 | A loading shortfall warns and requires dispatcher acknowledgement rather than hard-blocking departure | Keeps the flow moving while keeping the issue visible |
| A6 | Trip time uses the district-level formula in Section 7.3 | One definition shared by planning, reporting and analytics |

## 2. Architecture overview

Waypoint is a modular monolith: one PWA, one Fastify API and one PostgreSQL database behind a Caddy proxy, with the planning rules isolated in a pure package that both the API and the browser call.

container view · web app, proxy, API, database

Every write passes the API's role checks; every plan passes the planning validator before it can be published; the driver's offline layer queues events that the sync module applies exactly once.

### 2.1 Main flows

Order to queue: Store Manager posts an order → orders module stores it → at the operating clock's 4 PM cutoff it becomes Confirmed and joins the next day's planning run.

Plan to publish: Dispatcher runs auto-allocate or drags orders → planning package validates and explains → publish writes trips, stops, deferrals and fuel ledger in one transaction and bumps the plan version.

Publish to field: SSE and notifications tell the loader and driver; the driver app caches the trip in Dexie.

Field to store: Driver events go through the outbox to the sync module → stop status, POD and ETA update → Store Manager sees the delivery and confirms receipt.

Everything to dashboard: each domain event updates the dispatcher's live view and the audit log.

### 2.2 Why a modular monolith

A single API process keeps transactions simple (publish and sync must be atomic), deploys as one container and suits a small team. Module boundaries and the pure planning package keep it clean enough to split later if needed.

## 3. Technology stack

The stack is TypeScript end to end: React + Vite PWA on the front, Fastify + Drizzle + PostgreSQL on the back, with Zod as the single schema language shared by both.

| Layer | Choice | Role in Waypoint |
| --- | --- | --- |
| Language | TypeScript (strict) | One type system across web, API, planning engine and seed |
| Package manager | pnpm workspaces | Monorepo linking without extra build tooling |
| Web framework | React 18 + Vite | Four role workspaces, fast dev server, static build |
| Routing | TanStack Router (file-based) | Typed routes, role layouts and route guards |
| Server state | TanStack Query | Fetching, caching, polling for live dashboard, optimistic updates |
| Client state | Zustand (small) | Planning-workspace selection, connectivity status, UI toggles only |
| Forms | React Hook Form + Zod resolver | Order, loading exception, POD and receipt forms |
| Styling | Tailwind CSS with design tokens as CSS variables | Implements the Waypoint design library (Section 10.5) |
| UI components | shadcn/ui (Radix primitives), restyled to the design library | Accessible dialogs, sheets, menus, tabs, segmented controls |
| Icons | Lucide React, 1.5 px stroke | Thin, rounded line icons in the style of SF Symbols; tree-shaken per icon |
| Charts | Recharts via shadcn/ui chart components | Cluster bar chart, capacity bars, plan-quality gauge, forecasts; themed from tokens |
| Data tables | TanStack Table (headless) + shadcn/ui Table | Planning queue, deferrals, audit log: sorting, filtering, column visibility, row selection |
| Motion | Motion (formerly Framer Motion) | Spring-based transitions for sheets, cards and drag-to-allocate |
| Typography | Inter variable, system font stack first | SF Pro renders natively on Apple devices; Inter elsewhere |
| Dates | date-fns + date-fns-tz | Every time rendered in Asia/Colombo |
| Signature capture | signature_pad | Proof-of-delivery signatures on the driver's phone |
| PWA | vite-plugin-pwa (Workbox) | App-shell precache, installable driver/loader app |
| Offline store | Dexie (IndexedDB) | Cached trips, outbox of driver events, POD blobs |
| API | Fastify 5 | HTTP API, plugins for auth, cookies, static, swagger |
| Validation | Zod + fastify-type-provider-zod | Request/response validation from the shared schemas |
| ORM / DB | Drizzle ORM + PostgreSQL 16 | Typed queries, SQL migrations, transactions, unique constraints |
| Auth | @fastify/cookie + session table + argon2 | httpOnly session cookies, server-side RBAC |
| API docs | @fastify/swagger + swagger-ui | OpenAPI generated from route schemas at /api/docs |
| Logging | Pino (Fastify logger) | Structured logs with request id, user id, role |
| Lint and format | Biome | One fast tool for linting, formatting and import sorting across the monorepo |
| Git hooks | Husky + lint-staged | Biome on staged files before every commit |
| Commit format | commitlint (Conventional Commits) | Enforced type(scope): subject messages via the Husky commit-msg hook |
| Dead code | Knip | Finds unused files, exports, types and dependencies in every workspace |
| Tests | Vitest, Testing Library, Playwright | Unit (engine), component, end-to-end walkthrough |
| Proxy / TLS | Caddy | Single origin, serves web build, proxies /api, automatic HTTPS |
| Runtime | Docker + Docker Compose | docker compose up starts db, migrations, seed, api and web |
| CI | GitHub Actions | Biome, typecheck, Knip, unit tests, Playwright on every push |

### 3.1 Changes from the original proposal

Zod replaces TypeBox. One schema library means one definition per payload, shared by forms, API validation and the offline outbox.

Biome replaces ESLint and Prettier. One binary, one config (biome.json at the root), and lint plus format in well under a second for the whole repo.

Husky, lint-staged and commitlint are added so every commit is formatted, lint-clean and uses a Conventional Commits message.

Knip is added to keep the monorepo free of unused files, exports and dependencies as features change quickly.

Turborepo is dropped. Two apps and three packages do not need a task graph; root pnpm scripts are enough and Docker builds stay simple.

Zustand is kept deliberately small. Server data stays in TanStack Query and offline data in Dexie, so Zustand holds UI-only state.

Caddy is added to give one origin (no CORS, simple cookies) and HTTPS, which service workers require.

A pure packages/planning package is added so the constraint validator is testable in isolation and reusable by the web app and the what-if simulator.

## 4. Monorepo and module structure

The repository holds two apps and three packages; dependencies flow one way, from apps into packages, never between apps.

```text
waypoint/
├── apps/
│   ├── web/                      # React PWA (all four roles)
│   │   └── src/
│   │       ├── routes/           # file-based: _auth, dispatcher/, loader/, driver/, store/
│   │       ├── features/         # orders, planning, loading, trips, pod, receipts, dashboard
│   │       ├── components/
│   │       │   ├── ui/           # shadcn/ui primitives restyled to the design library
│   │       │   ├── charts/       # Recharts wrappers: BarByCluster, CapacityBar, QualityGauge
│   │       │   └── data-table/   # TanStack Table wrapper, filters, column toggles
│   │       ├── styles/           # tokens.css (colours, radii, spacing, type), globals.css
│   │       ├── offline/          # dexie db, outbox, sync engine, connectivity hook
│   │       ├── lib/              # api client, query keys, formatters (Asia/Colombo)
│   │       └── stores/           # zustand: ui, connectivity
│   └── api/                      # Fastify
│       └── src/
│           ├── modules/          # one folder per bounded area (see 4.1)
│           ├── plugins/          # db, auth, rbac, audit, errors, swagger
│           ├── config/           # env parsing with zod
│           ├── app.ts            # builds the Fastify instance (used by tests)
│           └── server.ts         # listens
├── packages/
│   ├── shared/                   # zod schemas, enums, DTO types, error codes
│   ├── planning/                 # PURE: validator, trip time, fuel, allocator, explain
│   └── database/                 # drizzle schema, migrations, seed (csv import + scenario)
├── infra/
│   ├── Caddyfile
│   ├── api.Dockerfile
│   └── web.Dockerfile
├── e2e/                          # playwright end-to-end walkthrough
├── docs/                         # architecture, data-model, api, offline-sync, design-system
├── data/                         # source CSVs, gitignored (see 12.4)
├── .husky/
│   ├── pre-commit                # pnpm lint-staged
│   └── commit-msg                # pnpm commitlint --edit $1
├── .github/workflows/ci.yml
├── biome.json
├── commitlint.config.ts
├── knip.json
├── docker-compose.yml
├── .env.example
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### 4.1 API modules

Each module has routes.ts (HTTP + schemas), service.ts (business logic, transactions) and repo.ts (Drizzle queries). Routes never touch the database directly.

| Module | Responsibility |
| --- | --- |
| auth | Login, logout, session, current user |
| reference | Outlets, vehicles, depots, calendar, district travel, service allowance (read-only) |
| orders | Create, edit before lock, confirm, cutoff rule, history |
| planning | Planning runs, queue, auto-allocate, validate, what-if, publish |
| trips | Trips, stops, sequence, versioning, status transitions |
| loading | Load verification, exceptions, ready state |
| deliveries | Stop events, outcomes, POD upload, lateness flag |
| receipts | Receipt confirmation, discrepancy issues |
| sync | Batch ingest of offline events, idempotency, conflicts |
| notifications | In-app feed, read state |
| dashboard | KPIs, capacity, exceptions, SSE stream |
| admin | Operating clock and seed reset (non-production environments only) |

### 4.2 Dependency rule

packages/planning imports only packages/shared. It has no database, HTTP or date-now calls; the caller passes the current time. This keeps it deterministic, fast to test and usable in the browser for instant "why not possible?" feedback.

## 5. Domain and data model

The model has 24 PostgreSQL tables in four groups: reference data loaded from the source CSVs, the order-to-receipt operational chain, field events, and cross-cutting audit and notifications. All IDs are text keys matching the datasets where they exist (OUT001, VEH014) and UUIDv7 elsewhere.

### 5.1 Tables

| Group | Table | Key columns |
| --- | --- | --- |
| Reference | depots | id, name |
| Reference | outlets | id, brand, district, depot_id, dock_type, parking_constraint, mall_window_open/close, window_open/close (time) |
| Reference | vehicles | id, type, temp, weight_cap_kg, volume_cap_m3, fuel_type, km_per_l, weekly_fuel_quota_l, depot_id |
| Reference | calendar_days | date, dow, iso_year, iso_week, is_payday, festival, festival_ramp, is_holiday, monsoon, is_operating |
| Reference | district_travel | district, depot_id, road_class, depot_to_district_km/min, inter_stop_km/min |
| Reference | service_allowances | brand, dock_type, minutes |
| Reference | vehicle_availability | vehicle_id, date, status (available, in_workshop) |
| Identity | users | id, name, email, password_hash, role, outlet_id?, depot_id?, vehicle_id? |
| Identity | sessions | id, user_id, expires_at |
| Orders | orders | id, outlet_id, brand, temp, requested_date, units, weight_kg, volume_m3, status, submitted_at, locked_at, version |
| Planning | planning_runs | id, depot_id, service_date, status (open, published), published_at, published_by, plan_version |
| Planning | trips | id, run_id, vehicle_id, trip_no (1 or 2), brand, district, status, version, planned_minutes, planned_km |
| Planning | trip_stops | id, trip_id, order_id (unique), seq, planned_arrival, status |
| Planning | deferrals | id, order_id, run_id, reason_code, type (unavoidable, prioritized), note, actor_id, created_at |
| Planning | fuel_ledger | id, vehicle_id, iso_year, iso_week, trip_id, litres |
| Loading | loading_records, loading_issues | trip_id, status, loader_id; order_id, type (missing, damaged, short), qty, note, acknowledged_by |
| Field | stop_events | id, client_event_id (unique), stop_id, type, payload jsonb, client_time, server_time, trip_version |
| Field | pods | id, stop_id, recipient_name, signature (bytea), photo (bytea?), client_time |
| Store | receipts, issues | stop_id, confirmed_by, status; order_id, type, note, status |
| Cross-cutting | notifications, audit_log, sync_conflicts | recipient, type, entity; actor, action, entity, before/after jsonb; event_id, reason, resolved_by |

### 5.2 Integrity rules enforced in the database

trip_stops.order_id is unique, so an order is served by at most one trip (whole orders, no split).

trips (run_id, vehicle_id, trip_no) is unique and trip_no is checked to be 1 or 2.

stop_events.client_event_id is unique, which makes sync idempotent.

deferrals.reason_code is NOT NULL, so no deferral exists without a reason.

Times use timestamptz for events and time for windows; the app always interprets them in Asia/Colombo.

### 5.3 State machines

| Object | States and transitions |
| --- | --- |
| Order | Draft → Submitted → Confirmed (at cutoff) → Allocated or Deferred → Loading → Dispatched → Delivered or Failed → Receipt confirmed. Deferred returns to the next run's queue. Cancelled only before lock. |
| Trip | Planned → Published → Loading → Ready → Departed → Completed. Blocked if its vehicle becomes unavailable. |
| Stop | Pending → Arrived → Delivered or Failed. Late is a flag on Arrived, not a separate outcome. |
| Loading | Not started → In progress → Exception or Ready → Departed. Exception returns to In progress once acknowledged. |
| Sync event | Local → Queued → Syncing → Synced, or Conflict (shown to driver and dispatcher). |

Transitions are implemented as a single transition(entity, from, to) helper per object, which rejects illegal moves and writes an audit row in the same transaction.

## 6. API design

The API is a JSON REST API under /api/v1, validated by the shared Zod schemas and documented automatically at /api/docs.

### 6.1 Conventions

Resource nouns, plural; actions that change state are explicit sub-resources (POST /trips/:id/depart), never generic PATCHes of status.

Every mutating request on a versioned entity sends If-Match: <version>; a stale version returns 409 VERSION_CONFLICT.

List endpoints accept filters as query params and return { items, total }.

Times are ISO 8601 with the +05:30 offset; windows are HH:MM strings.

Role scoping happens in the service layer: a Store Manager requesting another outlet's order gets 404, not 403, to avoid leaking existence.

### 6.2 Endpoint catalogue

| Area | Method and path | Roles |
| --- | --- | --- |
| Auth | POST /auth/login · POST /auth/logout · GET /auth/me | All |
| Reference | GET /outlets · /vehicles · /calendar · /district-travel | All (scoped) |
| Orders | GET, POST /orders · PATCH /orders/:id · POST /orders/:id/cancel | Store Manager (own outlet), Dispatcher (read) |
| Planning | GET /planning/runs/:date/queue · POST /planning/runs/:date/auto-allocate · POST /planning/validate · POST /planning/runs/:date/publish | Dispatcher |
| Allocation | PUT /planning/runs/:date/allocations (move order to vehicle-trip) | Dispatcher |
| Deferrals | POST /deferrals · GET /deferrals?outlet= | Dispatcher (write), Store (own) |
| What-if | POST /planning/runs/:date/simulate | Dispatcher |
| Trips | GET /trips?date=&vehicle= · GET /trips/:id · POST /trips/:id/resequence · POST /trips/:id/depart | Dispatcher, Loader (depot), Driver (own) |
| Loading | POST /trips/:id/loading/start · POST /trips/:id/loading/issues · POST /loading/issues/:id/ack · POST /trips/:id/loading/ready | Loader, Dispatcher (ack) |
| Deliveries | POST /stops/:id/events · POST /stops/:id/pod | Driver (online path) |
| Sync | POST /sync/events (batch, up to 100) · GET /sync/trips/:id?since=version | Driver |
| Receipts | POST /stops/:id/receipt · POST /issues | Store Manager |
| Notifications | GET /notifications · POST /notifications/:id/read | All |
| Dashboard | GET /dashboard/summary?date= · GET /dashboard/stream (SSE) | Dispatcher |
| Admin | GET, PUT /admin/clock · POST /admin/reset | Dispatcher, only when DEMO_MODE=true |

### 6.3 Error model

All errors return one shape, so the web app can show consistent messages and the planning UI can render violations inline.

```json
{
  "error": {
    "code": "CONSTRAINT_VIOLATION",
    "message": "VEH031 cannot carry this load",
    "violations": [
      { "rule": "REEFER_REQUIRED", "orderId": "ORD-8812", "detail": "Chilled order on ambient vehicle" },
      { "rule": "VOLUME_CAP", "tripKey": "VEH031-1", "detail": "18.4 m3 > 16.0 m3" }
    ]
  }
}
```

| HTTP | Code | When |
| --- | --- | --- |
| 400 | VALIDATION_ERROR | Body fails Zod schema |
| 401 / 403 | UNAUTHENTICATED / FORBIDDEN | No session / wrong role |
| 404 | NOT_FOUND | Missing or out of the user's scope |
| 409 | VERSION_CONFLICT | Stale If-Match version |
| 422 | CONSTRAINT_VIOLATION | Hard planning rule broken |
| 422 | CUTOFF_PASSED | Order edit after lock |

## 7. Planning and allocation engine

The engine is a pure TypeScript package with two layers: a deterministic validator that decides what is feasible, and a greedy allocator that ranks and places orders only among feasible options. Automatic, assisted and manual planning all call the same validator.

### 7.1 Inputs and outputs

```typescript
type PlanInput = {
  serviceDate: string;            // '2026-10-03'
  depotId: string;
  orders: OrderLite[];            // confirmed queue incl. deferred_yesterday, days_since_last_served
  vehicles: VehicleLite[];        // only status = available
  outlets: Record<string, OutletLite>;
  districtTravel: Record<string, DistrictTravel>;
  serviceAllowance: Record<`${Brand}:${DockType}`, number>;
  fuelRemainingL: Record<string, number>;   // weekly quota minus fuel_ledger
  policy: PriorityWeights;                  // configurable, shown in UI
};

type PlanResult = {
  trips: TripPlan[];              // vehicleId, tripNo, brand, district, stops[], minutes, km, litres, utilization
  deferred: { orderId: string; reason: ReasonCode; type: 'unavoidable' | 'prioritized'; explain: string }[];
  metrics: PlanMetrics;           // scorecard (7.6)
};
```

### 7.2 Hard constraints (validator)

| Rule | Check per trip or vehicle | Reason code |
| --- | --- | --- |
| Grouping | All stops share one brand and one district | MIXED_BRAND_DISTRICT |
| Refrigeration | Any chilled order → vehicle.temp = reefer | REEFER_REQUIRED |
| Access | Any van_only outlet → vehicle.type = van | VAN_REQUIRED |
| Depot | vehicle.depot = outlet.depot | WRONG_DEPOT |
| Availability | Vehicle available on service date | VEHICLE_UNAVAILABLE |
| Weight | Σ weight_kg ≤ weight_cap_kg | WEIGHT_CAP |
| Volume | Σ volume_m3 ≤ volume_cap_m3 | VOLUME_CAP |
| Trips | ≤ 2 trips per vehicle per day | TRIP_LIMIT |
| Fresh time | Σ Fresh trip minutes per vehicle ≤ 270 (03:30–08:00) | FRESH_TIME_BUDGET |
| Style + Tech time | Σ Style and Tech trip minutes per vehicle ≤ 480 | DAY_TIME_BUDGET |
| Window | Planned arrival at each stop ≤ window_close and inside mall_window | WINDOW_MISSED |
| Fuel | Trip litres ≤ remaining weekly quota | FUEL_QUOTA |

The validator returns every violation, not just the first, so the UI can list them all under "Why not possible?".

### 7.3 Trip time, arrivals and fuel

Trip time uses one district-level formula, so planning, reporting and analytics share a single definition:

$$
\text{trip\_min} = \text{depot\_to\_district\_min} + \text{inter\_stop\_min} \times (n-1) + \sum_{i=1}^{n} \text{service\_allowance}_i
$$

Planned arrival at stop k = trip start + outbound minutes + inter-stop minutes × (k − 1) + allowances of stops 1 to k − 1, plus any wait until window_open. Fresh trip 1 starts at 03:30; trip 2 starts when trip 1 ends plus the return leg (equal to the outbound time, an assumption).

Fuel per trip is estimated as (2 × depot_to_district_km + inter_stop_km × (n − 1)) ÷ km_per_l. This round-trip estimate is assumption A4 and is written to fuel_ledger on publish.

### 7.4 Allocation heuristic

Score each order with transparent weights: deferred yesterday (+40), days since last served (+5 per day, capped at 30), chilled (+10), Fresh before 08:00 (+10), tight window (+0 to 10). The weights live in policy and are shown in the UI.

Group orders by brand × district × needs (chilled, van_only).

Place scarce demand first: van_only chilled, then van_only ambient, then chilled, then ambient. This protects the 16 reefer-capable vehicles and 8 vans for orders that truly need them.

Best fit: for each order in score order, try existing open trips of the same group, then open a new trip on the least capable vehicle that fits (an ambient truck before a reefer, a truck before a van). Keep the placement only if the validator passes.

Improve: one pass tries to swap a low-score served order for a higher-score deferred one of the same group.

Defer whatever remains, labelling each deferral unavoidable (no feasible vehicle-trip exists even with an empty fleet) or prioritized (it was feasible but lost to a higher-scored order).

At the scale of one depot and one day (a few hundred orders) this runs in well under a second, so it can re-run on every drag in the UI.

### 7.5 Explainability

Every placement and rejection carries a structured reason, rendered into plain sentences by one explain() function. For example: "Deferred: all 5 available reefers at Peliyagoda are full (98% volume). Outlet OUT047 was also skipped yesterday; it is first in tomorrow's queue." The same text feeds the store's deferral notice.

### 7.6 Plan scorecard and what-if

The scorecard shows served and deferred orders and m3, repeat deferrals, average weight and volume utilization, reefer and van utilization, fuel used, and stops within 15 minutes of window close. What-if runs the same engine on a cloned PlanInput with changed assumptions (vehicle unavailable, one extra reefer, Fresh +20%) and compares scorecards side by side. It never writes to the database.

## 8. Offline-first and synchronization

The driver app always writes to IndexedDB first and syncs an outbox to the server, so online and offline use the same code path and a dropped connection never loses a stop.

### 8.1 What is cached

| Store (Dexie) | Contents | Refreshed |
| --- | --- | --- |
| trips | Active trip with version, stops, outlet windows, access notes, order summaries | On open and every sync |
| outbox | Pending events: event_id (UUID), stop_id, type, payload, client_time, trip_version, status, attempts | Written on every driver action |
| blobs | POD signature and photo, compressed to ≤ 300 KB | Deleted after upload confirmed |
| meta | Last sync time, device id, user id | Every sync |

The service worker (Workbox via vite-plugin-pwa) precaches the app shell, so the driver can reload the app with no signal. API responses are not cached by the service worker; Dexie is the only offline data source, which avoids two competing caches.

### 8.2 Recording an event

The driver taps Arrived, Delivered or Failed. The app writes the event to outbox with a new UUID and updates the local stop status immediately.

The UI shows the stop with a Pending sync badge; the header shows Online, Offline or Syncing (n).

The sync engine is triggered by the online event, app focus, a 20-second interval while items are queued, and a manual Sync now button. The Background Sync API is not relied on because iOS Safari does not support it.

Events are sent in order, in batches of up to 100, to POST /sync/events. POD blobs upload separately first, and the event references the returned POD id.

### 8.3 Server processing

For each event, in one transaction:

INSERT INTO stop_events ... ON CONFLICT (client_event_id) DO NOTHING. If nothing was inserted, the event was already applied: return applied without side effects. This is the idempotency guarantee.

Check the trip version. Stop outcome events (arrived, delivered, failed, POD) are facts about the past and are always accepted, even if the plan changed meanwhile.

If the stop was removed or reassigned while the driver was offline, store the event, create a sync_conflicts row, and return conflict. Nothing is silently overwritten.

Apply the state transition, write the audit row, and notify the store and dispatcher.

The response lists a status per event (applied, duplicate, conflict, rejected), and the client updates each outbox item to match. Failed network calls retry with exponential backoff from 2 to 60 seconds.

### 8.4 Plan changes reaching an offline driver

When online again, the client calls GET /sync/trips/:id?since=<version>. If the version moved, the app shows a Route changed notice listing added, removed and reordered stops, and the driver must acknowledge it before continuing. The trip is never mutated silently.

### 8.5 What the dispatcher sees

The dashboard shows each driver's last sync time and pending count. A trip with no events for 30 minutes is shown as Last seen 09:12 · may be offline, never as live progress. Conflicts appear in the exception list with a resolve action.

### 8.6 Timestamps

Each event keeps client_time (when it happened) and server_time (when it arrived). Lateness and ETA use client_time; audit uses both. Client clocks are trusted within reason, and events more than 12 hours from server time are flagged.

## 9. Authentication, RBAC and security

Users sign in with email and password into an httpOnly session cookie; every route declares its allowed roles, and every query is scoped to the user's outlet, depot or vehicle on the server.

### 9.1 Authentication

Passwords hashed with argon2id; sessions stored in the sessions table, 12-hour expiry, sliding refresh.

Cookie flags: HttpOnly, Secure, SameSite=Lax, path /. Single origin via Caddy means no CORS configuration.

Login is rate-limited with @fastify/rate-limit (10 attempts per minute per IP).

The driver's cached session lets the offline app open without a network; sync resumes with the same cookie once online. An expired session while offline keeps the outbox intact and asks for re-login before syncing.

### 9.2 Authorization matrix

| Capability | Dispatcher | Loader | Driver | Store Manager |
| --- | --- | --- | --- | --- |
| Place and edit orders | Read all | No | No | Own outlet |
| Allocate, defer, publish | Yes | No | No | No |
| View trips | All | Own depot | Own vehicle | Own deliveries (ETA) |
| Record loading and exceptions | Acknowledge | Own depot | No | No |
| Record stop events and POD | Read | No | Own trip | No |
| Confirm receipt, report issue | Read, resolve | No | No | Own outlet |
| Dashboard | Full | Loading board | Own trip | Own orders |
| Operating clock and seed reset | Yes (non-production) | No | No | No |

### 9.3 Enforcement

requireRole(...roles) Fastify preHandler on every route.

scope(user) helper returns a Drizzle where clause added to every query in the service layer (for example orders.outlet_id = user.outlet_id).

Integration tests assert that each role gets 404 on another scope's records.

### 9.4 Other controls

Secrets only in environment variables; .env.example holds placeholders and the demo seed passwords.

@fastify/helmet for security headers; a strict Content Security Policy allowing only self.

Uploads limited to images under 2 MB, type-checked by magic bytes.

Audit log is append-only from the application; no update or delete paths exist.

## 10. Frontend architecture and role experiences

One React app serves all four roles; after login the router sends each user to their workspace, and each workspace is tuned to that role's device: desktop for the dispatcher, shared tablet for the loader, phone for the driver, and desktop or phone for the store manager.

### 10.1 Structure

Routes (TanStack Router, file-based): /login, /dispatcher/*, /loader/*, /driver/*, /store/*. A root beforeLoad guard redirects by role; wrong-role URLs redirect to the user's home.

Features folders own their queries, components and forms. Query keys come from one factory (qk.trips.detail(id)) so invalidation after a mutation is predictable.

Shared status vocabulary: one <StatusBadge> maps every order, trip, stop, loading and sync state to the same label and colour across roles, so a status means the same thing on every screen.

Time: one formatting module renders every time in Asia/Colombo regardless of device timezone.

### 10.2 Screens per role

| Role | Screens | Device focus |
| --- | --- | --- |
| Dispatcher | Command center · Planning queue · Allocation workspace (vehicle-trip columns, capacity bars, drag to assign, inline violations) · Vehicle/trip inspector · Deferral center · What-if · Review and publish · Live operations | 1440 px desktop |
| Loader | Assigned loads · Load plan in reverse stop order · Verification checklist · Exception form · Plan changed banner with acknowledge | 768 px tablet, large targets |
| Driver | My trips · Trip overview · Stop detail · Outcome and POD (signature pad, name, optional photo) · Sync center | 360–414 px phone, one-hand, 48 px targets |
| Store Manager | Dashboard · Place order (dry and chilled Fresh orders, cutoff countdown) · Confirmation · Tracking with ETA · Deferral notice · Receipt and issue | Desktop and phone |

### 10.3 Driver UX rules

Every screen works offline after the trip is opened once; a persistent header shows connectivity and pending count.

One primary action per screen; destructive actions (Failed delivery) ask for a reason, not a second confirmation.

No free-text required while driving; reasons are picked from lists.

POD completes in three taps plus the signature.

### 10.4 Loader UX rules

The load plan is shown in reverse stop order (last stop loaded first) with chilled and van badges, so goods come off the vehicle in delivery order.

A plan change during loading shows a diff and blocks Ready until acknowledged, so no one loads from a stale list.

### 10.5 Design system

The UI follows the Waypoint design library: an Apple-inspired language of calm neutral surfaces, large rounded cards, bold numerals and one warm accent, with colour reserved for meaning. The library is maintained in Figma and exported as CSS variables in styles/tokens.css, so design and code share one set of names.

#### Principles

Clarity first. One headline number per card, a short caption that states the finding, and detail one tap away.

Depth through layering, not decoration. Warm grey canvas, white cards, one dark hero card for the most critical resource; no gradients or heavy shadows.

Colour is meaning. The accent marks data and focus; green, amber and red appear only for good, warning and blocking states.

Direct manipulation. Drag to allocate, swipe-free large targets on phones, spring motion that follows the finger.

#### Tokens

| Token | Value | Use |
| --- | --- | --- |
| --surface-canvas | Warm light grey | App background |
| --surface-card | White | Cards, sheets, sidebar selection |
| --surface-inverse | Near-black | Hero card (reefer capacity), primary buttons, avatar |
| --accent | Coral orange-red | Chart bars, gauge arc, active navigation icon |
| --status-good | Soft green | Positive deltas, capacity within limits |
| --status-warning | Amber | Near-limit resources, repeat deferrals, cutoff notices |
| --status-critical | Red | Hard violations, "Blocks publish" |
| --text-primary / --text-secondary | Near-black / mid grey | Values and labels / captions and metadata |
| --radius-card / --radius-control / --radius-pill | 24 px / 12 px / 999 px | Cards / inputs and buttons / badges, segmented controls, status chips |
| --space-* | 4 px scale (4, 8, 12, 16, 24, 32) | All padding and gaps |
| Type scale | 12 / 14 / 16 / 20 / 28 / 48 / 72 px | Metadata to hero numerals; numerals use tabular figures |

Exact colour values live in the Figma library and are the source of truth; tokens.css is generated from it, with a matching dark theme.

#### Component patterns

| Pattern (from the design) | Implementation |
| --- | --- |
| Sidebar with sections and count badges | Custom AppSidebar on shadcn/ui Sidebar; counts from TanStack Query |
| Segmented control (Planning / Operations) | shadcn/ui Tabs styled as a pill segmented control |
| Command search (⌘K) | shadcn/ui Command (cmdk) over orders, outlets and trips |
| Planning-window status pill | StatusPill bound to the operating clock |
| KPI card (big number, delta pill, progress, icon) | MetricCard with CapacityBar |
| Orders by cluster bar chart | Recharts BarChart, rounded top corners, value labels above bars, no grid, caption sentence below |
| Hero capacity card | HeroMetric on --surface-inverse with a threshold bar |
| Risk radar bars | CapacityBar rows with warning and critical states and an icon beside the value |
| Plan quality gauge | Recharts RadialBarChart half-arc with sub-score chips |
| Needs-action list | ActionList rows: status icon in a tinted circle, title, reason, chevron; sorted by severity |
| Publish countdown | DeadlineCard driven by the operating clock |
| Data tables (queue, deferrals, audit) | TanStack Table in shadcn/ui Table, sticky header, row badges |

#### Charts, tables and icons

Charts: Recharts through shadcn/ui chart components, themed only from tokens. One accent colour per chart; every chart has a one-sentence caption stating its finding.

Tables: TanStack Table for sorting, filtering, column visibility and row selection; rendered with shadcn/ui Table so they match cards and spacing.

Icons: Lucide React at 20 px with a 1.5 px stroke, matching the thin, rounded look of SF Symbols. Icons always pair with a text label or an accessible name.

#### Accessibility and motion

Text contrast at least 4.5:1; status is never shown by colour alone (icon plus label, as in "Blocks publish").

Touch targets at least 44 × 44 px on phone and tablet screens.

Motion uses short springs (about 200 to 300 ms) and respects prefers-reduced-motion.

Full keyboard support on the dispatcher workspace, including drag-to-allocate via keyboard.

## 11. Notifications, live updates and audit

Notifications are rows written in the same transaction as the event that caused them, delivered in-app; the dispatcher dashboard receives changes over Server-Sent Events with polling as the fallback.

### 11.1 Notification events

| Event | Recipients | Priority |
| --- | --- | --- |
| Order confirmed at cutoff | Store Manager | Info |
| Order deferred (with reason) | Store Manager | High |
| Plan published or changed | Loader of that depot, Driver of that vehicle | High |
| Loading shortfall | Dispatcher | High |
| Stop failed or delivery issue | Dispatcher, Store Manager | High |
| Delivered (with ETA-met or late flag) | Store Manager | Info |
| Receipt discrepancy | Dispatcher | High |
| Sync conflict | Driver, Dispatcher | Medium |

The notification feed is sorted by priority, then time; high-priority items need an action (acknowledge, resolve), not just a read.

### 11.2 Live updates

GET /dashboard/stream is an SSE endpoint. The API publishes domain events through an in-process emitter (Postgres LISTEN/NOTIFY if more than one API instance is ever run).

The client maps each event to TanStack Query invalidations, so screens refetch only what changed.

If SSE drops, TanStack Query polls every 15 seconds. Other roles simply poll their own views every 30 seconds.

### 11.3 Audit log

An audit() helper, called inside each service transaction, writes actor, role, action, entity, before and after JSON, and time. Audited actions include order edits after lock, allocation changes, deferrals, publish, loading exceptions and acknowledgements, stop outcomes, receipt confirmations, sync conflicts and seed resets. The dispatcher can open an entity's timeline from any screen.

## 12. Deployment, infrastructure and seeding

docker compose up starts four services in order (database, a one-shot migrate-and-seed job, API, Caddy with the web build), and the same file runs on a small VPS for the public HTTPS URL.

### 12.1 Compose services

| Service | Image | Starts after | Notes |
| --- | --- | --- | --- |
| db | postgres:16-alpine | — | Healthcheck pg_isready; named volume pgdata |
| migrate | api image, command pnpm db:migrate && pnpm db:seed | db healthy | Idempotent: seeds only if the seed_meta row is missing; exits 0 |
| api | api image (Node 20, multi-stage build) | migrate completed | Healthcheck GET /api/health |
| web | caddy:2 with the Vite build copied in | api healthy | Serves /, proxies /api/*; auto-HTTPS when DOMAIN is set, plain HTTP on localhost |

```yaml
services:
  db:
    image: postgres:16-alpine
    env_file: .env
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U $$POSTGRES_USER"], interval: 5s, retries: 20 }
  migrate:
    build: { context: ., dockerfile: infra/api.Dockerfile }
    command: sh -c "pnpm db:migrate && pnpm db:seed"
    env_file: .env
    volumes: [./data:/data:ro]
    depends_on: { db: { condition: service_healthy } }
  api:
    build: { context: ., dockerfile: infra/api.Dockerfile }
    env_file: .env
    depends_on: { migrate: { condition: service_completed_successfully } }
  web:
    build: { context: ., dockerfile: infra/web.Dockerfile }
    ports: ["80:80", "443:443"]
    env_file: .env
    depends_on: { api: { condition: service_healthy } }
volumes: { pgdata: {} }
```

### 12.2 Environment variables

| Variable | Example | Purpose |
| --- | --- | --- |
| POSTGRES_USER / PASSWORD / DB | waypoint / change-me / waypoint | Database |
| DATABASE_URL | postgres://waypoint:change-me@db:5432/waypoint | API and migrate |
| SESSION_SECRET | 64 random chars | Cookie signing |
| DOMAIN | localhost or waypoint.example.com | Caddy site address |
| DEMO_MODE | true | Enables operating-clock control and seed reset |
| DEMO_DATE | the seeded service date | Initial operating date |
| DATA_DIR | /data | Where the source CSVs are read from |
| SEED_PASSWORD | (set per deploy) | Password for the four seeded accounts |

### 12.3 Seed data

Reference data is imported from the source CSVs (outlets, vehicles, calendar, district travel, service allowance) so every environment uses the same 120 outlets, 60 vehicles and 2 depots.

Four accounts, one per role: a Peliyagoda dispatcher, a Peliyagoda loader, a driver assigned to a van, and a store manager for a Fresh outlet with both dry and chilled orders.

A realistic over-capacity day built from historical order sizes: some vehicles in the workshop, more reefer demand than reefer capacity, at least one van_only outlet, one mall-window Style outlet, and one outlet with deferred_yesterday = 1. The seed script is deterministic (fixed RNG seed), so every install sees the same day.

A handful of orders are left unsubmitted so a new order can be placed before the cutoff.

### 12.4 Dataset confidentiality

The source datasets are confidential and licensed for this project only; neither they nor their derivatives may be published. The CSVs therefore live in data/, which is gitignored and mounted read-only into the migrate job. The repository is private, with access granted only to named reviewers. The README explains where to place the files.

### 12.5 Hosting

A 2 vCPU / 4 GB VPS runs the same Compose file, with a DNS record pointing at it and DOMAIN set so Caddy obtains a certificate. HTTPS is mandatory: service workers do not register on plain HTTP outside localhost. Deploy by git pull && docker compose up -d --build, triggered manually or from a GitHub Actions job over SSH. The deployment must stay available for the whole evaluation period.

## 13. Testing, quality and observability

Testing concentrates where a defect would do the most damage: the planning validator (every hard rule), sync idempotency, RBAC scoping, and one end-to-end run of the full four-role workflow.

### 13.1 Test layers

| Layer | Tool | What it covers | Target |
| --- | --- | --- | --- |
| Unit | Vitest | packages/planning: each rule in 7.2 passing and failing, reference trip-time examples (Gampaha = 101 min, Colombo = 112 min), allocator never outputs an infeasible trip | Every rule, 90%+ lines in planning |
| Property | Vitest + fast-check | Random order sets: every allocator output passes the validator; every order is served or deferred exactly once | 500 runs per build |
| Integration | Vitest + Fastify inject + test Postgres | Cutoff rule, publish, sync duplicate returns duplicate, conflict path, RBAC 404s per role | All API modules |
| Component | Testing Library | Planning violation list, outbox badge states, POD form | Key components |
| End-to-end | Playwright | The README walkthrough across four roles, driver on a 390 px viewport, context.setOffline(true) during a stop, then reconnect and assert Synced | One full run per push |

Reference calculations for the business rules become test fixtures, so domain accuracy is checked on every build.

### 13.2 CI (GitHub Actions)

pnpm install --frozen-lockfile

pnpm biome ci . (lint + format check, fails on any diff)

pnpm typecheck across all workspaces

pnpm knip (fails on unused files, exports or dependencies)

pnpm test (unit, property, integration with a Postgres service container)

docker compose up -d --build, then pnpm e2e against it, uploading the Playwright trace on failure

CI uses a small synthetic fixture instead of the confidential CSVs, so no source data is stored in GitHub. A green badge in the README shows the walkthrough passes.

### 13.3 Code quality

Quality is enforced by tools at three points: on save (Biome in the editor), on commit (Husky hooks) and on push (CI). Nothing relies on reviewers remembering rules.

| Tool | Runs | What it enforces |
| --- | --- | --- |
| Biome | Editor, pre-commit, CI | Recommended lint rules plus noExplicitAny, useImportType, noUnusedVariables, useExhaustiveDependencies; formatting (2 spaces, single quotes, 100 columns); sorted imports |
| TypeScript | CI | strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes in every workspace |
| Husky pre-commit | Every commit | lint-staged runs biome check --write on staged files only, so commits stay fast |
| Husky commit-msg | Every commit | commitlint with @commitlint/config-conventional; scopes limited to web, api, planning, shared, database, infra, docs |
| Knip | CI, and pnpm knip locally | No unused files, exports, types or dependencies; entry points declared per workspace in knip.json |
| Vitest coverage | CI | 90% line coverage on packages/planning, reported for the rest |

Commit messages follow type(scope): subject, for example feat(planning): add fuel quota check or fix(sync): ignore duplicate event ids. The allowed types are feat, fix, refactor, test, docs, chore, perf, build and ci.

```jsonc
// biome.json (root)
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "organizeImports": { "enabled": true },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "useImportType": "error" },
      "correctness": { "noUnusedVariables": "error", "useExhaustiveDependencies": "warn" }
    }
  }
}
```

### 13.4 Observability

Pino JSON logs with reqId, userId, role, route and latency on every request.

Dedicated log events: allocation.validation_failed, sync.batch (counts per status), sync.conflict, auth.login_failed.

GET /api/health checks the database; GET /api/health/ready also checks migrations are applied.

Front-end errors caught by a React error boundary and posted to /api/client-errors.
