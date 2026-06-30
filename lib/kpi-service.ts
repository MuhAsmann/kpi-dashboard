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
    };
    tasks: {
        id: string;
        title: string;
        status: string;
        url: string | null;
        repository: string | null;
        created_at: Date;
        closed_at: Date | null;
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

            // Average cycle time: only for tasks that have both createdAt and closedAt
            const completedWithDates = tasks.filter(
                (t: TaskWithRelations) => t.status === "DONE" && t.closed_at
            );

            let avgCycleTimeDays: number | null = null;
            if (completedWithDates.length > 0) {
                const totalDays = completedWithDates.reduce(
                    (sum: number, task: TaskWithRelations) => {
                        const days = differenceInDays(
                            new Date(task.closed_at!),
                            new Date(task.created_at)
                        );
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
                },
                tasks: tasks.map((t: TaskWithRelations) => ({
                    id: t.id,
                    title: t.title,
                    status: t.status,
                    url: t.url,
                    repository: t.repository,
                    created_at: t.created_at,
                    closed_at: t.closed_at,
                    labels: t.labels.map((l) => ({ name: l.name, color: l.color })),
                })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
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
