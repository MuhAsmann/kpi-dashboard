import {
    fetchGitHubProjectItems,
    parseStatusFromFieldValues,
    parseDateFromFieldValues,
    parseNumberFromFieldValues,
} from "@/lib/github";
import {
    createSyncLog,
    updateSyncLog,
    upsertTask,
    upsertTaskLabels,
    syncTaskHistories,
    upsertUser,
} from "@/lib/repository";
import { PROJECTS, ProjectConfig } from "@/lib/projects";

async function syncOneProject(
    ownerLogin: string,
    project: ProjectConfig,
    ownerType: "user" | "organization"
): Promise<{ title: string; itemsSynced: number }> {
    const projectData = await fetchGitHubProjectItems(ownerLogin, project.number, ownerType);

    console.log(
        `[Sync] Fetched ${projectData.items.length} items from "${projectData.title}" (#${project.number})`
    );

    let itemsSynced = 0;

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

        // Status is whatever the project's Status field says, verbatim — each
        // board defines its own columns, so we don't guess what they mean here.
        const taskStatus = parseStatusFromFieldValues(item.fieldValues);

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

        const startDateStr = parseDateFromFieldValues(item.fieldValues, ["start"]);
        const endDateStr = parseDateFromFieldValues(item.fieldValues, ["end", "due", "target"]);
        const storyPoints = parseNumberFromFieldValues(item.fieldValues, ["story", "point", "sp", "estimate", "size"]);

        // Upsert the task, scoped to this project board (the same issue can
        // be tracked on more than one board)
        const task = await upsertTask({
            github_issue_id: content.id,
            github_issue_number: content.number,
            title: content.title,
            body: content.body,
            url: content.url,
            created_at: new Date(content.createdAt!),
            closed_at: content.closedAt ? new Date(content.closedAt) : null,
            start_date: startDateStr ? new Date(startDateStr) : null,
            end_date: endDateStr ? new Date(endDateStr) : null,
            type: content.__typename === "PullRequest" ? "PullRequest" : "Issue",
            status: taskStatus,
            assignee_id: assigneeId,
            repository: content.repository?.nameWithOwner,
            project_number: project.number,
            project_title: projectData.title,
            story_points: storyPoints,
        });

        // Upsert labels
        const labels = content.labels?.nodes || [];
        await upsertTaskLabels(
            task.id,
            labels.map((l) => ({ name: l.name, color: l.color }))
        );

        // Sync histories from timeline items
        const timelineNodes = content.timelineItems?.nodes || [];
        const parsedHistories = timelineNodes
            .filter((n) => n.__typename === "ProjectV2ItemStatusChangedEvent")
            .map((n) => ({
                old_status: n.previousStatus || null,
                new_status: n.status || "Todo",
                changed_at: n.createdAt ? new Date(n.createdAt) : new Date(),
            }));

        await syncTaskHistories(task.id, parsedHistories);

        itemsSynced++;
    }

    return { title: projectData.title, itemsSynced };
}

/**
 * Main sync service: fetches every configured GitHub Project board (or just
 * one, if projectNumber is given) and saves their items to the database.
 * One board failing doesn't stop the others.
 */
export async function syncGitHubProject(projectNumber?: number): Promise<{
    success: boolean;
    message: string;
    items_synced: number;
}> {
    const ownerLogin = process.env.GITHUB_ORG_OR_USER;
    const ownerType = (process.env.GITHUB_OWNER_TYPE || "user") as
        | "user"
        | "organization";

    if (!ownerLogin) {
        throw new Error("GITHUB_ORG_OR_USER environment variable is not set");
    }

    const targetProjects = projectNumber
        ? PROJECTS.filter((p) => p.number === projectNumber)
        : PROJECTS;

    if (targetProjects.length === 0) {
        throw new Error(`Project #${projectNumber} is not configured`);
    }

    const syncLog = await createSyncLog();
    let itemsSynced = 0;
    const results: string[] = [];
    const failures: string[] = [];

    for (const project of targetProjects) {
        try {
            console.log(`[Sync] Starting sync for ${ownerLogin} project #${project.number} (${project.label})`);
            const { title, itemsSynced: count } = await syncOneProject(ownerLogin, project, ownerType);
            itemsSynced += count;
            results.push(`${count} from "${title}"`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            console.error(`[Sync] Error syncing project #${project.number} (${project.label}):`, message);
            failures.push(`${project.label}: ${message}`);
        }
    }

    const success = failures.length < targetProjects.length;
    const message = [
        results.length > 0 ? `Synced ${itemsSynced} items (${results.join(", ")})` : null,
        failures.length > 0 ? `Failed: ${failures.join("; ")}` : null,
    ].filter(Boolean).join(". ");

    await updateSyncLog(syncLog.id, {
        status: success ? "SUCCESS" : "FAILED",
        message,
        items_synced: itemsSynced,
    });

    console.log(`[Sync] Completed. ${message}`);

    if (!success) {
        throw new Error(message);
    }

    return { success, message, items_synced: itemsSynced };
}
