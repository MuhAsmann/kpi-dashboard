import { FilterDailyTimeline } from "@/types/daily--timeline";
import { CalendarSummary } from "@/types/summary";
import { useCallback, useState } from "react";

const getDefaultFilters = (): FilterDailyTimeline => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    return {
        date: today,
        repository: "",
        project: "",
    };
};

export const useDailyTimelineHooks = () => {

    const [summary, setSummary] = useState<CalendarSummary | null>(null);
    const [filters, setFilters] = useState<FilterDailyTimeline>(getDefaultFilters());

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchSummary = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = filters?.project !== "" ? `?project=${filters?.project}` : "";
            const [summaryRes] = await Promise.all([
                fetch(`/api/kpi/summary${qs}`),
            ]);
            const summaryData = await summaryRes.json();
            if (summaryData.summary) {
                setSummary({ repositories: summaryData.repositories || [], last_sync: summaryData.summary.last_sync });
            } else {
                setSummary(null);
            }
            if (!summaryRes.ok) {
                setError(summaryData?.error || "Failed to load summary data");
            }
        } catch (err) {
            console.error("Failed to fetch summary data:", err);
            setError("Network error. Please check your connection.");
        } finally {
            setLoading(false);
        }
    }, [filters?.project]);

    return {
        data: {
            summary,
            loading,
            error,
            filters
        },
        method: {
            setFilters,
            fetchSummary
        }
    }
}

