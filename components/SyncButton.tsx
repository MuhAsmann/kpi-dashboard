"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, CheckCircle, XCircle, ChevronDown } from "lucide-react";
import { PROJECTS } from "@/lib/projects";

interface SyncButtonProps {
    onSyncComplete: () => void;
    project: number | "";
}

interface RunningSync {
    total: number;
    processed: number;
    stage: string | null;
    startedAt: string | null;
}

interface Notice {
    kind: "success" | "error" | "info";
    text: string;
}

type Scope = number | "all";

interface StatusOption {
    status: string;
    isDone: boolean;
}

interface ProjectStatuses {
    number: number;
    label: string;
    options: StatusOption[];
}

const POLL_MS = 2000;
const STORAGE_KEY = "sync-options";

function loadStoredOptions(headerProject: number | ""): { scope: Scope; skip: string[]; customized: boolean } {
    const fallback = {
        scope: (headerProject === "" ? "all" : headerProject) as Scope,
        skip: [] as string[],
        customized: false,
    };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return fallback;
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) return fallback;
        const p = parsed as Record<string, unknown>;
        const scope: Scope =
            p.scope === "all" || (typeof p.scope === "number" && PROJECTS.some((pr) => pr.number === p.scope))
                ? (p.scope as Scope)
                : fallback.scope;
        return {
            scope,
            skip: Array.isArray(p.skip) ? p.skip.filter((s): s is string => typeof s === "string") : [],
            customized: p.customized === true,
        };
    } catch {
        return fallback;
    }
}

export default function SyncButton({ onSyncComplete, project }: SyncButtonProps) {
    const [running, setRunning] = useState<RunningSync | null>(null);
    const [starting, setStarting] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [canForce, setCanForce] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [scope, setScope] = useState<Scope>(() => loadStoredOptions(project).scope);
    const [skip, setSkip] = useState<string[]>(() => loadStoredOptions(project).skip);
    const [skipCustomized, setSkipCustomized] = useState(() => loadStoredOptions(project).customized);
    const [statuses, setStatuses] = useState<ProjectStatuses[] | null>(null);
    const [statusesLoading, setStatusesLoading] = useState(false);
    const wasRunningRef = useRef(false);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);

    const showNotice = useCallback((n: Notice, autoHideMs = 6000) => {
        setNotice(n);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        if (autoHideMs > 0) {
            noticeTimer.current = setTimeout(() => setNotice(null), autoHideMs);
        }
    }, []);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch("/api/sync/github-project", { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            const r = data.running;
            if (r) {
                setRunning({
                    total: typeof r.total_items === "number" ? r.total_items : 0,
                    processed: typeof r.processed_items === "number" ? r.processed_items : 0,
                    stage: (r.current_stage as string | null) ?? null,
                    startedAt: (r.started_at as string | null) ?? null,
                });
            } else {
                setRunning(null);
            }
        } catch {
            // Polling is best-effort; a transient failure shouldn't nuke state.
        }
    }, []);

    // Status options for the skip list, loaded lazily on first menu open.
    const fetchStatuses = useCallback(async () => {
        setStatusesLoading(true);
        try {
            const res = await fetch("/api/status-mapping", { cache: "no-store" });
            if (!res.ok) return;
            const data = await res.json();
            const list: ProjectStatuses[] = (data.projects ?? []).map(
                (p: {
                    number: number;
                    label: string;
                    statuses: { status: string; bucket_id: string | null }[];
                    buckets: { id: string; is_done: boolean }[];
                }) => {
                    const doneIds = new Set(p.buckets.filter((b) => b.is_done).map((b) => b.id));
                    return {
                        number: p.number,
                        label: p.label,
                        options: p.statuses.map((s) => ({
                            status: s.status,
                            isDone: s.bucket_id !== null && doneIds.has(s.bucket_id),
                        })),
                    };
                }
            );
            setStatuses(list);
        } catch {
            // Menu still works (scope only) if statuses can't load.
        } finally {
            setStatusesLoading(false);
        }
    }, []);

    // On mount, pick up a sync that is already running (e.g. after refresh).
    useEffect(() => {
        const id = setTimeout(() => void fetchStatus(), 0);
        return () => clearTimeout(id);
    }, [fetchStatus]);

    // Keep polling while a sync is active (or one is being started).
    const active = running !== null || starting;
    useEffect(() => {
        if (!active) return;
        const id = setInterval(fetchStatus, POLL_MS);
        return () => clearInterval(id);
    }, [active, fetchStatus]);

    // Detect running -> finished transition: refresh dashboard + toast result.
    // Partially-cancelled runs still refresh — whatever was saved is new data.
    useEffect(() => {
        if (wasRunningRef.current && running === null && !starting) {
            setCancelling(false);
            setCanForce(false);
            // The RUNNING row disappeared — check the latest log for outcome.
            fetch("/api/sync/github-project", { cache: "no-store" })
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => {
                    const latest = data?.logs?.[0];
                    if (latest?.status === "SUCCESS") {
                        showNotice({
                            kind: "success",
                            text: latest.message || `Synced ${latest.items_synced ?? 0} items.`,
                        });
                    } else if (latest?.status === "CANCELLED") {
                        showNotice({
                            kind: "info",
                            text: latest.message || "Sync cancelled — partial results kept.",
                        });
                    } else if (latest?.status === "FAILED") {
                        showNotice({
                            kind: "error",
                            text: latest.message || "Sync failed.",
                        });
                    }
                    onSyncComplete();
                })
                .catch(() => onSyncComplete());
        }
        wasRunningRef.current = running !== null;
    }, [running, starting, onSyncComplete, showNotice]);

    useEffect(() => {
        return () => {
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
        };
    }, []);

    // Close the menu on outside click / Escape.
    useEffect(() => {
        if (!menuOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setMenuOpen(false);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuOpen]);

    // Persist scope + skip choices.
    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ scope, skip, customized: skipCustomized }));
        } catch {
            // Private browsing etc. — options just won't persist.
        }
    }, [scope, skip, skipCustomized]);

    // First time statuses load (and user hasn't customized), pre-check the
    // Done-bucket statuses — the classic "already finished, don't re-save"
    // candidates.
    useEffect(() => {
        if (statuses === null || skipCustomized) return;
        const doneStatuses = statuses.flatMap((p) =>
            p.options.filter((o) => o.isDone).map((o) => o.status)
        );
        const id = setTimeout(() => setSkip(Array.from(new Set(doneStatuses))), 0);
        return () => clearTimeout(id);
    }, [statuses, skipCustomized]);

    const toggleSkip = (status: string) => {
        setSkipCustomized(true);
        setSkip((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
    };

    const openMenu = () => {
        if (running !== null || starting) return;
        setNotice(null);
        setMenuOpen((v) => {
            if (!v && statuses === null && !statusesLoading) void fetchStatuses();
            return !v;
        });
    };

    const handleStart = async () => {
        if (running !== null || starting) return;
        setMenuOpen(false);
        setStarting(true);
        setNotice(null);

        try {
            const res = await fetch("/api/sync/github-project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(scope === "all" ? {} : { project: scope }),
                    ...(skip.length > 0 ? { skipStatuses: skip } : {}),
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok && data.success) {
                showNotice({
                    kind: "success",
                    text: data.message || `Synced ${data.items_synced ?? 0} items.`,
                });
                onSyncComplete();
            } else if (res.ok && data.cancelled) {
                // This tab's own run was cancelled mid-flight.
                showNotice({
                    kind: "info",
                    text: data.message || "Sync cancelled — partial results kept.",
                });
                onSyncComplete();
            } else if (res.status === 409) {
                // Another sync is already running — attach to it via polling.
                setRunning({
                    total: typeof data.total_items === "number" ? data.total_items : 0,
                    processed:
                        typeof data.processed_items === "number" ? data.processed_items : 0,
                    stage: (data.current_stage as string | null) ?? null,
                    startedAt: (data.running_since as string | null) ?? null,
                });
                showNotice(
                    {
                        kind: "info",
                        text: "A sync is already running — showing its progress instead of starting a new one.",
                    },
                    8000
                );
                fetchStatus();
            } else {
                showNotice({
                    kind: "error",
                    text: data.error || "Sync failed",
                });
            }
        } catch {
            showNotice({
                kind: "error",
                text: "Network error. Please check your connection.",
            });
        } finally {
            setStarting(false);
            // Reconcile with the server (covers refresh-safe RUNNING state).
            fetchStatus();
        }
    };

    const handleCancel = async () => {
        if (running === null) return;
        if (cancelling && !canForce) return;
        setCancelling(true);
        try {
            const res = await fetch("/api/sync/github-project/cancel", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setCancelling(false);
                showNotice({
                    kind: "error",
                    text: data.error || "Could not cancel the sync.",
                });
            } else if (data.forced) {
                showNotice({ kind: "info", text: data.message });
            }
            // Otherwise just wait — polling will show the CANCELLED outcome.
        } catch {
            setCancelling(false);
            showNotice({
                kind: "error",
                text: "Network error. Please check your connection.",
            });
        }
    };

    // If the worker doesn't react to cancellation, offer a force stop
    // (marks a dead run CANCELLED so it stops blocking new syncs).
    useEffect(() => {
        if (!cancelling) return;
        const id = setTimeout(() => setCanForce(true), 32000);
        return () => clearTimeout(id);
    }, [cancelling]);

    const busy = running !== null || starting;
    const headerLabel = project !== "" ? PROJECTS.find((p) => p.number === project)?.label : undefined;
    const scopeLabel = scope === "all" ? "all projects" : (PROJECTS.find((p) => p.number === scope)?.label ?? `#${scope}`);

    const buttonLabel = running
        ? running.total > 0
            ? `Syncing ${running.processed}/${running.total}…`
            : "Syncing…"
        : starting
          ? "Starting…"
          : headerLabel
            ? `Sync ${headerLabel}`
            : "Sync GitHub";

    const pct =
        running && running.total > 0
            ? Math.min(100, Math.round((running.processed / running.total) * 100))
            : null;

    const visibleStatuses =
        statuses === null
            ? []
            : scope === "all"
              ? statuses
              : statuses.filter((p) => p.number === scope);

    return (
        <div className="relative" ref={menuRef}>
            <button
                id="sync-github-btn"
                onClick={openMenu}
                disabled={busy}
                title={
                    busy
                        ? "A sync is already running — only one sync can run at a time"
                        : "Choose what to sync"
                }
                className="neo-btn flex items-center gap-2"
                style={{
                    fontSize: "13px",
                    padding: "11px 18px",
                    background: notice?.kind === "error" ? "var(--accent-pink)" : "var(--accent)",
                    color: "var(--text-primary)",
                    opacity: busy ? 0.85 : 1,
                    cursor: busy ? "wait" : "pointer",
                }}
            >
                {busy ? (
                    <RefreshCw size={14} className="animate-spin" />
                ) : notice?.kind === "success" ? (
                    <CheckCircle size={14} />
                ) : notice?.kind === "error" ? (
                    <XCircle size={14} />
                ) : (
                    <RefreshCw size={14} />
                )}
                {buttonLabel}
                {!busy && <ChevronDown size={14} style={{ opacity: 0.7 }} />}
            </button>

            {menuOpen && !busy && (
                <div
                    className="absolute right-0 top-full mt-2 z-50"
                    style={{
                        minWidth: "18rem",
                        maxWidth: "22rem",
                        padding: "12px",
                        background: "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "3px 3px 0 var(--card-border)",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "12px",
                        color: "var(--text-primary)",
                    }}
                >
                    <div style={{ fontSize: "10.5px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "6px" }}>
                        Scope
                    </div>
                    {[{ value: "all" as Scope, label: "All projects" },
                        ...PROJECTS.map((p) => ({ value: p.number as Scope, label: p.label }))].map((opt) => (
                        <label
                            key={String(opt.value)}
                            className="flex items-center gap-2"
                            style={{ padding: "5px 4px", cursor: "pointer" }}
                        >
                            <input
                                type="radio"
                                name="sync-scope"
                                checked={scope === opt.value}
                                onChange={() => setScope(opt.value)}
                            />
                            {opt.label}
                        </label>
                    ))}

                    <div style={{ fontSize: "10.5px", letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-muted)", margin: "10px 0 6px" }}>
                        Skip unchanged in…
                    </div>
                    {statusesLoading && <div style={{ color: "var(--text-muted)" }}>Loading statuses…</div>}
                    {!statusesLoading &&
                        visibleStatuses.map((p) => (
                            <div key={p.number} style={{ marginBottom: "6px" }}>
                                {scope === "all" && (
                                    <div style={{ fontWeight: 700, padding: "2px 4px" }}>{p.label}</div>
                                )}
                                {p.options.length === 0 && (
                                    <div style={{ color: "var(--text-muted)", padding: "2px 4px" }}>
                                        No statuses known yet
                                    </div>
                                )}
                                {p.options.map((o) => (
                                    <label
                                        key={`${p.number}:${o.status}`}
                                        className="flex items-center gap-2"
                                        style={{ padding: "4px 4px 4px 14px", cursor: "pointer" }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={skip.includes(o.status)}
                                            onChange={() => toggleSkip(o.status)}
                                        />
                                        {o.status}
                                        {o.isDone && (
                                            <span style={{ color: "var(--text-muted)" }}>(done)</span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        ))}
                    {!statusesLoading && (
                        <div style={{ color: "var(--text-muted)", lineHeight: 1.5, marginTop: "2px" }}>
                            Skipped only when already stored with the same status — new or
                            changed items always sync.
                        </div>
                    )}

                    <div className="flex gap-2" style={{ marginTop: "12px" }}>
                        <button
                            onClick={handleStart}
                            className="neo-btn flex-1"
                            style={{ padding: "9px 12px", background: "var(--accent)", fontSize: "12.5px" }}
                        >
                            Start sync · {scopeLabel}
                            {skip.length > 0 ? ` · skip ${skip.length}` : ""}
                        </button>
                        <button
                            onClick={() => setMenuOpen(false)}
                            className="neo-btn"
                            style={{ padding: "9px 12px", fontSize: "12.5px" }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {running && (
                <div
                    className="absolute right-0 top-full mt-2 z-50"
                    style={{
                        minWidth: "16rem",
                        maxWidth: "20rem",
                        padding: "10px 12px",
                        background: "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "3px 3px 0 var(--card-border)",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "12px",
                        color: "var(--text-primary)",
                    }}
                >
                    <div className="flex justify-between" style={{ marginBottom: "6px" }}>
                        <span>
                            {running.total > 0
                                ? `${running.processed} of ${running.total} items`
                                : `${running.processed} items…`}
                        </span>
                        {pct !== null && <span>{pct}%</span>}
                    </div>
                    <div
                        style={{
                            height: "8px",
                            border: "1.5px solid var(--card-border)",
                            background: "var(--bg, #fff)",
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                height: "100%",
                                width: pct !== null ? `${pct}%` : "35%",
                                background: "var(--accent)",
                                transition: "width 0.4s ease",
                                ...(pct === null
                                    ? { animation: "sync-indeterminate 1.2s ease-in-out infinite" }
                                    : {}),
                            }}
                        />
                    </div>
                    {running.stage && (
                        <div style={{ marginTop: "6px", color: "var(--text-muted)" }}>
                            {running.stage}
                        </div>
                    )}
                    <button
                        onClick={handleCancel}
                        disabled={cancelling && !canForce}
                        title={canForce ? "The sync is not responding — mark it cancelled" : undefined}
                        className="neo-btn w-full"
                        style={{
                            marginTop: "10px",
                            padding: "8px 12px",
                            fontSize: "12.5px",
                            background: "var(--accent-pink)",
                            cursor: cancelling && !canForce ? "wait" : "pointer",
                            opacity: cancelling && !canForce ? 0.7 : 1,
                        }}
                    >
                        {cancelling ? (canForce ? "Force stop" : "Cancelling…") : "Cancel sync"}
                    </button>
                </div>
            )}

            {!running && notice && (
                <div
                    className="absolute right-0 top-full mt-2 z-50"
                    style={{
                        minWidth: "16rem",
                        maxWidth: "20rem",
                        padding: "10px 12px",
                        background:
                            notice.kind === "error" ? "var(--accent-pink)" : "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "3px 3px 0 var(--card-border)",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "12px",
                        color: "var(--text-primary)",
                    }}
                >
                    {notice.text}
                </div>
            )}

            <style>{`@keyframes sync-indeterminate { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }`}</style>
        </div>
    );
}
