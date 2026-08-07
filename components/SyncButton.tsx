"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { PROJECTS } from "@/lib/projects";

interface SyncButtonProps {
    onSyncComplete: () => void;
    project: number | "";
}

type SyncState = "idle" | "syncing" | "success" | "error";

export default function SyncButton({ onSyncComplete, project }: SyncButtonProps) {
    const [state, setSyncState] = useState<SyncState>("idle");
    const [message, setMessage] = useState("");

    const handleSync = async () => {
        if (state === "syncing") return;

        setSyncState("syncing");
        setMessage("");

        try {
            const res = await fetch("/api/sync/github-project", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(project !== "" ? { project } : {}),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                setSyncState("success");
                setMessage(data.message);
                onSyncComplete();
            } else {
                setSyncState("error");
                setMessage(data.error || "Sync failed");
            }
        } catch {
            setSyncState("error");
            setMessage("Network error. Please check your connection.");
        } finally {
            setTimeout(() => {
                setSyncState("idle");
                setMessage("");
            }, 4000);
        }
    };

    const bg = {
        idle: "var(--accent)",
        syncing: "var(--accent)",
        success: "var(--accent)",
        error: "var(--accent-pink)",
    }[state];

    const icons = {
        idle: <RefreshCw size={14} />,
        syncing: <RefreshCw size={14} className="animate-spin" />,
        success: <CheckCircle size={14} />,
        error: <XCircle size={14} />,
    };

    const scopeLabel = project !== "" ? PROJECTS.find((p) => p.number === project)?.label : undefined;
    const labels = {
        idle: scopeLabel ? `Sync ${scopeLabel}` : "Sync GitHub",
        syncing: "Syncing…",
        success: "Synced",
        error: "Retry sync",
    };

    return (
        <div className="relative">
            <button
                id="sync-github-btn"
                onClick={handleSync}
                disabled={state === "syncing"}
                className="neo-btn flex items-center gap-2"
                style={{
                    fontSize: "13px",
                    padding: "11px 18px",
                    background: bg,
                    color: "var(--text-primary)",
                }}
            >
                {icons[state]}
                {labels[state]}
            </button>

            {message && (
                <div
                    className="absolute right-0 top-full mt-2 z-50"
                    style={{
                        minWidth: "16rem",
                        maxWidth: "20rem",
                        padding: "10px 12px",
                        background: state === "error" ? "var(--accent-pink)" : "var(--card)",
                        border: "2px solid var(--card-border)",
                        boxShadow: "3px 3px 0 var(--card-border)",
                        fontFamily: "var(--font-mono), monospace",
                        fontSize: "12px",
                        color: "var(--text-primary)",
                    }}
                >
                    {message}
                </div>
            )}
        </div>
    );
}
