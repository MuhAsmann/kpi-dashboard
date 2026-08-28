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
    if (segments.length === 0) {
        return [{ status: points[points.length - 1].status, start: finalEndMs, end: finalEndMs }];
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

// ============================================================================
// Calendar Layout and Navigation
// ============================================================================

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

// ============================================================================
// Lane Packing and Segment Blocks
// ============================================================================

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
        while (lane < maxLanes && lanesEndCol[lane] !== undefined && lanesEndCol[lane] > c0) lane++;
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
    labelKind: "title" | "status" | "none";
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
        let labelKind: SegmentBlock["labelKind"] = "none";
        if (!labelled) {
            label = task.title;
            labelKind = "title";
            labelled = true;
        } else if (span >= 2) {
            label = seg.status;
            labelKind = "status";
        }

        const terminal = !!task.closed_at && i === task.segments.length - 1 && endsHere;

        blocks.push({
            key: `${task.id}-${weekStartMs}-${i}`,
            taskId: task.id,
            label,
            labelKind,
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

// ============================================================================
// Month/Week/Day View Data
// ============================================================================

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

export function formatHour(hour: number): string {
    const h = hour % 24;
    const pad = h < 10 ? `0${h}` : `${h}`;
    return `${pad}:00`;
}
