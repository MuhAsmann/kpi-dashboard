# Task History Preview + Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the KPI dashboard's expanded "tickets in range" panel, cap each task card's inline history chips at 3, and add a click-to-open modal showing the full status timeline plus per-status duration (both per-visit and summed across revisits).

**Architecture:** A new pure-function module (`lib/task-history.ts`) turns a task's `histories` array into per-visit durations and per-status totals. A new `TaskHistoryModal` component (native `<dialog>`, same pattern as `StatusMappingModal`) renders that data. `KPITable.tsx` is modified to cap its preview chips, make the whole card clickable, and mount the modal.

**Tech Stack:** Next.js 16 / React 19 / TypeScript. No test framework is installed in this repo — pure logic gets a runnable `node --experimental-strip-types` self-check (Node 22 supports executing `.ts` files directly, no dependency needed); UI changes are verified manually against the dev server.

## Global Constraints

- No new npm dependency — reuse the native `<dialog>` modal pattern already used by `components/StatusMappingModal.tsx`.
- No changes to `lib/kpi-service.ts`, the Prisma schema, or any API route — `task.histories`, `task.closed_at`, and `task.is_done` are already present on every task passed into `KPITable`.
- Card preview shows the **first 3** history entries (chronological, ascending — `task.histories` already arrives pre-sorted by `changed_at` from `kpi-service.ts`), with a `+N more` chip if there are more.
- Duration format is precise, top-two-units: `"{d}d {h}h"` if ≥1 day, else `"{h}h {m}m"` if ≥1 hour, else `"{m}m"`.
- Summary totals sum every visit to the same status (a task that revisits "In progress" twice reports one combined total), sorted by total duration descending.
- Spec: `docs/superpowers/specs/2026-08-11-task-history-modal-design.md`.

---

### Task 1: `lib/task-history.ts` — duration + summary pure functions

**Files:**
- Create: `lib/task-history.ts`
- Create: `scripts/check-task-history.ts` (runnable self-check, not a test-framework test — none is installed in this repo)

**Interfaces:**
- Produces (consumed by Task 2):
  - `interface TaskHistoryEntry { old_status: string | null; new_status: string; changed_at: Date | string }`
  - `interface StatusVisit { status: string; changedAt: Date | string; durationMs: number }`
  - `interface StatusSummary { status: string; totalMs: number }`
  - `function computeStatusVisits(histories: TaskHistoryEntry[], closedAt: Date | string | null, isDone: boolean, now?: number): StatusVisit[]`
  - `function summarizeStatusVisits(visits: StatusVisit[]): StatusSummary[]`
  - `function formatDuration(ms: number): string`

- [ ] **Step 1: Write the failing self-check**

Create `scripts/check-task-history.ts`:

```typescript
import assert from "node:assert";
import { computeStatusVisits, summarizeStatusVisits, formatDuration } from "../lib/task-history.ts";

// Scenario: TODO 50m -> In progress 2h -> Ready to review 1h -> In progress 30m -> Ready to review (still open)
const MIN = 60_000;
const HOUR = 60 * MIN;
const t0 = new Date("2026-08-01T00:00:00Z").getTime();

const histories = [
    { old_status: null, new_status: "TODO", changed_at: new Date(t0) },
    { old_status: "TODO", new_status: "In progress", changed_at: new Date(t0 + 50 * MIN) },
    { old_status: "In progress", new_status: "Ready to review", changed_at: new Date(t0 + 50 * MIN + 2 * HOUR) },
    { old_status: "Ready to review", new_status: "In progress", changed_at: new Date(t0 + 50 * MIN + 2 * HOUR + 1 * HOUR) },
    { old_status: "In progress", new_status: "Ready to review", changed_at: new Date(t0 + 50 * MIN + 2 * HOUR + 1 * HOUR + 30 * MIN) },
];
// task still open, 45m into the final ("Ready to review") visit
const now = t0 + 50 * MIN + 2 * HOUR + 1 * HOUR + 30 * MIN + 45 * MIN;

const visits = computeStatusVisits(histories, null, false, now);
assert.strictEqual(visits.length, 5);
assert.strictEqual(visits[0].status, "TODO");
assert.strictEqual(visits[0].durationMs, 50 * MIN);
assert.strictEqual(visits[1].status, "In progress");
assert.strictEqual(visits[1].durationMs, 2 * HOUR);
assert.strictEqual(visits[2].status, "Ready to review");
assert.strictEqual(visits[2].durationMs, 1 * HOUR);
assert.strictEqual(visits[3].status, "In progress");
assert.strictEqual(visits[3].durationMs, 30 * MIN);
assert.strictEqual(visits[4].status, "Ready to review");
assert.strictEqual(visits[4].durationMs, 45 * MIN); // still open -> ends at `now`

const summary = summarizeStatusVisits(visits);
const byStatus = Object.fromEntries(summary.map((s) => [s.status, s.totalMs]));
assert.strictEqual(byStatus["TODO"], 50 * MIN);
assert.strictEqual(byStatus["In progress"], 2 * HOUR + 30 * MIN); // summed across both visits
assert.strictEqual(byStatus["Ready to review"], 1 * HOUR + 45 * MIN);

assert.strictEqual(formatDuration(2 * HOUR + 30 * MIN), "2h 30m");
assert.strictEqual(formatDuration(50 * MIN), "50m");
assert.strictEqual(formatDuration(26 * HOUR + 15 * MIN), "1d 2h");

// Done task with no closed_at: last visit stops counting immediately, doesn't run to `now`.
const doneNoClosedAt = computeStatusVisits(
    [{ old_status: "TODO", new_status: "Done", changed_at: new Date(t0) }],
    null,
    true,
    now
);
assert.strictEqual(doneNoClosedAt[0].durationMs, 0);

// Done task with closed_at: last visit ends at closed_at, not `now`.
const doneWithClosedAt = computeStatusVisits(
    [{ old_status: "TODO", new_status: "Done", changed_at: new Date(t0) }],
    new Date(t0 + 3 * HOUR),
    true,
    now
);
assert.strictEqual(doneWithClosedAt[0].durationMs, 3 * HOUR);

// No history at all.
assert.deepStrictEqual(computeStatusVisits([], null, false, now), []);

console.log("task-history checks passed");
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types scripts/check-task-history.ts`
Expected: FAIL — `lib/task-history.ts` does not exist yet (module not found error).

- [ ] **Step 3: Implement `lib/task-history.ts`**

```typescript
export interface TaskHistoryEntry {
    old_status: string | null;
    new_status: string;
    changed_at: Date | string;
}

export interface StatusVisit {
    status: string;
    changedAt: Date | string;
    durationMs: number;
}

export interface StatusSummary {
    status: string;
    totalMs: number;
}

/**
 * One row per history entry ("visit"), with how long the task stayed in that
 * status before the next transition. The last visit's end is `closedAt` if
 * set, else `now` if the task is still open, else the visit's own timestamp
 * (a done task with no closed_at stops counting immediately) — mirrors the
 * same fallback chain `buildSegments` uses in lib/calendar-utils.ts.
 */
export function computeStatusVisits(
    histories: TaskHistoryEntry[],
    closedAt: Date | string | null,
    isDone: boolean,
    now: number = Date.now()
): StatusVisit[] {
    if (histories.length === 0) return [];

    const lastChangedAt = histories[histories.length - 1].changed_at;
    const endFallback = closedAt
        ? new Date(closedAt).getTime()
        : isDone
            ? new Date(lastChangedAt).getTime()
            : now;

    return histories.map((h, i) => {
        const start = new Date(h.changed_at).getTime();
        const end = i < histories.length - 1
            ? new Date(histories[i + 1].changed_at).getTime()
            : endFallback;
        return { status: h.new_status, changedAt: h.changed_at, durationMs: Math.max(0, end - start) };
    });
}

/** Sums each status's visits into one total, sorted by total duration descending. */
export function summarizeStatusVisits(visits: StatusVisit[]): StatusSummary[] {
    const totals = new Map<string, number>();
    for (const v of visits) {
        totals.set(v.status, (totals.get(v.status) ?? 0) + v.durationMs);
    }
    return Array.from(totals, ([status, totalMs]) => ({ status, totalMs })).sort(
        (a, b) => b.totalMs - a.totalMs
    );
}

/** Precise, top-two-units: "2d 3h", "5h 20m", or "20m" under an hour. */
export function formatDuration(ms: number): string {
    const totalMinutes = Math.max(0, Math.round(ms / 60_000));
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --experimental-strip-types scripts/check-task-history.ts`
Expected: prints `task-history checks passed` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add lib/task-history.ts scripts/check-task-history.ts
git commit -m "feat: add per-status duration and summary calculation for task history"
```

---

### Task 2: `TaskHistoryModal` component + `KPITable` wiring

**Files:**
- Create: `components/TaskHistoryModal.tsx`
- Modify: `components/KPITable.tsx:1-8` (imports, state), `components/KPITable.tsx:348-475` (card wrapper, title link, history chips block), `components/KPITable.tsx:490-492` (mount modal before closing the outer div)

**Interfaces:**
- Consumes (from Task 1): `computeStatusVisits`, `summarizeStatusVisits`, `formatDuration` from `@/lib/task-history`.
- Produces: `TaskHistoryModal` default export with props `{ task: KpiTask | null; onClose: () => void }`, and named export `type KpiTask = UserKPI["tasks"][number]`.

- [ ] **Step 1: Create `components/TaskHistoryModal.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { format } from "date-fns";
import type { UserKPI } from "@/lib/kpi-service";
import { computeStatusVisits, summarizeStatusVisits, formatDuration } from "@/lib/task-history";

export type KpiTask = UserKPI["tasks"][number];

interface TaskHistoryModalProps {
    task: KpiTask | null;
    onClose: () => void;
}

const timelineChipStyle: React.CSSProperties = {
    padding: "2px 7px",
    background: "var(--background)",
    border: "1.5px solid var(--card-border)",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "11px",
};

export default function TaskHistoryModal({ task, onClose }: TaskHistoryModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (task && !dialog.open) {
            dialog.showModal();
        } else if (!task && dialog.open) {
            dialog.close();
        }
    }, [task]);

    if (!task) return null;

    const visits = computeStatusVisits(task.histories, task.closed_at, task.is_done);
    const summary = summarizeStatusVisits(visits);

    return (
        <dialog
            ref={dialogRef}
            onClose={onClose}
            style={{
                margin: "auto",
                border: "2px solid var(--card-border)",
                boxShadow: "6px 6px 0 var(--card-border)",
                padding: 0,
                width: "min(560px, 92vw)",
                maxHeight: "80vh",
                background: "var(--card)",
                color: "var(--text-primary)",
            }}
        >
            <div
                className="flex items-center justify-between gap-3"
                style={{ padding: "16px 20px", borderBottom: "2px solid var(--card-border)" }}
            >
                <h2
                    className="line-clamp-2"
                    style={{ fontFamily: "var(--font-mono), monospace", fontSize: "15px", margin: 0 }}
                >
                    {task.title}
                </h2>
                <button
                    onClick={onClose}
                    className="neo-btn neo-btn-sm shrink-0"
                    style={{ padding: "6px", background: "var(--card)" }}
                >
                    <X size={14} />
                </button>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "calc(80vh - 66px)" }}>
                <h3
                    style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "10.5px",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                        margin: "0 0 8px",
                    }}
                >
                    Time in status
                </h3>
                <div className="flex flex-col gap-1.5 mb-5">
                    {summary.map((s) => (
                        <div key={s.status} className="flex items-center justify-between" style={{ fontSize: "13px" }}>
                            <span>{s.status}</span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>
                                {formatDuration(s.totalMs)}
                            </span>
                        </div>
                    ))}
                </div>

                <h3
                    style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "10.5px",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                        margin: "0 0 8px",
                    }}
                >
                    Timeline
                </h3>
                <div className="flex flex-col gap-2">
                    {visits.map((v, i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between gap-2 flex-wrap"
                            style={i > 0 ? { borderTop: "1.5px dashed var(--dashed)", paddingTop: "8px" } : undefined}
                        >
                            <span style={timelineChipStyle}>{v.status}</span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                                {format(new Date(v.changedAt), "MMM d, h:mm a")}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", fontWeight: 700 }}>
                                {formatDuration(v.durationMs)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </dialog>
    );
}
```

- [ ] **Step 2: Wire the modal into `KPITable.tsx`**

In `components/KPITable.tsx`, add the import (near the other local imports, after the existing `import { format } from "date-fns";` line):

```typescript
import TaskHistoryModal, { type KpiTask } from "@/components/TaskHistoryModal";
```

Add state alongside the existing `expandedUserId` state (inside the `KPITable` function body):

```typescript
const [historyTask, setHistoryTask] = useState<KpiTask | null>(null);
```

Replace the task card's opening wrapper — currently:

```tsx
                                                    <div
                                                        key={task.id}
                                                        style={{
                                                            background: "var(--card)",
                                                            border: "2px solid var(--card-border)",
                                                            boxShadow: "3px 3px 0 var(--card-border)",
                                                            padding: "12px 14px",
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: "9px",
                                                        }}
                                                    >
```

with:

```tsx
                                                    <div
                                                        key={task.id}
                                                        onClick={() => task.histories.length > 0 && setHistoryTask(task)}
                                                        style={{
                                                            background: "var(--card)",
                                                            border: "2px solid var(--card-border)",
                                                            boxShadow: "3px 3px 0 var(--card-border)",
                                                            padding: "12px 14px",
                                                            display: "flex",
                                                            flexDirection: "column",
                                                            gap: "9px",
                                                            cursor: task.histories.length > 0 ? "pointer" : "default",
                                                        }}
                                                    >
```

Add `stopPropagation` to the title link — currently:

```tsx
                                                            <a
                                                                href={task.url || "#"}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="font-semibold text-sm hover:opacity-70 flex-1 pr-2 line-clamp-2"
                                                                style={{ color: "var(--text-primary)" }}
                                                            >
```

becomes:

```tsx
                                                            <a
                                                                href={task.url || "#"}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="font-semibold text-sm hover:opacity-70 flex-1 pr-2 line-clamp-2"
                                                                style={{ color: "var(--text-primary)" }}
                                                            >
```

Replace the entire history-chips IIFE block (currently runs from `{task.histories && task.histories.length > 0 && (() => {` through its closing `})()}`, covering the `pastChips`/`currentAt`/`chipStyle` variables and the chips `<div>`) with:

```tsx
                                                        {task.histories && task.histories.length > 0 && (() => {
                                                            const preview = task.histories.slice(0, 3);
                                                            const remaining = task.histories.length - preview.length;
                                                            const chipStyle: React.CSSProperties = {
                                                                padding: "2px 7px",
                                                                background: "var(--background)",
                                                                border: "1.5px solid var(--card-border)",
                                                                display: "flex",
                                                                alignItems: "baseline",
                                                                gap: "6px",
                                                            };
                                                            return (
                                                                <div
                                                                    className="flex items-center gap-2 flex-wrap"
                                                                    style={{ borderTop: "1.5px dashed var(--dashed)", paddingTop: "9px", fontFamily: "var(--font-mono), monospace", fontSize: "11px" }}
                                                                >
                                                                    <span style={{ fontSize: "10.5px", letterSpacing: "0.5px", textTransform: "uppercase", color: "var(--text-muted)" }}>
                                                                        History
                                                                    </span>
                                                                    {preview.map((h, i) => (
                                                                        <span key={i} className="flex items-center gap-2">
                                                                            <span style={chipStyle}>
                                                                                {h.new_status}
                                                                                <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                                                                                    {format(new Date(h.changed_at), "MMM d, h:mm a")}
                                                                                </span>
                                                                            </span>
                                                                            {(i < preview.length - 1 || remaining > 0) && (
                                                                                <span style={{ color: "var(--dashed)" }}>→</span>
                                                                            )}
                                                                        </span>
                                                                    ))}
                                                                    {remaining > 0 && (
                                                                        <span style={{ ...chipStyle, color: "var(--text-muted)" }}>
                                                                            +{remaining} more
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
```

Finally, mount the modal once as the last child of the component's outer container `<div>` — i.e. right after the `<div className="overflow-x-auto">...</div>` block closes, but still before that outer `<div>`'s own closing tag. Currently the end of the file reads:

```tsx
                </table>
            </div>
        </div>
    );
}
```

Change it to:

```tsx
                </table>
            </div>
            <TaskHistoryModal task={historyTask} onClose={() => setHistoryTask(null)} />
        </div>
    );
}
```

(`<dialog>` renders via the browser's top layer, so its position in the DOM tree doesn't affect how/where it visually appears — this placement is just the simplest one, one level outside `overflow-x-auto`.)

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually verify in the browser**

Run: `npm run dev`, then open the dashboard, expand a developer row (click any row in the "Developer breakdown" table) to reveal "tickets in range" cards.

Check:
- Each card's HISTORY row shows at most 3 chips, plus a `+N more` chip when the task has more than 3 history entries.
- Clicking anywhere on a card (not the title link) opens the modal, showing a "Time in status" summary (one row per distinct status) and a "Timeline" list (one row per transition, each with its own duration).
- Clicking the task title still opens the GitHub issue in a new tab and does **not** open the modal.
- Clicking the modal's close button (or pressing Escape, native `<dialog>` behavior) closes it.
- A task with zero history entries has no HISTORY row and its card is not clickable (`cursor: default`).

Stop the dev server when done (`Ctrl+C`).

- [ ] **Step 5: Commit**

```bash
git add components/TaskHistoryModal.tsx components/KPITable.tsx
git commit -m "feat: cap task history preview to 3 entries, add click-to-open duration modal"
```
