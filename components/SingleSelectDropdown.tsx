"use client";

import { useEffect, useRef, useState } from "react";

export interface SingleSelectOption {
    value: string;
    label: string;
}

interface SingleSelectDropdownProps {
    id: string;
    options: SingleSelectOption[];
    value: string;
    onChange: (value: string) => void;
    title?: string;
    buttonStyle?: React.CSSProperties;
}

export default function SingleSelectDropdown({ id, options, value, onChange, title, buttonStyle }: SingleSelectDropdownProps) {
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

    const selectedLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";

    return (
        <div ref={containerRef} style={{ position: "relative" }}>
            <button
                type="button"
                id={id}
                title={title}
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
                    ...buttonStyle,
                }}
            >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedLabel}</span>
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
                        maxHeight: "240px",
                        overflowY: "auto",
                        background: "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "4px 4px 0 var(--card-border)",
                        padding: "4px",
                    }}
                >
                    {options.map((o) => (
                        <button
                            key={o.value}
                            type="button"
                            onClick={() => {
                                onChange(o.value);
                                setOpen(false);
                            }}
                            className="text-left"
                            style={{
                                fontFamily: "var(--font-mono), monospace",
                                fontWeight: o.value === value ? 700 : 400,
                                fontSize: "12.5px",
                                padding: "6px 8px",
                                border: "none",
                                background: o.value === value ? "var(--accent)" : "transparent",
                                color: "var(--text-primary)",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
