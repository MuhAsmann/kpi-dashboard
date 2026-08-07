// app/calendar/page.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { UserKPI } from "@/lib/kpi-service";
import { PROJECTS } from "@/lib/projects";
import {
    CalendarTask,
    ComputedTask,
    computeTask,
    uniqueOptions,
    CalendarView,
    computeMonthWeeks,
    navigateAnchor,
    colorForKey,
    buildSegmentBlocks,
    getWeekStart,
    packLanes,
    getDayItems,
    statusOnDay,
    MONTH_NAMES,
    DOW_NAMES,
    DAY_MS,
} from "@/lib/calendar-utils";
import {
    LayoutDashboard,
    ListChecks,
    GitBranch,
    Clock,
    BarChart3,
    Settings,
    HelpCircle,
    Calendar as CalendarIcon,
    X,
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

    const [filters, setFilters] = useState({ repository: "", assignee: "", label: "", status: "" });

    const [view, setView] = useState<CalendarView>("month");
    const [anchorMs, setAnchorMs] = useState(todayMs);
    const [span, setSpan] = useState<"continuous" | "per-day">("continuous");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

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

    const hasActiveFilters = !!(filters.repository || filters.assignee || filters.label || filters.status);

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

                <div className="flex gap-5 items-start min-w-0">
                    <div className="flex-1 min-w-0 flex flex-col gap-5">
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
            </main>
        </div>
    );
}
