# Driver

Summary of the Driver UI work, how to review it, and what is still limited.

## Summary

The Driver UI covers all 13 Figma frames (DR01–DR08). It has not been viewed in a browser yet.
Driver files pass Biome (the linter) and TypeScript with no errors.

The web app does not build right now. The build stops on missing files in the Store Manager code
(`./issues`, `./notifications`), which another session is editing. This is not caused by the
Driver files.

The Driver app already existed on `main` with 8 routes on the real API and an offline queue (the
"outbox": events saved on the phone until they reach the server). So this work was an audit against
Figma plus the missing screens, not a new build.

Nothing in the backend, the API contracts or the database was changed. Nothing is committed.

### Pages

Figma has phone frames only (390 × 844), so there is no desktop layout. Wider screens show the
phone column centred.

| Page | Route | Figma | Main interactions | Data |
| --- | --- | --- | --- | --- |
| DR01 My trips | `/driver` | `2046:4816` | Open trip, Start trip | API |
| DR02 Trip overview | `/driver/trips/:tripId` | `2046:5122` | Arrive at stop, open stop | API |
| DR03 Stop detail | `/driver/stops/:stopId` | `2046:5243` | Call contact, I've arrived, Record delivery | Mixed |
| DR04 Outcome & POD | `/driver/stops/:stopId/outcome` | `2046:5462` | Name, signature, photo, Complete delivery | Mixed |
| DR04a Failed delivery | same route, "Failed" | `2046:5550` | Pick a reason, Record failed delivery, Call dispatcher | Mixed |
| DR05 Offline mode | DR02 with no connection | `2046:5341` | Offline bar opens Sync | Phone cache |
| DR05a Saved offline (new) | `/driver/stops/:stopId/saved` | `2046:5641` | Next stop | Outbox |
| DR05b / DR05c Sync centre (rebuilt) | `/driver/sync` | `2046:5705`, `2046:5840` | Sync now, Back to trip | Outbox |
| DR05d Conflict (new) | `/driver/sync/conflicts/:eventId` | `2046:6036` | Keep my record, See route | Outbox + API |
| DR06 Route change | `/driver/notices/:noticeId` | `2046:4727` | Acknowledge route | API |
| DR07 Notices | `/driver/notices` | `2106:10655` | Open a notice | API |
| DR08 Account (rebuilt) | `/driver/account` | `2106:10764` | Sound, language, Call dispatcher, Sign out | Mixed |

"Mixed" means API plus fixture data (made-up but realistic values kept in one file,
`features/driver/fixtures.ts`). The fixture items are the outlet contact and access note, the
dispatcher phone, and the weekly on-time record.

### Files changed

All changes are in `apps/web/src/features/driver/`, plus one icon.

- **New:** `saved.tsx`, `conflict.tsx`, `fixtures.ts`, and `public/waypoint/icons/logout.svg`
  (downloaded from Figma).
- **Rebuilt:** `sync.tsx`, `account.tsx`.
- **Edited:** `shell.tsx` (Figma offline bar, tinted icon `Glyph`, status `Chip`), `workspace.tsx`
  (two new routes), `trips.tsx`, `trip.tsx`, `stop.tsx`, `outcome.tsx`, `pod.tsx`, `notices.tsx`,
  `labels.ts`, `driver.css`.
- **Docs:** `docs/IMPLEMENTATION.md` has a new §11 with Driver routes, data sources and backend
  gaps.

No shared component and no other role's page was touched.

## Review order

Sign in as `driver@waypoint.test` / `waypoint-demo` with the browser at 390 px wide. The Store
build errors must be fixed first, or the app will not load.

1. **My trips:** hero card (stops, cartons, km), place-name chips, green "Route v… saved for
   offline" strip.
2. **Start trip → Trip overview:** "In progress" badge, outlined "Next" stop, progress bar.
3. **Arrive at … → Stop detail:** dark arrival card with window bar, phone button, access and
   contact rows, carton count.
4. **Record delivery:** three segments (Partial is greyed out), pre-filled name, signature, photo,
   stepper.
5. **Complete delivery → Saved screen:** green tick, record card, "Next stop".
6. **Next stop → Failed:** five reason chips, time-in-window tile, "Call dispatcher" link.
7. **Go offline** (DevTools → Network → Offline): dark offline bar with pending count; record a
   stop; trip overview shows compact "Saved" rows.
8. **Sync tab offline:** amber ring, queued events, disabled "Sync now" with the note under it.
9. **Go online:** ring turns green, rows read "Synced", dark "Route v… is still current" card,
   "Back to trip".
10. **Notices:** count card, "Needs you" and "Earlier" lists; open one and acknowledge it.
11. **Account:** profile, dark weekly dots, settings rows, language switch, red Sign out (locked
    while events are pending).
12. **Loading and errors:** reload each page for the skeletons; stop the API for the error state
    with Retry.
13. **Wide window:** the column stays centred, no sideways scroll.

## Known limitations

- **Partial delivery and the carton stepper** are drawn but disabled. The API has no partial
  outcome or delivered quantity.
- **Failed-delivery reasons changed** from the previous seven to Figma's five (Outlet closed, No
  access, Refused, Damaged, Other). The API stores the text as written, so check whether the Store
  or Dispatcher side depends on the old wording.
- **Goods are now called "cartons"** as in Figma; the API field is still `units`.
- **Photo evidence on a failed stop** is not built; the API takes a photo only with a delivery.
- **Conflict screen** shows the recorded event against the stop's current state and the server's
  message. Figma shows carton counts on both sides, which the API does not give. "Keep my record ·
  tell dispatcher" only returns to Sync; it sends nothing.
- **Missing times and sizes:** planned departure, "Departed 04:41", publish time of later trips,
  queue size in MB and sync duration are not in the API, so they are left out.
- **Route change** shows the version jump and added/removed/moved counts only when the phone has a
  change from its last sync; there is no per-stop diff.
- **Account:** sound and language are saved on the phone only, and the UI is not translated. The
  depot name is left out.
- **Conflict screen is the least certain:** no real conflict was produced to check it against.
- **Tests:** `e2e/tests/driver.spec.ts` already did not match the screens before this work; it was
  not updated or run.
- **Not viewed in a browser.** Checks run were Biome and TypeScript only.
