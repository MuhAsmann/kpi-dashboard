"use client";

import { Filter, X } from "lucide-react";
import { DashboardFilters } from "@/types/dashboard";

interface FilterBarProps {
    filters: DashboardFilters;
    repositories: string[];
    onFilterChange: (filters: Partial<DashboardFilters>) => void;
}

export default function FilterBar({
    filters,
    repositories,
    onFilterChange,
}: FilterBarProps) {
    const hasActiveFilters =
        filters.startDate || filters.endDate || filters.repository;

    const clearFilters = () => {
        onFilterChange({ startDate: "", endDate: "", repository: "" });
    };

    const inputStyle = {
        background: "rgba(17, 24, 39, 0.8)",
        border: "1px solid rgba(31, 41, 55, 0.8)",
        color: "var(--text-primary)",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: "13px",
        outline: "none",
        transition: "border-color 0.2s",
    };

    return (
        <div
            className="p-4 rounded-xl flex flex-wrap items-center gap-3"
            style={{
                background: "rgba(17, 24, 39, 0.6)",
                border: "1px solid rgba(31, 41, 55, 0.8)",
            }}
        >
            <div className="flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                <Filter size={14} />
                <span className="text-xs font-medium uppercase tracking-wider">Filters</span>
            </div>

            <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>From</label>
                <input
                    id="filter-start-date"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => onFilterChange({ startDate: e.target.value })}
                    style={inputStyle}
                />
            </div>

            <div className="flex items-center gap-2">
                <label className="text-xs" style={{ color: "var(--text-muted)" }}>To</label>
                <input
                    id="filter-end-date"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => onFilterChange({ endDate: e.target.value })}
                    style={inputStyle}
                />
            </div>

            {repositories.length > 0 && (
                <select
                    id="filter-repository"
                    value={filters.repository}
                    onChange={(e) => onFilterChange({ repository: e.target.value })}
                    style={{ ...inputStyle, cursor: "pointer" }}
                >
                    <option value="">All Repositories</option>
                    {repositories.map((repo) => (
                        <option key={repo} value={repo}>
                            {repo}
                        </option>
                    ))}
                </select>
            )}

            {hasActiveFilters && (
                <button
                    id="clear-filters-btn"
                    onClick={clearFilters}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs transition-all hover:opacity-80"
                    style={{
                        background: "rgba(239, 68, 68, 0.1)",
                        color: "#ef4444",
                        border: "1px solid rgba(239, 68, 68, 0.2)",
                    }}
                >
                    <X size={12} />
                    Clear
                </button>
            )}
        </div>
    );
}
