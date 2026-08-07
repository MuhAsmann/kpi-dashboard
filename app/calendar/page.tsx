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
