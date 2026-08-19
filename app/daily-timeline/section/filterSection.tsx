"use client";

import { FilterDailyTimeline } from "@/types/daily--timeline";
import { Users } from "@/types/user";
import { X, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface FilterBarProps {
    filters: FilterDailyTimeline;
    repositories: string[];
    onFilterChange: (filters: Partial<FilterDailyTimeline>) => void;
    onOpenStatusMapping: () => void;
}

const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace",
    fontSize: "10.5px",
    letterSpacing: "1px",
    textTransform: "uppercase",
    color: "var(--text-muted)",
};

const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono), monospace",
    fontSize: "13px",
    padding: "8px 10px",
    border: "2px solid var(--card-border)",
    background: "var(--background)",
    color: "var(--text-primary)",
};

export default function FilterBar({
    filters,
    repositories,
    onFilterChange,
    onOpenStatusMapping,
}: FilterBarProps) {

    const [opsiUsers, setOpsiUsers] = useState<{ id: string, name: string }[]>([])

    const fetchOpsiPIC = useCallback(async () => {
        try {
            const query = new URLSearchParams({
                ...(filters?.project && { project: String(filters.project) }),
                ...(filters?.date && { date: String(filters.date) })
            });

            const res = await fetch(`/api/kpi/users?${query.toString()}`);

            if (!res.ok) {
                throw new Error(`Request failed with status ${res.status}`);
            }

            const data: Users[] = await res.json();
            setOpsiUsers(data?.map((e) => e.user));

        } catch (err) {
            console.error("Failed to fetch summary data:", err);
        }
    }, [filters.project]);

    useEffect(() => {
        fetchOpsiPIC();
    }, [filters?.project])

    const hasActiveFilters =
        filters.date || filters.repository || filters.project !== "";

    const clearFilters = () => {
        onFilterChange({ date: "", repository: "", project: "" });
    };

    return (
        <div
            className="flex items-end gap-3.5 flex-wrap"
            style={{
                background: "var(--card)",
                border: "2px solid var(--card-border)",
                boxShadow: "5px 5px 0 var(--card-border)",
                padding: "14px 16px",
            }}
        >
            <div className="flex flex-col gap-1.5">
                <label htmlFor="filter-start-date" style={labelStyle}>Date</label>
                <input
                    id="filter-start-date"
                    type="date"
                    value={filters.date}
                    onChange={(e) => onFilterChange({ date: e.target.value })}
                    style={inputStyle}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <label htmlFor="filter-pic" style={labelStyle}>PIC</label>
                <select
                    id="filter-pic"
                    value={filters.id_user}
                    onChange={(e) => onFilterChange({ id_user: e.target.value })}
                    style={{ ...inputStyle, cursor: "pointer", minWidth: "170px" }}
                >
                    <option value="">All PIC</option>
                    {opsiUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                            {user.name}
                        </option>
                    ))}
                </select>
            </div>

            <div
                className="self-stretch"
                style={{ width: "2px", background: "var(--card-border)", margin: "0 4px" }}
            />

            {repositories.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="filter-repository" style={labelStyle}>Repository</label>
                    <select
                        id="filter-repository"
                        value={filters.repository}
                        onChange={(e) => onFilterChange({ repository: e.target.value })}
                        style={{ ...inputStyle, cursor: "pointer", minWidth: "170px" }}
                    >
                        <option value="">All repositories</option>
                        {repositories.map((repo) => (
                            <option key={repo} value={repo}>
                                {repo}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <button
                id="open-status-mapping-btn"
                onClick={onOpenStatusMapping}
                className="neo-btn neo-btn-sm flex items-center gap-1.5"
                title="Map this board's status names onto your team's KPI buckets"
                style={{
                    fontSize: "12px",
                    padding: "9px 13px",
                    background: "var(--card-alt)",
                    color: "var(--text-primary)",
                }}
            >
                <Settings2 size={12} />
                Status mapping
            </button>

            {hasActiveFilters && (
                <button
                    id="clear-filters-btn"
                    onClick={clearFilters}
                    className="neo-btn neo-btn-sm flex items-center gap-1.5"
                    style={{
                        fontSize: "12px",
                        padding: "9px 13px",
                        background: "var(--accent-pink)",
                        color: "var(--text-primary)",
                    }}
                >
                    <X size={12} />
                    Clear filters
                </button>
            )}
        </div>
    );
}
