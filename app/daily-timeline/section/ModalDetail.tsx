import { formatHour } from "@/lib/calendar-utils";
import { DailyWorkEntry } from "@/types/daily-work";
import { AlertCircle, CheckCircle2, Clock, ExternalLink, GitPullRequestArrow, Tag, User as UserIcon, X } from "lucide-react";
import { getStatusBadgeClass } from "./timelineSection";

const ModalDetail = ({ selectedEntry, setSelectedEntry }: { selectedEntry: DailyWorkEntry, setSelectedEntry: (entry: DailyWorkEntry | null) => void }) => {
    return (
        <div>
            <div
                onClick={() => setSelectedEntry(null)}
                style={{
                    position: "fixed",
                    inset: 0,
                    backgroundColor: "rgba(18, 17, 16, 0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 9999,
                    padding: "16px",
                }}
            >
                <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "6px 6px 0 var(--card-border)",
                        padding: "20px 24px",
                        maxWidth: "520px",
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: "16px",
                    }}
                >
                    {/* Modal Header */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <span
                                style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    fontWeight: 700,
                                    fontSize: "12px",
                                    background: "var(--accent)",
                                    border: "1.5px solid var(--card-border)",
                                    padding: "3px 8px",
                                }}
                            >
                                {formatHour(selectedEntry.hour)}
                            </span>
                            {selectedEntry.isContinuous ? (
                                <span
                                    className="flex items-center gap-1"
                                    style={{
                                        fontFamily: "var(--font-mono), monospace",
                                        fontSize: "10.5px",
                                        fontWeight: 600,
                                        color: "var(--warning)",
                                        background: "var(--accent)",
                                        padding: "3px 8px",
                                        border: "1.5px solid var(--card-border)",
                                    }}
                                >
                                    <AlertCircle size={12} />
                                    ONGOING
                                </span>
                            ) : (
                                <span
                                    className="flex items-center gap-1"
                                    style={{
                                        fontFamily: "var(--font-mono), monospace",
                                        fontSize: "10.5px",
                                        fontWeight: 600,
                                        color: "var(--text-primary)",
                                        background: "var(--accent-green)",
                                        padding: "3px 8px",
                                        border: "1.5px solid var(--card-border)",
                                    }}
                                >
                                    <CheckCircle2 size={12} />
                                    DONE
                                </span>
                            )}
                        </div>

                        <button
                            onClick={() => setSelectedEntry(null)}
                            className="neo-btn neo-btn-sm"
                            style={{
                                padding: "4px 8px",
                                background: "var(--card-alt)",
                                fontSize: "12px",
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Title & Issue number */}
                    <div className="flex flex-col gap-1">
                        <div
                            style={{
                                fontFamily: "var(--font-mono), monospace",
                                fontSize: "12px",
                                color: "var(--text-muted)",
                            }}
                        >
                            {selectedEntry.issueNumber != null ? `Issue #${selectedEntry.issueNumber}` : "Task"}
                        </div>
                        <h3
                            style={{
                                fontSize: "16px",
                                fontWeight: 700,
                                margin: 0,
                                lineHeight: 1.4,
                                color: "var(--text-primary)",
                            }}
                        >
                            {selectedEntry.issueTitle}
                        </h3>
                    </div>

                    {/* Details grid */}
                    <div
                        style={{
                            background: "var(--background)",
                            border: "1.5px solid var(--card-border)",
                            padding: "12px 14px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "10px",
                            fontSize: "12.5px",
                        }}
                    >
                        {/* PIC */}
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                                <UserIcon size={13} /> PIC
                            </span>
                            <div className="flex items-center gap-2">
                                {selectedEntry.avatarUrl && (
                                    <img
                                        src={selectedEntry.avatarUrl}
                                        alt=""
                                        style={{ width: 20, height: 20, border: "1px solid var(--card-border)" }}
                                    />
                                )}
                                <span style={{ fontWeight: 600 }}>{selectedEntry.username || "-"}</span>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                                <Tag size={13} /> Status
                            </span>
                            <span className={getStatusBadgeClass(selectedEntry.status, selectedEntry.isContinuous)}>
                                {selectedEntry.status}
                            </span>
                        </div>

                        {/* Repository */}
                        {selectedEntry.repository && (
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                                    <GitPullRequestArrow size={13} /> Repository
                                </span>
                                <span style={{ fontFamily: "var(--font-mono), monospace", fontWeight: 600 }}>
                                    {selectedEntry.repository}
                                </span>
                            </div>
                        )}

                        {/* WorkLog ID */}
                        <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                                Log ID
                            </span>
                            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "11px", color: "var(--text-muted)" }}>
                                {selectedEntry.workLogId}
                            </span>
                        </div>
                    </div>

                    {/* Actions */}
                    {selectedEntry.issueUrl && (
                        <a
                            href={selectedEntry.issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="neo-btn flex items-center justify-center gap-2"
                            style={{
                                padding: "10px 16px",
                                fontSize: "13px",
                                background: "var(--accent-blue)",
                                color: "var(--text-primary)",
                                textDecoration: "none",
                            }}
                        >
                            Open Issue in GitHub <ExternalLink size={14} />
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ModalDetail