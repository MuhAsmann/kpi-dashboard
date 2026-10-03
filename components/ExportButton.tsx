"use client";

import { Download } from "lucide-react";
import { DashboardFilters } from "@/types/dashboard";

interface ExportButtonProps {
    filters: DashboardFilters;
}

export default function ExportButton({ filters }: ExportButtonProps) {
    const handleExport = async () => {
        const params = new URLSearchParams();
        if (filters.startDate) params.set("start_date", filters.startDate);
        if (filters.endDate) params.set("end_date", filters.endDate);
        filters.repository.forEach((repository) => params.append("repository", repository));
        if (filters.project !== "") params.set("project", String(filters.project));

        const downloadUrl = `/api/export?${params.toString()}`;
        const timestamp = new Date()
            .toLocaleString("sv-SE", { hour12: false })
            .replace(" ", "_")
            .replace(/:/g, "-");

        // task-exports-{start_date}-{end_date}_{timestamp_local}
        const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "");
        const range = `${safe(filters.startDate || "all")}-${safe(filters.endDate || "all")}`;

        const response = await fetch(downloadUrl);
        if (!response.ok) {
            throw new Error("Failed to export tasks");
        }

        const blobUrl = URL.createObjectURL(await response.blob());
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `task-exports-${range}_${timestamp}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    };

    return (
        <button
            onClick={handleExport}
            className="neo-btn flex items-center gap-2"
            style={{
                fontSize: "13px",
                padding: "11px 16px",
                background: "var(--card)",
                color: "var(--text-primary)",
            }}
            title="Export data to CSV"
        >
            <Download size={14} />
            <span className="hidden sm:inline">Export CSV</span>
        </button>
    );
}
