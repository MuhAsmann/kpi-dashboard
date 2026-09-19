// app/calendar/page.tsx
"use client";

import {
    ACCENT_TOKENS,
    CalendarTask,
    CalendarView,
    ComputedTask,
    DAY_MS,
    DOW_NAMES,
    MONTH_NAMES,
    StatusMappingProject,
    buildBucketLookup,
    buildSegmentBlocks,
    colorForKey,
    computeMonthWeeks,
    computeTask,
    getDayItems,
    getWeekStart,
    navigateAnchor,
    packLanes,
    segmentIndexOnDay,
    statusOnDay,
    uniqueOptions,
} from "@/lib/calendar-utils";
import { UserKPI } from "@/lib/kpi-service";
import { PROJECTS } from "@/lib/projects";
import { usePersistedState } from "@/lib/use-persisted-state";
import MultiSelectDropdown from "@/components/MultiSelectDropdown";
import SingleSelectDropdown from "@/components/SingleSelectDropdown";
import TaskSearchBox from "@/components/TaskSearchBox";
import { formatDistanceToNow } from "date-fns";
import {
    X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

interface CalendarSummary {
    repositories: string[];
    last_sync: string | null;
}

interface CalendarFilters {
    repository: string[];
    assignee: string[];
    label: string[];
    status: string[];
}

const DEFAULT_CALENDAR_FILTERS: CalendarFilters = {
    repository: [],
    assignee: [],
    label: [],
    status: [],
};

function isCalendarFilters(value: unknown): value is CalendarFilters {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        Array.isArray(v.repository) &&
        Array.isArray(v.assignee) &&
        Array.isArray(v.label) &&
        Array.isArray(v.status) &&
        v.repository.every((x) => typeof x === "string") &&
        v.assignee.every((x) => typeof x === "string") &&
        v.label.every((x) => typeof x === "string") &&
        v.status.every((x) => typeof x === "string")
    );
}

function formatDateTime(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function isProjectValue(value: unknown): value is number | "" {
    return value === "" || typeof value === "number";
}

export default function CalendarPage() {
    const [kpis, setKpis] = useState<UserKPI[]>([]);
    const [summary, setSummary] = useState<CalendarSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [project, setProject, projectLoaded] = usePersistedState<number | "">("calendar-project", "", isProjectValue);

    const [colorMode, setColorMode] = useState<"status" | "bucket">("status");
    const [bucketProject, setBucketProject] = useState<StatusMappingProject | undefined>(undefined);

    useEffect(() => {
        if (colorMode !== "bucket" || project === "") return;
        fetch(`/api/status-mapping?project=${project}`)
            .then((r) => r.json())
            .then((data) => setBucketProject((data.projects ?? [])[0]))
            .catch(() => setBucketProject(undefined));
    }, [colorMode, project]);

    const bucketLookup = useMemo(() => buildBucketLookup(bucketProject), [bucketProject]);

    const resolveColor = useCallback(
        (status: string): { label: string; color: string } => {
            if (colorMode !== "bucket" || project === "" || bucketProject?.number !== project) {
                return { label: status, color: colorForKey(status) };
            }
            const bucket = bucketLookup.get(status);
            if (bucket === undefined || bucket === null) {
                return { label: "Unmapped", color: "var(--card-alt)" };
            }
            return { label: bucket.label, color: colorForKey(bucket.id) };
        },
        [colorMode, project, bucketLookup, bucketProject]
    );

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
            if (Array.isArray(usersData)) {
                setKpis(usersData);
            } else {
                setKpis([]);
            }
            if (summaryData.summary) {
                setSummary({ repositories: summaryData.repositories || [], last_sync: summaryData.summary.last_sync });
            } else {
                setSummary(null);
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

    useEffect(() => {
        if (!projectLoaded) return;
        fetchData();
    }, [fetchData, projectLoaded]);

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

    // Per-task, de-collided segment colors: two DIFFERENT raw statuses can hash
    // to the same accent color, which makes a status change invisible in the
    // timeline. Only applies in "by status" mode — in "by bucket" mode, two
    // consecutive segments sharing a color means they're genuinely the same
    // bucket, which is correct to show identically.
    const taskSegmentColors = useMemo(() => {
        const map = new Map<string, string[]>();
        computedTasks.forEach((t) => {
            const colors: string[] = [];
            t.segments.forEach((seg, i) => {
                let color = resolveColor(seg.status).color;
                if (colorMode === "status" && i > 0 && color === colors[i - 1]) {
                    const startIdx = ACCENT_TOKENS.indexOf(color as (typeof ACCENT_TOKENS)[number]);
                    for (let step = 1; step < ACCENT_TOKENS.length; step++) {
                        const candidate = ACCENT_TOKENS[(startIdx + step) % ACCENT_TOKENS.length];
                        if (candidate !== colors[i - 1]) {
                            color = candidate;
                            break;
                        }
                    }
                }
                colors.push(color);
            });
            map.set(t.id, colors);
        });
        return map;
    }, [computedTasks, colorMode, resolveColor]);

    const colorForSegment = useCallback(
        (taskId: string, segIndex: number, fallbackStatus: string): string => {
            const colors = taskSegmentColors.get(taskId);
            if (colors && segIndex >= 0 && segIndex < colors.length) return colors[segIndex];
            return resolveColor(fallbackStatus).color;
        },
        [taskSegmentColors, resolveColor]
    );

    const [filters, setFilters] = usePersistedState<CalendarFilters>(
        "calendar-filters",
        DEFAULT_CALENDAR_FILTERS,
        isCalendarFilters
    );

    const [view, setView] = useState<CalendarView>("month");
    const [anchorMs, setAnchorMs] = useState(todayMs);
    const [span, setSpan] = useState<"continuous" | "per-day">("continuous");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [hoveredDayMs, setHoveredDayMs] = useState<number | null>(null);

    const anchorDate = new Date(anchorMs);
    const weekStartMs = useMemo(() => getWeekStart(anchorMs), [anchorMs]);
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
                : (() => {
                    const d = new Date(anchorMs);
                    return `${DOW_NAMES[d.getUTCDay()]}, ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
                })();

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

    const repoOptions = useMemo(() => uniqueOptions(computedTasks.map((t) => t.repository), "All repositories").slice(1), [computedTasks]);
    const assigneeOptions = useMemo(
        () => uniqueOptions(computedTasks.map((t) => t.assignee.name ?? t.assignee.github_login), "All assignees").slice(1),
        [computedTasks]
    );
    const labelOptions = useMemo(
        () => uniqueOptions(computedTasks.flatMap((t) => t.labels.map((l) => l.name)), "All labels").slice(1),
        [computedTasks]
    );
    const statusOptions = useMemo(() => uniqueOptions(computedTasks.map((t) => t.status), "All statuses").slice(1), [computedTasks]);

    const taskSearchOptions = useMemo(
        () => computedTasks.map((t) => ({ id: t.id, title: t.title, repository: t.repository, status: t.status })),
        [computedTasks]
    );

    const jumpToTask = useCallback(
        (taskId: string) => {
            const task = computedTasks.find((t) => t.id === taskId);
            if (task) setAnchorMs(task.spanStart);
            setSelectedTaskId(taskId);
        },
        [computedTasks]
    );

    const filteredTasks = useMemo(
        () =>
            computedTasks.filter(
                (t) =>
                    (filters.repository.length === 0 || filters.repository.includes(t.repository ?? "")) &&
                    (filters.assignee.length === 0 || filters.assignee.includes(t.assignee.name ?? t.assignee.github_login ?? "")) &&
                    (filters.label.length === 0 || t.labels.some((l) => filters.label.includes(l.name))) &&
                    (filters.status.length === 0 || filters.status.includes(t.status))
            ),
        [computedTasks, filters]
    );

    const monthWeeks = useMemo(
        () => (view === "month" ? computeMonthWeeks(anchorMs, filteredTasks, todayMs) : []),
        [view, anchorMs, filteredTasks, todayMs]
    );
    const weekLayout = useMemo(
        () => (view === "week" ? packLanes(weekStartMs, filteredTasks, 12) : { placed: [], hiddenPerDay: [0, 0, 0, 0, 0, 0, 0] }),
        [view, weekStartMs, filteredTasks]
    );
    const dayItems = useMemo(() => (view === "day" ? getDayItems(anchorMs, filteredTasks) : []), [view, anchorMs, filteredTasks]);

    const selectedTask = useMemo(() => computedTasks.find((t) => t.id === selectedTaskId) ?? null, [computedTasks, selectedTaskId]);

    useEffect(() => {
        if (!selectedTaskId) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setSelectedTaskId(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedTaskId]);

    const hasActiveFilters = !!(
        filters.repository.length ||
        filters.assignee.length ||
        filters.label.length ||
        filters.status.length
    );

    return (
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
                        <SingleSelectDropdown
                            id="calendar-project"
                            value={project === "" ? "" : String(project)}
                            onChange={(v) => {
                                const next = v ? parseInt(v, 10) : "";
                                setProject(next);
                                if (next === "") setColorMode("status");
                            }}
                            title="Scopes calendar data to this project"
                            buttonStyle={{ fontWeight: 700, padding: "9px 12px", background: "var(--accent)" }}
                            options={[
                                { value: "", label: "All projects" },
                                ...PROJECTS.map((p) => ({ value: String(p.number), label: p.label })),
                            ]}
                        />
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

            {error && (
                <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12.5px", color: "var(--danger)" }}>
                    ⚠ {error}
                </p>
            )}

            <div className="flex gap-5 items-start min-w-0">
                <div className="flex-1 min-w-0 flex flex-col gap-5">
                    {loading ? (
                        <div className="flex flex-col gap-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="h-16 animate-pulse" style={{ background: "var(--card-alt)", border: "2px solid var(--card-border)" }} />
                            ))}
                        </div>
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
                                <div className="flex flex-col gap-1.5">
                                    <label
                                        htmlFor="calendar-task-search"
                                        style={{
                                            fontFamily: "var(--font-mono), monospace",
                                            fontSize: "10.5px",
                                            letterSpacing: "1px",
                                            textTransform: "uppercase",
                                            color: "var(--text-muted)",
                                        }}
                                    >
                                        Search task
                                    </label>
                                    <TaskSearchBox id="calendar-task-search" tasks={taskSearchOptions} onSelect={jumpToTask} />
                                </div>
                                {[
                                    { key: "repository" as const, label: "Repository", options: repoOptions, allLabel: "All repositories" },
                                    { key: "assignee" as const, label: "Assignee", options: assigneeOptions, allLabel: "All assignees" },
                                    { key: "label" as const, label: "Label", options: labelOptions, allLabel: "All labels" },
                                    { key: "status" as const, label: "Status", options: statusOptions, allLabel: "All statuses" },
                                ].map(({ key, label, options, allLabel }) => (
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
                                        <MultiSelectDropdown
                                            id={`calendar-filter-${key}`}
                                            options={options}
                                            selected={filters[key]}
                                            allLabel={allLabel}
                                            onChange={(values) => setFilters((prev) => ({ ...prev, [key]: values }))}
                                        />
                                    </div>
                                ))}
                                {hasActiveFilters && (
                                    <button
                                        onClick={() => setFilters(DEFAULT_CALENDAR_FILTERS)}
                                        className="neo-btn neo-btn-sm flex items-center gap-1.5"
                                        style={{ fontSize: "12px", padding: "9px 13px", background: "var(--accent-pink)", color: "var(--text-primary)" }}
                                    >
                                        <X size={12} />
                                        Clear filters
                                    </button>
                                )}
                            </div>

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

                            <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                                {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""} in view · {computedTasks.length} total
                            </p>

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
                                                            <div
                                                                key={day.dateMs}
                                                                role="button"
                                                                tabIndex={0}
                                                                onClick={() => {
                                                                    setView("day");
                                                                    setAnchorMs(day.dateMs);
                                                                }}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === "Enter" || e.key === " ") {
                                                                        e.preventDefault();
                                                                        setView("day");
                                                                        setAnchorMs(day.dateMs);
                                                                    }
                                                                }}
                                                                onMouseEnter={() => setHoveredDayMs(day.dateMs)}
                                                                onMouseLeave={() => setHoveredDayMs((prev) => (prev === day.dateMs ? null : prev))}
                                                                style={{
                                                                    borderLeft: "1.5px dashed var(--dashed)",
                                                                    background: hoveredDayMs === day.dateMs ? "var(--card-alt)" : day.isCurrentMonth ? "transparent" : "var(--card-alt)",
                                                                    overflow: "hidden",
                                                                    cursor: "pointer",
                                                                }}
                                                            >
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
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setSelectedTaskId(t.id);
                                                                                }}
                                                                                title={t.title}
                                                                                style={{
                                                                                    fontFamily: "var(--font-mono), monospace",
                                                                                    fontSize: "10.5px",
                                                                                    textAlign: "left",
                                                                                    padding: "2px 6px",
                                                                                    border: "1.5px solid var(--card-border)",
                                                                                    background: colorForSegment(t.id, segmentIndexOnDay(t, day.dateMs), statusOnDay(t, day.dateMs)),
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
                                                                    title={block.labelKind === "status" ? resolveColor(block.status).label : (block.label || resolveColor(block.status).label)}
                                                                    style={{
                                                                        position: "absolute",
                                                                        pointerEvents: "auto",
                                                                        left: `calc(${(block.colStart / 7) * 100}% + ${block.openLeft ? 0 : 4}px)`,
                                                                        width: `calc(${(block.colSpan / 7) * 100}% - ${(block.openLeft ? 0 : 4) + (block.openRight ? 0 : 4)}px)`,
                                                                        top: `${34 + block.lane * 26}px`,
                                                                        height: "22px",
                                                                        background: colorForSegment(block.taskId, block.segIndex, block.status),
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
                                                                    {block.labelKind === "status" ? resolveColor(block.status).label : block.label}
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

                            {view === "week" && (
                                <div style={{ background: "var(--card)", border: "2px solid var(--card-border)", boxShadow: "5px 5px 0 var(--card-border)" }}>
                                    <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "2px solid var(--card-border)" }}>
                                        {Array.from({ length: 7 }, (_, i) => weekStartMs + i * DAY_MS).map((dateMs, i) => {
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
                                                    {weekLayout.hiddenPerDay[i] > 0 && (
                                                        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "10.5px", color: "var(--text-muted)" }}>
                                                            +{weekLayout.hiddenPerDay[i]} more
                                                        </div>
                                                    )}
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
                                                        title={block.labelKind === "status" ? resolveColor(block.status).label : (block.label || resolveColor(block.status).label)}
                                                        style={{
                                                            position: "absolute",
                                                            pointerEvents: "auto",
                                                            left: `calc(${(block.colStart / 7) * 100}% + ${block.openLeft ? 0 : 4}px)`,
                                                            width: `calc(${(block.colSpan / 7) * 100}% - ${(block.openLeft ? 0 : 4) + (block.openRight ? 0 : 4)}px)`,
                                                            top: `${14 + block.lane * 44}px`,
                                                            height: "38px",
                                                            background: colorForSegment(block.taskId, block.segIndex, block.status),
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
                                                        {block.labelKind === "status" ? resolveColor(block.status).label : block.label}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

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
                                                    <span style={{ width: "4px", alignSelf: "stretch", minHeight: "34px", background: resolveColor(status).color, border: "1.5px solid var(--card-border)", flexShrink: 0 }} />
                                                    <span className="flex flex-col gap-1 min-w-0">
                                                        <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>
                                                            {t.title}
                                                        </span>
                                                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                                            {t.repository} · {t.assignee.name ?? t.assignee.github_login}
                                                        </span>
                                                    </span>
                                                    <span className="ml-auto badge" style={{ background: resolveColor(status).color }}>
                                                        {resolveColor(status).label}
                                                    </span>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            )}
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
                            <span className="badge" style={{ background: resolveColor(selectedTask.status).color }}>
                                {resolveColor(selectedTask.status).label}
                            </span>

                            <dl
                                className="grid gap-2"
                                style={{ gridTemplateColumns: "90px 1fr", margin: "16px 0", fontSize: "12.5px", paddingTop: "14px", borderTop: "1.5px dashed var(--dashed)" }}
                            >
                                <dt style={{ color: "var(--text-muted)" }}>Assignee</dt>
                                <dd style={{ margin: 0, fontWeight: 600 }}>{selectedTask.assignee.name ?? selectedTask.assignee.github_login}</dd>
                                <dt style={{ color: "var(--text-muted)" }}>Started</dt>
                                <dd style={{ margin: 0 }}>{formatDateTime(selectedTask.segments[0].rawStart)}</dd>
                                <dt style={{ color: "var(--text-muted)" }}>{selectedTask.closed_at ? "Closed" : "Target"}</dt>
                                <dd style={{ margin: 0 }}>{formatDateTime(selectedTask.segments[selectedTask.segments.length - 1].rawEnd)}</dd>
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
                                            <span style={{ width: "8px", height: "8px", borderRadius: "999px", background: colorForSegment(selectedTask.id, i, seg.status), border: "1.5px solid var(--card-border)", marginTop: "4px", flexShrink: 0 }} />
                                            <span className="flex flex-col">
                                                <span style={{ fontSize: "13px", fontWeight: 600 }}>{resolveColor(seg.status).label}</span>
                                                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                                    {formatDateTime(seg.rawStart)} – {formatDateTime(seg.rawEnd)}
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
        </main>
    );
}
