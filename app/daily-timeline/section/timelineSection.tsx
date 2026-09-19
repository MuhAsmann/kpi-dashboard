"use client";

import { formatHour } from "@/lib/calendar-utils";
import { DailyWorkEntry } from "@/types/daily-work";
import { Clock, ExternalLink, GitPullRequestArrow, X, User as UserIcon, Tag, CheckCircle2, AlertCircle } from "lucide-react";
import { useMemo } from "react";

interface TimelineSectionProps {
    data: DailyWorkEntry[];
    loading: boolean;
    selectedEntry: DailyWorkEntry | null;
    setSelectedEntry: (entry: DailyWorkEntry | null) => void;
}

/** Group entries by hour (9 to 17 guaranteed, plus any extra hours in data) */
function groupByHour(entries: DailyWorkEntry[]): Map<number, DailyWorkEntry[]> {
    const map = new Map<number, DailyWorkEntry[]>();

    // Always include hours 9 to 17 by default
    for (let h = 9; h <= 17; h++) {
        map.set(h, []);
    }

    // Add entries to their respective hour buckets
    for (const entry of entries) {
        const list = map.get(entry.hour) ?? [];
        list.push(entry);
        map.set(entry.hour, list);
    }

    // Sort hours ascending (09:00 -> 17:00+)
    return new Map([...map.entries()].sort((a, b) => a[0] - b[0]));
}



export function getStatusBadgeClass(status: string, isContinuous: boolean): string {
    if (!isContinuous) return "badge badge-done";
    const lower = status.toLowerCase();
    if (lower.includes("progress") || lower.includes("review")) return "badge badge-in-progress";
    if (lower.includes("todo") || lower.includes("backlog")) return "badge badge-todo";
    return "badge badge-in-progress";
}

export default function TimelineSection({ data, loading, selectedEntry, setSelectedEntry }: TimelineSectionProps) {
    const grouped = useMemo(() => groupByHour(data), [data]);

    if (loading) {
        return (
            <div
                className="flex items-center justify-center gap-3"
                style={{
                    padding: "60px 20px",
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: "13px",
                    color: "var(--text-muted)",
                }}
            >
                <div
                    style={{
                        width: 18,
                        height: 18,
                        border: "2.5px solid var(--card-border)",
                        borderTopColor: "transparent",
                        borderRadius: "50%",
                        animation: "spin 0.7s linear infinite",
                    }}
                />
                Loading timeline…
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-0" style={{ position: "relative" }}>
            {[...grouped.entries()].map(([hour, entries], groupIdx) => (
                <div key={hour} className="flex gap-0" style={{ minHeight: 48 }}>
                    {/* Hour label column */}
                    <div
                        className="flex flex-col items-center"
                        style={{ width: 75, flexShrink: 0, position: "relative" }}
                    >
                        {/* Hour badge */}
                        <div
                            className="flex items-center gap-1"
                            style={{
                                fontFamily: "var(--font-mono), monospace",
                                fontWeight: 700,
                                fontSize: "11px",
                                color: entries.length > 0 ? "var(--text-primary)" : "var(--text-muted)",
                                background: entries.length > 0 ? "var(--accent)" : "var(--card-alt)",
                                border: "1.5px solid var(--card-border)",
                                padding: "3px 7px",
                                whiteSpace: "nowrap",
                                zIndex: 2,
                                position: "relative",
                            }}
                        >
                            <Clock size={11} />
                            {formatHour(hour)}
                        </div>
                        {/* Vertical connector line */}
                        {groupIdx < grouped.size - 1 && (
                            <div
                                style={{
                                    width: 2,
                                    flex: 1,
                                    background: "var(--card-border)",
                                    minHeight: 16,
                                }}
                            />
                        )}
                    </div>

                    {/* Entries column */}
                    <div
                        className="flex flex-col gap-1.5"
                        style={{ flex: 1, paddingBottom: groupIdx < grouped.size - 1 ? 14 : 0, paddingLeft: 10 }}
                    >
                        {entries.length === 0 ? (
                            <div
                                className="flex items-center"
                                style={{
                                    height: 28,
                                    fontFamily: "var(--font-mono), monospace",
                                    fontSize: "11px",
                                    color: "var(--dashed)",
                                    fontStyle: "italic",
                                }}
                            >
                                — No activity
                            </div>
                        ) : (
                            entries.map((entry) => (
                                <div
                                    key={entry.workLogId}
                                    onClick={() => setSelectedEntry(entry)}
                                    className="flex items-center gap-2.5"
                                    style={{
                                        background: "var(--card)",
                                        border: "1.5px solid var(--card-border)",
                                        boxShadow: "3px 3px 0 var(--card-border)",
                                        padding: "6px 10px",
                                        transition: "transform 0.1s ease, box-shadow 0.1s ease",
                                        cursor: "pointer",
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = "translate(1px, 1px)";
                                        e.currentTarget.style.boxShadow = "2px 2px 0 var(--card-border)";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = "";
                                        e.currentTarget.style.boxShadow = "3px 3px 0 var(--card-border)";
                                    }}
                                >
                                    {/* Avatar */}
                                    {entry.avatarUrl ? (
                                        <img
                                            src={entry.avatarUrl}
                                            alt={entry.username ?? ""}
                                            style={{
                                                width: 24,
                                                height: 24,
                                                border: "1.5px solid var(--card-border)",
                                                flexShrink: 0,
                                            }}
                                        />
                                    ) : (
                                        <div
                                            style={{
                                                width: 24,
                                                height: 24,
                                                border: "1.5px solid var(--card-border)",
                                                background: "var(--accent-lavender)",
                                                flexShrink: 0,
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                fontFamily: "var(--font-mono), monospace",
                                                fontWeight: 700,
                                                fontSize: "10px",
                                            }}
                                        >
                                            ?
                                        </div>
                                    )}

                                    {/* PIC Username */}
                                    <span
                                        style={{
                                            fontFamily: "var(--font-mono), monospace",
                                            fontWeight: 700,
                                            fontSize: "11px",
                                            color: "var(--text-muted)",
                                            flexShrink: 0,
                                            maxWidth: 100,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {entry.username}
                                    </span>

                                    {/* Issue title */}
                                    <span
                                        style={{
                                            fontWeight: 600,
                                            fontSize: "12.5px",
                                            color: "var(--text-primary)",
                                            flex: 1,
                                            minWidth: 0,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {entry.issueNumber != null && `#${entry.issueNumber} `}
                                        {entry.issueTitle}
                                    </span>

                                    {/* Status Badge */}
                                    <span
                                        className={getStatusBadgeClass(entry.status, entry.isContinuous)}
                                        style={{ fontSize: "9.5px", padding: "1px 6px" }}
                                    >
                                        {entry.status}
                                    </span>

                                    {/* Continuous badge */}
                                    {entry.isContinuous && (
                                        <span
                                            className="flex items-center gap-1"
                                            style={{
                                                fontFamily: "var(--font-mono), monospace",
                                                fontSize: "9px",
                                                fontWeight: 600,
                                                color: "var(--warning)",
                                                background: "var(--accent)",
                                                padding: "1px 5px",
                                                border: "1px solid var(--card-border)",
                                                flexShrink: 0,
                                            }}
                                        >
                                            <span
                                                className="pulse-dot"
                                                style={{
                                                    width: 5,
                                                    height: 5,
                                                    borderRadius: "50%",
                                                    background: "var(--warning)",
                                                    display: "inline-block",
                                                }}
                                            />
                                            ONGOING
                                        </span>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
