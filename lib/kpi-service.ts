import { prisma } from "@/lib/prisma";
import { Task, User, TaskLabel, TaskHistory, Prisma } from "@prisma/client";
import { differenceInDays } from "date-fns";
import { getBucketLookup, lookupBucket } from "@/lib/status-mapping";
import { KpiBucketInfo } from "@/lib/kpi-buckets";

type TaskWithRelations = Task & {
    labels: TaskLabel[];
    histories: TaskHistory[];
};

type UserWithTasks = User & {
    tasks: TaskWithRelations[];
};

export interface UserKPI {
    user: {
        id: string;
        name: string | null;
        github_login: string;
        avatar_url: string | null;
    };
    metrics: {
        total_tasks: number;
        completed_tasks: number;
        completion_rate: number;
        avg_cycle_time_days: number | null;
        active_tasks: number;
        unmapped_tasks: number;
        bugs_count: number;
        overdue_tasks: number;
        total_story_points: number;
        tasks_without_sp: number;
        // Non-done tasks grouped by this project's own buckets — fully
        // dynamic since every team defines its own taxonomy beyond Done.
        bucket_breakdown: { bucket_id: string; label: string; count: number }[];
    };
    tasks: {
        id: string;
        title: string;
        status: string;
        bucket: KpiBucketInfo | null;
        url: string | null;
        repository: string | null;
        created_at: Date;
        closed_at: Date | null;
        start_date: Date | null;
        end_date: Date | null;
        type: string | null;
        is_done: boolean;
        is_overdue: boolean;
        bug_count: number;
        story_points: number | null;
        labels: { name: string; color: string | null }[];
        histories: {
            old_status: string | null;
            new_status: string;
            changed_at: Date;
        }[];
    }[];
}

export interface KPIFilters {
    startDate?: Date;
    endDate?: Date;
    repository?: string[];
    projectNumber?: number;
}

function isTaskOverdue(task: TaskWithRelations, done: boolean, now: Date): boolean {
    if (!task.end_date) return false;
    if (done) {
        return !!task.closed_at && new Date(task.closed_at) > new Date(task.end_date);
    }
    return new Date(task.end_date) < now;
}

/**
 * Calculate KPI metrics for all users
 */
export async function calculateAllUserKPIs(
    filters?: KPIFilters
): Promise<UserKPI[]> {
    const now = new Date();
    const bucketLookup = await getBucketLookup();
    const bucketOf = (t: TaskWithRelations) => lookupBucket(bucketLookup, t.project_number, t.status);

    const users = (await prisma.user.findMany({
        include: {
            tasks: {
                where: buildTaskFilter(filters),
                include: {
                    labels: true,
                    histories: { orderBy: { changed_at: "asc" } },
                },
            },
        },
        orderBy: { github_login: "asc" },
    })) as UserWithTasks[];

    const kpis: UserKPI[] = users
        .filter((user) => user.tasks.length > 0)
        .map((user) => {
            const tasks = user.tasks;
            const isDone = (t: TaskWithRelations) => bucketOf(t)?.is_done === true;

            const totalTasks = tasks.length;
            const completedTasks = tasks.filter(isDone).length;
            const activeTasks = totalTasks - completedTasks;
            const unmappedTasks = tasks.filter((t) => bucketOf(t) === null).length;
            const completionRate =
                totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

            const bucketCounts = new Map<string, { label: string; count: number }>();
            tasks.forEach((t) => {
                const b = bucketOf(t);
                if (!b || b.is_done) return;
                const entry = bucketCounts.get(b.id) ?? { label: b.label, count: 0 };
                entry.count++;
                bucketCounts.set(b.id, entry);
            });
            const bucketBreakdown = [...bucketCounts.entries()]
                .map(([bucket_id, { label, count }]) => ({ bucket_id, label, count }))
                .sort((a, b) => b.count - a.count);

            const overdueTasks = tasks.filter((t) => isTaskOverdue(t, isDone(t), now)).length;

            // Bugs generated: a PR opened in the same repo after a task was marked done
            // is treated as a follow-up fix for that task.
            let bugsCount = 0;
            const issuesDone = tasks.filter((t) => t.type === "Issue" && isDone(t) && t.closed_at);
            const prs = tasks.filter((t) => t.type === "PullRequest");

            issuesDone.forEach((issue) => {
                const baseDate = issue.end_date && issue.end_date > issue.closed_at! ? issue.end_date : issue.closed_at!;
                const hasBug = prs.some((pr) =>
                    pr.repository === issue.repository &&
                    new Date(pr.created_at) > new Date(baseDate)
                );
                if (hasBug) bugsCount++;
            });

            // Average cycle time: only for done tasks with a closed_at
            const completedWithDates = tasks.filter((t) => isDone(t) && t.closed_at);

            let avgCycleTimeDays: number | null = null;
            if (completedWithDates.length > 0) {
                const totalDays = completedWithDates.reduce((sum, task) => {
                    const start = task.start_date ? new Date(task.start_date) : new Date(task.created_at);
                    const end = new Date(task.closed_at!);
                    const days = differenceInDays(end, start);
                    return sum + Math.max(0, days);
                }, 0);
                avgCycleTimeDays =
                    Math.round((totalDays / completedWithDates.length) * 10) / 10;
            }

            return {
                user: {
                    id: user.id,
                    name: user.name,
                    github_login: user.github_login,
                    avatar_url: user.avatar_url,
                },
                metrics: {
                    total_tasks: totalTasks,
                    completed_tasks: completedTasks,
                    completion_rate: Math.round(completionRate * 10) / 10,
                    avg_cycle_time_days: avgCycleTimeDays,
                    active_tasks: activeTasks,
                    unmapped_tasks: unmappedTasks,
                    bugs_count: bugsCount,
                    overdue_tasks: overdueTasks,
                    total_story_points: tasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0),
                    tasks_without_sp: tasks.filter((t) => t.story_points == null).length,
                    bucket_breakdown: bucketBreakdown,
                },
                tasks: tasks
                    .map((t) => {
                        const done = isDone(t);
                        let issueBugCount = 0;
                        if (t.type === "Issue" && done && t.closed_at) {
                            const baseDate = t.end_date && t.end_date > t.closed_at! ? t.end_date : t.closed_at!;
                            issueBugCount = prs.filter((pr) =>
                                pr.repository === t.repository &&
                                new Date(pr.created_at) > new Date(baseDate)
                            ).length;
                        }

                        return {
                            id: t.id,
                            title: t.title,
                            status: t.status,
                            bucket: bucketOf(t),
                            url: t.url,
                            repository: t.repository,
                            created_at: t.created_at,
                            closed_at: t.closed_at,
                            start_date: t.start_date,
                            end_date: t.end_date,
                            type: t.type,
                            is_done: done,
                            is_overdue: isTaskOverdue(t, done, now),
                            bug_count: issueBugCount,
                            story_points: t.story_points ?? null,
                            labels: t.labels.map((l) => ({ name: l.name, color: l.color })),
                            histories: t.histories.map((h) => ({
                                old_status: h.old_status,
                                new_status: h.new_status,
                                changed_at: h.changed_at,
                            })),
                        };
                    })
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
            };
        });

    return kpis;
}

/**
 * Build Prisma where clause for task filtering
 */
function buildTaskFilter(filters?: KPIFilters): Prisma.TaskWhereInput {
    if (!filters) return {};

    const where: Prisma.TaskWhereInput = {};

    if (filters.startDate || filters.endDate) {
        where.created_at = {};
        if (filters.startDate) {
            (where.created_at as Prisma.DateTimeFilter).gte = filters.startDate;
        }
        if (filters.endDate) {
            (where.created_at as Prisma.DateTimeFilter).lte = filters.endDate;
        }
    }

    if (filters.repository?.length) {
        where.repository = { in: filters.repository };
    }

    if (filters.projectNumber) {
        where.project_number = filters.projectNumber;
    }

    return where;
}

/**
 * Get all unique repositories from tasks, optionally scoped to one project board
 */
export async function getRepositories(projectNumber?: number): Promise<string[]> {
    const result = await prisma.task.findMany({
        where: { repository: { not: null }, ...(projectNumber ? { project_number: projectNumber } : {}) },
        select: { repository: true },
        distinct: ["repository"],
        orderBy: { repository: "asc" },
    });

    return result
        .map((r) => r.repository)
        .filter((r): r is string => r !== null);
}

/**
 * Get all distinct raw statuses currently present in synced tasks, so the UI
 * can let the user map each one onto a KPI bucket instead of us guessing.
 * Different boards define their own status columns, so this is optionally
 * scoped to one project.
 */
export async function getStatuses(projectNumber?: number): Promise<string[]> {
    const result = await prisma.task.findMany({
        where: projectNumber ? { project_number: projectNumber } : {},
        select: { status: true },
        distinct: ["status"],
        orderBy: { status: "asc" },
    });

    return result.map((r) => r.status);
}

/**
 * Get summary stats for dashboard header
 */
export async function getDashboardSummary(filters?: KPIFilters) {
    const taskWhere = buildTaskFilter(filters);
    const bucketLookup = await getBucketLookup();

    const [tasks, activeUsers, lastSync] = await Promise.all([
        prisma.task.findMany({
            where: taskWhere,
            select: { project_number: true, status: true, story_points: true },
        }),
        prisma.user.count({ where: { tasks: { some: taskWhere } } }),
        prisma.syncLog.findFirst({
            where: { status: "SUCCESS" },
            orderBy: { finished_at: "desc" },
        }),
    ]);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
        (t) => lookupBucket(bucketLookup, t.project_number, t.status)?.is_done === true
    ).length;
    const unmappedTasks = tasks.filter(
        (t) => lookupBucket(bucketLookup, t.project_number, t.status) === null
    ).length;
    const totalStoryPoints = tasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0);

    return {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        active_tasks: totalTasks - completedTasks,
        unmapped_tasks: unmappedTasks,
        active_users: activeUsers,
        total_story_points: totalStoryPoints,
        last_sync: lastSync?.finished_at ?? null,
    };
}
