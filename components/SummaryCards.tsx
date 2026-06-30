"use client";

import { CheckSquare, Users, TrendingUp, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SummaryData {
    total_tasks: number;
    completed_tasks: number;
    active_users: number;
    last_sync: string | null;
}

interface SummaryCardsProps {
    summary: SummaryData | null;
    loading: boolean;
}

function SkeletonCard() {
    return (
        <div className="stat-card animate-pulse">
            <div className="h-4 w-24 rounded mb-3" style={{ background: "#1f2937" }} />
            <div className="h-8 w-16 rounded" style={{ background: "#1f2937" }} />
        </div>
    );
}

export default function SummaryCards({ summary, loading }: SummaryCardsProps) {
    const completionRate = summary
        ? summary.total_tasks > 0
            ? Math.round((summary.completed_tasks / summary.total_tasks) * 100)
            : 0
        : 0;

    const cards = [
        {
            id: "total-tasks-card",
            label: "Total Tasks",
            value: summary?.total_tasks ?? 0,
            icon: CheckSquare,
            color: "#6366f1",
            bg: "rgba(99,102,241,0.1)",
        },
        {
            id: "completed-tasks-card",
            label: "Completed",
            value: summary?.completed_tasks ?? 0,
            icon: TrendingUp,
            color: "#10b981",
            bg: "rgba(16,185,129,0.1)",
        },
        {
            id: "active-users-card",
            label: "Active Devs",
            value: summary?.active_users ?? 0,
            icon: Users,
            color: "#06b6d4",
            bg: "rgba(6,182,212,0.1)",
        },
        {
            id: "completion-rate-card",
            label: "Completion Rate",
            value: `${completionRate}%`,
            icon: Clock,
            color: "#f59e0b",
            bg: "rgba(245,158,11,0.1)",
        },
    ];

    if (loading) {
        return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                    <SkeletonCard key={i} />
                ))}
            </div>
        );
    }

    return (
        <div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.id} id={card.id} className="stat-card">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                                    {card.label}
                                </span>
                                <div
                                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                                    style={{ background: card.bg }}
                                >
                                    <Icon size={15} style={{ color: card.color }} />
                                </div>
                            </div>
                            <div
                                className="text-3xl font-bold"
                                style={{ color: card.color }}
                            >
                                {card.value}
                            </div>
                        </div>
                    );
                })}
            </div>

            {summary?.last_sync && (
                <p className="text-right mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    Last synced{" "}
                    {formatDistanceToNow(new Date(summary.last_sync), { addSuffix: true })}
                </p>
            )}
        </div>
    );
}
