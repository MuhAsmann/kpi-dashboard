# Task Calendar — design spec

Date: 2026-08-07

## Goal

Add a new "Calendar" menu/page that shows tasks laid out on a month/week/day
calendar, colored by their GitHub status lifecycle, based on a Claude Design
mockup (`Task Calendar - Studio.dc.html`). Additive only — no existing files
change.

## Non-goals

- No new API routes or backend/service changes. Everything is built from
  data the existing `/api/kpi/users`, `/api/kpi/summary`, and (for Bucket
  color mode) `/api/status-mapping` endpoints already return.
- No changes to `app/dashboard/page.tsx` or any other existing file.
- No new test framework — this repo has none today; not introducing one for
  a single new file. Verified manually against real synced data instead.

## Architecture

- New route: `app/calendar/page.tsx` (client component). Has its own local
  `Sidebar` component (copied/adapted from the one inlined in
  `app/dashboard/page.tsx`), with "Dashboard" and "Calendar" as real links
  and the rest of the nav items left as decorative placeholders, same as
  today's dashboard.
- New pure-logic module: `lib/calendar-utils.ts` — no React, no fetch calls.
  - Builds per-task lifecycle segments from `TaskHistory`.
  - Lane-packing layout math for month/week bars (ported from the design's
    `layout()`/`bar()` functions).
  - Deterministic color assignment for raw status strings.
- Data fetched client-side, re-fetched whenever the project selector changes,
  from:
  - `GET /api/kpi/users?project=<n>` (project omitted → all boards; existing
    endpoint, existing `project` query param — every user's tasks with full
    `histories`, `labels`, dates, `repository`, `status`).
  - `GET /api/kpi/summary?project=<n>` (for `repositories` list and
    `last_sync`).

**Project selector**: the dashboard now scopes filtering/status-mapping/
export/sync to one board via a header "Project" `<select>` sourced from
`lib/projects.ts` (`PROJECTS`), defaulting to "All projects". The calendar
gets the same selector in its own header, same default, same reuse of
`PROJECTS` and the `?project=` param — kept because boards can define wildly
different status vocabularies (that's the reason per-project buckets exist),
so mixing boards into one raw-status-colored calendar would be confusing.
This is the calendar's only filter that triggers a re-fetch; repo/assignee/
label/status filters below stay client-side over whatever the project
selector already loaded.

## Data mapping

**Segments** (per task, from `TaskHistory` sorted by `changed_at` asc):
- First segment: `status = histories[0].old_status ?? task.status`,
  `start = task.start_date ?? task.created_at`.
- Each history row after that starts a new segment at `changed_at` with
  `status = new_status`.
- Last segment end: `closed_at` if the task is closed, else `end_date` if
  set (planned/target), else "today" (open-ended, still active).
- Tasks with zero history rows: single segment,
  `status = task.status`, `start = start_date ?? created_at`,
  `end` per the same closed/end_date/today rule.

**Color mode — two selectable options**, toggled via a pill switch in the
calendar header (same visual pattern as the design's own Span toggle).
Segment *boundaries* (the date math above) never change between modes —
only how each segment is labeled/colored:

- **By status** (default): each segment's label/color comes straight from
  its raw `TaskHistory.new_status` text, hashed to one of the app's 5
  existing accent tokens (`--accent`, `--accent-blue`, `--accent-pink`,
  `--accent-green`, `--accent-lavender`) — not the mockup's own
  green/amber/red palette. Same status text always gets the same color
  within a session. No extra fetch — everything needed is already in
  `/api/kpi/users`.
- **By bucket**: each segment's label/color comes from that board's
  `ProjectBucket` mapping instead. Reuses the existing
  `GET /api/status-mapping?project=<n>` endpoint (already powers
  `StatusMappingModal` — no backend change) to build a client-side
  `${project_number}:${raw_status} -> bucket` lookup, fetched once per
  project-selector change (and cached for "All projects" as one lookup
  across every board). A segment whose raw status has no `bucket_id` in
  that table renders as "Unmapped", styled like the existing
  `.badge-unmapped` (dashed border, muted color) used elsewhere in the app.
  Bucket colors are the same accent-token hash, keyed by `bucket.id` instead
  of raw text, so one bucket keeps one consistent color across all projects
  in a session.

Segment boundaries and end-date fallback (`closed_at`/`end_date`/"today")
stay exactly as specced above regardless of mode — neither depends on
status text or bucket, so switching modes never reflows the calendar grid,
only recolors/relabels the bars already laid out.

**Bucket mode constraints** (discovered during implementation planning):
- Requires one specific project to be selected. `UserKPI.tasks[]` doesn't
  carry `project_number`, so a `project_number:raw_status` bucket lookup is
  only unambiguous when every loaded task belongs to the one project the
  selector is scoped to. The "By bucket" toggle is disabled (with a tooltip)
  whenever the Project selector is "All projects", auto-falling back to
  "By status".
- `/api/status-mapping`'s status list is each project's *currently active*
  statuses only (`getStatuses()` is `distinct` over live `Task.status`), not
  every status that ever appeared in `TaskHistory`. A segment whose status
  no task is presently sitting in renders as "Unmapped" in bucket mode even
  if it was mapped before. Documented limitation, not fixed — fixing it
  needs a new/changed API route, which the Non-goals section rules out.

**Filters**: Repository, Assignee, Label, Status — option lists derived
client-side from the fetched task set (distinct values), same approach as
the design's `uniq()` helper. Purely client-side filtering of already-loaded
data; no new backend query params.

## Views

Full design scope, all client-state (no URL persistence):

- **Month**: grid of weeks; each task drawn as a continuous bar spanning the
  days it's live within that week, broken into colored sub-segments per
  status change, with lane-packing + "+N more" overflow when a week is full.
- **Week**: same bar/lane logic, 7 wider day columns.
- **Day**: list of tasks active that day, each with a status pill and
  metadata line.
- **Span toggle**: "State timeline" (continuous bars, default) vs "Per-day"
  (small per-day status chips instead of spanning bars).
- **Color mode toggle**: "By status" (default) vs "By bucket" — see Data
  mapping above.
- **Detail panel**: slide-in aside on task click — assignee, repository,
  started date, closed/target date, duration, labels, full state timeline,
  "Open on GitHub" link. Drops the design's specific "Blocked days" stat
  (no reliable way to detect a "blocking" status from free-text — the full
  timeline already shows this).

## Styling

Reskinned entirely to this app's existing soft neo-brutalism system: 2px
solid borders, hard offset box-shadows (`3px 3px 0` / `5px 5px 0`), monospace
headers via `var(--font-mono)`, existing CSS custom properties and classes
(`.neo-btn`, `.badge`, `.pulse-dot`, `.progress-bar`) from `app/globals.css`.
Not the mockup's rounded/soft-shadow visual style — the mockup is used only
for layout and interaction pattern.

## Empty / loading / error states

Mirror `KPITable`'s existing patterns: skeleton pulse rows while loading, a
centered empty-state message when no tasks match the current view/filters,
console-logged fetch errors (consistent with how `app/dashboard/page.tsx`
handles fetch failures today).

## Verification

Run `next dev`, navigate to `/calendar`, and manually confirm against real
synced data:
- Month/Week/Day views render tasks correctly, including multi-status bars.
- Project selector re-fetches and scopes data correctly, including "All projects".
- Color mode toggle switches between raw-status and bucket coloring without
  reflowing bar positions; unmapped statuses show as "Unmapped" in bucket mode.
- Filters (repo/assignee/label/status) narrow the view correctly.
- Span toggle switches between continuous bars and per-day chips.
- Clicking a task opens the detail panel with correct data.
- Empty and loading states render correctly.
- No console errors.
