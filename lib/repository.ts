import { prisma } from "@/lib/prisma";
import { Task, TaskStatus, User } from "@prisma/client";

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
    status: TaskStatus;
    assignee_id?: string | null;
    repository?: string | null;
    project_title?: string | null;
}): Promise<Task> {
    return prisma.task.upsert({
        where: { github_issue_id: data.github_issue_id },
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
            project_title: data.project_title,
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
