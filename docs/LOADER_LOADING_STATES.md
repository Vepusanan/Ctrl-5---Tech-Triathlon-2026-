# Loader · loading states

What was built for the Loader user's loading, empty, error and busy states, the order to review it
in, and what is still open.

Date: 2026-10-04. Branch: `main`. Nothing is committed.

Checks run: Biome (the linter) passes on `apps/web/src/features/loader`. The type check has 0
errors outside `features/dispatch/` (that folder is being changed in another session and does not
build yet). Nothing was checked in a browser.

## 1. Summary

### What Figma has for the Loader

The eight main Loader screens (L01–L07, section B) have no loading frames. The Loader prototype
(section G, node `2140:17884`) does. These five frames were the source:

| Figma frame | Node | What it shows |
| --- | --- | --- |
| G02 · Assigned loads — loading | `2148:21593` | Skeleton, "refreshing…" under the title, greyed "Refreshing…" pill |
| G04 · Assigned loads — empty | `2148:21672` | Truck icon, "No loads currently awaiting action", Refresh button |
| G05 · Assigned loads — error | `2148:21747` | Red wifi-off icon, "Couldn't load your assigned loads", Retry button |
| G14 · Exception — submitting | `2146:21052` | "Sending…" button with spinner, form locked |
| G15 · Exception — send failed | `2146:21284` | Red banner, entries kept, button becomes Retry |

The shared rules come from frame X03 "System states" (`2048:7666`): skeleton blocks use the subtle
grey, pulse gently, and stop moving when the device asks for reduced motion. A busy button keeps
its label, shows a small spinner, and blocks a second tap.

### What was built

| Screen | State | Result |
| --- | --- | --- |
| Assigned loads | Loading (G02) | White main card with five grey bars, three grey blocks on the right. The title is real; the line under it reads "refreshing…". |
| Assigned loads | Refresh | New Refresh pill at the right of the title. It reads "Refreshing…" only when pressed, not on the automatic 30-second refresh. |
| Assigned loads | Empty (G04) | Centred card: truck icon, "No loads currently awaiting action", Refresh button. |
| Assigned loads | Error (G05) | Centred card: red wifi-off icon, "Couldn't load your assigned loads", Retry button. |
| Assigned loads | Stale data | If a background refresh fails while data is on screen, the data stays. The line under the title reads "couldn't refresh · last updated HH:MM". |
| Load plan | Loading | Same G02 style in the load plan's own layout, with the bottom action bar already in place. The title shows the real vehicle name when the trip list is already loaded. |
| Load plan | Error | The G05 card with Retry, and a back button to Assigned loads. |
| Report shortfall | Sending (G14) | Button reads "Sending…" with the spinner. Status line reads "Sending to dispatcher…". Every field is locked. |
| Report shortfall | Send failed (G15) | Banner reads "Couldn't send the shortfall … Your entries are kept — tap Retry". Button reads "Retry". |
| App bar | Loading | The "Plan v…" pill holds its place while trips load, so the bar does not shift. |
| All action buttons | Busy | The button stays black with the spinner. Before, it turned grey like a disabled button. |

### Files

| File | Change |
| --- | --- |
| `apps/web/src/features/loader/skeletons.tsx` | New. `AssignedSkeleton`, `LoadPlanSkeleton`. |
| `apps/web/src/features/loader/shell.tsx` | New `RefreshButton` and `StateCard`. App bar pill placeholder. Three new icon names. |
| `apps/web/src/features/loader/assigned.tsx` | One heading for all states; loading, error, empty and loaded bodies. |
| `apps/web/src/features/loader/load.tsx` | Skeleton with real title, error card, failed-send banner wording. |
| `apps/web/src/features/loader/shortfall.tsx` | Fields lock while sending; "Sending…" and "Retry" labels. |
| `apps/web/src/features/loader/workspace.tsx` | Tells the app bar when trips are still loading. |
| `apps/web/src/features/loader/loader.css` | Styles for the pill, the state card and the skeleton bars. Busy buttons keep their colour. |
| `apps/web/public/waypoint/loader/` | Three icons from Figma: `refresh.svg`, `truck-empty.svg`, `wifi-off-danger.svg`. |

Shared pieces used, from the first pass: `Skeleton`, `LoadingLabel` in
`apps/web/src/components/waypoint/skeleton.tsx`, and the button spinner in
`apps/web/src/styles/globals.css`.

### Where the states come from

Every state is driven by the existing request state from React Query (the library that fetches
data): the trips list, the trip and loading requests, and the one shared action request. Nothing is
tied to mock data. No API, database schema or business rule changed.

## 2. Review order

Sign in as a loader. Set the browser to tablet width (about 1180px). In the browser dev tools,
slow the network so each state stays on screen long enough to see.

1. **App bar.** Reload the page. The "Plan v…" pill should hold its place and not jump in.
2. **Assigned loads, loading.** On the same reload, the skeleton shows: a white card with grey
   bars on the left, three grey blocks on the right. Compare with Figma G02. When the data
   arrives, the cards should land in the same place.
3. **Refresh pill.** Press Refresh. The pill greys out and reads "Refreshing…". The content stays
   on screen.
4. **Assigned loads, empty.** With no published trips, the empty card shows. Compare with G04.
   Press its Refresh button: it shows a spinner.
5. **Assigned loads, error.** Go offline in dev tools and reload. The error card shows. Compare
   with G05. Go back online and press Retry.
6. **Stale data.** With loads on screen, go offline and press Refresh. The loads stay; the line
   under the title reads "couldn't refresh · last updated HH:MM".
7. **Load plan, loading.** Open a load. The skeleton shows with the action bar at the bottom and
   the real vehicle name in the title.
8. **Load plan, error.** Go offline and open a load by its link. The error card with Retry shows.
9. **Start loading.** Press Start loading. The button stays black with a spinner and a second tap
   does nothing.
10. **Report shortfall, sending.** Count a stop short, go to Verify, then Report shortfall. Press
    Send. The button reads "Sending…", the status line reads "Sending to dispatcher…", and the
    fields are locked. Compare with G14.
11. **Report shortfall, failed.** Go offline and press Send. The red banner shows, your entries
    stay, and the button reads "Retry". Compare with G15.
12. **Mark Ready and Confirm departure.** Each button stays black with a spinner while it works.
13. **Switch user.** Press Switch user, then confirm. The button shows a spinner.
14. **Narrow width.** Repeat steps 2 and 7 at about 900px wide. The skeleton should stack the same
    way the loaded screen does.
15. **Reduced motion.** Turn on "reduce motion" in the system settings. Skeletons and the spinner
    should stop moving.

## 3. Known limitations

1. **Refresh does not swap back to the skeleton.** The prototype jumps to G02 on every Refresh.
   The content stays on screen and only the pill changes, so the page does not flash. This can be
   changed if the skeleton is wanted on every refresh.
2. **Error text is the real server message.** Figma shows a fixed "Check the connection and try
   again". The real message is shown so that errors that are not about the network are not
   mislabelled.
3. **Wording.** The app says "shortfall" where the prototype says "exception". The app's word was
   kept.
4. **No Figma loading frame for Load plan, Verify or Ready.** The load plan skeleton follows the
   G02 style. A direct link to Verify or Ready shows the load plan skeleton first.
5. **Busy button size.** Figma draws the "Sending…" button at 40px. The 52px tablet size used by
   the other Loader buttons was kept.
6. **Busy button width.** A button grows by about 20px when the spinner appears.
7. **Spinner.** The Figma spinner image exports as an almost invisible hairline. The same 12px arc
   is drawn in CSS instead.
8. **Other busy labels.** Only the shortfall button changes its label ("Sending…"). Start loading,
   Mark Ready and Confirm departure keep their label and add the spinner, because Figma gives no
   in-progress wording for them.
9. **Refresh pill height.** It follows Figma (about 37px), which is smaller than the 52px touch
   target used elsewhere on the tablet.
10. **Notifications screens (G19, G20, G37, G38)** are in the prototype but are not built in the
    Loader app, so they have no loading state.
11. **Risk from the other session.** The Dispatcher work in another session also touches shared
    files such as `globals.css`. If those are replaced with the `Dispatcher_UI` versions, the
    skeleton and spinner styles must be re-applied.
12. **Not checked in a browser.** Only the linter and the type check were run.
