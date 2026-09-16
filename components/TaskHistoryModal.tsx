"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { format } from "date-fns";
import type { UserKPI } from "@/lib/kpi-service";
import { computeStatusVisits, summarizeStatusVisits, formatDuration } from "@/lib/task-history";

export type KpiTask = UserKPI["tasks"][number];

interface TaskHistoryModalProps {
    task: KpiTask | null;
    onClose: () => void;
}

const timelineChipStyle: React.CSSProperties = {
    padding: "2px 7px",
    background: "var(--background)",
    border: "1.5px solid var(--card-border)",
    fontFamily: "var(--font-mono), monospace",
    fontSize: "11px",
};

export default function TaskHistoryModal({ task, onClose }: TaskHistoryModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (task && !dialog.open) {
            dialog.showModal();
        } else if (!task && dialog.open) {
            dialog.close();
        }
    }, [task]);

    if (!task) return null;

    const visits = computeStatusVisits(task.histories, task.closed_at, task.is_done);
    const summary = summarizeStatusVisits(visits);

    return (
        <dialog
            ref={dialogRef}
            onClose={onClose}
            style={{
                margin: "auto",
                border: "2px solid var(--card-border)",
                boxShadow: "6px 6px 0 var(--card-border)",
                padding: 0,
                width: "min(560px, 92vw)",
                maxHeight: "80vh",
                background: "var(--card)",
                color: "var(--text-primary)",
            }}
        >
            <div
                className="flex items-center justify-between gap-3"
                style={{ padding: "16px 20px", borderBottom: "2px solid var(--card-border)" }}
            >
                <h2
                    className="line-clamp-2"
                    style={{ fontFamily: "var(--font-mono), monospace", fontSize: "15px", margin: 0 }}
                >
                    {task.title}
                </h2>
                <button
                    onClick={onClose}
                    className="neo-btn neo-btn-sm shrink-0"
                    style={{ padding: "6px", background: "var(--card)" }}
                >
                    <X size={14} />
                </button>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "calc(80vh - 66px)" }}>
                <h3
                    style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "10.5px",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                        margin: "0 0 8px",
                    }}
                >
                    Time in status
                </h3>
                <div className="flex flex-col gap-1.5 mb-5">
                    {summary.map((s) => (
                        <div key={s.status} className="flex items-center justify-between" style={{ fontSize: "13px" }}>
                            <span>{s.status}</span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>
                                {formatDuration(s.totalMs)}
                            </span>
                        </div>
                    ))}
                </div>

                <h3
                    style={{
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "10.5px",
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                        color: "var(--text-muted)",
                        margin: "0 0 8px",
                    }}
                >
                    Timeline
                </h3>
                <div className="flex flex-col gap-2">
                    {visits.map((v, i) => (
                        <div
                            key={i}
                            className="flex items-center justify-between gap-2 flex-wrap"
                            style={i > 0 ? { borderTop: "1.5px dashed var(--dashed)", paddingTop: "8px" } : undefined}
                        >
                            <span style={timelineChipStyle}>{v.status}</span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                                {format(new Date(v.changedAt), "MMM d, h:mm a")}
                            </span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "12px", fontWeight: 700 }}>
                                {formatDuration(v.durationMs)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </dialog>
    );
}
