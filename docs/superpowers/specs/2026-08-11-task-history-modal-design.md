# Task history preview + modal — design

## Problem
In the KPI dashboard's expanded "tickets in range" panel (`components/KPITable.tsx`), each
task card renders its *entire* status-change history inline as a row of chips. Tasks with
long histories make cards tall and noisy, and there's no way to see how long a task actually
sat in each status (e.g. "in progress for 5h, blocked for 3h").

## Design

### Card preview (collapsed)
- Show only the **first 3** entries of `task.histories` (already sorted ascending by
  `changed_at`) as chips, same visual style as today.
- If `task.histories.length > 3`, append a `+N more` chip.
- No duration shown in the preview — the task's current status is already visible via the
  badge in the card header.

### Click-to-open
- The whole card becomes clickable (`cursor: pointer`) whenever `task.histories.length > 0`,
  opening a per-task timeline modal.
- The title `<a>` (external GitHub link) gets `stopPropagation` on click so it keeps opening
  the issue instead of also triggering the modal.
- Cards with no history (`histories.length === 0`) stay inert — nothing to show.

### `TaskHistoryModal` component (new: `components/TaskHistoryModal.tsx`)
Mirrors the existing native `<dialog>` pattern used by `StatusMappingModal.tsx` (no new
dependency).
- Props: `{ task: KpiTask | null; onClose: () => void }` — `open` is implied by `task` being
  non-null.
- Header: task title, close button.
- Body: every `task.histories` entry, in order, each rendered as a row with:
  - status chip (`new_status`)
  - timestamp (`changed_at`)
  - **duration**: how long the task remained in that status.

### Duration calculation
For history entry `i`:
```
end_i = history[i+1].changed_at
        (or, for the last entry: closed_at ?? (is_done ? that entry's own changed_at : now))
duration_i = end_i - history[i].changed_at
```
This mirrors the existing `closed_at ?? (is_done ? lastHistoryTime : null) ?? now` fallback
chain already used by `buildSegments` in `lib/calendar-utils.ts`, so "when does an open task
stop counting" stays consistent across the app.

### Duration format
Precise, top-two-units:
- `days > 0` → `"{d}d {h}h"` (drop minutes)
- else `hours > 0` → `"{h}h {m}m"`
- else → `"{m}m"`

## Non-goals
- No changes to data fetching, `UserKPI`/`kpi-service.ts`, or the calendar page — all needed
  data (`task.histories`, `task.closed_at`, `task.is_done`) is already present on the task
  object passed into `KPITable`.
- No new dependency — reuses the native `<dialog>` modal pattern already in the codebase.

## Files touched
- `components/KPITable.tsx` — preview chips capped at 3, card click handler, modal wiring.
- `components/TaskHistoryModal.tsx` — new.
