"use client";

import ExportButton from "@/components/ExportButton";
import FilterBar from "@/components/FilterBar";
import KPITable from "@/components/KPITable";
import StatusMappingModal from "@/components/StatusMappingModal";
import SingleSelectDropdown from "@/components/SingleSelectDropdown";
import SummaryCards from "@/components/SummaryCards";
import SyncButton from "@/components/SyncButton";
import UserChart from "@/components/UserChart";
import { UserKPI } from "@/lib/kpi-service";
import { PROJECTS } from "@/lib/projects";
import { DashboardFilters, SortField } from "@/types/dashboard";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

interface DashboardSummary {
    total_tasks: number;
    completed_tasks: number;
    active_tasks: number;
    unmapped_tasks: number;
    active_users: number;
    total_story_points: number;
    last_sync: string | null;
}

const MIX_PALETTE = ["#CFE6F2", "#F3D8D2", "#D7E8D8", "#E4E3EC", "#FFFDF8"];

const SORT_FIELDS: SortField[] = [
    "completion_rate",
    "completed_tasks",
    "total_tasks",
    "avg_cycle_time_days",
    "reopened_tasks",
];

function isDashboardFilters(value: unknown): value is DashboardFilters {
    if (typeof value !== "object" || value === null) return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.startDate === "string" &&
        typeof v.endDate === "string" &&
        Array.isArray(v.repository) &&
        v.repository.every((x) => typeof x === "string") &&
        (v.project === "" || typeof v.project === "number") &&
        typeof v.sortBy === "string" &&
        SORT_FIELDS.includes(v.sortBy as SortField) &&
        (v.sortOrder === "asc" || v.sortOrder === "desc")
    );
}

function DeliveryMix({ kpis, total }: { kpis: UserKPI[]; total: number }) {
    const mix = useMemo(() => {
        const done = kpis.reduce((a, k) => a + k.metrics.completed_tasks, 0);
        const overdue = kpis.reduce((a, k) => a + k.metrics.overdue_tasks, 0);
        const unmapped = kpis.reduce((a, k) => a + k.metrics.unmapped_tasks, 0);

        const bucketCounts = new Map<string, number>();
        kpis.forEach((k) =>
            k.metrics.bucket_breakdown.forEach((b) => {
                bucketCounts.set(b.label, (bucketCounts.get(b.label) ?? 0) + b.count);
            })
        );
        const buckets = [...bucketCounts.entries()].map(([label, count], i) => ({
            label,
            count,
            color: MIX_PALETTE[i % MIX_PALETTE.length],
        }));

        const sum = done + buckets.reduce((a, b) => a + b.count, 0) + unmapped || 1;
        let deg = 0;
        const stops: string[] = [];
        [{ label: "Done", count: done, color: "#F7E7A8" }, ...buckets, { label: "Unmapped", count: unmapped, color: "#A8A49B" }].forEach(
            ({ count, color }) => {
                const next = deg + (count / sum) * 360;
                if (count > 0) stops.push(`${color} ${deg}deg ${next}deg`);
                deg = next;
            }
        );
        const gauge = `conic-gradient(${stops.join(", ") || "#FFFDF8 0deg 360deg"})`;

        const worst = kpis.length
            ? [...kpis].sort(
                (a, b) =>
                    b.metrics.overdue_tasks - a.metrics.overdue_tasks ||
                    (b.metrics.avg_cycle_time_days ?? 0) - (a.metrics.avg_cycle_time_days ?? 0)
            )[0]
            : null;
        return { done, buckets, unmapped, overdue, gauge, worst };
    }, [kpis]);

    const rate = total > 0 ? Math.round((mix.done / total) * 100) : 0;

    return (
        <div
            className="flex flex-col items-center min-w-0"
            style={{
                background: "var(--accent-lavender)",
                border: "2px solid var(--card-border)",
                boxShadow: "5px 5px 0 var(--card-border)",
                padding: "18px 20px 20px",
            }}
        >
            <div className="w-full flex justify-between items-start">
                <h2 style={{ fontFamily: "var(--font-mono), monospace", fontSize: "20px", margin: 0, color: "var(--text-primary)" }}>
                    Delivery mix
                </h2>
            </div>
            <div className="relative" style={{ width: "180px", height: "180px", margin: "18px 0 4px" }}>
                <div className="absolute inset-0 rounded-full" style={{ border: "2px solid var(--card-border)", background: mix.gauge }} />
                <div
                    className="absolute rounded-full flex flex-col items-center justify-center gap-0.5"
                    style={{ inset: "32px", background: "var(--accent-lavender)", border: "2px solid var(--card-border)" }}
                >
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "10.5px", letterSpacing: "0.5px", color: "var(--text-muted)" }}>
                        TOTAL TASKS
                    </span>
                    <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: "30px", lineHeight: 1, color: "var(--text-primary)" }}>
                        {total}
                    </span>
                </div>
            </div>
            <div className="w-full flex flex-col gap-1.5 mt-3" style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12.5px" }}>
                <div className="flex justify-between pb-1.5" style={{ borderBottom: "1.5px dashed var(--dashed)" }}>
                    <span>Done</span><span>{mix.done} · {rate}%</span>
                </div>
                {mix.buckets.map((b) => (
                    <div key={b.label} className="flex justify-between pb-1.5" style={{ borderBottom: "1.5px dashed var(--dashed)" }}>
                        <span>{b.label}</span><span>{b.count}</span>
                    </div>
                ))}
                {mix.unmapped > 0 && (
                    <div className="flex justify-between pb-1.5" style={{ borderBottom: "1.5px dashed var(--dashed)", color: "var(--text-muted)" }}>
                        <span>Unmapped</span><span>{mix.unmapped}</span>
                    </div>
                )}
                <div className="flex justify-between">
                    <span>Overdue</span><span>{mix.overdue}</span>
                </div>
            </div>
            {mix.worst && mix.worst.metrics.overdue_tasks > 0 && (
                <div
                    className="w-full mt-4"
                    style={{ background: "var(--card)", border: "2px solid var(--card-border)", padding: "10px 12px", fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-primary)" }}
                >
                    @{mix.worst.user.github_login} has {mix.worst.metrics.overdue_tasks} overdue task
                    {mix.worst.metrics.overdue_tasks > 1 ? "s" : ""}
                    {mix.worst.metrics.avg_cycle_time_days != null && ` and the slowest cycle time (${mix.worst.metrics.avg_cycle_time_days}d)`}.
                </div>
            )}
        </div>
    );
}

function DashboardContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [kpis, setKpis] = useState<UserKPI[]>([]);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [repositories, setRepositories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [mappingModalOpen, setMappingModalOpen] = useState(false);
    const getDefaultFilters = (): DashboardFilters => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const toDateString = (d: Date) => d.toISOString().split("T")[0];

        return {
            startDate: toDateString(firstDay),
            endDate: toDateString(lastDay),
            repository: [],
            project: "",
            sortBy: "completion_rate",
            sortOrder: "desc",
        };
    };

    // Filters read from the URL first (shareable/bookmarkable links, survives
    // a page refresh), falling back to the last-used filters in localStorage
    // when there's nothing in the URL (e.g. navigated here via a plain sidebar
    // link, which has no query string) instead of resetting to defaults.
    const [filters, setFilters] = useState<DashboardFilters>(() => {
        const defaults = getDefaultFilters();
        const query = new URLSearchParams(searchParams.toString());
        const hasUrlFilters =
            query.has("start_date") || query.has("end_date") || query.has("repository") || query.has("project");

        if (hasUrlFilters) {
            const project = query.get("project");
            const parsedProject = project ? Number.parseInt(project, 10) : NaN;
            return {
                ...defaults,
                startDate: query.has("start_date") ? query.get("start_date") ?? "" : defaults.startDate,
                endDate: query.has("end_date") ? query.get("end_date") ?? "" : defaults.endDate,
                repository: query.getAll("repository"),
                project: Number.isInteger(parsedProject) ? parsedProject : "",
            };
        }

        try {
            const raw = window.localStorage.getItem("dashboard-filters");
            if (raw) {
                const parsed: unknown = JSON.parse(raw);
                if (isDashboardFilters(parsed)) return parsed;
            }
        } catch {
            // localStorage unavailable — fall through to defaults.
        }
        return defaults;
    });

    // Keep the URL in sync with the current filters (shareable/bookmarkable).
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("start_date");
        params.delete("end_date");
        params.delete("repository");
        params.delete("project");
        params.set("start_date", filters.startDate);
        params.set("end_date", filters.endDate);
        filters.repository.forEach((repository) => params.append("repository", repository));
        if (filters.project !== "") params.set("project", String(filters.project));

        const nextQuery = params.toString();
        if (nextQuery !== searchParams.toString()) {
            router.replace(`${pathname}?${nextQuery}`, { scroll: false });
        }
    }, [filters, pathname, router, searchParams]);

    // Also persist so navigating away and back (which drops the URL query)
    // still restores the last-used filters instead of resetting to defaults.
    useEffect(() => {
        try {
            window.localStorage.setItem("dashboard-filters", JSON.stringify(filters));
        } catch {
            // localStorage unavailable (e.g. private browsing) — ignore.
        }
    }, [filters]);

    const sortKPIs = useCallback(
        (data: UserKPI[], sortBy: SortField, sortOrder: "asc" | "desc"): UserKPI[] => {
            return [...data].sort((a, b) => {
                let aVal: number;
                let bVal: number;

                switch (sortBy) {
                    case "completion_rate":
                        aVal = a.metrics.completion_rate;
                        bVal = b.metrics.completion_rate;
                        break;
                    case "completed_tasks":
                        aVal = a.metrics.completed_tasks;
                        bVal = b.metrics.completed_tasks;
                        break;
                    case "total_tasks":
                        aVal = a.metrics.total_tasks;
                        bVal = b.metrics.total_tasks;
                        break;
                    case "avg_cycle_time_days":
                        aVal = a.metrics.avg_cycle_time_days ?? 9999;
                        bVal = b.metrics.avg_cycle_time_days ?? 9999;
                        break;
                    case "reopened_tasks":
                        aVal = a.metrics.reopened_tasks;
                        bVal = b.metrics.reopened_tasks;
                        break;
                    default:
                        aVal = a.metrics.completion_rate;
                        bVal = b.metrics.completion_rate;
                }

                return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
            });
        },
        []
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (filters.startDate) params.set("start_date", filters.startDate);
            if (filters.endDate) params.set("end_date", filters.endDate);
            filters.repository.forEach((repository) => params.append("repository", repository));
            if (filters.project !== "") params.set("project", String(filters.project));

            const [kpiRes, summaryRes] = await Promise.all([
                fetch(`/api/kpi/users?${params.toString()}`),
                fetch(`/api/kpi/summary?${params.toString()}`),
            ]);

            const kpiData = await kpiRes.json();
            const summaryData = await summaryRes.json();

            if (Array.isArray(kpiData)) {
                setKpis(sortKPIs(kpiData, filters.sortBy, filters.sortOrder));
            }

            if (summaryData.summary) {
                setSummary(summaryData.summary);
                setRepositories(summaryData.repositories || []);
            }
        } catch (err) {
            console.error("Failed to fetch KPI data:", err);
        } finally {
            setLoading(false);
        }
    }, [filters, sortKPIs]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleFilterChange = (newFilters: Partial<DashboardFilters>) => {
        setFilters((prev) => ({ ...prev, ...newFilters }));
    };

    const handleSort = (field: SortField) => {
        setFilters((prev) => ({
            ...prev,
            sortBy: field,
            sortOrder:
                prev.sortBy === field && prev.sortOrder === "desc" ? "asc" : "desc",
        }));
    };

    const githubOrg = process.env.NEXT_PUBLIC_GITHUB_ORG_OR_USER || "";

    return (


            <main className="flex-1 min-w-0 flex flex-col gap-5" style={{ padding: "26px 30px 60px" }}>
                <header className="flex items-end justify-between gap-6 flex-wrap">
                    <div className="flex items-end gap-4 flex-wrap">
                        <div>
                            <h1 style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700, fontSize: "34px", letterSpacing: "-0.5px", margin: 0, color: "var(--text-primary)" }}>
                                Dev KPI Dashboard
                            </h1>
                            <p className="mt-1.5" style={{ fontSize: "13.5px", color: "var(--text-muted)" }}>
                                GitHub Projects V2
                                {githubOrg && (
                                    <>
                                        {" · "}
                                        <a href={`https://github.com/${githubOrg}`} target="_blank" rel="noopener noreferrer">
                                            {githubOrg}
                                        </a>
                                    </>
                                )}
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label
                                htmlFor="header-project"
                                style={{ fontFamily: "var(--font-mono), monospace", fontSize: "10.5px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-muted)" }}
                            >
                                Project
                            </label>
                            <SingleSelectDropdown
                                id="header-project"
                                value={filters.project === "" ? "" : String(filters.project)}
                                onChange={(v) => handleFilterChange({ project: v ? parseInt(v, 10) : "" })}
                                title="Scopes filtering, status mapping, export, and sync to this project"
                                buttonStyle={{ fontWeight: 700, padding: "9px 12px", background: "var(--accent)" }}
                                options={[
                                    { value: "", label: "All projects" },
                                    ...PROJECTS.map((p) => ({ value: String(p.number), label: p.label })),
                                ]}
                            />
                        </div>
                    </div>
                    <div className="flex gap-3 items-center">
                        <ExportButton filters={filters} />
                        <SyncButton project={filters.project} onSyncComplete={fetchData} />
                    </div>
                </header>

                <div className="fade-in-up fade-in-up-delay-1 flex flex-col gap-2 relative z-30">
                    <FilterBar
                        filters={filters}
                        repositories={repositories}
                        onFilterChange={handleFilterChange}
                        onOpenStatusMapping={() => setMappingModalOpen(true)}
                    />
                    {!loading && !!summary?.unmapped_tasks && (
                        <p style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", color: "var(--warning)" }}>
                            ⚠ {summary.unmapped_tasks} task{summary.unmapped_tasks > 1 ? "s have" : " has"} a status with no KPI mapping yet —{" "}
                            <button
                                onClick={() => setMappingModalOpen(true)}
                                style={{ textDecoration: "underline", cursor: "pointer" }}
                            >
                                map it in Status mapping
                            </button>
                            .
                        </p>
                    )}
                </div>

                <StatusMappingModal
                    open={mappingModalOpen}
                    onClose={() => setMappingModalOpen(false)}
                    onSaved={fetchData}
                    projectNumber={filters.project || undefined}
                />

                <div className="fade-in-up">
                    <SummaryCards summary={summary} loading={loading} />
                </div>

                {!loading && kpis.length > 0 && (
                    <div className="fade-in-up fade-in-up-delay-2 grid gap-5 items-stretch" style={{ gridTemplateColumns: "minmax(0, 2.15fr) minmax(0, 1fr)" }}>
                        <UserChart kpis={kpis} />
                        <DeliveryMix kpis={kpis} total={summary?.total_tasks ?? 0} />
                    </div>
                )}

                <div className="fade-in-up fade-in-up-delay-3">
                    <KPITable
                        kpis={kpis}
                        loading={loading}
                        sortBy={filters.sortBy}
                        sortOrder={filters.sortOrder}
                        onSort={handleSort}
                    />
                </div>
            </main>

    );
}

export default function DashboardPage() {
    return (
        <Suspense>
            <DashboardContent />
        </Suspense>
    );
}
