"use client";

import { UserKPI } from "@/lib/kpi-service";
import { KpiBucketInfo } from "@/lib/kpi-buckets";
import { ChevronUp, ChevronDown, ChevronsUpDown, ExternalLink, List, Calendar, Zap, GitBranch } from "lucide-react";
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

function bucketBadgeClass(bucket: KpiBucketInfo | null): string {
    if (!bucket) return "badge-unmapped";
    return bucket.is_done ? "badge-done" : "badge-in-progress";
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
        <ChevronDown size={12} style={{ color: "var(--text-primary)" }} />
    ) : (
        <ChevronUp size={12} style={{ color: "var(--text-primary)" }} />
    );
}

function CompletionBar({ rate }: { rate: number }) {
    return (
        <div className="flex items-center gap-2">
            <div className="progress-bar flex-1" style={{ minWidth: "80px" }}>
                <div
                    className="progress-bar-fill"
                    style={{ width: `${rate}%`, background: "var(--accent)" }}
                />
            </div>
            <span
                className="w-10 text-right"
                style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", color: "var(--text-primary)" }}
            >
                {rate}%
            </span>
        </div>
    );
}

function SkeletonRow() {
    return (
        <tr>
            {[40, 160, 60, 60, 140, 80, 80, 100].map((width, i) => (
                <td key={i} style={{ padding: "16px" }}>
                    <div
                        className="h-4 animate-pulse"
                        style={{ background: "#E2E0D8", width: `${width}px` }}
                    />
                </td>
            ))}
        </tr>
    );
}

function EmptyState() {
    return (
        <tr>
            <td colSpan={9} className="text-center py-16">
                <div style={{ color: "var(--text-muted)" }}>
                    <div className="text-4xl mb-3">⌛</div>
                    <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
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
        { key: null, label: "#" },
        { key: null, label: "Developer" },
        { key: "total_tasks", label: "Total", sortable: true },
        { key: "completed_tasks", label: "Done", sortable: true },
        { key: "completion_rate", label: "Rate", sortable: true },
        { key: "avg_cycle_time_days", label: "Cycle", sortable: true },
        { key: "bugs_count", label: "Bugs", sortable: true },
        { key: null, label: "Points" },
        { key: null, label: "Active work" },
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
            style={{
                background: "var(--card)",
                border: "2px solid var(--card-border)",
                boxShadow: "5px 5px 0 var(--card-border)",
            }}
        >
            <div
                className="px-5 py-4"
                style={{ borderBottom: "2px solid var(--card-border)", background: "var(--card-alt)" }}
            >
                <h2 style={{ fontFamily: "var(--font-mono), monospace", fontSize: "20px", margin: 0, color: "var(--text-primary)" }}>
                    Developer breakdown
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                    {kpis.length} developer{kpis.length !== 1 ? "s" : ""} tracked · click a row to see tickets and status history
                </p>
            </div>

            <div className="overflow-x-auto">
                <table className="kpi-table">
                    <thead>
                        <tr style={{ background: "var(--card-alt)" }}>
                            {columns.map((col) => (
                                <th key={col.label}>
                                    {col.sortable && col.key ? (
                                        <button
                                            id={`sort-${col.key}-btn`}
                                            onClick={() => onSort(col.key as SortField)}
                                            className="flex items-center gap-1 hover:opacity-70 transition-opacity cursor-pointer"
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
                                const tint = ["var(--accent)", "var(--accent-blue)", "var(--accent-pink)", "var(--accent-green)", "var(--accent-lavender)"][index % 5];
                                return (
                                    <Fragment key={kpi.user.id}>
                                        <tr
                                            id={`kpi-row-${kpi.user.github_login}`}
                                            onClick={() => toggleRow(kpi.user.id)}
                                            className="cursor-pointer"
                                            style={{ background: isExpanded ? "#F7F5EE" : "var(--card)" }}
                                        >
                                            {/* Rank */}
                                            <td style={{ width: "46px" }}>
                                                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-muted)" }}>
                                                    {String(index + 1).padStart(2, "0")}
                                                </span>
                                            </td>

                                            {/* Developer */}
                                            <td>
                                                <div className="flex items-center gap-2.5">
                                                    <div
                                                        className="relative shrink-0 overflow-hidden"
                                                        style={{ width: "34px", height: "34px", background: tint, border: "2px solid var(--card-border)" }}
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
                                                                className="w-full h-full flex items-center justify-center"
                                                                style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: "12px", color: "var(--text-primary)" }}
                                                            >
                                                                {kpi.user.github_login.slice(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <a
                                                            href={`https://github.com/${kpi.user.github_login}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="flex items-center gap-1 font-semibold text-sm hover:opacity-70 transition-opacity"
                                                            style={{ color: "var(--text-primary)" }}
                                                        >
                                                            {kpi.user.name || kpi.user.github_login}
                                                            <ExternalLink size={10} className="opacity-50" />
                                                        </a>
                                                        <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                                                            @{kpi.user.github_login}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Total */}
                                            <td>
                                                <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "var(--text-primary)" }}>
                                                    {kpi.metrics.total_tasks}
                                                </span>
                                            </td>

                                            {/* Completed */}
                                            <td>
                                                <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "var(--text-primary)" }}>
                                                    {kpi.metrics.completed_tasks}
                                                </span>
                                            </td>

                                            {/* Completion Rate */}
                                            <td style={{ minWidth: "150px" }}>
                                                <CompletionBar rate={kpi.metrics.completion_rate} />
                                            </td>

                                            {/* Avg Cycle Time */}
                                            <td>
                                                {kpi.metrics.avg_cycle_time_days !== null ? (
                                                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px", color: "var(--text-primary)" }}>
                                                        {kpi.metrics.avg_cycle_time_days}d
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--text-muted)" }}>—</span>
                                                )}
                                            </td>

                                            {/* Bugs */}
                                            <td className="text-center">
                                                <span
                                                    style={{
                                                        fontFamily: "var(--font-mono), monospace",
                                                        fontSize: "12px",
                                                        padding: "3px 8px",
                                                        background: kpi.metrics.bugs_count > 0 ? "var(--accent-pink)" : "var(--card-alt)",
                                                        border: "1.5px solid var(--card-border)",
                                                        color: "var(--text-primary)",
                                                    }}
                                                >
                                                    {kpi.metrics.bugs_count}
                                                </span>
                                            </td>

                                            {/* Story Points */}
                                            <td style={{ fontFamily: "var(--font-mono), monospace", fontSize: "13px" }}>
                                                {kpi.metrics.total_story_points > 0 ? (
                                                    <span className="flex items-center gap-1" style={{ color: "var(--text-primary)" }}>
                                                        <Zap size={12} />
                                                        {kpi.metrics.total_story_points}
                                                        {kpi.metrics.tasks_without_sp > 0 && (
                                                            <span style={{ color: "var(--warning)" }}>
                                                                {" "}⚠{kpi.metrics.tasks_without_sp}
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--warning)" }}>No SP</span>
                                                )}
                                            </td>

                                            {/* Active Tasks — by this project's own KPI buckets */}
                                            <td>
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    {kpi.metrics.bucket_breakdown.slice(0, 2).map((b) => (
                                                        <span key={b.bucket_id} className="badge badge-in-progress">
                                                            {b.count} {b.label}
                                                        </span>
                                                    ))}
                                                    {kpi.metrics.bucket_breakdown.length > 2 && (
                                                        <span className="badge badge-todo">
                                                            +{kpi.metrics.bucket_breakdown.length - 2} more
                                                        </span>
                                                    )}
                                                    {kpi.metrics.unmapped_tasks > 0 && (
                                                        <span className="badge badge-unmapped" title="These statuses aren't mapped to a KPI bucket yet">
                                                            {kpi.metrics.unmapped_tasks} unmapped
                                                        </span>
                                                    )}
                                                    {kpi.metrics.overdue_tasks > 0 && (
                                                        <span className="badge badge-cancelled">
                                                            {kpi.metrics.overdue_tasks} overdue
                                                        </span>
                                                    )}
                                                    {kpi.metrics.active_tasks === 0 && (
                                                        <span className="badge badge-done">All done</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={9} className="p-0" style={{ background: "var(--card-alt)", borderBottom: "2px solid var(--card-border)" }}>
                                                    <div className="p-5">
                                                        <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-3">
                                                            <div className="flex items-center gap-2">
                                                                <List size={15} style={{ color: "var(--text-muted)" }} />
                                                                <h3 style={{ fontFamily: "var(--font-mono), monospace", fontSize: "15px", margin: 0, color: "var(--text-primary)" }}>
                                                                    @{kpi.user.github_login} · tickets in range
                                                                </h3>
                                                            </div>
                                                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "11.5px", color: "var(--text-muted)" }}>
                                                                {kpi.tasks.length} tasks
                                                            </span>
                                                        </div>

                                                        {kpi.tasks.length === 0 ? (
                                                            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No tasks found in the selected period.</p>
                                                        ) : (
                                                            <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
                                                                {kpi.tasks.map(task => (
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
                                                                        <div className="flex justify-between items-start gap-3.5 flex-wrap">
                                                                            <a
                                                                                href={task.url || "#"}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="font-semibold text-sm hover:opacity-70 flex-1 pr-2 line-clamp-2"
                                                                                style={{ color: "var(--text-primary)" }}
                                                                            >
                                                                                {task.title}
                                                                            </a>
                                                                            <div className="flex gap-1.5 shrink-0 items-center flex-wrap justify-end">
                                                                                {task.story_points != null ? (
                                                                                    <span
                                                                                        className="flex items-center gap-1"
                                                                                        style={{ padding: "2px 7px", fontSize: "10.5px", background: "var(--card-alt)", border: "1.5px solid var(--card-border)", color: "var(--text-primary)", fontWeight: 600 }}
                                                                                    >
                                                                                        <Zap size={9} />{task.story_points} SP
                                                                                    </span>
                                                                                ) : (
                                                                                    <span
                                                                                        className="flex items-center gap-1"
                                                                                        style={{ padding: "2px 7px", fontSize: "10.5px", background: "var(--accent)", border: "1.5px solid var(--card-border)", color: "var(--text-primary)" }}
                                                                                    >
                                                                                        ⚠ No SP
                                                                                    </span>
                                                                                )}
                                                                                {task.is_overdue && (
                                                                                    <span className="badge badge-cancelled" style={{ padding: "2px 7px", fontSize: "10.5px" }}>
                                                                                        overdue
                                                                                    </span>
                                                                                )}
                                                                                {task.bug_count > 0 && (
                                                                                    <span className="badge badge-cancelled" style={{ padding: "2px 7px", fontSize: "10.5px" }}>
                                                                                        🐞 {task.bug_count} bug{task.bug_count > 1 ? 's' : ''}
                                                                                    </span>
                                                                                )}
                                                                                <span className={`badge shrink-0 ${bucketBadgeClass(task.bucket)}`}>
                                                                                    {task.status}
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        <div
                                                                            className="flex items-center justify-between flex-wrap gap-2"
                                                                            style={{ borderTop: "1.5px dashed var(--dashed)", paddingTop: "9px", fontFamily: "var(--font-mono), monospace", fontSize: "11px", color: "var(--text-muted)" }}
                                                                        >
                                                                            <div className="flex items-center gap-3">
                                                                                {task.repository && (
                                                                                    <span className="flex items-center gap-1" style={{ background: "var(--card-alt)", padding: "2px 6px", border: "1.5px solid var(--card-border)" }}>
                                                                                        <GitBranch size={11} />
                                                                                        {task.repository.split('/')[1] || task.repository}
                                                                                    </span>
                                                                                )}
                                                                                <span className="flex items-center gap-1">
                                                                                    <Calendar size={11} />
                                                                                    {format(new Date(task.created_at), "MMM d, yyyy")}
                                                                                </span>
                                                                                {task.closed_at && (
                                                                                    <span>→ {format(new Date(task.closed_at), "MMM d")}</span>
                                                                                )}
                                                                            </div>

                                                                            {task.labels && task.labels.length > 0 && (
                                                                                <div className="flex flex-wrap gap-1 justify-end">
                                                                                    {task.labels.slice(0, 3).map((l, idx) => (
                                                                                        <span
                                                                                            key={idx}
                                                                                            style={{ width: "8px", height: "8px", border: "1px solid var(--card-border)", backgroundColor: `#${l.color || '6b7280'}` }}
                                                                                            title={l.name}
                                                                                        />
                                                                                    ))}
                                                                                    {task.labels.length > 3 && <span style={{ fontSize: "9px" }}>+{task.labels.length - 3}</span>}
                                                                                </div>
                                                                            )}
                                                                        </div>

                                                                        {task.histories && task.histories.length > 0 && (() => {
                                                                            const pastChips = task.histories.slice(0, -1);
                                                                            const currentAt = task.histories[task.histories.length - 1].changed_at;
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
                                                                                    {pastChips.map((h, i) => (
                                                                                        <span key={i} className="flex items-center gap-2">
                                                                                            <span style={chipStyle}>
                                                                                                {h.new_status}
                                                                                                <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                                                                                                    {format(new Date(h.changed_at), "MMM d, h:mm a")}
                                                                                                </span>
                                                                                            </span>
                                                                                            <span style={{ color: "var(--dashed)" }}>→</span>
                                                                                        </span>
                                                                                    ))}
                                                                                    <span style={{ ...chipStyle, background: task.is_done ? "var(--accent)" : "var(--card-alt)" }}>
                                                                                        {task.status}
                                                                                        <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>
                                                                                            {format(new Date(currentAt), "MMM d, h:mm a")}
                                                                                        </span>
                                                                                    </span>
                                                                                </div>
                                                                            );
                                                                        })()}
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
