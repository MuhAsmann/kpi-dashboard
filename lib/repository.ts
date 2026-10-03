import { prisma } from "@/lib/prisma";
import { Task, User } from "@prisma/client";

// ============ USER REPOSITORY ============

export async function upsertUser(data: {
    github_login: string;
    name?: string | null;
    avatar_url?: string | null;
}): Promise<User> {
    return prisma.user.upsert({
        where: { github_login: data.github_login },
        update: {
            name: data.name,
            avatar_url: data.avatar_url,
        },
        create: {
            github_login: data.github_login,
            name: data.name,
            avatar_url: data.avatar_url,
        },
    });
}

export async function getAllUsers(): Promise<User[]> {
    return prisma.user.findMany({
        orderBy: { github_login: "asc" },
    });
}

// ============ TASK REPOSITORY ============

export async function upsertTask(data: {
    github_issue_id: string;
    github_issue_number?: number | null;
    title: string;
    body?: string | null;
    url?: string | null;
    created_at: Date;
    closed_at?: Date | null;
    start_date?: Date | null;
    end_date?: Date | null;
    type?: string | null;
    status: string;
    assignee_id?: string | null;
    repository?: string | null;
    project_number: number;
    project_title?: string | null;
    story_points?: number | null;
}): Promise<Task> {
    return prisma.task.upsert({
        where: {
            github_issue_id_project_number: {
                github_issue_id: data.github_issue_id,
                project_number: data.project_number,
            },
        },
        update: {
            title: data.title,
            body: data.body,
            url: data.url,
            closed_at: data.closed_at,
            start_date: data.start_date,
            end_date: data.end_date,
            type: data.type,
            status: data.status,
            assignee_id: data.assignee_id,
            repository: data.repository,
            project_title: data.project_title,
            story_points: data.story_points,
        },
        create: {
            github_issue_id: data.github_issue_id,
            github_issue_number: data.github_issue_number,
            title: data.title,
            body: data.body,
            url: data.url,
            created_at: data.created_at,
            closed_at: data.closed_at,
            start_date: data.start_date,
            end_date: data.end_date,
            type: data.type,
            status: data.status,
            assignee_id: data.assignee_id,
            repository: data.repository,
            project_number: data.project_number,
            project_title: data.project_title,
            story_points: data.story_points,
        },
    });
}

export async function upsertTaskLabels(
    taskId: string,
    labels: Array<{ name: string; color?: string }>
): Promise<void> {
    // Delete old labels that are no longer present
    const labelNames = labels.map((l) => l.name);
    await prisma.taskLabel.deleteMany({
        where: { task_id: taskId, name: { notIn: labelNames } },
    });

    // Upsert new labels
    for (const label of labels) {
        await prisma.taskLabel.upsert({
            where: { task_id_name: { task_id: taskId, name: label.name } },
            update: { color: label.color },
            create: { task_id: taskId, name: label.name, color: label.color },
        });
    }
}

export async function syncTaskHistories(
    taskId: string,
    histories: Array<{
        old_status: string | null;
        new_status: string;
        changed_at: Date;
    }>
): Promise<void> {
    // Since we fetch the full timeline from GitHub, we can just replace the existing histories for this task
    await prisma.taskHistory.deleteMany({
        where: { task_id: taskId },
    });

    if (histories.length > 0) {
        await prisma.taskHistory.createMany({
            data: histories.map((h) => ({
                task_id: taskId,
                old_status: h.old_status,
                new_status: h.new_status,
                changed_at: h.changed_at,
            })),
        });
    }
}

export async function getAllTasksWithRelations() {
    return prisma.task.findMany({
        include: {
            assignee: true,
            labels: true,
        },
        orderBy: { created_at: "desc" },
    });
}

// ============ SYNC LOG REPOSITORY ============

export async function createSyncLog(data?: {
    total_items?: number;
    current_stage?: string;
}) {
    return prisma.syncLog.create({
        data: {
            status: "RUNNING",
            total_items: data?.total_items ?? 0,
            processed_items: 0,
            current_stage: data?.current_stage ?? "Starting…",
        },
    });
}

export async function updateSyncLog(
    id: string,
    data: {
        status: "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";
        message?: string;
        items_synced?: number;
        total_items?: number;
        processed_items?: number;
        current_stage?: string | null;
        finished_at?: Date;
    }
) {
    const { status, ...rest } = data;
    return prisma.syncLog.update({
        where: { id },
        data: {
            ...rest,
            status,
            // Only stamp finished_at once the sync leaves RUNNING.
            finished_at:
                status === "RUNNING" ? undefined : (data.finished_at ?? new Date()),
        },
    });
}

/** Live progress write during a sync (stays RUNNING). */
export async function updateSyncProgress(
    id: string,
    data: {
        total_items?: number;
        processed_items?: number;
        current_stage?: string;
    }
) {
    return prisma.syncLog.update({
        where: { id },
        data,
    });
}

export async function getRunningSyncLog() {
    return prisma.syncLog.findFirst({
        where: { status: "RUNNING" },
        orderBy: { started_at: "desc" },
    });
}

/**
 * Batch lookup of already-stored statuses for one board, used by the
 * skip-if-unchanged sync optimization. Chunked so very large boards don't
 * blow up a single `IN (...)` query.
 */
export async function getTaskStatusMap(
    projectNumber: number,
    githubIssueIds: string[]
): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const CHUNK = 1000;
    for (let i = 0; i < githubIssueIds.length; i += CHUNK) {
        const rows = await prisma.task.findMany({
            where: {
                project_number: projectNumber,
                github_issue_id: { in: githubIssueIds.slice(i, i + CHUNK) },
            },
            select: { github_issue_id: true, status: true },
        });
        for (const r of rows) map.set(r.github_issue_id, r.status);
    }
    return map;
}

export async function getLatestSyncLog() {
    return prisma.syncLog.findFirst({
        orderBy: { started_at: "desc" },
    });
}

/**
 * Ask a RUNNING sync to stop. Only touches rows still RUNNING, so a sync
 * that finished in the meantime keeps its terminal status — returns the
 * number of rows flagged (0 = nothing to cancel).
 */
export async function requestSyncCancel(id: string): Promise<number> {
    const result = await prisma.syncLog.updateMany({
        where: { id, status: "RUNNING" },
        data: { cancel_requested: true },
    });
    return result.count;
}

export async function isSyncCancelRequested(id: string): Promise<boolean> {
    const row = await prisma.syncLog.findUnique({
        where: { id },
        select: { cancel_requested: true },
    });
    return row?.cancel_requested ?? false;
}

/** Current status of one sync row (used to avoid overwriting a forced outcome). */
export async function getSyncLogStatus(id: string): Promise<string | null> {
    const row = await prisma.syncLog.findUnique({
        where: { id },
        select: { status: true },
    });
    return row?.status ?? null;
}

export async function getRecentSyncLogs() {
    return prisma.syncLog.findMany({
        orderBy: { started_at: "desc" },
        take: 10,
    });
}
