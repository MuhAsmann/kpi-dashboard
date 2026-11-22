import {
    fetchGitHubProjectItems,
    fetchProjectItemRefs,
    fetchProjectItemsByIds,
    topUpProjectItemTimelines,
    parseStatusFromFieldValues,
    parseDateFromFieldValues,
    parseNumberFromFieldValues,
    SyncCancelledError,
    type GitHubProjectItem,
    type GitHubProjectItemRef,
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

// ============================================================================
// FILTERED SYNC (OPTIONAL, SEPARATE ENDPOINT)
//
// Everything below is additive: the full-sync path above (syncGitHubProject /
// syncOneProject) is intentionally untouched. This flow is only used by
// POST /api/sync/github-project/filtered.
// ============================================================================

export type FilteredSyncStrategy = "probe" | "updated";

export interface FilteredSyncOptions {
    projectNumber?: number;
    /** YYYY-MM-DD, interpreted as 00:00 Asia/Jakarta (UTC+7). */
    startDate: string;
    strategy: FilteredSyncStrategy;
}

export interface FilteredSyncResult {
    success: boolean;
    cancelled: boolean;
    strategy: FilteredSyncStrategy;
    start_date: string;
    since_utc: string;
    items_scanned: number;
    items_changed: number;
    items_synced: number;
    message: string;
}

interface ProgressUpdate {
    total_items?: number;
    processed_items?: number;
    current_stage?: string;
}

type ProgressReporter = (update: ProgressUpdate, force?: boolean) => Promise<void>;

function startOfWIBDate(startDate: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw new Error(`Invalid start_date: ${startDate}`);
    }
    const [year, month, day] = startDate.split("-").map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ) {
        throw new Error(`Invalid start_date: ${startDate}`);
    }
    return new Date(`${startDate}T00:00:00+07:00`);
}

function ymdUTC(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function selectChangedRefs(
    refs: GitHubProjectItemRef[],
    sinceUtc: Date
): GitHubProjectItemRef[] {
    const sinceMs = sinceUtc.getTime();
    return refs.filter((ref) => {
        if (!ref.content) return false;
        if (ref.content.__typename !== "Issue" && ref.content.__typename !== "PullRequest") {
            return false;
        }
        const itemMs = Date.parse(ref.updatedAt);
        const contentMs = ref.content.updatedAt ? Date.parse(ref.content.updatedAt) : 0;
        // Unknown timestamps are included to be safe (over-fetch, never miss).
        if (!Number.isFinite(itemMs) && !Number.isFinite(contentMs)) return true;
        return (
            Math.max(
                Number.isFinite(itemMs) ? itemMs : 0,
                Number.isFinite(contentMs) ? contentMs : 0
            ) >= sinceMs
        );
    });
}

function createProgressReporter(syncLogId: string): ProgressReporter {
    let lastWrite = 0;
    let pending: ProgressUpdate = {};
    return async (update, force = false) => {
        pending = { ...pending, ...update };
        const now = Date.now();
        if (!force && now - lastWrite < PROGRESS_WRITE_MIN_MS) return;
        const toWrite = pending;
        pending = {};
        lastWrite = now;
        try {
            await updateSyncProgress(syncLogId, toWrite);
        } catch (error) {
            console.warn("[FilteredSync] Failed to write progress:", error);
        }
    };
}

function createCancellationChecker(syncLogId: string): () => Promise<boolean> {
    let lastCheck = 0;
    let seen = false;
    return async () => {
        if (seen) return true;
        const now = Date.now();
        if (now - lastCheck < 1000) return false;
        lastCheck = now;
        try {
            seen = await isSyncCancelRequested(syncLogId);
        } catch {
            // Best effort — a failed check must never abort a healthy sync.
        }
        return seen;
    };
}

/**
 * Save path for the filtered flow. Mirrors syncOneProject's per-item writes
 * without its skip-if-unchanged branch (every item here was selected because
 * it changed) and without touching the full-sync function.
 */
async function persistProjectItemsFiltered(
    project: ProjectConfig,
    projectTitle: string,
    items: GitHubProjectItem[],
    progressBase: { totalSoFar: number; processedSoFar: number },
    reportProgress: ProgressReporter,
    isCancelled: () => Promise<boolean>
): Promise<{ itemsSynced: number; itemsTotal: number }> {
    let itemsSynced = 0;

    await reportProgress(
        {
            total_items: progressBase.totalSoFar + items.length,
            processed_items: progressBase.processedSoFar,
            current_stage: `Saving ${project.label}: 0 of ${items.length}…`,
        },
        true
    );

    for (const item of items) {
        if (await isCancelled()) throw new SyncCancelledError();
        if (
            !item.content ||
            (item.content.__typename !== "Issue" && item.content.__typename !== "PullRequest")
        ) {
            continue;
        }

        const content = item.content;
        if (!content.id || !content.title) continue;

        const taskStatus = parseStatusFromFieldValues(item.fieldValues);

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
        const storyPoints = parseNumberFromFieldValues(item.fieldValues, [
            "story",
            "point",
            "sp",
            "estimate",
            "size",
        ]);

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
            project_title: projectTitle,
            story_points: storyPoints,
        });

        const labels = content.labels?.nodes || [];
        await upsertTaskLabels(
            task.id,
            labels.map((l) => ({ name: l.name, color: l.color }))
        );

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
        await reportProgress({
            total_items: progressBase.totalSoFar + items.length,
            processed_items: progressBase.processedSoFar + itemsSynced,
            current_stage: `Saving ${project.label}: ${itemsSynced} of ${items.length}…`,
        });
    }

    await reportProgress(
        {
            total_items: progressBase.totalSoFar + items.length,
            processed_items: progressBase.processedSoFar + itemsSynced,
            current_stage: `Saving ${project.label}: ${itemsSynced} of ${items.length}…`,
        },
        true
    );

    return { itemsSynced, itemsTotal: items.length };
}

async function syncOneProjectFiltered(
    ownerLogin: string,
    project: ProjectConfig,
    ownerType: "user" | "organization",
    sinceUtc: Date,
    strategy: FilteredSyncStrategy,
    progressBase: { totalSoFar: number; processedSoFar: number },
    reportProgress: ProgressReporter,
    isCancelled: () => Promise<boolean>
): Promise<{
    title: string;
    itemsScanned: number;
    itemsChanged: number;
    itemsSynced: number;
    itemsTotal: number;
}> {
    if (strategy === "probe") {
        const scan = await fetchProjectItemRefs(
            ownerLogin,
            project.number,
            ownerType,
            (fetched, total) => {
                void reportProgress({
                    total_items: progressBase.totalSoFar + (total ?? fetched),
                    processed_items: progressBase.processedSoFar + fetched,
                    current_stage: `Scanning ${project.label}: ${fetched}${total !== null ? ` of ${total}` : ""}…`,
                });
            },
            isCancelled
        );

        const selected = selectChangedRefs(scan.refs, sinceUtc);

        await reportProgress(
            {
                total_items: progressBase.totalSoFar + selected.length,
                processed_items: progressBase.processedSoFar,
                current_stage: `Fetching details ${project.label}: 0 of ${selected.length}…`,
            },
            true
        );

        const items = await fetchProjectItemsByIds(
            selected.map((ref) => ref.id),
            (fetched, total) => {
                void reportProgress({
                    total_items: progressBase.totalSoFar + total,
                    processed_items: progressBase.processedSoFar + fetched,
                    current_stage: `Fetching details ${project.label}: ${fetched} of ${total}…`,
                });
            },
            isCancelled
        );

        await topUpProjectItemTimelines(items, isCancelled);
        const { itemsSynced, itemsTotal } = await persistProjectItemsFiltered(
            project,
            scan.title,
            items,
            progressBase,
            reportProgress,
            isCancelled
        );

        return {
            title: scan.title,
            itemsScanned: scan.total,
            itemsChanged: selected.length,
            itemsSynced,
            itemsTotal,
        };
    }

    // `sinceUtc` is 00:00 WIB, which is the previous UTC day. Using its UTC
    // date as the filter lower bound is exactly "start_date - 1 day" and
    // keeps the boundary safe without relying on a timezone assumption.
    const filterDate = ymdUTC(sinceUtc);
    const data = await fetchGitHubProjectItems(
        ownerLogin,
        project.number,
        ownerType,
        (fetched, total) => {
            void reportProgress({
                total_items: progressBase.totalSoFar + (total ?? fetched),
                processed_items: progressBase.processedSoFar + fetched,
                current_stage: `Fetching ${project.label} (updated ≥ ${filterDate}): ${fetched}${total !== null ? ` of ${total}` : ""}…`,
            });
        },
        isCancelled,
        { filter: `updated:>=${filterDate}` }
    );

    await topUpProjectItemTimelines(data.items, isCancelled);
    const { itemsSynced, itemsTotal } = await persistProjectItemsFiltered(
        project,
        data.title,
        data.items,
        progressBase,
        reportProgress,
        isCancelled
    );

    return {
        title: data.title,
        itemsScanned: data.items.length,
        itemsChanged: data.items.length,
        itemsSynced,
        itemsTotal,
    };
}

/**
 * Optional filtered sync. The full sync endpoint/function above is not used or
 * modified by this path; both share the same in-process + DB RUNNING lock.
 */
export async function syncGitHubProjectFiltered(
    options: FilteredSyncOptions
): Promise<FilteredSyncResult> {
    const ownerLogin = process.env.GITHUB_ORG_OR_USER;
    const ownerType = (process.env.GITHUB_OWNER_TYPE || "user") as "user" | "organization";

    if (!ownerLogin) {
        throw new Error("GITHUB_ORG_OR_USER environment variable is not set");
    }

    const sinceUtc = startOfWIBDate(options.startDate);

    const targetProjects =
        options.projectNumber !== undefined
            ? PROJECTS.filter((p) => p.number === options.projectNumber)
            : PROJECTS;

    if (targetProjects.length === 0) {
        throw new Error(`Project #${options.projectNumber} is not configured`);
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
                `[FilteredSync] Found stale RUNNING sync ${running.id} (started ${running.started_at}), marking FAILED so a new sync can start.`
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
    let syncLog: Awaited<ReturnType<typeof createSyncLog>>;
    try {
        syncLog = await createSyncLog({
            current_stage: `Filtered sync (${options.strategy}) since ${options.startDate}…`,
        });
    } catch (error) {
        inMemorySyncRunning = false;
        throw error;
    }

    const reportProgress = createProgressReporter(syncLog.id);
    const isCancelled = createCancellationChecker(syncLog.id);

    let itemsScanned = 0;
    let itemsChanged = 0;
    let itemsSynced = 0;
    let totalSoFar = 0;
    let processedSoFar = 0;
    const results: string[] = [];
    const failures: string[] = [];

    try {
        for (const project of targetProjects) {
            try {
                console.log(
                    `[FilteredSync] Starting ${options.strategy} for ${ownerLogin} project #${project.number} (${project.label}) since ${options.startDate}`
                );
                await reportProgress({ current_stage: `Starting ${project.label}…` }, true);
                const result = await syncOneProjectFiltered(
                    ownerLogin,
                    project,
                    ownerType,
                    sinceUtc,
                    options.strategy,
                    { totalSoFar, processedSoFar },
                    reportProgress,
                    isCancelled
                );
                itemsScanned += result.itemsScanned;
                itemsChanged += result.itemsChanged;
                itemsSynced += result.itemsSynced;
                totalSoFar += result.itemsTotal;
                processedSoFar += result.itemsSynced;
                results.push(
                    `${result.itemsSynced} from "${result.title}" (${result.itemsChanged} changed)`
                );
            } catch (error) {
                if (error instanceof SyncCancelledError) throw error;
                const message = error instanceof Error ? error.message : "Unknown error";
                console.error(
                    `[FilteredSync] Error syncing project #${project.number} (${project.label}):`,
                    message
                );
                failures.push(`${project.label}: ${message}`);
            }
        }

        const success = failures.length < targetProjects.length;
        const message = [
            results.length > 0
                ? `Filtered sync ${itemsSynced} items (${results.join(", ")})`
                : null,
            `strategy ${options.strategy} since ${options.startDate}`,
            failures.length > 0 ? `Failed: ${failures.join("; ")}` : null,
        ]
            .filter(Boolean)
            .join(". ");

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

        console.log(`[FilteredSync] Completed. ${message}`);

        if (!success) {
            throw new Error(message);
        }

        return {
            success,
            cancelled: false,
            strategy: options.strategy,
            start_date: options.startDate,
            since_utc: sinceUtc.toISOString(),
            items_scanned: itemsScanned,
            items_changed: itemsChanged,
            items_synced: itemsSynced,
            message,
        };
    } catch (error) {
        if (error instanceof SyncCancelledError) {
            const message = `Cancelled by user after syncing ${itemsSynced} items (partial results kept)`;
            console.log(`[FilteredSync] ${message}.`);
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
            return {
                success: false,
                cancelled: true,
                strategy: options.strategy,
                start_date: options.startDate,
                since_utc: sinceUtc.toISOString(),
                items_scanned: itemsScanned,
                items_changed: itemsChanged,
                items_synced: itemsSynced,
                message,
            };
        }

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
