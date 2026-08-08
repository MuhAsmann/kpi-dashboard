"use client";

import { UserKPI } from "@/lib/kpi-service";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
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
                style={{
                    padding: "10px 12px",
                    background: "var(--card)",
                    border: "2px solid var(--card-border)",
                    boxShadow: "3px 3px 0 var(--card-border)",
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: "12px",
                }}
            >
                <p className="font-bold mb-1.5" style={{ color: "var(--text-primary)" }}>{label}</p>
                {payload.map((entry: { name: string; value: number; color: string }) => (
                    <div key={entry.name} className="flex items-center gap-2">
                        <span
                            style={{
                                width: "10px",
                                height: "10px",
                                background: entry.color,
                                border: "1.5px solid var(--card-border)",
                            }}
                        />
                        <span style={{ color: "var(--text-muted)" }}>{entry.name}:</span>
                        <span className="font-bold">{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// Cycled per non-done bucket, in whatever order a project's team defined them.
const BUCKET_PALETTE = ["#CFE6F2", "#F3D8D2", "#D7E8D8", "#E4E3EC", "#FFFDF8"];

export default function UserChart({ kpis }: UserChartProps) {
    const top10 = kpis.slice(0, 10);
    const bucketLabels = Array.from(
        new Set(top10.flatMap((k) => k.metrics.bucket_breakdown.map((b) => b.label)))
    );
    const hasUnmapped = top10.some((k) => k.metrics.unmapped_tasks > 0);

    const data = top10.map((kpi) => {
        const row: Record<string, string | number> = { name: kpi.user.github_login };
        bucketLabels.forEach((label) => {
            row[label] = kpi.metrics.bucket_breakdown.find((b) => b.label === label)?.count ?? 0;
        });
        if (hasUnmapped) row["Unmapped"] = kpi.metrics.unmapped_tasks;
        row["Completed"] = kpi.metrics.completed_tasks;
        return row;
    });

    return (
        <div
            style={{
                background: "var(--card-alt)",
                border: "2px solid var(--card-border)",
                boxShadow: "5px 5px 0 var(--card-border)",
                padding: "18px 20px 14px",
            }}
        >
            <div>
                <h2
                    style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "20px",
                        margin: 0,
                        color: "var(--text-primary)",
                    }}
                >
                    Workload by developer
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>
                    Top 10 by task volume, split by KPI bucket
                </p>
            </div>

            <ResponsiveContainer width="100%" height={280}>
                <BarChart
                    data={data}
                    margin={{ top: 20, right: 10, left: -20, bottom: 5 }}
                    barSize={32}
                >
                    <XAxis
                        dataKey="name"
                        tick={{ fill: "var(--text-secondary)", fontSize: 10.5, fontFamily: "var(--font-mono), monospace" }}
                        axisLine={{ stroke: "var(--card-border)", strokeWidth: 2 }}
                        tickLine={false}
                    />
                    <YAxis
                        tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono), monospace" }}
                        axisLine={false}
                        tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(18,17,16,0.05)" }} />
                    <Legend
                        wrapperStyle={{
                            fontSize: "12px",
                            fontFamily: "var(--font-mono), monospace",
                            color: "var(--text-secondary)",
                            paddingTop: "16px",
                        }}
                    />
                    {bucketLabels.map((label, i) => (
                        <Bar
                            key={label}
                            dataKey={label}
                            stackId="s"
                            fill={BUCKET_PALETTE[i % BUCKET_PALETTE.length]}
                            stroke="var(--card-border)"
                            strokeWidth={2}
                        />
                    ))}
                    {hasUnmapped && (
                        <Bar dataKey="Unmapped" stackId="s" fill="#A8A49B" stroke="var(--card-border)" strokeWidth={2} />
                    )}
                    <Bar dataKey="Completed" stackId="s" fill="#F7E7A8" stroke="var(--card-border)" strokeWidth={2} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
