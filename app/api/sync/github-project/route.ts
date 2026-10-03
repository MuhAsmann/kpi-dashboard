import { NextRequest, NextResponse } from "next/server";
import { syncGitHubProject, SyncAlreadyRunningError } from "@/lib/sync-service";
import { getRecentSyncLogs, getRunningSyncLog } from "@/lib/repository";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));
        const projectNumber = typeof body?.project === "number" ? body.project : undefined;
        const skipStatuses = Array.isArray(body?.skipStatuses)
            ? body.skipStatuses.filter((s: unknown): s is string => typeof s === "string")
            : undefined;
        const result = await syncGitHubProject(projectNumber, { skipStatuses });
        if (result.cancelled) {
            return NextResponse.json(
                {
                    success: false,
                    cancelled: true,
                    message: result.message,
                    items_synced: result.items_synced,
                    items_skipped: result.items_skipped,
                },
                { status: 200 }
            );
        }
        return NextResponse.json(
            {
                success: true,
                message: result.message,
                items_synced: result.items_synced,
                items_skipped: result.items_skipped,
            },
            { status: 200 }
        );
    } catch (error) {
        if (error instanceof SyncAlreadyRunningError) {
            return NextResponse.json(
                {
                    success: false,
                    error: error.message,
                    already_running: true,
                    running_since: error.runningSince,
                    total_items: error.totalItems,
                    processed_items: error.processedItems,
                    current_stage: error.stage,
                },
                { status: 409 }
            );
        }
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        console.error("[API /sync/github-project] Error:", message);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}

export async function GET() {
    try {
        const [logs, running] = await Promise.all([
            getRecentSyncLogs(),
            getRunningSyncLog(),
        ]);
        return NextResponse.json({ logs, running }, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
