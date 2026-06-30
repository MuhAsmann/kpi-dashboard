"use client";

import { UserKPI } from "@/lib/kpi-service";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

interface UserChartProps {
    kpis: UserKPI[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div
                className="p-3 rounded-lg text-sm shadow-xl"
                style={{
                    background: "#111827",
                    border: "1px solid #1f2937",
                    color: "var(--text-primary)",
                }}
            >
                <p className="font-semibold mb-2 text-indigo-400">{label}</p>
                {payload.map((entry: { name: string; value: number; color: string }) => (
                    <div key={entry.name} className="flex items-center gap-2">
                        <div
                            className="w-2 h-2 rounded-full"
                            style={{ background: entry.color }}
                        />
                        <span style={{ color: "var(--text-secondary)" }}>{entry.name}:</span>
                        <span className="font-medium">{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export default function UserChart({ kpis }: UserChartProps) {
    const data = kpis.slice(0, 10).map((kpi) => ({
        name: kpi.user.github_login,
        "Completed": kpi.metrics.completed_tasks,
        "In Progress": kpi.metrics.in_progress_tasks,
        "Todo": kpi.metrics.todo_tasks,
    }));

    return (
        <div
            className="p-6 rounded-xl"
            style={{
                background: "rgba(17, 24, 39, 0.8)",
                border: "1px solid rgba(31, 41, 55, 0.8)",
            }}
        >
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                        Task Distribution
                    </h2>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Top 10 developers by task volume
                    </p>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
                <BarChart
                    data={data}
                    margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
                    barSize={18}
                >
                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(31,41,55,0.5)"
                        vertical={false}
                    />
                    <XAxis
                        dataKey="name"
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(99,102,241,0.05)" }} />
                    <Legend
                        wrapperStyle={{ fontSize: "12px", color: "#9ca3af", paddingTop: "16px" }}
                    />
                    <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="In Progress" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Todo" fill="#374151" radius={[4, 4, 0, 0]} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
