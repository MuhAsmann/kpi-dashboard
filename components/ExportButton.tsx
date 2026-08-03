"use client";

import { Download } from "lucide-react";
import { DashboardFilters } from "@/types/dashboard";

interface ExportButtonProps {
    filters: DashboardFilters;
}

export default function ExportButton({ filters }: ExportButtonProps) {
    const handleExport = () => {
        const params = new URLSearchParams();
        if (filters.startDate) params.set("start_date", filters.startDate);
        if (filters.endDate) params.set("end_date", filters.endDate);
        if (filters.repository) params.set("repository", filters.repository);

        const downloadUrl = `/api/export?${params.toString()}`;
        
        // Create an invisible anchor element and trigger download
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = "tasks-export.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <button
            onClick={handleExport}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all hover:opacity-80"
            style={{
                background: "rgba(16, 185, 129, 0.2)",
                color: "#34d399",
                border: "1px solid rgba(16, 185, 129, 0.3)",
            }}
            title="Export data to CSV"
        >
            <Download size={14} />
            <span className="hidden sm:inline">Export</span>
        </button>
    );
}
