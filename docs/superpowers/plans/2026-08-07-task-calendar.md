# Task Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/calendar` page showing tasks on a month/week/day calendar, colored by GitHub status lifecycle, matching the app's existing soft neo-brutalism style — fully additive, no existing files modified.

**Architecture:** One new pure-logic module (`lib/calendar-utils.ts`) that builds per-task lifecycle segments from `TaskHistory` and does month/week lane-packing layout math, consumed by one new client page (`app/calendar/page.tsx`) that fetches from the three already-existing endpoints (`/api/kpi/users`, `/api/kpi/summary`, `/api/status-mapping`) and renders month/week/day views with a slide-in task detail panel.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, `date-fns` (already a dependency), existing CSS custom properties/classes in `app/globals.css`. No new dependencies.

## Global Constraints

- **Zero edits to existing files.** Every task in this plan creates new files only (`lib/calendar-utils.ts`, `app/calendar/page.tsx`). Never modify `app/dashboard/page.tsx` or any other existing file.
- **No new API routes.** Only `GET /api/kpi/users?project=<n>`, `GET /api/kpi/summary?project=<n>`, and `GET /api/status-mapping?project=<n>` (all pre-existing) may be called.
- **No new test framework.** This repo has none today (`package.json` has no test runner). Verification per task is `npx tsc --noEmit` (typecheck) + `npx eslint <file>` (already-configured lint), with real-browser manual verification at milestone tasks and a full pass in the final task. Do not add jest/vitest/tsx/ts-node or any other new devDependency.
- **Styling is this app's existing soft neo-brutalism**, not the design mockup's rounded/soft-shadow look: 2px solid `var(--card-border)` borders, hard offset box-shadows (`3px 3px 0` / `5px 5px 0` / `6px 6px 0`), `var(--font-mono)` for headers/labels, and reuse of existing CSS custom properties (`--background`, `--card`, `--card-alt`, `--accent`, `--accent-blue`, `--accent-pink`, `--accent-green`, `--accent-lavender`, `--text-primary`, `--text-secondary`, `--text-muted`, `--dashed`) and classes (`.neo-btn`, `.neo-btn-sm`, `.badge`, `.badge-unmapped`, `.pulse-dot`) from `app/globals.css`. Do not add new CSS files or new global classes — inline `style={{}}` objects, matching how `app/dashboard/page.tsx` and `components/KPITable.tsx` already do it.
- **Segment colors are raw-status-text based by default** ("By status" mode), with an optional "By bucket" mode — see Task 9. Colors always come from a 5-way deterministic hash over `["var(--accent)", "var(--accent-blue)", "var(--accent-pink)", "var(--accent-green)", "var(--accent-lavender)"]`.
- **"By bucket" color mode requires one specific project selected** (not "All projects") — disabled with a tooltip otherwise. See Task 9.
- All dates are handled as UTC day-boundaries in milliseconds (`Date.UTC(...)`), matching the design mockup's date math — avoids local-timezone off-by-one bugs in the grid.

---

## Task 1: Calendar data/mapping utilities

**Files:**
- Create: `lib/calendar-utils.ts` (part 1 of 2 — this task adds the sections marked below; Task 2 appends more to the same file)
- Test: none (no test framework — see Global Constraints). Verify with `npx tsc --noEmit` and `npx eslint lib/calendar-utils.ts`.

**Interfaces:**
- Consumes: `UserKPI` type from `@/lib/kpi-service` (already exported, read-only import).
- Produces (used by Task 2 and all page tasks):
  - `DAY_MS: number`
  - `MONTH_NAMES: string[]`, `DOW_NAMES: string[]`
  - `type CalendarTask = UserKPI["tasks"][number] & { assignee: UserKPI["user"] }`
  - `type CalendarSegment = { status: string; start: number; end: number }`
  - `type ComputedTask = CalendarTask & { segments: CalendarSegment[]; spanStart: number; spanEnd: number }`
  - `toDayMs(dateInput: string | Date): number`
  - `buildSegments(task: CalendarTask, todayMs: number): CalendarSegment[]`
  - `computeTask(task: CalendarTask, todayMs: number): ComputedTask`
  - `ACCENT_TOKENS: readonly string[]`
  - `colorForKey(key: string): string`
  - `type ProjectBucketInfo = { id: string; label: string; is_done: boolean }`
  - `type StatusMappingProject = { number: number; label: string; buckets: ProjectBucketInfo[]; statuses: { status: string; bucket_id: string | null }[] }`
  - `buildBucketLookup(project: StatusMappingProject | undefined): Map<string, ProjectBucketInfo | null>`
  - `uniqueOptions(values: (string | null | undefined)[], allLabel: string): string[]`

- [ ] **Step 1: Create the file with types, date helpers, segment builder, and color hashing**

```typescript
// lib/calendar-utils.ts
import type { UserKPI } from "@/lib/kpi-service";

export const DAY_MS = 86_400_000;

export const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** A task as returned per-user by `calculateAllUserKPIs`, flattened with its assignee attached. */
export type CalendarTask = UserKPI["tasks"][number] & {
    assignee: UserKPI["user"];
};

/** One contiguous run of a single raw status, in UTC day-boundary milliseconds (inclusive). */
export interface CalendarSegment {
    status: string;
    start: number;
    end: number;
}

export interface ComputedTask extends CalendarTask {
    segments: CalendarSegment[];
    spanStart: number;
    spanEnd: number;
}

/** UTC day-boundary ms for a Date or ISO date string (histories/dates arrive as strings over JSON). */
export function toDayMs(dateInput: string | Date): number {
    const d = new Date(dateInput);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Builds one segment per raw-status run for a task, from its `TaskHistory` transitions.
 * The first segment's status is the earliest known status (the first history row's
 * `old_status`, or the task's own current `status` if there's no history at all).
 * The last segment ends at `closed_at` (actual) if closed, else `end_date` (planned target)
 * if set, else `todayMs` (still open, no known end date).
 */
export function buildSegments(task: CalendarTask, todayMs: number): CalendarSegment[] {
    const startMs = toDayMs(task.start_date ?? task.created_at);
    const finalEndMs = task.closed_at
        ? toDayMs(task.closed_at)
        : task.end_date
            ? toDayMs(task.end_date)
            : todayMs;

    const history = [...task.histories].sort(
        (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
    );

    if (history.length === 0) {
        return [{ status: task.status, start: startMs, end: Math.max(startMs, finalEndMs) }];
    }

    const points: { status: string; start: number }[] = [
        { status: history[0].old_status ?? history[0].new_status, start: startMs },
        ...history.map((h) => ({ status: h.new_status, start: toDayMs(h.changed_at) })),
    ];

    const segments: CalendarSegment[] = [];
    for (let i = 0; i < points.length; i++) {
        const segStart = i === 0 ? startMs : points[i].start;
        const segEnd = i < points.length - 1 ? points[i + 1].start - DAY_MS : finalEndMs;
        if (segEnd >= segStart) {
            segments.push({ status: points[i].status, start: segStart, end: segEnd });
        }
    }
    return segments;
}

export function computeTask(task: CalendarTask, todayMs: number): ComputedTask {
    const segments = buildSegments(task, todayMs);
    return {
        ...task,
        segments,
        spanStart: segments[0].start,
        spanEnd: segments[segments.length - 1].end,
    };
}

/** This app's 5 existing accent tokens — not the design mockup's own palette. */
export const ACCENT_TOKENS = [
    "var(--accent)",
    "var(--accent-blue)",
    "var(--accent-pink)",
    "var(--accent-green)",
    "var(--accent-lavender)",
] as const;

/** Deterministic hash so the same key (raw status text, or bucket id) always gets the same color. */
export function colorForKey(key: string): string {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return ACCENT_TOKENS[hash % ACCENT_TOKENS.length];
}
```

- [ ] **Step 2: Add bucket lookup and filter-option helpers to the same file**

```typescript
// Append to lib/calendar-utils.ts

export interface ProjectBucketInfo {
    id: string;
    label: string;
    is_done: boolean;
}

export interface StatusMappingProject {
    number: number;
    label: string;
    buckets: ProjectBucketInfo[];
    statuses: { status: string; bucket_id: string | null }[];
}

/**
 * Builds a `raw_status -> bucket` lookup for one project (from `/api/status-mapping`'s
 * response). Only covers that project's *currently active* statuses — a status that only
 * ever appears in historical TaskHistory rows, with no task presently in it, won't be in
 * `project.statuses` and will look up as `undefined` (renders "Unmapped"). This is a known
 * limitation of reusing the existing endpoint as-is; see the design spec's Data mapping
 * section.
 */
export function buildBucketLookup(project: StatusMappingProject | undefined): Map<string, ProjectBucketInfo | null> {
    const map = new Map<string, ProjectBucketInfo | null>();
    if (!project) return map;
    const bucketsById = new Map(project.buckets.map((b) => [b.id, b]));
    project.statuses.forEach((s) => {
        map.set(s.status, s.bucket_id ? bucketsById.get(s.bucket_id) ?? null : null);
    });
    return map;
}

/** Distinct, sorted, non-empty values from `values`, prefixed with an "All X" option. */
export function uniqueOptions(values: (string | null | undefined)[], allLabel: string): string[] {
    const distinct = Array.from(new Set(values.filter((v): v is string => !!v))).sort();
    return [allLabel, ...distinct];
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `lib/calendar-utils.ts`.

Run: `npx eslint lib/calendar-utils.ts`
Expected: no errors (warnings about unused exports are fine — later tasks consume them).

- [ ] **Step 4: Commit**

```bash
git add lib/calendar-utils.ts
git commit -m "feat: add calendar segment/color/bucket mapping utilities"
```

---

## Task 2: Calendar layout/grid math

**Files:**
- Modify (append only): `lib/calendar-utils.ts`
- Test: none. Verify with `npx tsc --noEmit` and `npx eslint lib/calendar-utils.ts`.

**Interfaces:**
- Consumes: `DAY_MS`, `ComputedTask`, `MONTH_NAMES`, `toDayMs` from Task 1 (same file).
- Produces (used by Tasks 5–7):
  - `type CalendarView = "month" | "week" | "day"`
  - `getMonthGridStart(anchorMs: number): number`
  - `getWeekStart(anchorMs: number): number`
  - `navigateAnchor(anchorMs: number, view: CalendarView, direction: 1 | -1): number`
  - `type LanedTask = { task: ComputedTask; c0: number; c1: number; lane: number }`
  - `packLanes(weekStartMs: number, tasks: ComputedTask[], maxLanes: number): { placed: LanedTask[]; hiddenPerDay: number[] }`
  - `type SegmentBlock = { key: string; taskId: string; label: string; status: string; colStart: number; colSpan: number; lane: number; openLeft: boolean; openRight: boolean; terminal: boolean }`
  - `buildSegmentBlocks(laned: LanedTask, weekStartMs: number): SegmentBlock[]`
  - `type MonthDay = { dateMs: number; dayNumber: number; isCurrentMonth: boolean; isToday: boolean; monthLabel: string }`
  - `type MonthWeek = { weekStartMs: number; days: MonthDay[]; placed: LanedTask[]; hiddenPerDay: number[] }`
  - `computeMonthWeeks(anchorMs: number, tasks: ComputedTask[], todayMs: number, maxLanes?: number): MonthWeek[]`
  - `getDayItems(anchorMs: number, tasks: ComputedTask[]): ComputedTask[]`
  - `statusOnDay(task: ComputedTask, dayMs: number): string`

- [ ] **Step 1: Add navigation and range helpers**

```typescript
// Append to lib/calendar-utils.ts

export type CalendarView = "month" | "week" | "day";

/** First visible grid cell for the month containing `anchorMs` — the Sunday on/before the 1st. */
export function getMonthGridStart(anchorMs: number): number {
    const d = new Date(anchorMs);
    const firstOfMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    return firstOfMonth - new Date(firstOfMonth).getUTCDay() * DAY_MS;
}

/** Sunday on/before `anchorMs`. */
export function getWeekStart(anchorMs: number): number {
    return anchorMs - new Date(anchorMs).getUTCDay() * DAY_MS;
}

export function navigateAnchor(anchorMs: number, view: CalendarView, direction: 1 | -1): number {
    if (view === "day") return anchorMs + direction * DAY_MS;
    if (view === "week") return anchorMs + direction * 7 * DAY_MS;
    const d = new Date(anchorMs);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + direction, 1);
}
```

- [ ] **Step 2: Add lane-packing and segment-block builders**

```typescript
// Append to lib/calendar-utils.ts

export interface LanedTask {
    task: ComputedTask;
    c0: number;
    c1: number;
    lane: number;
}

/**
 * Packs tasks overlapping [weekStartMs, weekStartMs + 6*DAY_MS] into lanes so none overlap
 * visually, up to `maxLanes`. Tasks that don't fit count toward `hiddenPerDay` ("+N more").
 * Ported from the design mockup's `layout()` function.
 */
export function packLanes(
    weekStartMs: number,
    tasks: ComputedTask[],
    maxLanes: number
): { placed: LanedTask[]; hiddenPerDay: number[] } {
    const weekEndMs = weekStartMs + 6 * DAY_MS;
    const lanesEndCol: number[] = [];
    const placed: LanedTask[] = [];
    const hiddenPerDay = [0, 0, 0, 0, 0, 0, 0];

    const candidates = tasks
        .filter((t) => t.spanEnd >= weekStartMs && t.spanStart <= weekEndMs)
        .map((t) => ({
            task: t,
            c0: Math.max(0, Math.round((t.spanStart - weekStartMs) / DAY_MS)),
            c1: Math.min(6, Math.round((t.spanEnd - weekStartMs) / DAY_MS)),
        }))
        .sort((a, b) => a.c0 - b.c0 || (b.c1 - b.c0) - (a.c1 - a.c0) || a.task.id.localeCompare(b.task.id));

    candidates.forEach(({ task, c0, c1 }) => {
        let lane = 0;
        while (lanesEndCol[lane] !== undefined && lanesEndCol[lane] > c0) lane++;
        lanesEndCol[lane] = c1 + 1;
        if (lane < maxLanes) {
            placed.push({ task, c0, c1, lane });
        } else {
            for (let c = c0; c <= c1; c++) hiddenPerDay[c]++;
        }
    });

    return { placed, hiddenPerDay };
}

export interface SegmentBlock {
    key: string;
    taskId: string;
    label: string;
    status: string;
    colStart: number;
    colSpan: number;
    lane: number;
    openLeft: boolean;
    openRight: boolean;
    terminal: boolean;
}

/**
 * Splits one laned task's bar, within one week, into per-status colored blocks.
 * Ported from the design mockup's `bar()` function.
 */
export function buildSegmentBlocks(laned: LanedTask, weekStartMs: number): SegmentBlock[] {
    const { task, lane } = laned;
    const weekEndMs = weekStartMs + 6 * DAY_MS;
    const blocks: SegmentBlock[] = [];
    let labelled = false;

    task.segments.forEach((seg, i) => {
        if (seg.end < weekStartMs || seg.start > weekEndMs) return;
        const c0 = Math.max(0, Math.round((seg.start - weekStartMs) / DAY_MS));
        const c1 = Math.min(6, Math.round((seg.end - weekStartMs) / DAY_MS));
        const startsHere = seg.start >= weekStartMs;
        const endsHere = seg.end <= weekEndMs;
        const openLeft = !startsHere || i > 0;
        const openRight = !endsHere || i < task.segments.length - 1;
        const span = c1 - c0 + 1;

        let label = "";
        if (!labelled) {
            label = task.title;
            labelled = true;
        } else if (span >= 2) {
            label = seg.status;
        }

        const terminal = !!task.closed_at && i === task.segments.length - 1 && endsHere;

        blocks.push({
            key: `${task.id}-${weekStartMs}-${i}`,
            taskId: task.id,
            label,
            status: seg.status,
            colStart: c0,
            colSpan: span,
            lane,
            openLeft,
            openRight,
            terminal,
        });
    });

    return blocks;
}
```

- [ ] **Step 3: Add month/week/day view data builders**

```typescript
// Append to lib/calendar-utils.ts

export interface MonthDay {
    dateMs: number;
    dayNumber: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    monthLabel: string;
}

export interface MonthWeek {
    weekStartMs: number;
    days: MonthDay[];
    placed: LanedTask[];
    hiddenPerDay: number[];
}

export function computeMonthWeeks(
    anchorMs: number,
    tasks: ComputedTask[],
    todayMs: number,
    maxLanes = 3
): MonthWeek[] {
    const gridStart = getMonthGridStart(anchorMs);
    const anchorDate = new Date(anchorMs);
    const weeks: MonthWeek[] = [];

    for (let w = 0; w < 6; w++) {
        const weekStartMs = gridStart + w * 7 * DAY_MS;
        const { placed, hiddenPerDay } = packLanes(weekStartMs, tasks, maxLanes);
        const days: MonthDay[] = [];
        for (let i = 0; i < 7; i++) {
            const dateMs = weekStartMs + i * DAY_MS;
            const d = new Date(dateMs);
            days.push({
                dateMs,
                dayNumber: d.getUTCDate(),
                isCurrentMonth: d.getUTCMonth() === anchorDate.getUTCMonth(),
                isToday: dateMs === todayMs,
                monthLabel: d.getUTCDate() === 1 ? MONTH_NAMES[d.getUTCMonth()].slice(0, 3) : "",
            });
        }
        weeks.push({ weekStartMs, days, placed, hiddenPerDay });
    }
    return weeks;
}

export function getDayItems(anchorMs: number, tasks: ComputedTask[]): ComputedTask[] {
    return tasks.filter((t) => t.spanStart <= anchorMs && t.spanEnd >= anchorMs);
}

export function statusOnDay(task: ComputedTask, dayMs: number): string {
    const seg = task.segments.find((s) => s.start <= dayMs && s.end >= dayMs);
    return seg ? seg.status : task.status;
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `lib/calendar-utils.ts`.

Run: `npx eslint lib/calendar-utils.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/calendar-utils.ts
git commit -m "feat: add calendar month/week/day layout math"
```

---

## Task 3: Calendar page shell — Sidebar, header, data fetching

**Files:**
- Create: `app/calendar/page.tsx`
- Test: none. Verify with `npx tsc --noEmit`, `npx eslint app/calendar/page.tsx`, then manually in the browser.

**Interfaces:**
- Consumes: `UserKPI` from `@/lib/kpi-service`; `PROJECTS` from `@/lib/projects`; `CalendarTask`, `ComputedTask`, `computeTask` from `@/lib/calendar-utils` (Task 1).
- Produces (used by Tasks 4–9, all in the same file — later tasks extend this component's JSX/state, this step establishes the state shape and fetch):
  - Local `Sidebar` component with a real `Link` to `/dashboard` and `/calendar`.
  - `CalendarPage` default export with state: `kpis`, `summary`, `loading`, `project`, and derived `tasks`/`computedTasks`/`todayMs` memos.

- [ ] **Step 1: Create the page with Sidebar, header, and data fetching**

```tsx
// app/calendar/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { UserKPI } from "@/lib/kpi-service";
import { PROJECTS } from "@/lib/projects";
import { CalendarTask, ComputedTask, computeTask } from "@/lib/calendar-utils";
import {
    LayoutDashboard,
    ListChecks,
    GitBranch,
    Clock,
    BarChart3,
    Settings,
    HelpCircle,
    Calendar as CalendarIcon,
} from "lucide-react";

interface CalendarSummary {
    repositories: string[];
    last_sync: string | null;
}

const NAV_ITEMS: { icon: typeof LayoutDashboard; label: string; href?: string }[] = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: CalendarIcon, label: "Calendar", href: "/calendar" },
    { icon: ListChecks, label: "Tasks" },
    { icon: GitBranch, label: "Repositories" },
    { icon: Clock, label: "Cycle time" },
    { icon: BarChart3, label: "Reports" },
];

function Sidebar() {
    return (
        <nav
            className="flex flex-col items-center sticky top-0 shrink-0"
            style={{
                width: "78px",
                background: "#1A1917",
                borderRight: "2px solid var(--card-border)",
                padding: "18px 0 22px",
                gap: "26px",
                height: "100vh",
            }}
        >
            <div
                className="grid place-items-center"
                style={{
                    width: "44px",
                    height: "44px",
                    background: "var(--accent)",
                    border: "2px solid var(--card-border)",
                    boxShadow: "3px 3px 0 #000",
                    fontFamily: "var(--font-mono), monospace",
                    fontWeight: 700,
                    fontSize: "20px",
                }}
            >
                ↗
            </div>
            <div className="flex flex-col gap-3.5 items-center mt-1.5">
                {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
                    const active = label === "Calendar";
                    const itemStyle: React.CSSProperties = {
                        width: "42px",
                        height: "42px",
                        background: active ? "var(--accent)" : "#2E2C29",
                        border: `2px solid ${active ? "var(--card-border)" : "#2E2C29"}`,
                        color: active ? "var(--text-primary)" : "#8B8781",
                    };
                    if (href) {
                        return (
                            <Link key={label} href={href} title={label} className="grid place-items-center" style={itemStyle}>
                                <Icon size={17} />
                            </Link>
                        );
                    }
                    return (
                        <div key={label} title={`${label} (not available yet)`} className="grid place-items-center" style={itemStyle}>
                            <Icon size={17} />
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-col gap-3.5 items-center mt-auto">
                {[Settings, HelpCircle].map((Icon, i) => (
                    <div
                        key={i}
                        className="grid place-items-center"
                        style={{ width: "42px", height: "42px", background: "#2E2C29", border: "2px solid #2E2C29", color: "#8B8781" }}
                    >
                        <Icon size={17} />
                    </div>
                ))}
            </div>
        </nav>
    );
}

export default function CalendarPage() {
    const [kpis, setKpis] = useState<UserKPI[]>([]);
    const [summary, setSummary] = useState<CalendarSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [project, setProject] = useState<number | "">("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const qs = project !== "" ? `?project=${project}` : "";
            const [usersRes, summaryRes] = await Promise.all([
                fetch(`/api/kpi/users${qs}`),
                fetch(`/api/kpi/summary${qs}`),
            ]);
            const usersData = await usersRes.json();
            const summaryData = await summaryRes.json();
            if (Array.isArray(usersData)) setKpis(usersData);
            if (summaryData.summary) {
                setSummary({ repositories: summaryData.repositories || [], last_sync: summaryData.summary.last_sync });
            }
        } catch (err) {
            console.error("Failed to fetch calendar data:", err);
        } finally {
            setLoading(false);
        }
    }, [project]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const tasks: CalendarTask[] = useMemo(
        () => kpis.flatMap((k) => k.tasks.map((t) => ({ ...t, assignee: k.user }))),
        [kpis]
    );

    const todayMs = useMemo(() => {
        const d = new Date();
        return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }, []);

    const computedTasks: ComputedTask[] = useMemo(
        () => tasks.map((t) => computeTask(t, todayMs)),
        [tasks, todayMs]
    );

    return (
        <div className="flex min-h-screen" style={{ background: "var(--background)" }}>
            <Sidebar />
            <main className="flex-1 min-w-0 flex flex-col gap-5" style={{ padding: "26px 30px 60px" }}>
                <header className="flex items-end justify-between gap-6 flex-wrap">
                    <div className="flex items-end gap-4 flex-wrap">
                        <div>
                            <h1
                                style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    fontWeight: 700,
                                    fontSize: "34px",
                                    letterSpacing: "-0.5px",
                                    margin: 0,
                                    color: "var(--text-primary)",
                                }}
                            >
                                Task Calendar
                            </h1>
                            <p className="mt-1.5" style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>
                                Task lifecycle, derived from GitHub status events
                                {summary?.last_sync &&
                                    ` · Synced ${formatDistanceToNow(new Date(summary.last_sync), { addSuffix: true })}`}
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="calendar-project"
                                style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    fontSize: "10.5px",
                                    letterSpacing: "1px",
                                    textTransform: "uppercase",
                                    color: "var(--text-muted)",
                                }}
                            >
                                Project
                            </label>
                            <select
                                id="calendar-project"
                                value={project}
                                onChange={(e) => setProject(e.target.value ? parseInt(e.target.value, 10) : "")}
                                title="Scopes calendar data to this project"
                                style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    fontWeight: 700,
                                    fontSize: "13px",
                                    padding: "9px 12px",
                                    border: "2px solid var(--card-border)",
                                    background: "var(--accent)",
                                    color: "var(--text-primary)",
                                    cursor: "pointer",
                                    minWidth: "150px",
                                }}
                            >
                                <option value="">All projects</option>
                                {PROJECTS.map((p) => (
                                    <option key={p.number} value={p.number}>
                                        {p.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <button
                        id="calendar-refresh-btn"
                        onClick={fetchData}
                        disabled={loading}
                        className="neo-btn flex items-center gap-2"
                        style={{ fontSize: "13px", padding: "11px 18px", background: "var(--accent)", color: "var(--text-primary)" }}
                    >
                        Refresh
                    </button>
                </header>

                {loading ? (
                    <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                        Loading…
                    </p>
                ) : (
                    <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                        {computedTasks.length} task{computedTasks.length !== 1 ? "s" : ""} loaded
                    </p>
                )}
            </main>
        </div>
    );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no errors mentioning `app/calendar/page.tsx`.

Run: `npx eslint app/calendar/page.tsx`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `http://localhost:3000/calendar`.
Expected:
- Page loads with Sidebar (Calendar icon highlighted), title "Task Calendar", Project selector, Refresh button.
- After loading, shows "N tasks loaded" where N is a plausible number.
- Switching the Project selector re-fetches and the count changes.
- Clicking the Sidebar's Dashboard icon navigates to `/dashboard` and it still works exactly as before (proves zero regression on the existing page).

- [ ] **Step 4: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar page shell with data fetching"
```

---

## Task 4: Filters and legend

**Files:**
- Modify: `app/calendar/page.tsx`

**Interfaces:**
- Consumes: `uniqueOptions` from `@/lib/calendar-utils` (Task 1); `computedTasks` from Task 3.
- Produces: `filters` state `{ repository: string; assignee: string; label: string; status: string }` (each `""` = "all"), `filteredTasks: ComputedTask[]` memo, used by Tasks 5–8.

- [ ] **Step 1: Add filter state, filtering logic, and the filter bar + legend UI**

In `app/calendar/page.tsx`, add to the imports:

```tsx
import { uniqueOptions } from "@/lib/calendar-utils";
import { X } from "lucide-react";
```

Add state and derived values inside `CalendarPage`, right after the `computedTasks` memo:

```tsx
    const [filters, setFilters] = useState({ repository: "", assignee: "", label: "", status: "" });

    const repoOptions = useMemo(() => uniqueOptions(computedTasks.map((t) => t.repository), "All repositories"), [computedTasks]);
    const assigneeOptions = useMemo(
        () => uniqueOptions(computedTasks.map((t) => t.assignee.name ?? t.assignee.github_login), "All assignees"),
        [computedTasks]
    );
    const labelOptions = useMemo(
        () => uniqueOptions(computedTasks.flatMap((t) => t.labels.map((l) => l.name)), "All labels"),
        [computedTasks]
    );
    const statusOptions = useMemo(() => uniqueOptions(computedTasks.map((t) => t.status), "All statuses"), [computedTasks]);

    const filteredTasks = useMemo(
        () =>
            computedTasks.filter(
                (t) =>
                    (!filters.repository || t.repository === filters.repository) &&
                    (!filters.assignee || (t.assignee.name ?? t.assignee.github_login) === filters.assignee) &&
                    (!filters.label || t.labels.some((l) => l.name === filters.label)) &&
                    (!filters.status || t.status === filters.status)
            ),
        [computedTasks, filters]
    );

    const hasActiveFilters = !!(filters.repository || filters.assignee || filters.label || filters.status);
```

Replace the placeholder `{loading ? ... : <p>{computedTasks.length} task...}` block with the filter bar, legend, and (for now) the same count but computed from `filteredTasks`:

```tsx
                {loading ? (
                    <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                        Loading…
                    </p>
                ) : (
                    <>
                        <div
                            className="flex items-end gap-3.5 flex-wrap"
                            style={{
                                background: "var(--card)",
                                border: "2px solid var(--card-border)",
                                boxShadow: "5px 5px 0 var(--card-border)",
                                padding: "14px 16px",
                            }}
                        >
                            {[
                                { key: "repository" as const, label: "Repository", options: repoOptions },
                                { key: "assignee" as const, label: "Assignee", options: assigneeOptions },
                                { key: "label" as const, label: "Label", options: labelOptions },
                                { key: "status" as const, label: "Status", options: statusOptions },
                            ].map(({ key, label, options }) => (
                                <div key={key} className="flex flex-col gap-1.5">
                                    <label
                                        htmlFor={`calendar-filter-${key}`}
                                        style={{
                                            fontFamily: "var(--font-mono), monospace",
                                            fontSize: "10.5px",
                                            letterSpacing: "1px",
                                            textTransform: "uppercase",
                                            color: "var(--text-muted)",
                                        }}
                                    >
                                        {label}
                                    </label>
                                    <select
                                        id={`calendar-filter-${key}`}
                                        value={filters[key]}
                                        onChange={(e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                                        style={{
                                            fontFamily: "var(--font-mono), monospace",
                                            fontSize: "13px",
                                            padding: "8px 10px",
                                            border: "2px solid var(--card-border)",
                                            background: "var(--background)",
                                            color: "var(--text-primary)",
                                            cursor: "pointer",
                                            minWidth: "150px",
                                        }}
                                    >
                                        {options.map((o) => (
                                            <option key={o} value={o.startsWith("All ") ? "" : o}>
                                                {o}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                            {hasActiveFilters && (
                                <button
                                    onClick={() => setFilters({ repository: "", assignee: "", label: "", status: "" })}
                                    className="neo-btn neo-btn-sm flex items-center gap-1.5"
                                    style={{ fontSize: "12px", padding: "9px 13px", background: "var(--accent-pink)", color: "var(--text-primary)" }}
                                >
                                    <X size={12} />
                                    Clear filters
                                </button>
                            )}
                        </div>

                        <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                            {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""} in view · {computedTasks.length} total
                        </p>
                    </>
                )}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx eslint app/calendar/page.tsx` — expect no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open `/calendar`.
Expected: Filter dropdowns are populated from real data; selecting a repository/assignee/label/status narrows the "N tasks in view" count correctly; "Clear filters" appears only when a filter is active and resets all four.

- [ ] **Step 4: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar filters"
```

---

## Task 5: Month view

**Files:**
- Modify: `app/calendar/page.tsx`

**Interfaces:**
- Consumes: `CalendarView`, `computeMonthWeeks`, `navigateAnchor`, `colorForKey`, `buildSegmentBlocks`, `DAY_MS`, `MONTH_NAMES` from `@/lib/calendar-utils` (Tasks 1–2); `filteredTasks`, `todayMs` from Tasks 3–4.
- Produces: `view: CalendarView` state (default `"month"`), `anchorMs` state (default `todayMs`), `span: "continuous" | "per-day"` state (default `"continuous"`), `selectedTaskId: string | null` state (used by Task 8's detail panel — set it here via `onClick`, but the panel itself is built in Task 8).

- [ ] **Step 1: Add view/anchor/span state and the toolbar (nav, title, span toggle, view toggle)**

Add to imports:

```tsx
import { CalendarView, computeMonthWeeks, navigateAnchor, colorForKey, buildSegmentBlocks, MONTH_NAMES, DOW_NAMES, DAY_MS } from "@/lib/calendar-utils";
```

Add state right after `filters`:

```tsx
    const [view, setView] = useState<CalendarView>("month");
    const [anchorMs, setAnchorMs] = useState(todayMs);
    const [span, setSpan] = useState<"continuous" | "per-day">("continuous");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    const monthWeeks = useMemo(
        () => (view === "month" ? computeMonthWeeks(anchorMs, filteredTasks, todayMs) : []),
        [view, anchorMs, filteredTasks, todayMs]
    );

    const anchorDate = new Date(anchorMs);
    const toolbarTitle =
        view === "month"
            ? `${MONTH_NAMES[anchorDate.getUTCMonth()]} ${anchorDate.getUTCFullYear()}`
            : view === "week"
                ? "" // filled in Task 6
                : ""; // filled in Task 7

    const segStyle = (on: boolean): React.CSSProperties => ({
        fontFamily: "var(--font-mono), monospace",
        fontWeight: 700,
        fontSize: "12px",
        padding: "7px 13px",
        border: "2px solid var(--card-border)",
        background: on ? "var(--accent)" : "var(--card)",
        color: "var(--text-primary)",
        cursor: "pointer",
    });
```

Insert the toolbar directly below the filter bar block added in Task 4 (still inside the `{!loading && (...)}` branch, before the "N tasks in view" paragraph):

```tsx
                        <div
                            className="flex items-center justify-between gap-4 flex-wrap"
                            style={{ background: "var(--card)", border: "2px solid var(--card-border)", boxShadow: "5px 5px 0 var(--card-border)", padding: "12px 16px" }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex gap-1.5">
                                    <button onClick={() => setAnchorMs((a) => navigateAnchor(a, view, -1))} className="neo-btn neo-btn-sm" style={{ width: "32px", height: "32px", background: "var(--card)" }}>
                                        ←
                                    </button>
                                    <button onClick={() => setAnchorMs((a) => navigateAnchor(a, view, 1))} className="neo-btn neo-btn-sm" style={{ width: "32px", height: "32px", background: "var(--card)" }}>
                                        →
                                    </button>
                                    <button onClick={() => setAnchorMs(todayMs)} className="neo-btn neo-btn-sm" style={{ padding: "0 12px", height: "32px", background: "var(--card)" }}>
                                        Today
                                    </button>
                                </div>
                                <h2 style={{ fontFamily: "var(--font-mono), monospace", fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                                    {toolbarTitle}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1">
                                    <button onClick={() => setSpan("continuous")} style={segStyle(span === "continuous")}>
                                        State timeline
                                    </button>
                                    <button onClick={() => setSpan("per-day")} style={segStyle(span === "per-day")}>
                                        Per-day
                                    </button>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => setView("month")} style={segStyle(view === "month")}>
                                        Month
                                    </button>
                                    <button onClick={() => setView("week")} style={segStyle(view === "week")}>
                                        Week
                                    </button>
                                    <button onClick={() => setView("day")} style={segStyle(view === "day")}>
                                        Day
                                    </button>
                                </div>
                            </div>
                        </div>
```

- [ ] **Step 2: Add the month grid**

Directly below the "N tasks in view" paragraph (still inside the same `{!loading && (...)}` fragment), add:

```tsx
                        {view === "month" && (
                            <div style={{ background: "var(--card)", border: "2px solid var(--card-border)", boxShadow: "5px 5px 0 var(--card-border)" }}>
                                <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "2px solid var(--card-border)" }}>
                                    {DOW_NAMES.map((d) => (
                                        <div
                                            key={d}
                                            style={{
                                                padding: "9px 12px",
                                                fontFamily: "var(--font-mono), monospace",
                                                fontSize: "10.5px",
                                                fontWeight: 700,
                                                letterSpacing: "0.05em",
                                                textTransform: "uppercase",
                                                color: "var(--text-muted)",
                                            }}
                                        >
                                            {d.slice(0, 3)}
                                        </div>
                                    ))}
                                </div>
                                {monthWeeks.map((week) => {
                                    const lanes = week.placed.reduce((m, x) => Math.max(m, x.lane + 1), 0);
                                    const rowMinHeight = span === "per-day" ? 124 : Math.max(124, 38 + lanes * 26 + 16);
                                    return (
                                        <div key={week.weekStartMs} style={{ position: "relative", minHeight: `${rowMinHeight}px`, borderBottom: "1.5px dashed var(--dashed)" }}>
                                            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                                                {week.days.map((day) => {
                                                    const dayTasks = span === "per-day" ? filteredTasks.filter((t) => t.spanStart <= day.dateMs && t.spanEnd >= day.dateMs) : [];
                                                    return (
                                                        <div key={day.dateMs} style={{ borderLeft: "1.5px dashed var(--dashed)", background: day.isCurrentMonth ? "transparent" : "var(--card-alt)", overflow: "hidden" }}>
                                                            <div className="flex items-center gap-1.5" style={{ padding: "7px 9px 0" }}>
                                                                <span
                                                                    style={{
                                                                        fontFamily: "var(--font-mono), monospace",
                                                                        fontSize: "12px",
                                                                        fontWeight: 700,
                                                                        color: day.isToday ? "var(--card)" : day.isCurrentMonth ? "var(--text-primary)" : "var(--text-muted)",
                                                                        background: day.isToday ? "var(--text-primary)" : "transparent",
                                                                        borderRadius: "999px",
                                                                        width: "20px",
                                                                        height: "20px",
                                                                        display: "inline-flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                    }}
                                                                >
                                                                    {day.dayNumber}
                                                                </span>
                                                                {day.monthLabel && (
                                                                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "10.5px", color: "var(--text-muted)" }}>{day.monthLabel}</span>
                                                                )}
                                                            </div>
                                                            {span === "per-day" && (
                                                                <div className="flex flex-col gap-1" style={{ padding: "5px 5px 0" }}>
                                                                    {dayTasks.slice(0, 3).map((t) => (
                                                                        <button
                                                                            key={t.id}
                                                                            onClick={() => setSelectedTaskId(t.id)}
                                                                            title={t.title}
                                                                            style={{
                                                                                fontFamily: "var(--font-mono), monospace",
                                                                                fontSize: "10.5px",
                                                                                textAlign: "left",
                                                                                padding: "2px 6px",
                                                                                border: "1.5px solid var(--card-border)",
                                                                                background: colorForKey(t.status),
                                                                                color: "var(--text-primary)",
                                                                                whiteSpace: "nowrap",
                                                                                overflow: "hidden",
                                                                                textOverflow: "ellipsis",
                                                                                cursor: "pointer",
                                                                            }}
                                                                        >
                                                                            {t.title}
                                                                        </button>
                                                                    ))}
                                                                    {dayTasks.length > 3 && (
                                                                        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "10px", color: "var(--text-muted)" }}>
                                                                            +{dayTasks.length - 3} more
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {span === "continuous" && (
                                                <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                                                    {week.placed.flatMap((laned) =>
                                                        buildSegmentBlocks(laned, week.weekStartMs).map((block) => (
                                                            <button
                                                                key={block.key}
                                                                onClick={() => setSelectedTaskId(block.taskId)}
                                                                title={block.label || block.status}
                                                                style={{
                                                                    position: "absolute",
                                                                    pointerEvents: "auto",
                                                                    left: `calc(${(block.colStart / 7) * 100}% + ${block.openLeft ? 0 : 4}px)`,
                                                                    width: `calc(${(block.colSpan / 7) * 100}% - ${(block.openLeft ? 0 : 4) + (block.openRight ? 0 : 4)}px)`,
                                                                    top: `${34 + block.lane * 26}px`,
                                                                    height: "22px",
                                                                    background: colorForKey(block.status),
                                                                    border: "1.5px solid var(--card-border)",
                                                                    borderRight: block.terminal ? "4px solid var(--text-primary)" : "1.5px solid var(--card-border)",
                                                                    font: "700 11px/1 var(--font-mono), monospace",
                                                                    textAlign: "left",
                                                                    padding: "0 6px",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    whiteSpace: "nowrap",
                                                                    overflow: "hidden",
                                                                    textOverflow: "ellipsis",
                                                                    cursor: "pointer",
                                                                    color: "var(--text-primary)",
                                                                }}
                                                            >
                                                                {block.label}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                            {span === "continuous" &&
                                                week.hiddenPerDay.some((h) => h > 0) &&
                                                week.days.map(
                                                    (day, i) =>
                                                        week.hiddenPerDay[i] > 0 && (
                                                            <div
                                                                key={`more-${day.dateMs}`}
                                                                style={{
                                                                    position: "absolute",
                                                                    left: `calc(${(i / 7) * 100}% + 8px)`,
                                                                    bottom: "6px",
                                                                    fontFamily: "var(--font-mono), monospace",
                                                                    fontSize: "10.5px",
                                                                    color: "var(--text-muted)",
                                                                }}
                                                            >
                                                                +{week.hiddenPerDay[i]} more
                                                            </div>
                                                        )
                                                )}
                                        </div>
                                    );
                                })}
                                {!loading && filteredTasks.length === 0 && (
                                    <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ padding: "48px" }}>
                                        <p style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>
                                            No task activity in this period
                                        </p>
                                        <p style={{ fontSize: "13px", color: "var(--text-muted)", maxWidth: "42ch" }}>
                                            Nothing matched the current filters. Widen the range or clear the filters.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx eslint app/calendar/page.tsx` — expect no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/calendar`.
Expected:
- Month grid renders with real synced tasks as colored bars, correctly positioned on their start/end dates.
- Multi-status tasks show multiple colored sub-segments within one bar.
- Prev/Next/Today navigation moves the month and updates the title.
- Toggling "Per-day" switches bars to small per-day chips; toggling back to "State timeline" restores continuous bars.
- A week with more than 3 overlapping tasks shows "+N more".
- Filtering to something with zero matching tasks shows the empty state.
- Clicking a bar/chip doesn't error (no detail panel yet — that's Task 8; clicking just sets state with no visible effect for now).

- [ ] **Step 5: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar month view"
```

---

## Task 6: Week view

**Files:**
- Modify: `app/calendar/page.tsx`

**Interfaces:**
- Consumes: `getWeekStart`, `buildSegmentBlocks`, `packLanes`, `colorForKey`, `DOW_NAMES` from `@/lib/calendar-utils`; `view`, `anchorMs`, `filteredTasks`, `todayMs`, `setSelectedTaskId` from Task 5.
- Produces: week grid rendering, wired into the existing `view === "week"` branch of the toolbar's title and a new `view === "week"` render block.

- [ ] **Step 1: Compute week data and title**

Add to imports:

```tsx
import { getWeekStart } from "@/lib/calendar-utils";
```

Add a memo next to `monthWeeks`:

```tsx
    const weekStartMs = useMemo(() => getWeekStart(anchorMs), [anchorMs]);
    const weekLayout = useMemo(
        () => (view === "week" ? packLanes(weekStartMs, filteredTasks, 12) : { placed: [], hiddenPerDay: [0, 0, 0, 0, 0, 0, 0] }),
        [view, weekStartMs, filteredTasks]
    );
```

Add `packLanes` to the `@/lib/calendar-utils` import list.

Update `toolbarTitle` (from Task 5) to fill in the week branch:

```tsx
    const toolbarTitle =
        view === "month"
            ? `${MONTH_NAMES[anchorDate.getUTCMonth()]} ${anchorDate.getUTCFullYear()}`
            : view === "week"
                ? (() => {
                    const start = new Date(weekStartMs);
                    const end = new Date(weekStartMs + 6 * DAY_MS);
                    const startLabel = `${MONTH_NAMES[start.getUTCMonth()].slice(0, 3)} ${start.getUTCDate()}`;
                    const endLabel = `${MONTH_NAMES[end.getUTCMonth()].slice(0, 3)} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
                    return `${startLabel} – ${endLabel}`;
                })()
                : ""; // filled in Task 7
```

(This replaces the same `const toolbarTitle = ...` block introduced in Task 5 — edit it in place, don't duplicate it. `weekStartMs` must be declared before this, so move the `weekStartMs`/`weekLayout` memos above the `toolbarTitle` declaration.)

- [ ] **Step 2: Render the week grid**

Add directly after the month grid's closing `{view === "month" && (...)}`  block:

```tsx
                        {view === "week" && (
                            <div style={{ background: "var(--card)", border: "2px solid var(--card-border)", boxShadow: "5px 5px 0 var(--card-border)" }}>
                                <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "2px solid var(--card-border)" }}>
                                    {Array.from({ length: 7 }, (_, i) => weekStartMs + i * DAY_MS).map((dateMs) => {
                                        const d = new Date(dateMs);
                                        const isToday = dateMs === todayMs;
                                        return (
                                            <div key={dateMs} style={{ padding: "10px 12px", borderLeft: "1.5px dashed var(--dashed)", background: isToday ? "var(--card-alt)" : "transparent" }}>
                                                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "10.5px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)" }}>
                                                    {DOW_NAMES[d.getUTCDay()].slice(0, 3)}
                                                </div>
                                                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "20px", fontWeight: 700, color: isToday ? "var(--text-primary)" : "var(--text-secondary)" }}>
                                                    {d.getUTCDate()}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ position: "relative", minHeight: `${Math.max(160, 28 + weekLayout.placed.reduce((m, x) => Math.max(m, x.lane + 1), 0) * 44)}px` }}>
                                    <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                                        {Array.from({ length: 7 }, (_, i) => i).map((i) => (
                                            <div key={i} style={{ borderLeft: "1.5px dashed var(--dashed)" }} />
                                        ))}
                                    </div>
                                    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                                        {weekLayout.placed.flatMap((laned) =>
                                            buildSegmentBlocks(laned, weekStartMs).map((block) => (
                                                <button
                                                    key={block.key}
                                                    onClick={() => setSelectedTaskId(block.taskId)}
                                                    title={block.label || block.status}
                                                    style={{
                                                        position: "absolute",
                                                        pointerEvents: "auto",
                                                        left: `calc(${(block.colStart / 7) * 100}% + ${block.openLeft ? 0 : 4}px)`,
                                                        width: `calc(${(block.colSpan / 7) * 100}% - ${(block.openLeft ? 0 : 4) + (block.openRight ? 0 : 4)}px)`,
                                                        top: `${14 + block.lane * 44}px`,
                                                        height: "38px",
                                                        background: colorForKey(block.status),
                                                        border: "1.5px solid var(--card-border)",
                                                        borderRight: block.terminal ? "4px solid var(--text-primary)" : "1.5px solid var(--card-border)",
                                                        font: "700 12px/1 var(--font-mono), monospace",
                                                        textAlign: "left",
                                                        padding: "0 8px",
                                                        display: "flex",
                                                        alignItems: "center",
                                                        whiteSpace: "nowrap",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        cursor: "pointer",
                                                        color: "var(--text-primary)",
                                                    }}
                                                >
                                                    {block.label}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx eslint app/calendar/page.tsx` — expect no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/calendar`, click "Week".
Expected: 7 wide day columns for the current week, task bars correctly positioned and colored, title shows the week's date range, Prev/Next/Today move by 7 days.

- [ ] **Step 5: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar week view"
```

---

## Task 7: Day view

**Files:**
- Modify: `app/calendar/page.tsx`

**Interfaces:**
- Consumes: `getDayItems`, `statusOnDay`, `colorForKey`, `DOW_NAMES`, `MONTH_NAMES` from `@/lib/calendar-utils`; `view`, `anchorMs`, `filteredTasks`, `setSelectedTaskId` from Tasks 5–6.
- Produces: day list rendering, wired into the `view === "day"` branch of `toolbarTitle` and a new `view === "day"` render block.

- [ ] **Step 1: Compute day items and title**

Add `getDayItems`, `statusOnDay` to the `@/lib/calendar-utils` import list.

Add a memo:

```tsx
    const dayItems = useMemo(() => (view === "day" ? getDayItems(anchorMs, filteredTasks) : []), [view, anchorMs, filteredTasks]);
```

Fill in the last branch of `toolbarTitle` (replacing the `: ""; // filled in Task 7` line):

```tsx
                : (() => {
                    const d = new Date(anchorMs);
                    return `${DOW_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
                })();
```

- [ ] **Step 2: Render the day list**

Add directly after the week grid's closing `{view === "week" && (...)}` block:

```tsx
                        {view === "day" && (
                            <div style={{ background: "var(--card)", border: "2px solid var(--card-border)", boxShadow: "5px 5px 0 var(--card-border)" }}>
                                {dayItems.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ padding: "48px" }}>
                                        <p style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: "16px", color: "var(--text-primary)" }}>
                                            No task activity on this day
                                        </p>
                                    </div>
                                ) : (
                                    dayItems.map((t) => {
                                        const status = statusOnDay(t, anchorMs);
                                        return (
                                            <button
                                                key={t.id}
                                                onClick={() => setSelectedTaskId(t.id)}
                                                className="flex items-center gap-3.5 w-full text-left"
                                                style={{ padding: "14px 16px", borderBottom: "1.5px dashed var(--dashed)", background: "transparent", cursor: "pointer" }}
                                            >
                                                <span style={{ width: "4px", alignSelf: "stretch", minHeight: "34px", background: colorForKey(status), border: "1.5px solid var(--card-border)", flexShrink: 0 }} />
                                                <span className="flex flex-col gap-1 min-w-0">
                                                    <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>
                                                        {t.title}
                                                    </span>
                                                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                                        {t.repository} · {t.assignee.name ?? t.assignee.github_login}
                                                    </span>
                                                </span>
                                                <span className="ml-auto badge" style={{ background: colorForKey(status) }}>
                                                    {status}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        )}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx eslint app/calendar/page.tsx` — expect no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/calendar`, click "Day".
Expected: lists every task active on the anchor day with correct status pill, repository, and assignee; Prev/Next move by one day; Today jumps back to today; empty state shows on a day with nothing active.

- [ ] **Step 5: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar day view"
```

---

## Task 8: Task detail panel

**Files:**
- Modify: `app/calendar/page.tsx`

**Interfaces:**
- Consumes: `selectedTaskId`, `setSelectedTaskId`, `computedTasks`, `colorForKey` from Tasks 3–5.
- Produces: slide-in `<aside>` detail panel, no new exports (page-local only).

- [ ] **Step 1: Add the selected-task lookup and Escape-to-close handling**

Add `useEffect` (alongside the existing one) and a memo, right after `dayItems`:

```tsx
    const selectedTask = useMemo(() => computedTasks.find((t) => t.id === selectedTaskId) ?? null, [computedTasks, selectedTaskId]);

    useEffect(() => {
        if (!selectedTaskId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setSelectedTaskId(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedTaskId]);
```

- [ ] **Step 2: Wrap the calendar content in a flex row with the panel, and add the panel**

Change the outer `<main>` so its calendar body (filter bar / toolbar / grid, everything inside the `{!loading && (...)}` fragment from Tasks 4–7) sits inside a `<div className="flex gap-5 items-start">` next to the panel. Concretely, restructure the tail of the component to:

```tsx
                <div className="flex gap-5 items-start min-w-0">
                    <div className="flex-1 min-w-0 flex flex-col gap-5">
                        {loading ? (
                            <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                                Loading…
                            </p>
                        ) : (
                            <>
                                {/* filter bar, toolbar, month/week/day blocks from Tasks 4–7 stay here, unchanged */}
                            </>
                        )}
                    </div>

                    {selectedTask && (
                        <aside
                            style={{
                                width: "360px",
                                flexShrink: 0,
                                background: "var(--card)",
                                border: "2px solid var(--card-border)",
                                boxShadow: "6px 6px 0 var(--card-border)",
                            }}
                        >
                            <div className="flex items-center justify-between gap-3" style={{ padding: "14px 16px", borderBottom: "2px solid var(--card-border)" }}>
                                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "11px", color: "var(--text-muted)" }}>Task detail</span>
                                <button onClick={() => setSelectedTaskId(null)} className="neo-btn neo-btn-sm" style={{ padding: "5px", background: "var(--card)" }}>
                                    <X size={12} />
                                </button>
                            </div>
                            <div style={{ padding: "16px" }}>
                                <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                                    {selectedTask.repository}
                                </div>
                                <h3 style={{ fontFamily: "var(--font-mono), monospace", fontSize: "17px", fontWeight: 700, margin: "6px 0 10px", color: "var(--text-primary)" }}>
                                    {selectedTask.title}
                                </h3>
                                <span className="badge" style={{ background: colorForKey(selectedTask.status) }}>
                                    {selectedTask.status}
                                </span>

                                <dl
                                    className="grid gap-2"
                                    style={{ gridTemplateColumns: "90px 1fr", margin: "16px 0", fontSize: "12.5px", paddingTop: "14px", borderTop: "1.5px dashed var(--dashed)" }}
                                >
                                    <dt style={{ color: "var(--text-muted)" }}>Assignee</dt>
                                    <dd style={{ margin: 0, fontWeight: 600 }}>{selectedTask.assignee.name ?? selectedTask.assignee.github_login}</dd>
                                    <dt style={{ color: "var(--text-muted)" }}>Started</dt>
                                    <dd style={{ margin: 0 }}>{new Date(selectedTask.spanStart).toLocaleDateString()}</dd>
                                    <dt style={{ color: "var(--text-muted)" }}>{selectedTask.closed_at ? "Closed" : "Target"}</dt>
                                    <dd style={{ margin: 0 }}>{new Date(selectedTask.spanEnd).toLocaleDateString()}</dd>
                                    <dt style={{ color: "var(--text-muted)" }}>Duration</dt>
                                    <dd style={{ margin: 0 }}>
                                        {Math.round((selectedTask.spanEnd - selectedTask.spanStart) / DAY_MS) + 1} days
                                    </dd>
                                </dl>

                                {selectedTask.labels.length > 0 && (
                                    <div style={{ marginBottom: "16px" }}>
                                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>Labels</div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {selectedTask.labels.map((l) => (
                                                <span key={l.name} className="badge badge-todo">
                                                    {l.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div style={{ paddingTop: "14px", borderTop: "1.5px dashed var(--dashed)" }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px" }}>State timeline</div>
                                    <div className="flex flex-col gap-2.5" style={{ marginBottom: "16px" }}>
                                        {selectedTask.segments.map((seg, i) => (
                                            <div key={i} className="flex items-start gap-2.5">
                                                <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: colorForKey(seg.status), border: "1.5px solid var(--card-border)", marginTop: "4px", flexShrink: 0 }} />
                                                <span className="flex flex-col">
                                                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{seg.status}</span>
                                                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                                        {new Date(seg.start).toLocaleDateString()} – {new Date(seg.end).toLocaleDateString()}
                                                    </span>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {selectedTask.url && (
                                        <a href={selectedTask.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "13px" }}>
                                            Open on GitHub ↗
                                        </a>
                                    )}
                                </div>
                            </div>
                        </aside>
                    )}
                </div>
```

Move the filter bar, toolbar, and month/week/day grid blocks (Tasks 4–7) inside the `<>...</>` fragment shown above, unchanged.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx eslint app/calendar/page.tsx` — expect no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/calendar`. Click a task bar/chip/list-row in each of Month, Week, and Day views.
Expected: detail panel slides in with correct title, repo, assignee, dates, duration, labels, full state timeline (matching the bar's segments), and a working "Open on GitHub" link. Escape key and the panel's close button both close it. Grid content doesn't shift/break when the panel opens (it takes its own column).

- [ ] **Step 5: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar task detail panel"
```

---

## Task 9: Color mode toggle (By status / By bucket)

**Files:**
- Modify: `app/calendar/page.tsx`

**Interfaces:**
- Consumes: `StatusMappingProject`, `buildBucketLookup`, `ProjectBucketInfo` from `@/lib/calendar-utils` (Task 1); `project`, `filteredTasks`, `colorForKey` from earlier tasks.
- Produces: `colorMode: "status" | "bucket"` state, `resolveColor(status: string): { label: string; color: string }` helper used in place of bare `colorForKey(status)` calls in Tasks 5–8.

- [ ] **Step 1: Add color-mode state and the bucket-mapping fetch**

Add to imports:

```tsx
import { StatusMappingProject, buildBucketLookup } from "@/lib/calendar-utils";
```

Add state and fetch, near the `project` state:

```tsx
    const [colorMode, setColorMode] = useState<"status" | "bucket">("status");
    const [bucketProject, setBucketProject] = useState<StatusMappingProject | undefined>(undefined);

    useEffect(() => {
        if (colorMode !== "bucket" || project === "") {
            setBucketProject(undefined);
            return;
        }
        fetch(`/api/status-mapping?project=${project}`)
            .then((r) => r.json())
            .then((data) => setBucketProject((data.projects ?? [])[0]))
            .catch(() => setBucketProject(undefined));
    }, [colorMode, project]);

    const bucketLookup = useMemo(() => buildBucketLookup(bucketProject), [bucketProject]);

    const resolveColor = useCallback(
        (status: string): { label: string; color: string } => {
            if (colorMode !== "bucket" || project === "") {
                return { label: status, color: colorForKey(status) };
            }
            const bucket = bucketLookup.get(status);
            if (bucket === undefined || bucket === null) {
                return { label: "Unmapped", color: "var(--card-alt)" };
            }
            return { label: bucket.label, color: colorForKey(bucket.id) };
        },
        [colorMode, project, bucketLookup]
    );
```

Reset `colorMode` back to `"status"` whenever the project selector is cleared to "All projects" (bucket mode requires one project):

```tsx
    useEffect(() => {
        if (project === "") setColorMode("status");
    }, [project]);
```

- [ ] **Step 2: Add the toggle UI and switch every color/label call site to `resolveColor`**

Add the toggle to the toolbar, next to the Span toggle (inside the `<div className="flex items-center gap-2">` added in Task 5):

```tsx
                                <div className="flex gap-1" title={project === "" ? "Select a project to color by bucket" : undefined}>
                                    <button onClick={() => setColorMode("status")} style={segStyle(colorMode === "status")}>
                                        By status
                                    </button>
                                    <button
                                        onClick={() => project !== "" && setColorMode("bucket")}
                                        disabled={project === ""}
                                        style={{ ...segStyle(colorMode === "bucket"), opacity: project === "" ? 0.5 : 1, cursor: project === "" ? "not-allowed" : "pointer" }}
                                    >
                                        By bucket
                                    </button>
                                </div>
```

Replace color/label usages introduced in Tasks 5–8 as follows (each is a small find-and-replace within `app/calendar/page.tsx`):

- Month view per-day chip (Task 5): replace `background: colorForKey(t.status)` with `background: resolveColor(t.status).color`, and the chip's visible text `{t.title}` stays as the task title (unchanged — chips show title, not status).
- Month view continuous bar (Task 5): replace `background: colorForKey(block.status)` with `background: resolveColor(block.status).color`. Where `block.label` falls back to the raw status text (the `else if (span >= 2) label = seg.status` case inside `buildSegmentBlocks` in Task 2), that's a layout-layer label unrelated to color mode — leave it as-is, since it's the segment's own status text regardless of coloring, matching the design mockup's behavior.
- Week view bar (Task 6): replace `background: colorForKey(block.status)` with `background: resolveColor(block.status).color`.
- Day view row (Task 7): replace `colorForKey(status)` (both the swatch and the badge) with `resolveColor(status).color`, and replace the badge's visible text from `{status}` to `{resolveColor(status).label}`.
- Detail panel (Task 8): replace `colorForKey(selectedTask.status)` with `resolveColor(selectedTask.status).color`, and the visible badge text from `{selectedTask.status}` to `{resolveColor(selectedTask.status).label}`. Replace each timeline entry's `colorForKey(seg.status)` with `resolveColor(seg.status).color` and its visible `{seg.status}` with `{resolveColor(seg.status).label}`.

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expect no errors.
Run: `npx eslint app/calendar/page.tsx` — expect no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/calendar` with a specific project selected (not "All projects").
Expected:
- "By bucket" is enabled; clicking it recolors all currently-visible bars/chips/pills/timeline entries by their project's bucket mapping (open Status mapping on the dashboard in another tab to cross-check a couple of statuses' bucket assignments).
- A status with no bucket mapping shows "Unmapped" with the muted `--card-alt` color.
- Switching the Project selector to "All projects" disables "By bucket" (tooltip visible on hover) and snaps color mode back to "By status".
- Toggling color mode does not change bar positions or grid layout — only colors/labels.

- [ ] **Step 5: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar bucket color mode"
```

---

## Task 10: Loading skeleton, error state, and final verification pass

**Files:**
- Modify: `app/calendar/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces: `error: string | null` state; a skeleton loading UI matching `KPITable`'s pulse pattern instead of the plain "Loading…" text used as a placeholder since Task 3.

- [ ] **Step 1: Add error state and surface fetch failures**

Update `fetchData` (from Task 3) to track and surface errors:

```tsx
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = project !== "" ? `?project=${project}` : "";
            const [usersRes, summaryRes] = await Promise.all([
                fetch(`/api/kpi/users${qs}`),
                fetch(`/api/kpi/summary${qs}`),
            ]);
            const usersData = await usersRes.json();
            const summaryData = await summaryRes.json();
            if (Array.isArray(usersData)) setKpis(usersData);
            if (summaryData.summary) {
                setSummary({ repositories: summaryData.repositories || [], last_sync: summaryData.summary.last_sync });
            }
            if (!usersRes.ok || !summaryRes.ok) {
                setError(usersData?.error || summaryData?.error || "Failed to load calendar data");
            }
        } catch (err) {
            console.error("Failed to fetch calendar data:", err);
            setError("Network error. Please check your connection.");
        } finally {
            setLoading(false);
        }
    }, [project]);
```

Render the error inline, right below the header, above the `<div className="flex gap-5 items-start ...">` from Task 8:

```tsx
                {error && (
                    <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12.5px", color: "var(--danger)" }}>
                        ⚠ {error}
                    </p>
                )}
```

- [ ] **Step 2: Replace the plain "Loading…" text with a skeleton**

Replace every remaining `loading ? <p>Loading…</p> : ...` branch (there's one, inside the flex row from Task 8) with:

```tsx
                        {loading ? (
                            <div className="flex flex-col gap-3">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className="h-16 animate-pulse" style={{ background: "var(--card-alt)", border: "2px solid var(--card-border)" }} />
                                ))}
                            </div>
                        ) : (
```

(Keep the closing `)}` that was already there for this ternary — only the `loading ? ... :` branch's content changes.)

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit` — expect no errors across the whole project.
Run: `npx eslint app/calendar/page.tsx lib/calendar-utils.ts` — expect no errors.

- [ ] **Step 4: Full manual verification pass**

Run: `npm run dev`, open `/calendar`, and walk the full checklist from the design spec (`docs/superpowers/specs/2026-08-07-task-calendar-design.md`):

- Month/Week/Day views render tasks correctly, including multi-status bars.
- Project selector re-fetches and scopes data correctly, including "All projects".
- Color mode toggle switches between raw-status and bucket coloring without reflowing bar positions; unmapped statuses show as "Unmapped" in bucket mode; toggle disables on "All projects".
- Filters (repo/assignee/label/status) narrow the view correctly, and "Clear filters" resets them.
- Span toggle switches between continuous bars and per-day chips.
- Clicking a task opens the detail panel with correct data; Escape and the close button both work.
- Empty and loading states render correctly.
- Temporarily disconnect the network (or stop the dev DB) and confirm the error message renders instead of a silent failure.
- No console errors in the browser devtools during any of the above.
- Navigate to `/dashboard` and confirm it renders and behaves exactly as before — zero regressions from this feature being entirely additive.

- [ ] **Step 5: Commit**

```bash
git add app/calendar/page.tsx
git commit -m "feat: add calendar loading/error states"
```

---

## Plan self-review notes

- **Spec coverage:** Month/Week/Day views (Tasks 5–7), span toggle (Task 5), color mode toggle incl. bucket constraints (Task 9), detail panel (Task 8), filters (Task 4), Project selector (Task 3), empty/loading/error states (Tasks 5, 10), styling (baked into every JSX task via Global Constraints), zero existing-file edits (every task creates/modifies only the two new files) — all covered.
- **No new API routes/deps/test frameworks** — verified against every task; only pre-existing endpoints and the pre-existing `typescript`/`eslint` tooling are used.
- **Type consistency** — `CalendarTask`, `ComputedTask`, `CalendarSegment`, `LanedTask`, `SegmentBlock`, `MonthWeek`/`MonthDay`, `StatusMappingProject`/`ProjectBucketInfo` are each defined once in Tasks 1–2 and referenced by the same names throughout Tasks 3–9 — no renames.
