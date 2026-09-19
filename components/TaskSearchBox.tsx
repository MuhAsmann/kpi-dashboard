"use client";

import { Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface TaskSearchOption {
    id: string;
    title: string;
    repository: string | null;
    status: string;
}

interface TaskSearchBoxProps {
    id: string;
    tasks: TaskSearchOption[];
    onSelect: (taskId: string) => void;
}

export default function TaskSearchBox({ id, tasks, onSelect }: TaskSearchBoxProps) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onPointerDown);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onPointerDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return tasks.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 15);
    }, [query, tasks]);

    const pick = (taskId: string) => {
        onSelect(taskId);
        setQuery("");
        setOpen(false);
    };

    return (
        <div ref={containerRef} style={{ position: "relative" }}>
            <div className="flex items-center gap-1.5" style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: "10px", color: "var(--text-muted)", pointerEvents: "none" }} />
                <input
                    id={id}
                    type="text"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="Search task title…"
                    style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "13px",
                        padding: "8px 10px 8px 30px",
                        border: "2px solid var(--card-border)",
                        background: "var(--background)",
                        color: "var(--text-primary)",
                        minWidth: "220px",
                        width: "100%",
                    }}
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => {
                            setQuery("");
                            setOpen(false);
                        }}
                        style={{ position: "absolute", right: "8px", color: "var(--text-muted)", cursor: "pointer" }}
                        aria-label="Clear search"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {open && query.trim() && (
                <div
                    className="flex flex-col"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        left: 0,
                        zIndex: 100,
                        minWidth: "320px",
                        maxHeight: "300px",
                        overflowY: "auto",
                        background: "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "4px 4px 0 var(--card-border)",
                        padding: "4px",
                    }}
                >
                    {matches.length === 0 ? (
                        <span style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px" }}>No tasks match &ldquo;{query}&rdquo;</span>
                    ) : (
                        matches.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => pick(t.id)}
                                className="flex flex-col text-left"
                                style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    padding: "7px 9px",
                                    border: "none",
                                    background: "transparent",
                                    cursor: "pointer",
                                    borderBottom: "1.5px dashed var(--dashed)",
                                }}
                            >
                                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>{t.title}</span>
                                <span style={{ fontSize: "10.5px", color: "var(--text-muted)" }}>
                                    {t.repository ?? "—"} · {t.status}
                                </span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
