import { NextResponse } from "next/server";
import { getRunningSyncLog, requestSyncCancel, updateSyncLog } from "@/lib/repository";

/**
 * Ask the currently-running sync to stop. Cooperative: the sync loop polls
 * cancel_requested about once a second and aborts at the next check, so
 * expect a short delay before the RUNNING row disappears.
 *
 * If the worker is dead (server restart/crash mid-sync) it will never honor
 * the flag. Repeated calls therefore act as a dead-sync reaper: when the
 * row shows zero progress for FORCE_AFTER_MS after the first request, the
 * row is marked CANCELLED directly so it stops blocking new syncs.
 */
const FORCE_AFTER_MS = 30_000;

interface Watch {
    flaggedAt: number;
    processed: number;
    total: number;
}

const cancelWatch = new Map<string, Watch>();

export async function POST() {
    try {
        const running = await getRunningSyncLog();
        if (!running) {
            return NextResponse.json(
                { success: false, error: "No sync is currently running." },
                { status: 404 }
            );
        }
        const flagged = await requestSyncCancel(running.id);
        if (flagged === 0) {
            // Finished between the lookup and the flag write.
            return NextResponse.json(
                { success: false, error: "The sync already finished." },
                { status: 409 }
            );
        }

        const now = Date.now();
        const watch = cancelWatch.get(running.id);
        if (
            watch &&
            now - watch.flaggedAt > FORCE_AFTER_MS &&
            running.processed_items === watch.processed &&
            running.total_items === watch.total
        ) {
            // Flagged a while ago and the worker hasn't moved since — dead.
            cancelWatch.delete(running.id);
            await updateSyncLog(running.id, {
                status: "CANCELLED",
                message: "Cancelled by user (sync worker was unresponsive; marked as cancelled).",
                items_synced: running.items_synced,
                total_items: running.total_items,
                processed_items: running.processed_items,
                current_stage: "Cancelled",
            });
            return NextResponse.json(
                {
                    success: true,
                    forced: true,
                    message: "Sync was unresponsive and has been marked as cancelled.",
                },
                { status: 200 }
            );
        }

        cancelWatch.set(running.id, {
            flaggedAt: watch?.flaggedAt ?? now,
            processed: running.processed_items,
            total: running.total_items,
        });
        return NextResponse.json(
            { success: true, message: "Cancellation requested. The sync will stop shortly." },
            { status: 200 }
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
