import { prisma } from "@/lib/prisma";
import { Task, User, TaskLabel, TaskHistory, Prisma } from "@prisma/client";
import { addDays, differenceInDays } from "date-fns";
import { getBucketLookup, lookupBucket } from "@/lib/status-mapping";
import { KpiBucketInfo } from "@/lib/kpi-buckets";
import { computeStatusVisits } from "@/lib/task-history";

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
        // Median time done tasks spent in "active" buckets — the engineer's
        // own clock, excluding queue, waiting/blocked, and testing.
        median_active_days: number | null;
        active_tasks: number;
        unmapped_tasks: number;
        // Tasks moved out of a done status back into a not-done one (rework).
        reopened_tasks: number;
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
        done_at: Date | null;
        reopen_count: number;
        active_ms: number | null;
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

interface TaskCompletion {
    done: boolean;
    // When the task last entered a done status; null while it's not done.
    doneAt: Date | null;
    reopenCount: number;
    // Time spent in "active" buckets; null when history never shows one.
    activeMs: number | null;
}

type CompletionSource = Pick<Task, "project_number" | "status" | "created_at" | "closed_at"> & {
    histories: Pick<TaskHistory, "old_status" | "new_status" | "changed_at">[];
};

/**
 * Walks a task's status history (oldest first) using the project's bucket
 * mapping. A move from a done status to a mapped not-done status counts as a
 * reopen; unmapped statuses are skipped so a missing mapping never looks like
 * rework. A done task with no recorded move into done falls back to
 * closed_at, then created_at.
 */
export function getTaskCompletion(
    task: CompletionSource,
    bucketLookup: Map<string, KpiBucketInfo>
): TaskCompletion {
    const isDoneStatus = (status: string) =>
        lookupBucket(bucketLookup, task.project_number, status)?.is_done ?? null;

    let doneSince: Date | null = null;
    let reopenCount = 0;
    for (const h of task.histories) {
        const done = isDoneStatus(h.new_status);
        if (done === null) continue;
        if (done) {
            doneSince ??= new Date(h.changed_at);
        } else {
            if (doneSince) reopenCount++;
            doneSince = null;
        }
    }

    const done = isDoneStatus(task.status) === true;
    const activeVisits = computeStatusVisits(task.histories, task.closed_at, done).filter(
        (v) => lookupBucket(bucketLookup, task.project_number, v.status)?.category === "active"
    );
    return {
        done,
        doneAt: done ? doneSince ?? task.closed_at ?? task.created_at : null,
        reopenCount,
        activeMs: activeVisits.length ? activeVisits.reduce((sum, v) => sum + v.durationMs, 0) : null,
    };
}

/**
 * A task belongs to the period if it was finished inside it, or if it's still
 * open (current work, as long as it existed by the end of the period). The
 * end date is inclusive of the whole day.
 */
export function isTaskInPeriod(completion: TaskCompletion, filters?: KPIFilters): boolean {
    if (!completion.done || !completion.doneAt) return true;
    if (filters?.startDate && completion.doneAt < filters.startDate) return false;
    if (filters?.endDate && completion.doneAt >= addDays(filters.endDate, 1)) return false;
    return true;
}

function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
        .map((user) => {
            const completions = new Map(user.tasks.map((t) => [t.id, getTaskCompletion(t, bucketLookup)]));
            const completionOf = (t: TaskWithRelations) => completions.get(t.id)!;
            const tasks = user.tasks.filter((t) => isTaskInPeriod(completionOf(t), filters));
            const isDone = (t: TaskWithRelations) => completionOf(t).done;
            return { user, tasks, completionOf, isDone };
        })
        .filter(({ tasks }) => tasks.length > 0)
        .map(({ user, tasks, completionOf, isDone }) => {

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

            const reopenedTasks = tasks.filter((t) => completionOf(t).reopenCount > 0).length;

            // Average cycle time: start (or creation) until the task reached done
            const completedWithDates = tasks.filter(isDone);

            let avgCycleTimeDays: number | null = null;
            if (completedWithDates.length > 0) {
                const totalDays = completedWithDates.reduce((sum, task) => {
                    const start = task.start_date ? new Date(task.start_date) : new Date(task.created_at);
                    const end = completionOf(task).doneAt!;
                    const days = differenceInDays(end, start);
                    return sum + Math.max(0, days);
                }, 0);
                avgCycleTimeDays =
                    Math.round((totalDays / completedWithDates.length) * 10) / 10;
            }

            const activeDays = median(
                tasks
                    .filter(isDone)
                    .map((t) => completionOf(t).activeMs)
                    .filter((ms) => ms !== null)
            );
            const medianActiveDays = activeDays === null ? null : Math.round((activeDays / MS_PER_DAY) * 10) / 10;

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
                    median_active_days: medianActiveDays,
                    active_tasks: activeTasks,
                    unmapped_tasks: unmappedTasks,
                    reopened_tasks: reopenedTasks,
                    overdue_tasks: overdueTasks,
                    total_story_points: tasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0),
                    tasks_without_sp: tasks.filter((t) => t.story_points == null).length,
                    bucket_breakdown: bucketBreakdown,
                },
                tasks: tasks
                    .map((t) => {
                        const { done, doneAt, reopenCount, activeMs } = completionOf(t);

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
                            done_at: doneAt,
                            reopen_count: reopenCount,
                            active_ms: activeMs,
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
 * Build Prisma where clause for task filtering. The date range itself depends
 * on when a task reached done (from its history), so it's applied afterwards
 * with isTaskInPeriod — here we only drop tasks created after the period.
 */
export function buildTaskFilter(filters?: KPIFilters): Prisma.TaskWhereInput {
    if (!filters) return {};

    const where: Prisma.TaskWhereInput = {};

    if (filters.endDate) {
        where.created_at = { lt: addDays(filters.endDate, 1) };
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

    const [allTasks, lastSync] = await Promise.all([
        prisma.task.findMany({
            where: taskWhere,
            select: {
                project_number: true,
                status: true,
                story_points: true,
                created_at: true,
                closed_at: true,
                assignee_id: true,
                histories: {
                    select: { old_status: true, new_status: true, changed_at: true },
                    orderBy: { changed_at: "asc" },
                },
            },
        }),
        prisma.syncLog.findFirst({
            where: { status: "SUCCESS" },
            orderBy: { finished_at: "desc" },
        }),
    ]);

    const tasks = allTasks.filter((t) => isTaskInPeriod(getTaskCompletion(t, bucketLookup), filters));
    const activeUsers = new Set(tasks.map((t) => t.assignee_id).filter((id) => id !== null)).size;

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
