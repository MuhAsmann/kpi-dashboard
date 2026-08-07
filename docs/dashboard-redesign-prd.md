# PRD: `/dashboard` Redesign

**Status:** Draft
**Owner:** TBD
**Date:** 2026-08-07
**Scope:** Visual/UX redesign of the existing KPI Dashboard screen. No new data, no backend changes — this is a redesign of how existing data is presented, not what data exists.

## 1. Background

The KPI Dashboard (`/dashboard`) tracks developer performance from GitHub Projects V2 data (tasks, status, cycle time, story points). The screen currently works but was built incrementally, feature by feature, without a unifying visual/interaction design pass. This PRD captures **what the screen currently does** as the source of truth for scope, so a redesign can improve *how* it looks and *how* users interact with it without silently dropping functionality.

Non-goal: this PRD does not prescribe layout, chart types, or visual style — those are left to design exploration. It defines what must still be true after the redesign.

## 2. Current State Inventory

### 2.1 Filters (`FilterBar`)
| Control | Behavior |
|---|---|
| From date | Filters tasks by `start_date`, defaults to first day of current month |
| To date | Filters tasks by `end_date`, defaults to last day of current month |
| Repository dropdown | Only shown if repositories exist; populated dynamically from synced data |
| Clear filters | Only visible when a filter is active; resets all three |
| Column sort (in table header) | Sort by total tasks, completed, completion rate, avg cycle time, or bug count — client-side, asc/desc toggle |

Changing any filter re-fetches `/api/kpi/users` and `/api/kpi/summary` in parallel.

### 2.2 Header actions
- App title, link out to GitHub org
- **Export CSV** — downloads `tasks-export.csv` for the current filter scope
- **Sync GitHub** — triggers a manual data sync, shows idle/syncing/success/error state

### 2.3 Summary cards (6 stat tiles)
Total Tasks, Completed, Active Devs, Completion Rate, Active Tasks, Story Points — plus a "last synced X ago" timestamp.

### 2.4 Chart
Bar chart of top 10 developers by task volume, three stacked series: Completed / In Progress / Todo.

### 2.5 Developer KPI table
One row per developer: rank, avatar/name, total, completed, completion rate (progress bar), avg cycle time, bug count, story points (+ warning if tasks are missing SP), active-work badges (WIP / Todo / Overdue).

Clicking a row expands an inline panel listing that developer's individual tickets — each with title/link, SP, overdue/bug badges, status, repo, dates, labels, and a status-change history timeline.

No pagination — all developers and, on expand, all of a developer's tickets render at once.

### 2.6 Empty/loading states
Skeleton cards while loading; "No KPI data yet" message when a sync hasn't run.

## 3. Known Limitation: Single Hardcoded GitHub Project

The app currently syncs exactly **one** GitHub Project, chosen by `GITHUB_PROJECT_NUMBER` in the environment (`lib/sync-service.ts:53`, defaults to `1`, example env sets `9`). This is not just a sync-config detail — it directly constrains the dashboard's filters:

- There is no project switcher anywhere in the UI (§2.1). The Repository filter only distinguishes repos *within* the single synced project.
- GitHub Projects V2 lets each project define its own custom Status field values (e.g. one project might use "Backlog / Ready / In Review / Done", another "Todo / Doing / Blocked / Shipped"). This app force-maps every project's raw status string onto one fixed Prisma enum (`TaskStatus`: `TODO | IN_PROGRESS | DONE | CANCELLED | STAGING`) via `mapStatusToEnum()`. A different project's distinct status columns would get normalized (and potentially collapsed/mismatched) into that same fixed set rather than shown as-is.

**This is not implemented today — it's a feature to add, called out here because it changes the shape of the Filters this PRD otherwise treats as fixed.** Multi-project support is out of scope for *this* redesign PRD, but the redesign should not design the filter bar in a way that assumes "one global project" so tightly that adding a project selector later requires re-doing the layout. Concretely, when multi-project support lands, the Filters area is expected to need:
- A project selector (likely alongside or replacing the current Repository dropdown, since repos are scoped within a project).
- Status filter values that can vary per project, instead of being drawn from one fixed enum.

Recommendation: track multi-project support as a separate PRD/ticket; this section exists so the redesign's filter-bar design leaves room for it.

## 4. Problems With the Current Design

(For the design phase to weigh — not prescriptive fixes.)

- Six summary cards + a bar chart + a dense multi-column table all compete for attention with no clear visual hierarchy or primary metric.
- The table is wide (9 columns) and the per-developer detail panel (tickets + status history) is a lot of information revealed inline, with no pagination on either the developer list or the expanded ticket list — this will not scale as team/task count grows.
- Sorting only covers 5 of the numeric columns and is client-side only, decoupled from filtering.
- No repository filter appears until data exists (fine functionally, but worth designing the empty-state path deliberately).
- Loading and empty states exist but are minimal.

## 5. Requirements for the Redesign

### 5.1 Functional parity (must keep)
The redesigned screen must let a user do everything the current screen does:
1. Filter by date range (From/To) and repository.
2. Clear active filters in one action.
3. Sort the developer list by: total tasks, completed tasks, completion rate, avg cycle time, bug count.
4. See, at a glance: total tasks, completed tasks, active developers, completion rate, active tasks, total story points, and last-sync time.
5. Compare developers' task volume/status mix visually (currently a chart of top 10).
6. See a ranked, per-developer breakdown of: total/completed tasks, completion rate, avg cycle time, bug count, story points (and how many tasks lack story points), and current active-work counts (WIP, todo, overdue).
7. Drill into one developer to see their individual tickets, each with status, repo, dates, labels, story points, overdue/bug flags, and status-change history.
8. Export the currently filtered task set as CSV.
9. Trigger a manual GitHub sync and see its progress/result.
10. See a clear empty state before first sync, and a loading state while data fetches.

### 5.2 Explicitly open to redesign (AI/design discretion)
- Visual layout, hierarchy, and grouping of the sections above.
- Chart type and what it emphasizes (the only constraint is #5 above — some visual comparison of developers must exist).
- Table density, column set shown by default vs. on-demand, and whether developer detail opens inline, in a drawer, or on a separate view.
- Whether/how pagination, virtualization, or progressive disclosure is used for developer and ticket lists as data volume grows.
- Color/status coding scheme, iconography, spacing, typography.
- Whether summary metrics are cards, a compact bar, or something else.
- Leave visual room in the filter bar for a future project selector (see §3) — don't hard-lock the layout to exactly today's 3 controls.

### 5.3 Constraints
- No new API routes or Prisma schema changes — redesign consumes the existing `/api/kpi/users`, `/api/kpi/summary`, `/api/export`, `/api/sync/github-project` responses as documented in §2.
- Must remain responsive (the dashboard is used on laptop screens at minimum; no explicit mobile requirement today, but don't actively break narrow viewports).
- Keep CSV export and GitHub sync as explicit, discoverable actions.

## 6. Out of Scope
- Changing what data is tracked (new KPIs, new filters like assignee-only search) — flag as a future idea if design surfaces a real need, but don't silently add scope.
- Backend/sync logic changes.
- Authentication/access control (none exists today; not being added here).
- **Multi-project support itself** (project switcher, per-project status sets) — see §3. This PRD only asks the redesign to leave room for it, not build it.

## 7. Success Criteria
- A user unfamiliar with the current screen can, within the redesign, still complete all 10 items in §5.1 without documentation.
- The screen communicates one clear "primary" read (e.g., who's performing well / what needs attention) faster than the current all-cards-equal layout — validated qualitatively, not with a hard metric.
