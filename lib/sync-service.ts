import { TaskStatus } from "@prisma/client";
import {
    fetchGitHubProjectItems,
    parseStatusFromFieldValues,
} from "@/lib/github";
import {
    createSyncLog,
    updateSyncLog,
    upsertTask,
    upsertTaskLabels,
    upsertUser,
} from "@/lib/repository";

/**
 * Map GitHub status string to Prisma TaskStatus enum
 */
function mapStatusToEnum(statusStr: string): TaskStatus {
    const normalized = statusStr.toLowerCase().replace(/[\s_-]/g, "");
    if (normalized.includes("done") || normalized.includes("complete") || normalized.includes("closed")) {
        return "DONE";
    }
    if (
        normalized.includes("inprogress") ||
        normalized.includes("progress") ||
        normalized.includes("doing") ||
        normalized.includes("wip")
    ) {
        return "IN_PROGRESS";
    }
    if (normalized.includes("cancel")) {
        return "CANCELLED";
    }
    return "TODO";
}

/**
 * Main sync service: fetches GitHub Project data and saves to database
 */
export async function syncGitHubProject(): Promise<{
    success: boolean;
    message: string;
    items_synced: number;
}> {
    const ownerLogin = process.env.GITHUB_ORG_OR_USER;
    const projectNumber = parseInt(process.env.GITHUB_PROJECT_NUMBER || "1", 10);
    const ownerType = (process.env.GITHUB_OWNER_TYPE || "user") as
        | "user"
        | "organization";

    if (!ownerLogin) {
        throw new Error("GITHUB_ORG_OR_USER environment variable is not set");
    }

    const syncLog = await createSyncLog();
    let itemsSynced = 0;

    try {
        console.log(
            `[Sync] Starting sync for ${ownerLogin} project #${projectNumber}`
        );

        const projectData = await fetchGitHubProjectItems(
            ownerLogin,
            projectNumber,
            ownerType
        );

        console.log(
            `[Sync] Fetched ${projectData.items.length} items from "${projectData.title}"`
        );

        for (const item of projectData.items) {
            // Only process Issue and PullRequest types
            if (
                !item.content ||
                (item.content.__typename !== "Issue" &&
                    item.content.__typename !== "PullRequest")
            ) {
                continue;
            }

            const content = item.content;

            if (!content.id || !content.title) continue;

            // Parse status from project field values (Status field in GitHub Project)
            const rawStatus = parseStatusFromFieldValues(item.fieldValues);

            // Fallback: if issue is closed, mark as DONE
            let taskStatus: TaskStatus;
            if (content.state === "CLOSED" || content.closedAt) {
                taskStatus = "DONE";
            } else {
                taskStatus = mapStatusToEnum(rawStatus);
            }

            // Process assignees (take first assignee as primary)
            const assigneeNodes = content.assignees?.nodes || [];
            let assigneeId: string | null = null;

            if (assigneeNodes.length > 0) {
                const primaryAssignee = assigneeNodes[0];
                const user = await upsertUser({
                    github_login: primaryAssignee.login,
                    name: primaryAssignee.name || primaryAssignee.login,
                    avatar_url: primaryAssignee.avatarUrl,
                });
                assigneeId = user.id;
            }

            // Upsert the task
            const task = await upsertTask({
                github_issue_id: content.id,
                github_issue_number: content.number,
                title: content.title,
                body: content.body,
                url: content.url,
                created_at: new Date(content.createdAt!),
                closed_at: content.closedAt ? new Date(content.closedAt) : null,
                status: taskStatus,
                assignee_id: assigneeId,
                repository: content.repository?.nameWithOwner,
                project_title: projectData.title,
            });

            // Upsert labels
            const labels = content.labels?.nodes || [];
            await upsertTaskLabels(
                task.id,
                labels.map((l) => ({ name: l.name, color: l.color }))
            );

            // Handle multiple assignees - assign remaining to same task (we store primary only)
            // If you want to support multiple assignees per task, you'd need a join table

            itemsSynced++;
        }

        await updateSyncLog(syncLog.id, {
            status: "SUCCESS",
            message: `Successfully synced ${itemsSynced} items from project "${projectData.title}"`,
            items_synced: itemsSynced,
        });

        console.log(`[Sync] Completed. Synced ${itemsSynced} items.`);

        return {
            success: true,
            message: `Synced ${itemsSynced} items from "${projectData.title}"`,
            items_synced: itemsSynced,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[Sync] Error:", message);

        await updateSyncLog(syncLog.id, {
            status: "FAILED",
            message,
            items_synced: itemsSynced,
        });

        throw error;
    }
}
