"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search, X, Settings2 } from "lucide-react";
import { DashboardFilters } from "@/types/dashboard";

interface FilterBarProps {
    filters: DashboardFilters;
    repositories: string[];
    onFilterChange: (filters: Partial<DashboardFilters>) => void;
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
    const [repositoryOpen, setRepositoryOpen] = useState(false);
    const [repositoryQuery, setRepositoryQuery] = useState("");
    const [highlightedRepository, setHighlightedRepository] = useState(0);
    const repositoryDropdownRef = useRef<HTMLDivElement>(null);

    const filteredRepositories = repositories.filter((repo) =>
        repo.toLowerCase().includes(repositoryQuery.toLowerCase()),
    );

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            if (!repositoryDropdownRef.current?.contains(event.target as Node)) {
                setRepositoryOpen(false);
                setRepositoryQuery("");
            }
        };

        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, []);

    const toggleRepository = (repository: string) => {
        const selectedRepositories = filters.repository.includes(repository)
            ? filters.repository.filter((selected) => selected !== repository)
            : [...filters.repository, repository];
        onFilterChange({ repository: selectedRepositories });
        setRepositoryQuery("");
    };

    const clearRepositories = () => {
        onFilterChange({ repository: [] });
        setRepositoryQuery("");
    };

    const handleRepositoryKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setRepositoryOpen(true);
            setHighlightedRepository((current) =>
                Math.min(current + 1, filteredRepositories.length),
            );
        } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightedRepository((current) => Math.max(current - 1, 0));
        } else if (event.key === "Enter") {
            event.preventDefault();
            const repository = filteredRepositories[highlightedRepository - 1];
            if (repository !== undefined) toggleRepository(repository);
        } else if (event.key === "Escape") {
            setRepositoryOpen(false);
            setRepositoryQuery("");
        }
    };

    const hasActiveFilters =
        filters.startDate || filters.endDate || filters.repository.length > 0 || filters.project !== "";

    const clearFilters = () => {
        onFilterChange({ startDate: "", endDate: "", repository: [], project: "" });
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
                <label htmlFor="filter-start-date" style={labelStyle} title="Tasks finished in this range, plus all still-open work">Done from</label>
                <input
                    id="filter-start-date"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => onFilterChange({ startDate: e.target.value })}
                    style={inputStyle}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <label htmlFor="filter-end-date" style={labelStyle} title="Tasks finished in this range, plus all still-open work">Done to</label>
                <input
                    id="filter-end-date"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => onFilterChange({ endDate: e.target.value })}
                    style={inputStyle}
                />
            </div>

            <div
                className="self-stretch"
                style={{ width: "2px", background: "var(--card-border)", margin: "0 4px" }}
            />

            {repositories.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="filter-repository" style={labelStyle}>Repository</label>
                    <div ref={repositoryDropdownRef} style={{ position: "relative", minWidth: "220px" }}>
                        <div style={{ position: "relative" }}>
                            <Search
                                size={13}
                                aria-hidden="true"
                                style={{
                                    position: "absolute",
                                    left: "10px",
                                    top: "50%",
                                    transform: "translateY(-50%)",
                                    color: "var(--text-muted)",
                                    pointerEvents: "none",
                                }}
                            />
                            <input
                                id="filter-repository"
                                role="combobox"
                                aria-expanded={repositoryOpen}
                                aria-controls="repository-options"
                                aria-autocomplete="list"
                                value={repositoryOpen
                                    ? repositoryQuery
                                    : filters.repository.length === 0
                                        ? "All repositories"
                                        : `${filters.repository.length} selected`}
                                placeholder="Search repositories..."
                                onFocus={() => setRepositoryOpen(true)}
                                onChange={(event) => {
                                    setRepositoryQuery(event.target.value);
                                    setHighlightedRepository(0);
                                    setRepositoryOpen(true);
                                }}
                                onKeyDown={handleRepositoryKeyDown}
                                style={{
                                    ...inputStyle,
                                    width: "100%",
                                    paddingLeft: "30px",
                                    paddingRight: "30px",
                                }}
                            />
                            {filters.repository.length > 0 && (
                                <button
                                    type="button"
                                    aria-label="Clear repository filter"
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={clearRepositories}
                                    style={{
                                        position: "absolute",
                                        right: "30px",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        display: "flex",
                                        padding: 0,
                                        border: 0,
                                        background: "transparent",
                                        color: "var(--text-muted)",
                                        cursor: "pointer",
                                    }}
                                >
                                    <X size={13} />
                                </button>
                            )}
                            <ChevronDown
                                size={14}
                                aria-hidden="true"
                                style={{
                                    position: "absolute",
                                    right: "10px",
                                    top: "50%",
                                    transform: `translateY(-50%) rotate(${repositoryOpen ? 180 : 0}deg)`,
                                    color: "var(--text-muted)",
                                    pointerEvents: "none",
                                }}
                            />
                        </div>

                        {repositoryOpen && (
                            <div
                                id="repository-options"
                                role="listbox"
                                style={{
                                    position: "absolute",
                                    zIndex: 20,
                                    top: "calc(100% + 4px)",
                                    left: 0,
                                    right: 0,
                                    maxHeight: "220px",
                                    overflowY: "auto",
                                    border: "2px solid var(--card-border)",
                                    background: "var(--background)",
                                    boxShadow: "4px 4px 0 var(--card-border)",
                                }}
                            >
                                <button
                                    type="button"
                                    role="option"
                                    aria-selected={filters.repository.length === 0}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onClick={clearRepositories}
                                    style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "8px 10px",
                                        border: 0,
                                        background: highlightedRepository === 0
                                            ? "var(--card-alt)"
                                            : "transparent",
                                        color: "var(--text-primary)",
                                        fontFamily: "var(--font-mono), monospace",
                                        fontSize: "12px",
                                        textAlign: "left",
                                        cursor: "pointer",
                                    }}
                                >
                                    All repositories
                                </button>
                                {filteredRepositories.map((repo, index) => (
                                    <button
                                        key={repo}
                                        type="button"
                                        role="option"
                                        aria-selected={filters.repository.includes(repo)}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => toggleRepository(repo)}
                                        style={{
                                            display: "block",
                                            width: "100%",
                                            padding: "8px 10px",
                                            border: 0,
                                            background: highlightedRepository === index + 1
                                                ? "var(--card-alt)"
                                                : "transparent",
                                            color: "var(--text-primary)",
                                            fontFamily: "var(--font-mono), monospace",
                                            fontSize: "12px",
                                            textAlign: "left",
                                            cursor: "pointer",
                                        }}
                                    >
                                        <span className="flex items-center justify-between gap-2">
                                            {repo}
                                            {filters.repository.includes(repo) && <Check size={13} />}
                                        </span>
                                    </button>
                                ))}
                                {filteredRepositories.length === 0 && (
                                    <div
                                        style={{
                                            padding: "8px 10px",
                                            color: "var(--text-muted)",
                                            fontFamily: "var(--font-mono), monospace",
                                            fontSize: "12px",
                                        }}
                                    >
                                        No repositories found
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
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
