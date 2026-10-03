import {
    fetchGitHubProjectItems,
    parseStatusFromFieldValues,
    parseDateFromFieldValues,
    parseNumberFromFieldValues,
    SyncCancelledError,
} from "@/lib/github";
import {
    createSyncLog,
    updateSyncLog,
    updateSyncProgress,
    getRunningSyncLog,
    getTaskStatusMap,
    isSyncCancelRequested,
    getSyncLogStatus,
    upsertTask,
    upsertTaskLabels,
    syncTaskHistories,
    upsertUser,
} from "@/lib/repository";
import { PROJECTS, ProjectConfig } from "@/lib/projects";

/** Thrown when a sync is attempted while another one is still running. */
export class SyncAlreadyRunningError extends Error {
    runningSince: Date | null;
    totalItems: number;
    processedItems: number;
    stage: string | null;

    constructor(message: string, running: {
        started_at: Date;
        total_items: number;
        processed_items: number;
        current_stage: string | null;
    }) {
        super(message);
        this.name = "SyncAlreadyRunningError";
        this.runningSince = running.started_at;
        this.totalItems = running.total_items;
        this.processedItems = running.processed_items;
        this.stage = running.current_stage;
    }
}

/**
 * In-process mutex for this server instance. Complements the DB-level
 * RUNNING check below (which covers refreshes, multiple tabs, and multiple
 * server instances) by closing the race where two POSTs land at the same
 * time before either has written its RUNNING row.
 */
let inMemorySyncRunning = false;

/** A RUNNING row older than this is treated as stale (crashed) and failed. */
const STALE_RUNNING_MS = 30 * 60 * 1000;

/** Minimum gap between progress writes so we don't hammer the DB per item. */
const PROGRESS_WRITE_MIN_MS = 1000;

export interface SyncOptions {
    /**
     * Statuses to skip when the item is already stored with that same status
     * ("skip if unchanged"). New items and items whose status changed are
     * always synced, so e.g. a ticket moving into Done still gets its final
     * write — only the expensive re-save of untouched items is skipped.
     */
    skipStatuses?: string[];
}

async function syncOneProject(
    ownerLogin: string,
    project: ProjectConfig,
    ownerType: "user" | "organization",
    progressBase: { totalSoFar: number; processedSoFar: number },
    reportProgress: (
        update: { total_items?: number; processed_items?: number; current_stage?: string },
        force?: boolean
    ) => Promise<void>,
    options: SyncOptions = {},
    isCancelled: () => Promise<boolean> = async () => false
): Promise<{ title: string; itemsSynced: number; itemsSkipped: number; itemsTotal: number }> {
    let projectTotal: number | null = null;

    const projectData = await fetchGitHubProjectItems(
        ownerLogin,
        project.number,
        ownerType,
        (fetched, total) => {
            if (total !== null) projectTotal = total;
            // Don't await inside the fetch loop — fire and forget, the
            // throttled reporter drops writes that come too fast anyway.
            void reportProgress({
                total_items: progressBase.totalSoFar + (projectTotal ?? fetched),
                processed_items: progressBase.processedSoFar + fetched,
                current_stage: `Fetching ${project.label}: ${fetched}${projectTotal !== null ? ` of ${projectTotal}` : ""}…`,
            });
        },
        isCancelled
    );

    console.log(
        `[Sync] Fetched ${projectData.items.length} items from "${projectData.title}" (#${project.number})`
    );

    let itemsSynced = 0;
    let itemsSkipped = 0;

    // Lock in the now-known fetch total so the save phase can show
    // "Saving X of <total>" even before the first save lands.
    await reportProgress(
        {
            total_items: progressBase.totalSoFar + projectData.items.length,
            processed_items: progressBase.processedSoFar,
            current_stage: `Saving ${project.label}: 0 of ${projectData.items.length}…`,
        },
        true
    );

    // One batched read of stored statuses so the skip-if-unchanged check
    // below costs a single query per board instead of one per item.
    const skipSet = new Set(options.skipStatuses ?? []);
    const storedStatuses =
        skipSet.size > 0
            ? await getTaskStatusMap(
                project.number,
                projectData.items
                    .map((i) => i.content?.id)
                    .filter((id): id is string => !!id)
            )
            : new Map<string, string>();

    for (const item of projectData.items) {
        if (await isCancelled()) {
            throw new SyncCancelledError();
        }
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

        // Skip-if-unchanged: same status already stored means the status
        // histories derived from it are identical too, so the only thing a
        // re-save could update is labels — not worth 5+ writes per item.
        if (skipSet.has(taskStatus) && storedStatuses.get(content.id) === taskStatus) {
            itemsSkipped++;
            await reportProgress({
                processed_items: progressBase.processedSoFar + itemsSynced + itemsSkipped,
                current_stage: `Saving ${project.label}: ${itemsSynced + itemsSkipped} of ${projectData.items.length} (${itemsSkipped} skipped)…`,
            });
            continue;
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
        const savedOrSkipped = itemsSynced + itemsSkipped;
        await reportProgress({
            processed_items: progressBase.processedSoFar + savedOrSkipped,
            current_stage: `Saving ${project.label}: ${savedOrSkipped} of ${projectData.items.length}${itemsSkipped > 0 ? ` (${itemsSkipped} skipped)` : ""}…`,
        });
    }

    // Pin exact numbers for this project before moving on (the throttled
    // reporter may have dropped the final per-item write).
    await reportProgress(
        {
            total_items: progressBase.totalSoFar + projectData.items.length,
            processed_items: progressBase.processedSoFar + itemsSynced + itemsSkipped,
            current_stage: `Saving ${project.label}: ${itemsSynced + itemsSkipped} of ${projectData.items.length}${itemsSkipped > 0 ? ` (${itemsSkipped} skipped)` : ""}…`,
        },
        true
    );

    return { title: projectData.title, itemsSynced, itemsSkipped, itemsTotal: projectData.items.length };
}

/**
 * Main sync service: fetches every configured GitHub Project board (or just
 * one, if projectNumber is given) and saves their items to the database.
 * One board failing doesn't stop the others.
 *
 * Only one sync may run at a time — a second call while a sync is RUNNING
 * gets a SyncAlreadyRunningError (surfaced as HTTP 409). Progress is written
 * to the sync_logs row so a page refresh can pick it up by polling GET.
 */
export async function syncGitHubProject(
    projectNumber?: number,
    options: SyncOptions = {}
): Promise<{
    success: boolean;
    cancelled: boolean;
    message: string;
    items_synced: number;
    items_skipped: number;
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

    if (inMemorySyncRunning) {
        const running = await getRunningSyncLog();
        throw new SyncAlreadyRunningError(
            "A sync is already running. Please wait for it to finish.",
            running ?? {
                started_at: new Date(),
                total_items: 0,
                processed_items: 0,
                current_stage: null,
            }
        );
    }

    const running = await getRunningSyncLog();
    if (running) {
        const ageMs = Date.now() - new Date(running.started_at).getTime();
        if (ageMs > STALE_RUNNING_MS) {
            console.warn(
                `[Sync] Found stale RUNNING sync ${running.id} (started ${running.started_at}), marking FAILED so a new sync can start.`
            );
            await updateSyncLog(running.id, {
                status: "FAILED",
                message: "Marked as failed: sync did not finish in time (stale).",
            });
        } else {
            throw new SyncAlreadyRunningError(
                "A sync is already running. Please wait for it to finish.",
                running
            );
        }
    }

    inMemorySyncRunning = true;
    const syncLog = await createSyncLog({
        current_stage: "Starting…",
    });

    // Throttled progress writer — collapses rapid per-item updates into at
    // most one DB write per PROGRESS_WRITE_MIN_MS (plus forced writes).
    let lastWrite = 0;
    let pending: { total_items?: number; processed_items?: number; current_stage?: string } = {};
    const reportProgress = async (
        update: { total_items?: number; processed_items?: number; current_stage?: string },
        force = false
    ) => {
        pending = { ...pending, ...update };
        const now = Date.now();
        if (!force && now - lastWrite < PROGRESS_WRITE_MIN_MS) return;
        const toWrite = pending;
        pending = {};
        lastWrite = now;
        try {
            await updateSyncProgress(syncLog.id, toWrite);
        } catch (error) {
            console.warn("[Sync] Failed to write progress:", error);
        }
    };

    let itemsSynced = 0;
    let itemsSkipped = 0;
    let totalSoFar = 0;
    let processedSoFar = 0;
    const results: string[] = [];
    const failures: string[] = [];

    // Cooperative cancellation: the cancel endpoint flips
    // cancel_requested on the RUNNING row; this polls it at most once per
    // second no matter how often the loops ask.
    let cancelLastCheck = 0;
    let cancelSeen = false;
    const isCancelled = async (): Promise<boolean> => {
        if (cancelSeen) return true;
        const now = Date.now();
        if (now - cancelLastCheck < 1000) return false;
        cancelLastCheck = now;
        try {
            cancelSeen = await isSyncCancelRequested(syncLog.id);
        } catch {
            // Best effort — a failed check must never abort a healthy sync.
        }
        return cancelSeen;
    };

    try {
        for (const project of targetProjects) {
            try {
                console.log(`[Sync] Starting sync for ${ownerLogin} project #${project.number} (${project.label})`);
                await reportProgress(
                    { current_stage: `Starting ${project.label}…` },
                    true
                );
                const { title, itemsSynced: count, itemsSkipped: skipped, itemsTotal } = await syncOneProject(
                    ownerLogin,
                    project,
                    ownerType,
                    { totalSoFar, processedSoFar },
                    reportProgress,
                    options,
                    isCancelled
                );
                itemsSynced += count;
                itemsSkipped += skipped;
                totalSoFar += itemsTotal;
                processedSoFar += itemsTotal;
                results.push(
                    skipped > 0 ? `${count} from "${title}" (${skipped} skipped)` : `${count} from "${title}"`
                );
            } catch (error) {
                // Cancellation aborts the whole run, not just this board.
                if (error instanceof SyncCancelledError) throw error;
                const message = error instanceof Error ? error.message : "Unknown error";
                console.error(`[Sync] Error syncing project #${project.number} (${project.label}):`, message);
                failures.push(`${project.label}: ${message}`);
            }
        }

        const success = failures.length < targetProjects.length;
        const skipLabel = [...new Set(options.skipStatuses ?? [])].join(", ");
        const message = [
            results.length > 0 ? `Synced ${itemsSynced} items (${results.join(", ")})` : null,
            itemsSkipped > 0 ? `Skipped ${itemsSkipped} unchanged items in ${skipLabel}` : null,
            failures.length > 0 ? `Failed: ${failures.join("; ")}` : null,
        ].filter(Boolean).join(". ");

        // Don't overwrite a forced terminal status (e.g. user force-stopped
        // a stuck run while its last write was in flight).
        if ((await getSyncLogStatus(syncLog.id)) === "RUNNING") {
            await updateSyncLog(syncLog.id, {
                status: success ? "SUCCESS" : "FAILED",
                message,
                items_synced: itemsSynced,
                total_items: totalSoFar,
                processed_items: processedSoFar,
                current_stage: success ? "Done" : "Failed",
            });
        }

        console.log(`[Sync] Completed. ${message}`);

        if (!success) {
            throw new Error(message);
        }

        return { success, cancelled: false, message, items_synced: itemsSynced, items_skipped: itemsSkipped };
    } catch (error) {
        if (error instanceof SyncCancelledError) {
            const message = `Cancelled by user after syncing ${itemsSynced} items (partial results kept)`;
            console.log(`[Sync] ${message}.`);
            try {
                if ((await getSyncLogStatus(syncLog.id)) === "RUNNING") {
                    await updateSyncLog(syncLog.id, {
                        status: "CANCELLED",
                        message,
                        items_synced: itemsSynced,
                        total_items: totalSoFar,
                        processed_items: processedSoFar,
                        current_stage: "Cancelled",
                    });
                }
            } catch {
                // Best effort — the row may already be terminal.
            }
            return { success: false, cancelled: true, message, items_synced: itemsSynced, items_skipped: itemsSkipped };
        }
        // If we haven't already written a terminal status, mark FAILED so a
        // crashed sync never blocks future syncs forever.
        const latest = await getRunningSyncLog();
        if (latest?.id === syncLog.id) {
            try {
                await updateSyncLog(syncLog.id, {
                    status: "FAILED",
                    message: error instanceof Error ? error.message : "Unknown error",
                    items_synced: itemsSynced,
                    total_items: totalSoFar,
                    processed_items: processedSoFar,
                    current_stage: "Failed",
                });
            } catch {
                // Best effort — the original error is what matters.
            }
        }
        throw error;
    } finally {
        inMemorySyncRunning = false;
    }
}
