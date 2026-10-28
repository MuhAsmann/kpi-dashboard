export type SortField =
    | "completion_rate"
    | "completed_tasks"
    | "total_tasks"
    | "avg_cycle_time_days"
    | "median_active_days"
    | "reopened_tasks";

export interface DashboardFilters {
    startDate: string;
    endDate: string;
    repository: string[];
    project: number | "";
    sortBy: SortField;
    sortOrder: "asc" | "desc";
}
