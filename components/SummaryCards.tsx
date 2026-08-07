"use client";

import { CheckSquare, Users, TrendingUp, Percent, ListTodo, Target } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SummaryData {
    total_tasks: number;
    completed_tasks: number;
    active_tasks: number;
    active_users: number;
    total_story_points: number;
    last_sync: string | null;
}

interface SummaryCardsProps {
    summary: SummaryData | null;
    loading: boolean;
}

function SkeletonCard() {
    return (
        <div
            className="animate-pulse"
            style={{
                height: "116px",
                background: "#E2E0D8",
                border: "2px solid var(--card-border)",
                boxShadow: "4px 4px 0 var(--card-border)",
            }}
        />
    );
}

export default function SummaryCards({ summary, loading }: SummaryCardsProps) {
    const total = summary?.total_tasks ?? 0;
    const completed = summary?.completed_tasks ?? 0;
    const active = summary?.active_tasks ?? 0;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const activePct = total > 0 ? Math.round((active / total) * 100) : 0;

    const cards = [
        {
            id: "total-tasks-card",
            label: "Total Tasks",
            value: total,
            icon: CheckSquare,
            bg: "var(--accent-lavender)",
            barPct: 100,
        },
        {
            id: "completed-tasks-card",
            label: "Completed",
            value: completed,
            icon: TrendingUp,
            bg: "var(--accent-blue)",
            barPct: rate,
            barLabel: `${rate}%`,
        },
        {
            id: "completion-rate-card",
            label: "Completion Rate",
            value: `${rate}%`,
            icon: Percent,
            bg: "var(--accent)",
            barPct: rate,
        },
        {
            id: "active-tasks-card",
            label: "Active Tasks",
            value: active,
            icon: ListTodo,
            bg: "var(--accent-pink)",
            barPct: activePct,
            barLabel: `${activePct}%`,
        },
        {
            id: "active-users-card",
            label: "Active Devs",
            value: summary?.active_users ?? 0,
            icon: Users,
            bg: "var(--card)",
        },
        {
            id: "story-points-card",
            label: "Story Points",
            value: summary?.total_story_points ?? 0,
            icon: Target,
            bg: "var(--accent-green)",
        },
    ];

    if (loading) {
        return (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        );
    }

    return (
        <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div
                            key={card.id}
                            id={card.id}
                            className="flex flex-col gap-1 min-w-0"
                            style={{
                                background: card.bg,
                                border: "2px solid var(--card-border)",
                                boxShadow: "4px 4px 0 var(--card-border)",
                                padding: "14px 14px 12px",
                            }}
                        >
                            <div className="flex items-start justify-between">
                                <span
                                    style={{
                                        fontFamily: "var(--font-mono), monospace",
                                        fontWeight: 700,
                                        fontSize: "30px",
                                        lineHeight: 1,
                                        color: "var(--text-primary)",
                                    }}
                                >
                                    {card.value}
                                </span>
                                <span
                                    className="grid place-items-center shrink-0"
                                    style={{
                                        width: "30px",
                                        height: "30px",
                                        borderRadius: "50%",
                                        background: "var(--card-border)",
                                        color: "var(--card)",
                                    }}
                                >
                                    <Icon size={14} />
                                </span>
                            </div>
                            <span
                                style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    fontSize: "12px",
                                    letterSpacing: "-0.2px",
                                    color: "var(--text-primary)",
                                }}
                            >
                                {card.label}
                            </span>
                            {card.barPct !== undefined && (
                                <div className="mt-2 flex items-center gap-2">
                                    <div className="progress-bar flex-1">
                                        <div
                                            className="progress-bar-fill"
                                            style={{
                                                width: `${card.barPct}%`,
                                                background: "var(--card-border)",
                                            }}
                                        />
                                    </div>
                                    {card.barLabel && (
                                        <span
                                            style={{
                                                fontFamily: "var(--font-mono), monospace",
                                                fontSize: "11px",
                                                color: "var(--text-primary)",
                                            }}
                                        >
                                            {card.barLabel}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {summary?.last_sync && (
                <p
                    className="text-right mt-2"
                    style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "12px",
                        color: "var(--text-muted)",
                    }}
                >
                    Last synced{" "}
                    {formatDistanceToNow(new Date(summary.last_sync), { addSuffix: true })}
                </p>
            )}
        </div>
    );
}
