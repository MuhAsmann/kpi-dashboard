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
