// @ts-nocheck

import { prisma } from "@/lib/prisma";
import { Task, User, TaskLabel } from "@prisma/client";
import { differenceInDays } from "date-fns";

type TaskWithRelations = Task & {
    labels: TaskLabel[];
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
        cancelled_tasks: number;
        todo_tasks: number;
        in_progress_tasks: number;
        bugs_count: number;
        overdue_tasks: number;
        total_story_points: number;
        tasks_without_sp: number;
    };
    tasks: {
        id: string;
        title: string;
        status: string;
        url: string | null;
        repository: string | null;
        created_at: Date;
        closed_at: Date | null;
        start_date: Date | null;
        end_date: Date | null;
        type: string | null;
        is_overdue: boolean;
        bug_count: number;
        story_points: number | null;
        labels: { name: string; color: string | null }[];
    }[];
}

export interface KPIFilters {
    startDate?: Date;
    endDate?: Date;
    repository?: string;
}

/**
 * Calculate KPI metrics for all users
 */
export async function calculateAllUserKPIs(
    filters?: KPIFilters
): Promise<UserKPI[]> {
    const users = (await prisma.user.findMany({
        include: {
            tasks: {
                where: buildTaskFilter(filters),
                include: { labels: true },
            },
        },
        orderBy: { github_login: "asc" },
    })) as UserWithTasks[];

    const kpis: UserKPI[] = users
        .filter((user: UserWithTasks) => user.tasks.length > 0)
        .map((user: UserWithTasks) => {
            const tasks = user.tasks;

            const totalTasks = tasks.length;
            const completedTasks = tasks.filter(
                (t: TaskWithRelations) => t.status === "DONE"
            ).length;
            const cancelledTasks = tasks.filter(
                (t: TaskWithRelations) => t.status === "CANCELLED"
            ).length;
            const todoTasks = tasks.filter(
                (t: TaskWithRelations) => t.status === "TODO"
            ).length;
            const inProgressTasks = tasks.filter(
                (t: TaskWithRelations) => t.status === "IN_PROGRESS"
            ).length;
            const activeTasks = todoTasks + inProgressTasks;

            // Completion rate: completed / (total - cancelled) * 100
            const effectiveTotal = totalTasks - cancelledTasks;
            const completionRate =
                effectiveTotal > 0 ? (completedTasks / effectiveTotal) * 100 : 0;

            // Overdue tasks
            const overdueTasks = tasks.filter((t: TaskWithRelations) => {
                if (t.status === "DONE" && t.closed_at && t.end_date) {
                    return new Date(t.closed_at) > new Date(t.end_date);
                }
                return false;
            }).length;

            // Bugs generated
            let bugsCount = 0;
            const issuesDone = tasks.filter((t: TaskWithRelations) => t.type === "Issue" && t.status === "DONE" && t.closed_at);
            const prs = tasks.filter((t: TaskWithRelations) => t.type === "PullRequest");

            issuesDone.forEach((issue: TaskWithRelations) => {
                const baseDate = issue.end_date && issue.end_date > issue.closed_at! ? issue.end_date : issue.closed_at!;
                const hasBug = prs.some((pr: TaskWithRelations) =>
                    pr.repository === issue.repository &&
                    new Date(pr.created_at) > new Date(baseDate)
                );
                if (hasBug) bugsCount++;
            });

            // Average cycle time: only for tasks that have both start_date/createdAt and closedAt
            const completedWithDates = tasks.filter(
                (t: TaskWithRelations) => t.status === "DONE" && t.closed_at
            );

            let avgCycleTimeDays: number | null = null;
            if (completedWithDates.length > 0) {
                const totalDays = completedWithDates.reduce(
                    (sum: number, task: TaskWithRelations) => {
                        const start = task.start_date ? new Date(task.start_date) : new Date(task.created_at);
                        const end = new Date(task.closed_at!);
                        const days = differenceInDays(end, start);
                        return sum + Math.max(0, days);
                    },
                    0
                );
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
                    cancelled_tasks: cancelledTasks,
                    todo_tasks: todoTasks,
                    in_progress_tasks: inProgressTasks,
                    bugs_count: bugsCount,
                    overdue_tasks: overdueTasks,
                    total_story_points: tasks.reduce((sum: number, t: TaskWithRelations) => sum + (t.story_points ?? 0), 0),
                    tasks_without_sp: tasks.filter((t: TaskWithRelations) => t.story_points == null).length,
                },
                tasks: tasks.map((t: TaskWithRelations) => {
                    let isOverdue = false;
                    if (t.status === "DONE" && t.closed_at && t.end_date) {
                        isOverdue = new Date(t.closed_at) > new Date(t.end_date);
                    } else if (t.status !== "DONE" && t.status !== "CANCELLED" && t.end_date) {
                        isOverdue = new Date(t.end_date) > new Date(t.start_date);
                    }

                    let issueBugCount = 0;
                    if (t.type === "Issue" && t.status === "DONE" && t.closed_at) {
                        const baseDate = t.end_date && t.end_date > t.closed_at! ? t.end_date : t.closed_at!;
                        issueBugCount = prs.filter((pr: TaskWithRelations) =>
                            pr.repository === t.repository &&
                            new Date(pr.created_at) > new Date(baseDate)
                        ).length;
                    }

                    return {
                        id: t.id,
                        title: t.title,
                        status: t.status,
                        url: t.url,
                        repository: t.repository,
                        created_at: t.created_at,
                        closed_at: t.closed_at,
                        start_date: t.start_date,
                        end_date: t.end_date,
                        type: t.type,
                        is_overdue: isOverdue,
                        bug_count: issueBugCount,
                        story_points: t.story_points ?? null,
                        labels: t.labels.map((l) => ({ name: l.name, color: l.color })),
                    };
                }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
            };
        });

    return kpis;
}

/**
 * Build Prisma where clause for task filtering
 */
function buildTaskFilter(filters?: KPIFilters) {
    if (!filters) return {};

    const where: Record<string, unknown> = {};

    if (filters.startDate || filters.endDate) {
        where.created_at = {};
        if (filters.startDate) {
            (where.created_at as Record<string, Date>).gte = filters.startDate;
        }
        if (filters.endDate) {
            (where.created_at as Record<string, Date>).lte = filters.endDate;
        }
    }

    if (filters.repository) {
        where.repository = filters.repository;
    }

    return where;
}

/**
 * Get all unique repositories from tasks
 */
export async function getRepositories(): Promise<string[]> {
    const result = await prisma.task.findMany({
        where: { repository: { not: null } },
        select: { repository: true },
        distinct: ["repository"],
        orderBy: { repository: "asc" },
    });

    return result
        .map((r: { repository: string | null }) => r.repository)
        .filter((r: string | null): r is string => r !== null);
}

/**
 * Get summary stats for dashboard header
 */
export async function getDashboardSummary() {
    const [totalTasks, completedTasks, activeUsers, lastSync] = await Promise.all(
        [
            prisma.task.count(),
            prisma.task.count({ where: { status: "DONE" } }),
            prisma.user.count({ where: { tasks: { some: {} } } }),
            prisma.syncLog.findFirst({
                where: { status: "SUCCESS" },
                orderBy: { finished_at: "desc" },
            }),
        ]
    );

    return {
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        active_users: activeUsers,
        last_sync: lastSync?.finished_at ?? null,
    };
}
