# Dispatcher

Status of the Dispatcher front end, as of 4 October 2026. The work is on `main`, not committed.

## Summary

The Dispatcher UI from Figma (section A, every frame) is built at `/dispatcher`. It runs inside
the real sign-in, live updates, notifications and demo clock that `main` already had.

No page has been looked at in a browser yet, so the layout is unverified until it is reviewed by
eye.

Checks that passed for the Dispatcher files:

- Biome (lint and format), TypeScript, and the web unit tests.
- Every read "source" was run against the local API. A source is the code that maps real API data
  into the shape a page needs.
- One order was placed on a trip and removed again through the real API.

A production build failed earlier on missing Store files from another session. It was not re-run.

### Pages

All routes are under `/dispatcher`.

| Page | Route | Layouts | States built |
| --- | --- | --- | --- |
| D01 Command center | `/dispatcher` | Desktop, tablet, phone | Planning and Operations views, alert rows |
| D02 Planning queue + D02a Saved views | `/queue` | Desktop | Tabs, search, filters, column menu, export, views drawer |
| D03 Allocation + D03a Automatic result | `/allocate` | Desktop | Advice, assign, blocked vehicle, automatic run, undo run |
| D04 Fleet & trips | `/fleet`, `/vehicles/:id` | Desktop | Vehicle picker, capacity, trips |
| D04a Trip record | `/vehicles/:id/trips/:n/record` | Desktop | View only, correction dialog |
| D05 Validation | `/validation` | Desktop | Violations, risks, re-run |
| D06 Deferrals + D06a Confirm | `/deferrals` | Desktop | Candidates, preview, confirm dialog |
| D07 What-if simulator | `/simulate` | Desktop | Levers, comparison |
| D08 Review & publish + D08a Published | `/review` | Desktop | Checks, publish, published tracker |
| D09 Live operations | `/live` | Desktop, phone | Exceptions / all trips, alert |
| D09a–c Exception | `/live/exceptions/:id` | Desktop | Open, acknowledged, minor |
| D10 Analytics | `/analytics` | Desktop | Class and depot filters, export |
| D11 Orders & audit | `/orders` | Desktop | Search, source filter |
| D12 Replan | `/vehicles/:id/replan` | Desktop | Proposal, publish, published |
| D13 Outlets | `/outlets` | Desktop | Filters, search, profile |
| Shell | every page | Desktop, tablet rail, phone tab bar | Sidebar counts, search, bell, account menu |

### Data

- **Real API:** D01 to D09b and D04a. Allocate, automatic allocation, deferrals, simulate, publish
  and acknowledge are real requests, with the same validation steps `main` had.
- **Fixtures only** (fixed sample data copied from Figma): saved views (D02a), analytics (D10),
  orders & audit (D11), replan (D12), outlets (D13), and the D09c "minor exception" state. These
  show the Figma scenario, not the database.
- **Mixed:** on real pages, fields the API does not return are left empty or worked out in the
  browser. The full list is in `docs/IMPLEMENTATION.md` §8.
- No API contract, backend code or database schema was changed.
- The seeded database is small (13 orders and 3 available vehicles on the run tested), so real
  pages look emptier than Figma. Run `VITE_DISPATCH_FIXTURES=all pnpm dev` to see every page
  filled like the Figma frames.

### Files and areas changed

- `apps/web/src/features/dispatch/`: all pages, `workspace.tsx`, a Dispatcher-only shell
  (`shell.tsx`, `shell.css`), and the new `data/` folder (client, real-API sources, fixtures).
- Shared files, additions only: new `controls.tsx`, `primitives.tsx`, three `lib/` helpers, new
  icon folders, new tokens, and optional props on `Button`, `Badge` and `MetricCard`. Store, Loader
  and Driver should look the same as before.
- `apps/web/package.json` and `pnpm-lock.yaml`: added `zod`, which was already in the workspace.
- `docs/IMPLEMENTATION.md`: rewritten for the new state.

## Review order

Run `pnpm dev`, sign in as `dispatcher@waypoint.test` / `waypoint-demo`, and use a 1440px wide
window. Compare each page with its Figma frame (node ids are in `docs/IMPLEMENTATION.md` §7).

1. **Shell.** Sidebar, top bar, bell panel, and the account menu (⋯ beside your name). The account
   menu now holds the service date, demo clock, demo reset and sign out.
2. **Command center.** Both views (Planning and Operations). Click an alert.
3. **Planning queue.** Tabs, filters, export. Save a view.
4. **Allocation.** Pick an order and assign it. Try a blocked vehicle. Run automatic allocation,
   then undo it.
5. **Fleet & trips**, then **Trip record** on a trip that has stops.
6. **Validation**, **Deferrals** (with the confirm dialog), **Simulator**.
7. **Review & publish.** Publishing can only be undone by a demo reset, so do this late.
8. **Live operations** and an exception, after a loader reports a shortfall.
9. **Analytics**, **Orders & audit**, **Outlets**, and `/dispatcher/vehicles/VEH052/replan`. Use
   fixtures mode for the replan page.
10. **Tablet and phone.** Command center at 1180px and 390px wide. Live operations at 390px.
11. **Other roles.** Open `/store` once to confirm its sidebar and top bar did not change.

## Known limitations

### Work that was overwritten

- A teammate's "fix UI" restyle of the command center, queue and allocation pages is replaced by
  the Figma pages. It is still in commit `e7334f7`.
- Another session was adding skeleton loaders (grey placeholders shown while data loads) at the
  same time. If it had already edited the 9 old Dispatcher pages, those edits are lost. This could
  not be confirmed either way.
- That session's `dispatch/skeletons.tsx` was deleted, because it matched the old layout. Pages
  use the shared loading card instead.

### Things the server cannot do yet

The page shows a clear message instead of pretending:

- "Copy to draft" on the simulator.
- Correction requests on the trip record.
- Undoing an acknowledgement of a loading shortfall.

### Data gaps

- The plan quality score is a simple measure worked out in the browser, not a model score.
- Outlet names, order reference numbers, driver names, late-arrival risk and costs in rupees are
  not in the API. See `docs/IMPLEMENTATION.md` §8 for what each page shows instead.
- Fixture pages (D10 to D13, saved views) show Figma's orders, outlets and vehicles, not the ones
  in the database.

### Not done

- Notifications work on the real feed but keep the earlier design, not Figma X02.
- The end-to-end tests `ui-layout.spec.ts` and `roles.real.spec.ts` were written for the old
  pages. They were not run or updated.
- The Geist Mono font is not installed. Ids and reason codes fall back to the system monospace
  font.

### Outside the Dispatcher

- Two type errors remain in `features/store/place-order.tsx`. They come from another session's
  work in progress.
- Local database: one test order was placed and removed on the 2026-06-26 Peliyagoda run.
  Allocations are back to zero. The plan version went from 0 to 2.
