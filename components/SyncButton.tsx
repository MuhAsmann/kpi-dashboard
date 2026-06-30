"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle, XCircle } from "lucide-react";

interface SyncButtonProps {
    onSyncComplete: () => void;
}

type SyncState = "idle" | "syncing" | "success" | "error";

export default function SyncButton({ onSyncComplete }: SyncButtonProps) {
    const [state, setSyncState] = useState<SyncState>("idle");
    const [message, setMessage] = useState("");

    const handleSync = async () => {
        if (state === "syncing") return;

        setSyncState("syncing");
        setMessage("");

        try {
            const res = await fetch("/api/sync/github-project", { method: "POST" });
            const data = await res.json();

            if (res.ok && data.success) {
                setSyncState("success");
                setMessage(data.message);
                onSyncComplete();
            } else {
                setSyncState("error");
                setMessage(data.error || "Sync failed");
            }
        } catch (err) {
            setSyncState("error");
            setMessage("Network error. Please check your connection.");
        } finally {
            setTimeout(() => {
                setSyncState("idle");
                setMessage("");
            }, 4000);
        }
    };

    const buttonStyles = {
        idle: {
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            color: "white",
        },
        syncing: {
            background: "rgba(99, 102, 241, 0.3)",
            color: "#818cf8",
        },
        success: {
            background: "rgba(16, 185, 129, 0.2)",
            color: "#10b981",
        },
        error: {
            background: "rgba(239, 68, 68, 0.2)",
            color: "#ef4444",
        },
    };

    const icons = {
        idle: <RefreshCw size={14} />,
        syncing: <RefreshCw size={14} className="animate-spin" />,
        success: <CheckCircle size={14} />,
        error: <XCircle size={14} />,
    };

    const labels = {
        idle: "Sync GitHub",
        syncing: "Syncing...",
        success: "Synced!",
        error: "Failed",
    };

    return (
        <div className="relative">
            <button
                id="sync-github-btn"
                onClick={handleSync}
                disabled={state === "syncing"}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:cursor-not-allowed"
                style={buttonStyles[state]}
            >
                {icons[state]}
                {labels[state]}
            </button>

            {message && (
                <div
                    className="absolute right-0 top-full mt-2 p-3 rounded-lg text-xs z-50 min-w-64 max-w-80"
                    style={{
                        background: state === "error"
                            ? "rgba(239,68,68,0.1)"
                            : "rgba(16,185,129,0.1)",
                        border: `1px solid ${state === "error" ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.3)"}`,
                        color: state === "error" ? "#ef4444" : "#10b981",
                    }}
                >
                    {message}
                </div>
            )}
        </div>
    );
}
