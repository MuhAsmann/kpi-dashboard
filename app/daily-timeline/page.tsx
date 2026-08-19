"use client"
import { formatDistanceToNow } from "date-fns";
import { PROJECTS } from "@/lib/projects";
import { useDailyTimelineHooks } from "./hooks";
import { useEffect, useState } from "react";
import FilterBar from "./section/filterSection";
import StatusMappingModal from "@/components/StatusMappingModal";

export default function DailyTimeline() {
    const { data, method } = useDailyTimelineHooks()
    const [mappingModalOpen, setMappingModalOpen] = useState(false)

    const onClickRefresh = () => {
        method.fetchSummary()
        method.fetchOpsiPIC();
        method.fetchDailyTimeline();
    }

    useEffect(() => {
        method.fetchSummary()
        method.fetchOpsiPIC();
    }, [data.filters?.project])

    useEffect(() => {
        method.fetchDailyTimeline()
    }, [data.filters?.id_user, data.filters?.project, data.filters?.repository, data.filters?.date])

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
                            Daily Timeline
                        </h1>
                        <p className="mt-1.5" style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>
                            Status of tasks updated today
                            {data.summary?.last_sync &&
                                ` · Synced ${formatDistanceToNow(new Date(data.summary.last_sync), { addSuffix: true })}`}
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
                            value={data.filters?.project}
                            onChange={(e) => {
                                const next = e.target.value ? parseInt(e.target.value, 10) : "";
                                method.setFilters((prev) => ({ ...prev, project: next }));
                            }}
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
                    onClick={onClickRefresh}
                    disabled={data.loading}
                    className="neo-btn flex items-center gap-2"
                    style={{ fontSize: "13px", padding: "11px 18px", background: "var(--accent)", color: "var(--text-primary)" }}
                >
                    Refresh
                </button>
            </header>

            {data.error && (
                <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12.5px", color: "var(--danger)" }}>
                    ⚠ {data.error}
                </p>
            )}

            <div className="fade-in-up fade-in-up-delay-1 flex flex-col gap-2 relative z-30">
                <FilterBar
                    filters={data.filters}
                    opsiUsers={data.opsiUsers}
                    repositories={data.summary?.repositories || []}
                    onFilterChange={(newFilters) => method.setFilters((prev) => ({ ...prev, ...newFilters }))}
                    onOpenStatusMapping={() => setMappingModalOpen(true)}
                />
            </div>

            <StatusMappingModal
                open={mappingModalOpen}
                onClose={() => setMappingModalOpen(false)}
                onSaved={method.fetchSummary}
                projectNumber={data.filters.project || undefined}
            />

        </main>
    )
}