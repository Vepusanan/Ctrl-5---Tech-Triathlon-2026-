# Waypoint component library

Preview: `/dev/design-system`. This route uses local sample data and is intentionally available in preview builds. No role screens or backend mutations are implemented.

Import components and types from `components/waypoint`. `styles/globals.css` loads the self-hosted Inter/Geist fonts and `styles/tokens.css` once at the app entry point. No Tailwind or default shadcn theme is used. The Button follows shadcn's Radix Slot composition pattern; the mobile sheet uses unstyled Radix Dialog for focus trapping, Escape, and focus restoration.

## Components

| Component | Main inputs / behavior |
| --- | --- |
| AppShell | `navigation`, `topBar`, `children`; desktop sidebar and mobile dialog, skip link |
| AppSidebar | `groups`, optional `footer`, `onNavigate`; active/disabled navigation and counts |
| TopBar | `section`, `title`, optional `context`, `profile`, `onSearch`, `searchValue`, `onNotifications`; Ctrl/Cmd+K focuses search |
| StatusBadge | `status` from exported `Status`; optional contextual `label`; fixed semantic mapping |
| Tag | `kind` from exported `TagKind`; optional label children; predictions have dashed borders |
| MetricCard | `label`, `value`, optional `delta`, `trend`, `icon`, `children`; omit delta without a baseline |
| HeroMetric | `label`, `value`, optional `description`, `icon`, `children`, `inverse` |
| CapacityBar | `label`, `value`, `max`, `unit`, optional `projected`; amber ≥90%, red >100%; preserves actual over-limit value in accessible text |
| RecommendationCard | `title`, `description`, `reasons`, `state`, `onAccept`, `onModify`, `onReject`; caller owns persistence/state |
| ViolationPanel | typed `violations`; danger blocks publishing, warning requests review; empty means clear |
| ActionList | typed `items` with callbacks, severity, icon and disabled state; optional footer |
| DataTable<T> | typed `columns`, `rows`, `rowKey`, `caption`; optional controlled `selection` and `onSelectionChange`, loading/error/retry/empty states |
| ConnectivityBadge | `state`: online/offline/stale; optional `lastSeen` |
| SyncBadge | `state`: pending/syncing/synced/conflict; optional `pendingCount` |
| EmptyState | optional title, description and action slot |
| ErrorState | title, description, optional retry callback and retrying flag |
| LoadingState | accessible label, optional skeleton row count; the generic Figma X03 loading card, for screens with no known layout yet |
| Skeleton | one placeholder block: `shape` (line, title, number, block, field, button, circle), `width`, `height`, `on` (surface, subtle, inverse) |
| SkeletonLines, SkeletonRows, SkeletonCard, SkeletonMetric, SkeletonTableRows | ready-made groups; pages combine them inside their own layout classes so nothing moves when data arrives |
| LoadingLabel | the screen-reader text (`role="status"`) that goes with a skeleton; takes no space |
| DeadlineCard | title, remaining display string, progress 0–100, optional deadline and upcoming/urgent/overdue/complete state |

Use `Button` for 44px action targets. Badges are noninteractive labels. Supply meaningful labels for icon-only actions. `DataTable` sorting is local to the supplied rows, not server-side pagination. The caller supplies a stable unique `rowKey`. Deadline strings/progress are supplied by the caller; this component does not calculate dates or run a timer.

## Visual source

[Figma Soft Bento](https://www.figma.com/design/LXaIkpyGMshfrqYe50jRDN/Tech-Traithlon?node-id=2012-181): tokens from `2010:400`, `2010:434`, `2010:541`, `2010:605`; status/tag components `54:30`; patterns `54:55`; shell `2034:673` and `2034:768`; metric, hero and actions `2037:729`, `2037:843`, `2037:861`.

Local SVG filenames retain their source context node ID and Figma asset name. SVGs are unmodified, with intrinsic dimensions preserved. Touch controls are enlarged to 44px while retaining the design's icon size. Spacing tokens use multiples of 4px; optical type sizes, borders and Figma corner radii retain their original values. Coral is a data mark color; body text uses semantic inks on tinted surfaces.

## Verification

`pnpm --filter @waypoint/web typecheck` and `pnpm --filter @waypoint/web build`.

`pnpm --filter @waypoint/e2e e2e tests/design-system.spec.ts` runs the gallery's Playwright checks. They cover desktop/mobile axe WCAG A/AA rules, mobile overflow, 44px controls, mobile dialog focus, intrinsic asset geometry, table sorting and selection, recommendation state, and error recovery. Automated checks supplement visual and keyboard review; they are not a full accessibility certification.
