export interface DailyWorkEntry {
    hour: number;
    issueNumber: number | null;
    issueTitle: string;
    issueUrl: string | null;
    status: string;
    repository: string | null;
    userId: string | null;
    username: string | null;
    avatarUrl: string | null;
    workLogId: string;
    isContinuous: boolean;
}
