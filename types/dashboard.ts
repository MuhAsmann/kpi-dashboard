export type SortField =
    | "completion_rate"
    | "completed_tasks"
    | "total_tasks"
    | "avg_cycle_time_days";

export interface DashboardFilters {
    startDate: string;
    endDate: string;
    repository: string;
    sortBy: SortField;
    sortOrder: "asc" | "desc";
}
