"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface MultiSelectDropdownProps {
    id: string;
    options: string[];
    selected: string[];
    onChange: (values: string[]) => void;
    allLabel: string;
}

export default function MultiSelectDropdown({ id, options, selected, onChange, allLabel }: MultiSelectDropdownProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!open) return;
        searchRef.current?.focus();
        const onPointerDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery("");
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const toggleOption = (opt: string) => {
        onChange(selected.includes(opt) ? selected.filter((o) => o !== opt) : [...selected, opt]);
    };

    const visibleOptions = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter((opt) => opt.toLowerCase().includes(q));
    }, [options, query]);

    const buttonText =
        selected.length === 0 ? allLabel : selected.length === 1 ? selected[0] : `${selected.length} selected`;

    return (
        <div ref={containerRef} style={{ position: "relative" }}>
            <button
                type="button"
                id={id}
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="flex items-center justify-between gap-2"
                style={{
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: "13px",
                    padding: "8px 10px",
                    border: "2px solid var(--card-border)",
                    background: "var(--background)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    minWidth: "150px",
                    width: "100%",
                }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{buttonText}</span>
                <span style={{ color: "var(--text-muted)" }}>▾</span>
            </button>

            {open && (
                <div
                    className="flex flex-col"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        zIndex: 100,
                        minWidth: "100%",
                        maxHeight: "280px",
                        background: "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "4px 4px 0 var(--card-border)",
                    }}
                >
                    <div style={{ position: "relative", padding: "4px", borderBottom: "1.5px solid var(--card-border)" }}>
                        <Search size={12} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
                        <input
                            ref={searchRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search…"
                            style={{
                                fontFamily: "var(--font-mono), monospace",
                                fontSize: "12.5px",
                                padding: "6px 26px 6px 26px",
                                border: "none",
                                background: "transparent",
                                color: "var(--text-primary)",
                                width: "100%",
                            }}
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => setQuery("")}
                                aria-label="Clear search"
                                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", cursor: "pointer" }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>
                    <div className="flex flex-col" style={{ overflowY: "auto", padding: "4px" }}>
                        {visibleOptions.length === 0 ? (
                            <span style={{ fontSize: "12px", color: "var(--text-muted)", padding: "6px 8px" }}>
                                {options.length === 0 ? "No options" : `No matches for "${query}"`}
                            </span>
                        ) : (
                            visibleOptions.map((opt) => (
                                <label
                                    key={opt}
                                    className="flex items-center gap-2"
                                    style={{
                                        fontFamily: "var(--font-mono), monospace",
                                        fontSize: "12.5px",
                                        padding: "6px 8px",
                                        cursor: "pointer",
                                        whiteSpace: "nowrap",
                                        color: "var(--text-primary)",
                                    }}
                                >
                                    <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleOption(opt)} />
                                    {opt}
                                </label>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
