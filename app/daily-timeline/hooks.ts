import { FilterDailyTimeline } from "@/types/daily--timeline";
import { DailyWorkEntry } from "@/types/daily-work";
import { CalendarSummary } from "@/types/summary";
import { Users } from "@/types/user";
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
    const [opsiUsers, setOpsiUsers] = useState<{ id: string, name: string }[]>([])
    const [timelineData, setTimelineData] = useState<DailyWorkEntry[]>([])
    const [timelineLoading, setTimelineLoading] = useState(false)

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

    const fetchOpsiPIC = useCallback(async () => {
        try {
            const query = new URLSearchParams({
                ...(filters?.project && { project: String(filters.project) }),
                ...(filters?.date && { date: String(filters.date) })
            });

            const res = await fetch(`/api/kpi/users?${query.toString()}`);

            if (!res.ok) {
                throw new Error(`Request failed with status ${res.status}`);
            }

            const data: Users[] = await res.json();
            setOpsiUsers(data?.map((e) => e.user));

        } catch (err) {
            console.error("Failed to fetch summary data:", err);
        }
    }, [filters.project]);

    const fetchDailyTimeline = useCallback(async () => {
        setTimelineLoading(true);
        try {
            const query = new URLSearchParams({
                ...(filters?.project && { project: String(filters.project) }),
                ...(filters?.date && { date: String(filters.date) }),
                ...(filters?.id_user && { user_id: String(filters.id_user) }),
                ...(filters?.repository && { repository: String(filters.repository) })
            });

            const res = await fetch(`/api/kpi/daily-timeline?${query.toString()}`);

            if (!res.ok) {
                throw new Error(`Request failed with status ${res.status}`);
            }

            const data: DailyWorkEntry[] = await res.json();
            setTimelineData(data);

        } catch (err) {
            console.error("Failed to fetch daily timeline:", err);
        } finally {
            setTimelineLoading(false);
        }
    }, [filters.project, filters.date, filters.id_user, filters.repository]);

    return {
        data: {
            summary,
            opsiUsers,
            timelineData,
            timelineLoading,
            loading,
            error,
            filters
        },
        method: {
            setFilters,
            fetchSummary,
            fetchOpsiPIC,
            fetchDailyTimeline
        }
    }
}

