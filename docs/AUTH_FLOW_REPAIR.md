# Unified authentication and role workflow repair

## Audit before implementation

The audit covered README, SYSTEM_DESIGN, the SRS (currently headings only), workspace configuration, all web features, API route declarations and service/repository scope enforcement, shared schemas, database identity constraints, deterministic seed, proxy configuration, and existing tests.

| Area | Finding before repair |
| --- | --- |
| Login | Three separate forms embedded in Dispatcher, Loader and Store workspaces; no `/login`. |
| Session state | TanStack Query `['session']`, independently managed by each workspace. No persisted role in localStorage. |
| `/auth/me` | Correctly loads the user from a signed cookie and an unexpired database session. |
| Roles | Shared lowercase `dispatcher`, `loader`, `driver`, `store_manager` discriminated union; database uses the same vocabulary. |
| Route protection | Workspace-local checks; top-level selection reads `window.location.pathname` once. |
| Separate login pages | Three separate form implementations, despite being one application. |
| Manual role selection | None found. The account already determines its role on the server. |
| Hardcoded frontend identities | No mockUser/currentRole/selectedRole/demoRole auth source found. Workspace identity comes from the session. |
| Backend RBAC | Operational endpoints declare allowed roles; services also assert actors. |
| Data scoping | Store: outlet; Driver: assigned vehicle; Loader: depot; Dispatcher: depot, with central read scope where supported. Reference data and notifications are also scoped. |
| Login redirects | No common redirect; Dispatcher uses `/dispatch`; `/dispatcher` and `/driver` are absent. |
| Refresh | Individual workspaces request `/auth/me`; no global startup gate or consistent error handling. |
| Invalid-role URLs | Render an access error and sign-out option instead of redirecting home. |
| Logout | Three implementations. Dispatcher swallows failures; expiry handlers clear different cache subsets. |
| Navigation | Three existing role-specific shells; Driver shell missing. |
| Request cookies | Same-origin credentials work through Vite/Caddy. No CORS layer needed. |
| Deployment | Production API unconditionally sets Secure cookies despite explicit HTTP localhost configuration. Dockerfiles omit the required planning workspace. |
| Duplicate auth/errors | Three login/logout/session implementations. Client reads flat error fields, but the API returns `{ error: { code, message } }`. |

Additional findings: the demo operating clock uses real time rather than the seeded day, making seeded Store orders uneditable and leaving no eligible service date when the dataset calendar is in the past. No existing Driver frontend, Dexie store, Zustand store, or service worker. Dispatcher defaults to the last calendar date, which can show empty operational data. The implementation uses **React Router**, not the TanStack Router described in SYSTEM_DESIGN. The repair retains that installed router and its layout guard mechanism to avoid rewriting the working screens. The existing lowercase role/database contract is also retained; uppercase role names in the request are presentation labels.

## Resulting architecture

`/login` posts credentials to `/api/v1/auth/login`, then requests `/api/v1/auth/me` to verify that the browser accepted the httpOnly cookie. One AuthProvider and Query cache entry `['auth', 'me']` own the current user. Server session data is authoritative. No role selector, password constant, user object, or role is stored in localStorage.

A global pending/error state precedes protected rendering. A shared RoleGuard protects each role subtree and redirects anonymous users to `/login` and authenticated users to their own home. Opening `/login` while authenticated also redirects home. `/dispatch/*` remains a compatibility redirect to `/dispatcher/*`.

Shared `getHomeRoute` and `can` helpers define home routes and operational permissions. Typed layout users retain role-specific data contracts. Backend RBAC and SQL scoping remain authoritative; an out-of-scope record returns 404, a wrong-role operation returns 403, and a missing session returns 401.

The API client includes cookies, understands structured errors, preserves 409/422 domain messages, and suppresses 5xx implementation details. Auth responses are marked no-store. The cookie configuration retains Secure for production HTTPS and permits explicit HTTP localhost; `SECURE_COOKIES` can override it.

Logout waits for the server, cancels pending queries/requests, clears sensitive Query and mutation caches, and resets layout state by identity. It does not report success after a network/server failure. Session expiry uses the same cache boundary. There are no Zustand stores to clear.

The existing Store, Loader, and Dispatcher visual shells are preserved. Loader and Dispatcher gain scoped notifications. Dispatcher selects a default service date from operational orders instead of blindly using the end of the calendar. Demo-mode startup pins the operational clock to 10:00 Colombo time on the operating day preceding the seeded service date; production and session expiry still use real time.

## Driver workflow

The new mobile Driver workspace reads server-scoped trips and stops, supports departure, arrival, failure, recipient signature/POD and delivery, and exposes a Sync screen and notifications.

Driver actions write to Dexie first. Queries and mutations that access local storage use `networkMode: 'always'`. Outboxes and cached trips/stops are keyed by authenticated user **and** vehicle, survive logout, and remain hidden from other accounts. Before replay, the client rechecks `/auth/me`. POD uploads precede delivery events; lost upload responses are recovered from stop detail. Only confirmed syncs discard proof blobs. Conflict/rejected rows remain visible, and dependent events are withheld. Plan-version acknowledgement is persisted per account/trip and checked before further online actions.

## Validation

Final run: Biome, typecheck, Knip, and Docker build/start passed. Vitest: **415 tests in 31 files passed**. Playwright against `http://localhost:8080`: **10 tests passed**, including the real four-account scenario and demo Store eligibility.

- Existing PostgreSQL integration tests exercise auth signatures/expiry, all roles, scoped orders/trips/reference data, loading, delivery, receipts, planning, notifications, and idempotent sync.
- Added direct workspace RBAC tests: Store cannot read sibling/other-depot orders; outlet filters cannot widen scope; Driver cannot depart another vehicle's existing trip; Loader cannot auto-allocate; Dispatcher cannot enter the Store API.
- Added role-home/permission matrix and cookie deployment and demo-startup order eligibility tests.
- Added Playwright tests for initial loading without login flash, one login, credential/server errors, session confirmation, wrong-role redirects, refresh, expiry, logout failure, and history protection.
- Added Driver Playwright coverage for offline arrival/delivery, signature capture, logout/account isolation, POD upload ordering, and one-time replay.
- Added a real-stack Playwright scenario that signs into all four seeded accounts through Caddy and verifies role UI, redirects, cookies, scope, logout, and refresh. No API mocks are used in that scenario.

Commands:

```sh
pnpm biome check --write .
pnpm typecheck
pnpm knip
pnpm test
docker compose up -d --build
E2E_BASE_URL=http://localhost:8080 E2E_REAL_STACK=true pnpm e2e
```

## Scope and remaining limitations

- React Router is retained; this is not a TanStack Router migration. SYSTEM_DESIGN's router entry predates the actual frontend implementation.
- There is no service-worker app-shell cache. Offline actions work after the authenticated app has opened; a cold start/reload with no network is not supported. No offline authentication bypass was added.
- Sync conflicts/rejections are preserved for review; a dispatcher conflict-resolution API is not present in the existing backend.
- The deterministic seed begins before planning publication. Empty Loader/Driver trip lists are legitimate until a plan is published. Existing backend tests use nonempty assigned trips to validate isolation.
- The real-stack browser scenario verifies login, role reads and permissions without publishing or replacing the user's existing plan. Offline delivery browser coverage uses deterministic mocked API responses; delivery/POD/sync server behavior is separately covered by real PostgreSQL integration tests.
- No passwords or hashes were changed, and no demo fixtures were removed. Unused exported symbols were made private or removed to satisfy Knip; CSS font imports were moved to the application entry so Knip recognizes them.

## Verified local demo credentials

All four accounts were successfully authenticated through the real browser login using `waypoint-demo`.
These are the current local database assignments; another source dataset can select a different van/outlet.

| Role | Email | Scope | Home route |
| --- | --- | --- | --- |
| Dispatcher | dispatcher@waypoint.test | Peliyagoda | /dispatcher |
| Loader | loader@waypoint.test | Peliyagoda | /loader |
| Driver | driver@waypoint.test | VEH035 | /driver |
| Store Manager | store.manager@waypoint.test | OUT004 | /store |

## Changed files

- `.env.example`
- `README.md`
- `apps/api/src/app.ts`
- `apps/api/src/config/env.ts`
- `apps/api/src/modules/admin/__tests__/admin.test.ts`
- `apps/api/src/modules/auth/routes.ts`
- `apps/api/src/modules/dashboard/repo.ts`
- `apps/api/src/modules/notifications/repo.ts`
- `apps/api/src/modules/receipts/repo.ts`
- `apps/api/src/modules/receipts/service.ts`
- `apps/api/src/modules/reference/repo.ts`
- `apps/api/src/modules/sync/repo.ts`
- `apps/api/src/plugins/clock.ts`
- `apps/api/src/plugins/domain-events.ts`
- `apps/api/src/server.ts`
- `apps/api/test/env.test.ts`
- `apps/api/test/rbac.test.ts`
- `apps/web/package.json`
- `apps/web/src/app.tsx`
- `apps/web/src/components/waypoint/shell.tsx`
- `apps/web/src/features/auth/auth.tsx`
- `apps/web/src/features/auth/login.tsx`
- `apps/web/src/features/auth/notifications.tsx`
- `apps/web/src/features/dispatch/allocate.tsx`
- `apps/web/src/features/dispatch/board.ts`
- `apps/web/src/features/dispatch/command.tsx`
- `apps/web/src/features/dispatch/engine.ts`
- `apps/web/src/features/dispatch/inspector.tsx`
- `apps/web/src/features/dispatch/queue.tsx`
- `apps/web/src/features/dispatch/workspace.tsx`
- `apps/web/src/features/driver/driver.css`
- `apps/web/src/features/driver/offline.ts`
- `apps/web/src/features/driver/workspace.tsx`
- `apps/web/src/features/loader/loader.css`
- `apps/web/src/features/loader/workspace.tsx`
- `apps/web/src/features/store/auth.tsx`
- `apps/web/src/features/store/shared.tsx`
- `apps/web/src/features/store/workspace.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/styles/globals.css`
- `docs/AUTH_FLOW_REPAIR.md`
- `e2e/playwright.config.ts`
- `e2e/tests/auth.spec.ts`
- `e2e/tests/driver.spec.ts`
- `e2e/tests/roles.real.spec.ts`
- `e2e/tests/smoke.spec.ts`
- `infra/api.Dockerfile`
- `infra/web.Dockerfile`
- `packages/shared/src/index.ts`
- `packages/shared/src/permissions.ts`
- `packages/shared/test/permissions.test.ts`
- `pnpm-lock.yaml`
