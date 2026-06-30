"use client";

import { UserKPI } from "@/lib/kpi-service";
import { ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink, List, Calendar } from "lucide-react";
import Image from "next/image";
import { SortField } from "@/types/dashboard";
import { useState, Fragment } from "react";
import { format } from "date-fns";

interface KPITableProps {
    kpis: UserKPI[];
    loading: boolean;
    sortBy: SortField;
    sortOrder: "asc" | "desc";
    onSort: (field: SortField) => void;
}

function SortIcon({
    field,
    sortBy,
    sortOrder,
}: {
    field: SortField;
    sortBy: SortField;
    sortOrder: "asc" | "desc";
}) {
    if (field !== sortBy) return <ChevronsUpDown size={12} className="opacity-30" />;
    return sortOrder === "desc" ? (
        <ChevronDown size={12} style={{ color: "#6366f1" }} />
    ) : (
        <ChevronUp size={12} style={{ color: "#6366f1" }} />
    );
}

function CompletionBar({ rate }: { rate: number }) {
    const color =
        rate >= 80 ? "#10b981" : rate >= 50 ? "#f59e0b" : "#ef4444";

    return (
        <div className="flex items-center gap-2">
            <div className="progress-bar flex-1" style={{ minWidth: "80px" }}>
                <div
                    className="progress-bar-fill"
                    style={{ width: `${rate}%`, background: color }}
                />
            </div>
            <span className="text-xs font-medium w-10 text-right" style={{ color }}>
                {rate}%
            </span>
        </div>
    );
}

function RankBadge({ rank }: { rank: number }) {
    if (rank > 3) {
        return (
            <span className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>
                #{rank}
            </span>
        );
    }
    const classes = ["", "rank-1", "rank-2", "rank-3"];
    const emoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
    return (
        <span
            className={`${classes[rank]} text-white text-xs font-bold px-2 py-0.5 rounded-full`}
        >
            {emoji}
        </span>
    );
}

function SkeletonRow() {
    return (
        <tr>
            {[40, 160, 60, 60, 140, 80, 100].map((width, i) => (
                <td key={i} style={{ padding: "16px" }}>
                    <div
                        className="h-4 rounded animate-pulse"
                        style={{ background: "#1f2937", width: `${width}px` }}
                    />
                </td>
            ))}
        </tr>
    );
}

function EmptyState() {
    return (
        <tr>
            <td colSpan={7} className="text-center py-16">
                <div style={{ color: "var(--text-muted)" }}>
                    <div className="text-4xl mb-3">📊</div>
                    <p className="font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                        No KPI data yet
                    </p>
                    <p className="text-sm">
                        Click &ldquo;Sync GitHub&rdquo; to fetch data from your GitHub Project
                    </p>
                </div>
            </td>
        </tr>
    );
}

const columns: Array<{
    key: SortField | null;
    label: string;
    sortable?: boolean;
}> = [
        { key: null, label: "Rank" },
        { key: null, label: "Developer" },
        { key: "total_tasks", label: "Total", sortable: true },
        { key: "completed_tasks", label: "Completed", sortable: true },
        { key: "completion_rate", label: "Completion Rate", sortable: true },
        { key: "avg_cycle_time_days", label: "Avg Cycle Time", sortable: true },
        { key: "bugs_count", label: "Bugs", sortable: true },
        { key: null, label: "Active" },
    ];

export default function KPITable({
    kpis,
    loading,
    sortBy,
    sortOrder,
    onSort,
}: KPITableProps) {
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

    const toggleRow = (userId: string) => {
        setExpandedUserId(prev => prev === userId ? null : userId);
    };

    return (
        <div
            className="rounded-xl overflow-hidden"
            style={{
                background: "rgba(17, 24, 39, 0.8)",
                border: "1px solid rgba(31, 41, 55, 0.8)",
            }}
        >
            <div
                className="px-6 py-4 border-b"
                style={{ borderColor: "rgba(31,41,55,0.8)" }}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <h2
                            className="text-base font-semibold"
                            style={{ color: "var(--text-primary)" }}
                        >
                            Developer KPI
                        </h2>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            {kpis.length} developer{kpis.length !== 1 ? "s" : ""} tracked
                        </p>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="kpi-table">
                    <thead>
                        <tr>
                            {columns.map((col) => (
                                <th key={col.label}>
                                    {col.sortable && col.key ? (
                                        <button
                                            id={`sort-${col.key}-btn`}
                                            onClick={() => onSort(col.key as SortField)}
                                            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                                        >
                                            {col.label}
                                            <SortIcon
                                                field={col.key as SortField}
                                                sortBy={sortBy}
                                                sortOrder={sortOrder}
                                            />
                                        </button>
                                    ) : (
                                        col.label
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            [1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)
                        ) : kpis.length === 0 ? (
                            <EmptyState />
                        ) : (
                            kpis.map((kpi, index) => {
                                const isExpanded = expandedUserId === kpi.user.id;
                                return (
                                    <Fragment key={kpi.user.id}>
                                        <tr
                                            id={`kpi-row-${kpi.user.github_login}`}
                                            onClick={() => toggleRow(kpi.user.id)}
                                            className="cursor-pointer"
                                        >
                                            {/* Rank */}
                                            <td style={{ width: "60px" }}>
                                                <RankBadge rank={index + 1} />
                                            </td>

                                            {/* Developer */}
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <div
                                                        className="relative w-8 h-8 rounded-full overflow-hidden shrink-0"
                                                        style={{ background: "#1f2937" }}
                                                    >
                                                        {kpi.user.avatar_url ? (
                                                            <Image
                                                                src={kpi.user.avatar_url}
                                                                alt={kpi.user.github_login}
                                                                fill
                                                                className="object-cover"
                                                            />
                                                        ) : (
                                                            <div
                                                                className="w-full h-full flex items-center justify-center text-xs font-bold"
                                                                style={{ color: "#6366f1" }}
                                                            >
                                                                {kpi.user.github_login.slice(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <a
                                                            href={`https://github.com/${kpi.user.github_login}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 font-medium text-sm hover:opacity-80 transition-opacity"
                                                            style={{ color: "var(--text-primary)" }}
                                                        >
                                                            {kpi.user.name || kpi.user.github_login}
                                                            <ExternalLink size={10} className="opacity-50" />
                                                        </a>
                                                        <p
                                                            className="text-xs"
                                                            style={{ color: "var(--text-muted)" }}
                                                        >
                                                            @{kpi.user.github_login}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Total */}
                                            <td>
                                                <span
                                                    className="font-semibold"
                                                    style={{ color: "var(--text-primary)" }}
                                                >
                                                    {kpi.metrics.total_tasks}
                                                </span>
                                            </td>

                                            {/* Completed */}
                                            <td>
                                                <span className="font-semibold" style={{ color: "#10b981" }}>
                                                    {kpi.metrics.completed_tasks}
                                                </span>
                                            </td>

                                            {/* Completion Rate */}
                                            <td style={{ minWidth: "160px" }}>
                                                <CompletionBar rate={kpi.metrics.completion_rate} />
                                            </td>

                                            {/* Avg Cycle Time */}
                                            <td>
                                                {kpi.metrics.avg_cycle_time_days !== null ? (
                                                    <div className="flex items-baseline gap-1">
                                                        <span
                                                            className="font-semibold"
                                                            style={{
                                                                color:
                                                                    kpi.metrics.avg_cycle_time_days <= 3
                                                                        ? "#10b981"
                                                                        : kpi.metrics.avg_cycle_time_days <= 7
                                                                            ? "#f59e0b"
                                                                            : "#ef4444",
                                                            }}
                                                        >
                                                            {kpi.metrics.avg_cycle_time_days}
                                                        </span>
                                                        <span
                                                            className="text-xs"
                                                            style={{ color: "var(--text-muted)" }}
                                                        >
                                                            days
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)" }}>—</span>
                                                )}
                                            </td>

                                            {/* Bugs */}
                                            <td className="text-center">
                                                {kpi.metrics.bugs_count > 0 ? (
                                                    <span className="font-semibold" style={{ color: "#ef4444" }}>
                                                        {kpi.metrics.bugs_count}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)" }}>0</span>
                                                )}
                                            </td>

                                            {/* Active Tasks */}
                                            <td>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {kpi.metrics.in_progress_tasks > 0 && (
                                                        <span className="badge badge-in-progress">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 pulse-dot" />
                                                            {kpi.metrics.in_progress_tasks} WIP
                                                        </span>
                                                    )}
                                                    {kpi.metrics.todo_tasks > 0 && (
                                                        <span className="badge badge-todo">
                                                            {kpi.metrics.todo_tasks} Todo
                                                        </span>
                                                    )}
                                                    {kpi.metrics.overdue_tasks > 0 && (
                                                        <span className="badge badge-cancelled">
                                                            {kpi.metrics.overdue_tasks} Overdue
                                                        </span>
                                                    )}
                                                    {kpi.metrics.active_tasks === 0 && kpi.metrics.overdue_tasks === 0 && (
                                                        <span className="badge badge-done">All done</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {isExpanded && (
                                            <tr className="bg-[rgba(17,24,39,0.3)]">
                                                <td colSpan={7} className="p-0 border-b border-[rgba(31,41,55,0.5)]">
                                                    <div className="p-6">
                                                        <div className="flex items-center gap-2 mb-4">
                                                            <List size={16} style={{ color: "var(--text-muted)" }} />
                                                            <h3 className="font-semibold text-sm">Tickets for @{kpi.user.github_login}</h3>
                                                        </div>

                                                        {kpi.tasks.length === 0 ? (
                                                            <p className="text-sm text-gray-500">No tasks found in the selected period.</p>
                                                        ) : (
                                                            <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
                                                                {kpi.tasks.map(task => (
                                                                    <div key={task.id} className="p-4 rounded-lg bg-[rgba(31,41,55,0.4)] border border-[rgba(55,65,81,0.5)] hover:bg-[rgba(55,65,81,0.3)] transition-colors">
                                                                        <div className="flex justify-between items-start mb-2">
                                                                            <a href={task.url || "#"} target="_blank" rel="noopener noreferrer" className="font-medium text-sm text-(--accent-light) hover:underline flex-1 pr-4 line-clamp-2">
                                                                                {task.title}
                                                                            </a>
                                                                            <div className="flex gap-2 shrink-0 items-center">
                                                                                {task.is_overdue && (
                                                                                    <span className="badge badge-cancelled" style={{ padding: "2px 6px", fontSize: "10px", lineHeight: "1.2" }}>
                                                                                        ⚠️ Overdue
                                                                                    </span>
                                                                                )}
                                                                                {task.bug_count > 0 && (
                                                                                    <span className="badge badge-cancelled" style={{ padding: "2px 6px", fontSize: "10px", lineHeight: "1.2", backgroundColor: "rgba(239, 68, 68, 0.2)", color: "#fca5a5", border: "1px solid rgba(239, 68, 68, 0.3)" }}>
                                                                                        🐞 {task.bug_count} Bug{task.bug_count > 1 ? 's' : ''}
                                                                                    </span>
                                                                                )}
                                                                                <span className={`badge shrink-0 ${task.status === 'DONE' ? 'badge-done' : task.status === 'IN_PROGRESS' ? 'badge-in-progress' : task.status === 'CANCELLED' ? 'badge-cancelled' : 'badge-todo'}`}>
                                                                                    {task.status.replace("_", " ")}
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-center justify-between mt-3 text-xs text-[var(--text-muted)]">
                                                                            <div className="flex items-center gap-3">
                                                                                {task.repository && (
                                                                                    <span className="flex items-center gap-1 bg-[#111827] px-2 py-1 rounded">
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></svg>
                                                                                        {task.repository.split('/')[1] || task.repository}
                                                                                    </span>
                                                                                )}
                                                                                <span className="flex items-center gap-1">
                                                                                    <Calendar size={12} />
                                                                                    {format(new Date(task.created_at), "MMM d, yyyy")}
                                                                                </span>
                                                                                {task.closed_at && (
                                                                                    <span className="flex items-center gap-1 text-emerald-500/70">
                                                                                        → {format(new Date(task.closed_at), "MMM d")}
                                                                                    </span>
                                                                                )}
                                                                            </div>

                                                                            {task.labels && task.labels.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1 justify-end">
                                                                                    {task.labels.slice(0, 3).map((l, idx) => (
                                                                                        <span key={idx} className="w-2 h-2 rounded-full" style={{ backgroundColor: `#${l.color || '6b7280'}` }} title={l.name} />
                                                                                    ))}
                                                                                    {task.labels.length > 3 && <span className="text-[9px] opacity-70">+{task.labels.length - 3}</span>}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
