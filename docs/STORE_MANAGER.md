# Store Manager

Summary of the Store Manager UI build, the order to review it in, and what is not finished.
The full detail (frame node ids, backend gap table, file list) is in
[IMPLEMENTATION.md](IMPLEMENTATION.md) §11.

## Summary

The Store Manager UI is built for all 16 Figma frames of section D, on desktop (1440) and phone
(390). It has not been opened in a browser yet: the review below is the first visual check.

Checks that were run:

- TypeScript passes for the whole project.
- Biome (the linter) is clean on the Store folder.
- A production build succeeds.
- `pnpm check` still reports 3 errors. All 3 are in Loader SVG files from other work, not in the
  Store code.

Nothing is committed. No API, shared contract or database file was changed.

### How to see it

1. Run `pnpm dev` and sign in as `store.manager@waypoint.test` / `waypoint-demo`.
2. Open `/store?fixtures=on`. This shows the Figma scenario: outlet WF-F071 Gampola on
   Fri 25 Sep at 11:40.
3. Open `/store?fixtures=off` to go back to the real data.

In the Figma scenario, actions change memory only and reset when the tab is refreshed. Sign-in is
always real.

### Pages

| Page | Route | Figma frame | Phone frame |
| --- | --- | --- | --- |
| Store home | `/store` | S01 | S01m |
| Place order / edit | `/store/orders/new`, `/store/orders/:id/edit` | S02 | S02m |
| Order held (cutoff passed) | `/store/orders/:id/held` | S02a | desktop layout stacked |
| Order confirmation | `/store/orders/:id/confirmation` | S03 | S03m |
| Tracking & ETA | `/store/deliveries`, `/store/orders/:id` | S04 | S04m |
| Deferral notice | `/store/orders/:id/deferred` | S05-W | S05 |
| Confirm receipt | `/store/receipts`, `/store/orders/:id/receipt` | S06-W | S06 |
| Report an issue | `/store/orders/:id/issue` | prototype I24 | S06a |
| Issues | `/store/issues` | S07 | S07m |
| Notifications | `/store/notifications` | prototype I29 | prototype J12 |

These states come from the prototype frames (section I): loading skeleton, load error, empty
home, submit failure, validation, the "Receipt confirmed" dialog and "Issue sent".

### Data

The data is mixed.

- **Real API (default).** Workspace, order detail, notifications, placing and editing an order,
  confirming a receipt, reporting an issue. These are the same requests as before.
- **Fixture in both modes.** The product catalogue and the "usual" quantities. The API stores an
  order as units, weight and volume only, so the product lines add up to the size that is sent.
- **Fixture only.** Driver name and phone, "stop 1 of 3", the pre-notified shortage and top-up,
  late arrivals, issue numbers and timeline, the planning phone number, reason number R-03. On
  real data these are hidden or shown in a simpler form.

All data goes through one file, `apps/web/src/features/store/data.ts`. A fixture can later be
replaced by a real endpoint there without changing the pages.

### Files

Everything is in `apps/web/src/features/store/`.

- New: `shell.tsx` (Figma sidebar, top bar, phone tab bar), `ui.tsx`, `states.tsx`,
  `contracts.ts`, `fixtures.ts`, `data.ts`, and one file per screen (`home`, `confirmation`,
  `tracking`, `deferral`, `receipt`, `issue-report`, `issues`, `notifications`).
- Rewritten: `workspace.tsx`, `place-order.tsx`, `order-page.tsx`, `store.css`.
- Deleted: `dashboard.tsx` (replaced by `home.tsx`).
- Unchanged: `shared.tsx`. Driver, Loader and Dispatcher import helpers from it.
- No shared component was edited.

### Things to know

- **`shared.tsx` was deleted by mistake and restored.** It had no uncommitted edits, so the
  restored file is identical to the last commit. The `.store-signin`, `.store-form` and
  `.store-error` styles, which the sign-in page uses, were also put back in `store.css`.
- **`order-page.tsx` had an uncommitted edit from another session** (a loading skeleton). The
  rewrite replaced that file; the new version has its own skeleton.
- **Shared primitives had no styles outside the Dispatcher.** Icon, Avatar, ProgressBar, Banner
  and others are styled only under the Dispatcher scope. Those rules are copied into `store.css`
  under the Store scope. Moving them to the global stylesheet would be cleaner, but that is a
  shared change and needs a decision.

## Review order

Use `/store?fixtures=on`. Go through the list at 1440px wide, then again at 390px.

1. **Store home.** The countdown ticks. Click an order half. Fold the sidebar. Open "⋯" on the
   user card and check Sign out is there.
2. **Place order.** Tabs, search, steppers, the amber "usual" warning, Save draft, then Submit
   both orders.
3. **Confirmation.** Edit order, then Back to home. The home page now shows Confirmed.
4. **Deliveries.** The timeline, the order picker, the dashed receipt card.
5. **Receipts.** Change a count: the button becomes "Confirm with 1 issue". Confirm and check
   the dialog.
6. **Issue on a line.** Pick a type and a count and submit. Then try to submit it empty.
7. **Issues.** Open and Resolved tabs. Select another issue.
8. **Bell.** Open "Order deferred" (S05) and "Order held after cutoff" (S02a). Then Mark all
   read.
9. **States.** Go offline in the browser dev tools: the offline banner shows. On real data, stop
   the API: the skeleton shows, then the error card with Retry.
10. **Real data.** Open `/store?fixtures=off` and repeat steps 1–8.

## Known limitations

- **Controls that are not in Figma.** An order picker on Deliveries and Receipts, because Figma
  shows one delivery only. Sign out at the foot of Notifications on a phone, because the phone
  has no sidebar.
- **Removed field.** The free-text "Note for planning" on the issue form is gone, because Figma
  has no such field. The note is now built from the type, the count and the product.
- **Photo on an issue.** The photo is chosen but not uploaded. The API takes no file.
- **"Too warm".** It is sent as "damaged" with the reason in the note. The API has three issue
  types only.
- **S02a on a phone.** There is no phone frame, so the phone view is the desktop layout stacked.
- **Fixture times.** Each order screen is frozen at its Figma moment (tracking at 05:44, the held
  order at 16:07) while the top bar shows 11:40.
- **Icons.** The existing icon set is used by name. Each frame's own assets were not fetched from
  Figma.
- **Order numbers.** The API has no order number, so a real order shows `ORD-` plus the first 8
  characters of its id.
- **Catalogue.** It is for the Fresh brand only. A Style or Tech outlet sees the dry grocery list.
- **e2e specs.** `ui-layout.spec.ts` and `roles.real.spec.ts` describe the old Store pages and
  were not re-run.
- **Not viewed in a browser.** Layout and spacing are checked from code and Figma only.
