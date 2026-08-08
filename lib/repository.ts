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

export async function createSyncLog() {
    return prisma.syncLog.create({
        data: {
            status: "RUNNING",
        },
    });
}

export async function updateSyncLog(
    id: string,
    data: {
        status: "SUCCESS" | "FAILED";
        message?: string;
        items_synced?: number;
        finished_at?: Date;
    }
) {
    return prisma.syncLog.update({
        where: { id },
        data: {
            ...data,
            finished_at: data.finished_at ?? new Date(),
        },
    });
}

export async function getRecentSyncLogs() {
    return prisma.syncLog.findMany({
        orderBy: { started_at: "desc" },
        take: 10,
    });
}
