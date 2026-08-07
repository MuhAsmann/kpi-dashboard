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
