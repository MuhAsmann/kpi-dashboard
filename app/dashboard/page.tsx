"use client";

import { useState, useEffect, useCallback } from "react";
import { UserKPI } from "@/lib/kpi-service";
import { DashboardFilters, SortField } from "@/types/dashboard";
import SyncButton from "@/components/SyncButton";
import KPITable from "@/components/KPITable";
import SummaryCards from "@/components/SummaryCards";
import FilterBar from "@/components/FilterBar";
import UserChart from "@/components/UserChart";
import { Activity, GitBranch } from "lucide-react";

interface DashboardSummary {
    total_tasks: number;
    completed_tasks: number;
    active_users: number;
    last_sync: string | null;
}

export default function DashboardPage() {
    const [kpis, setKpis] = useState<UserKPI[]>([]);
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [repositories, setRepositories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const getDefaultFilters = (): DashboardFilters => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const toDateString = (d: Date) => d.toISOString().split("T")[0];
        return {
            startDate: toDateString(firstDay),
            endDate: toDateString(lastDay),
            repository: "",
            sortBy: "completion_rate",
            sortOrder: "desc",
        };
    };

    const [filters, setFilters] = useState<DashboardFilters>(getDefaultFilters());

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
                    case "bugs_count":
                        aVal = a.metrics.bugs_count;
                        bVal = b.metrics.bugs_count;
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
            if (filters.repository) params.set("repository", filters.repository);

            const [kpiRes, summaryRes] = await Promise.all([
                fetch(`/api/kpi/users?${params.toString()}`),
                fetch("/api/kpi/summary"),
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

    return (
        <div className="min-h-screen" style={{ background: "var(--background)" }}>
            {/* Background decoration */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div
                    className="absolute -top-40 -right-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
                    style={{
                        background: "radial-gradient(circle, #6366f1, transparent)",
                    }}
                />
                <div
                    className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-10 blur-3xl"
                    style={{
                        background: "radial-gradient(circle, #06b6d4, transparent)",
                    }}
                />
            </div>

            <div className="relative z-10">
                {/* Header */}
                <header
                    className="border-b sticky top-0 z-50"
                    style={{
                        background: "rgba(10, 14, 26, 0.9)",
                        backdropFilter: "blur(20px)",
                        borderColor: "rgba(31, 41, 55, 0.8)",
                    }}
                >
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center"
                                style={{
                                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                                }}
                            >
                                <Activity size={18} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg font-bold gradient-text">
                                    KPI Dashboard
                                </h1>
                                <p
                                    className="text-xs"
                                    style={{ color: "var(--text-muted)" }}
                                >
                                    Powered by GitHub Projects V2
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <a
                                href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_ORG_OR_USER || ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all hover:opacity-80"
                                style={{
                                    background: "rgba(31,41,55,0.8)",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                <GitBranch size={14} />
                                <span className="hidden sm:inline">GitHub</span>
                            </a>
                            <SyncButton onSyncComplete={fetchData} />
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
                    {/* Summary Cards */}
                    <div className="fade-in-up">
                        <SummaryCards summary={summary} loading={loading} />
                    </div>

                    {/* Filter Bar */}
                    <div className="fade-in-up fade-in-up-delay-1">
                        <FilterBar
                            filters={filters}
                            repositories={repositories}
                            onFilterChange={handleFilterChange}
                        />
                    </div>

                    {/* Chart Section */}
                    {!loading && kpis.length > 0 && (
                        <div className="fade-in-up fade-in-up-delay-2">
                            <UserChart kpis={kpis} />
                        </div>
                    )}

                    {/* KPI Table */}
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
            </div>
        </div>
    );
}
