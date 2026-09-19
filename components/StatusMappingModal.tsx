"use client";

import { useEffect, useRef, useState } from "react";
import { X, Lock, Plus } from "lucide-react";
import { KpiBucketInfo } from "@/lib/kpi-buckets";
import SingleSelectDropdown from "@/components/SingleSelectDropdown";

interface ProjectData {
    number: number;
    label: string;
    buckets: KpiBucketInfo[];
    statuses: { status: string; bucket_id: string | null }[];
}

interface StatusMappingModalProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** Scope to one project. Omit to manage all configured projects at once. */
    projectNumber?: number;
}

export default function StatusMappingModal({ open, onClose, onSaved, projectNumber }: StatusMappingModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [projects, setProjects] = useState<ProjectData[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newBucketLabel, setNewBucketLabel] = useState<Record<number, string>>({});

    const load = () => {
        setLoading(true);
        const qs = projectNumber ? `?project=${projectNumber}` : "";
        fetch(`/api/status-mapping${qs}`)
            .then((r) => r.json())
            .then((data) => setProjects(data.projects ?? []))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open && !dialog.open) {
            dialog.showModal();
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    useEffect(() => {
        if (open) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, projectNumber]);

    const setStatusBucket = (projNumber: number, status: string, bucketId: string | "") => {
        setProjects((prev) =>
            prev.map((p) =>
                p.number !== projNumber
                    ? p
                    : {
                        ...p,
                        statuses: p.statuses.map((s) =>
                            s.status === status ? { ...s, bucket_id: bucketId || null } : s
                        ),
                    }
            )
        );
    };

    const handleAddBucket = async (projNumber: number) => {
        const label = (newBucketLabel[projNumber] ?? "").trim();
        if (!label) return;

        const res = await fetch("/api/status-mapping/buckets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_number: projNumber, label }),
        });
        if (!res.ok) return;
        const { bucket } = await res.json();

        setProjects((prev) =>
            prev.map((p) => (p.number !== projNumber ? p : { ...p, buckets: [...p.buckets, bucket] }))
        );
        setNewBucketLabel((prev) => ({ ...prev, [projNumber]: "" }));
    };

    const handleDeleteBucket = async (projNumber: number, bucketId: string) => {
        const res = await fetch("/api/status-mapping/buckets", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket_id: bucketId }),
        });
        if (!res.ok) return;

        setProjects((prev) =>
            prev.map((p) =>
                p.number !== projNumber
                    ? p
                    : {
                        ...p,
                        buckets: p.buckets.filter((b) => b.id !== bucketId),
                        statuses: p.statuses.map((s) =>
                            s.bucket_id === bucketId ? { ...s, bucket_id: null } : s
                        ),
                    }
            )
        );
    };

    const handleSave = async () => {
        setSaving(true);
        const entries = projects.flatMap((p) =>
            p.statuses.map((s) => ({ project_number: p.number, raw_status: s.status, bucket_id: s.bucket_id }))
        );
        try {
            await fetch("/api/status-mapping", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entries }),
            });
            onSaved();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <dialog
            ref={dialogRef}
            onClose={onClose}
            style={{
                margin: "auto",
                border: "2px solid var(--card-border)",
                boxShadow: "6px 6px 0 var(--card-border)",
                padding: 0,
                width: "min(680px, 92vw)",
                maxHeight: "80vh",
                background: "var(--card)",
                color: "var(--text-primary)",
            }}
        >
            <div
                className="flex items-center justify-between gap-3"
                style={{ padding: "16px 20px", borderBottom: "2px solid var(--card-border)" }}
            >
                <div>
                    <h2 style={{ fontFamily: "var(--font-mono), monospace", fontSize: "18px", margin: 0 }}>
                        KPI status mapping
                    </h2>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "4px 0 0" }}>
                        Each project defines its own buckets. <strong>Done</strong> is required and drives completion — add or remove any other bucket your team needs.
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="neo-btn neo-btn-sm shrink-0"
                    style={{ padding: "6px", background: "var(--card)" }}
                >
                    <X size={14} />
                </button>
            </div>

            <div style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "calc(80vh - 130px)" }}>
                {loading ? (
                    <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading…</p>
                ) : (
                    projects.map((p) => (
                        <div key={p.number} className="mb-6">
                            <h3
                                style={{
                                    fontFamily: "var(--font-mono), monospace",
                                    fontSize: "13px",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.5px",
                                    marginBottom: "8px",
                                    color: "var(--text-secondary)",
                                }}
                            >
                                {p.label} <span style={{ color: "var(--text-muted)" }}>#{p.number}</span>
                            </h3>

                            <div className="flex items-center gap-1.5 flex-wrap mb-3">
                                {p.buckets.map((b) => (
                                    <span
                                        key={b.id}
                                        className="flex items-center gap-1.5"
                                        style={{
                                            fontFamily: "var(--font-mono), monospace",
                                            fontSize: "11.5px",
                                            padding: "4px 8px",
                                            border: "1.5px solid var(--card-border)",
                                            background: b.is_done ? "var(--accent)" : "var(--card-alt)",
                                        }}
                                    >
                                        {b.is_done && <Lock size={10} />}
                                        {b.label}
                                        {!b.is_done && (
                                            <button
                                                onClick={() => handleDeleteBucket(p.number, b.id)}
                                                title={`Remove ${b.label}`}
                                                className="cursor-pointer"
                                                style={{ display: "flex" }}
                                            >
                                                <X size={11} />
                                            </button>
                                        )}
                                    </span>
                                ))}
                                <span className="flex items-center gap-1">
                                    <input
                                        value={newBucketLabel[p.number] ?? ""}
                                        onChange={(e) => setNewBucketLabel((prev) => ({ ...prev, [p.number]: e.target.value }))}
                                        onKeyDown={(e) => e.key === "Enter" && handleAddBucket(p.number)}
                                        placeholder="New bucket…"
                                        style={{
                                            fontFamily: "var(--font-mono), monospace",
                                            fontSize: "11.5px",
                                            padding: "4px 6px",
                                            border: "1.5px dashed var(--dashed)",
                                            background: "var(--background)",
                                            width: "110px",
                                        }}
                                    />
                                    <button
                                        onClick={() => handleAddBucket(p.number)}
                                        title="Add bucket"
                                        className="neo-btn neo-btn-sm"
                                        style={{ padding: "4px", background: "var(--card)" }}
                                    >
                                        <Plus size={11} />
                                    </button>
                                </span>
                            </div>

                            {p.statuses.length === 0 ? (
                                <p style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>No synced data yet.</p>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {p.statuses.map((s) => (
                                        <div key={s.status} className="flex items-center justify-between gap-3" style={{ fontSize: "13px" }}>
                                            <span>{s.status}</span>
                                            <SingleSelectDropdown
                                                id={`bucket-select-${p.number}-${s.status.replace(/\s+/g, "-")}`}
                                                value={s.bucket_id ?? ""}
                                                onChange={(v) => setStatusBucket(p.number, s.status, v)}
                                                buttonStyle={{ fontSize: "12.5px", padding: "5px 8px", minWidth: "140px" }}
                                                options={[
                                                    { value: "", label: "— Unmapped —" },
                                                    ...p.buckets.map((b) => ({ value: b.id, label: b.label })),
                                                ]}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div
                className="flex justify-end gap-2"
                style={{ padding: "14px 20px", borderTop: "2px solid var(--card-border)" }}
            >
                <button
                    onClick={onClose}
                    className="neo-btn neo-btn-sm"
                    style={{ fontSize: "12.5px", padding: "9px 14px", background: "var(--card)" }}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="neo-btn neo-btn-sm"
                    style={{ fontSize: "12.5px", padding: "9px 14px", background: "var(--accent)" }}
                >
                    {saving ? "Saving…" : "Save mapping"}
                </button>
            </div>
        </dialog>
    );
}
