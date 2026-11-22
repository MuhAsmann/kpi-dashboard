import { NextRequest, NextResponse } from "next/server";
import {
    syncGitHubProjectFiltered,
    SyncAlreadyRunningError,
    type FilteredSyncStrategy,
} from "@/lib/sync-service";
import { PROJECTS } from "@/lib/projects";

/**
 * Optional filtered sync. The default full sync stays on
 * POST /api/sync/github-project and is intentionally untouched.
 *
 * Body:
 *   { project?: number, start_date: "YYYY-MM-DD", strategy?: "probe" | "updated" }
 *
 * `start_date` is the lower bound for the item's LAST UPDATE time (not its
 * created_at), interpreted as 00:00 Asia/Jakarta.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json().catch(() => ({}));

        const startDate =
            typeof body?.start_date === "string" ? body.start_date.trim() : "";

        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
            return NextResponse.json(
                { success: false, error: "start_date is required and must be YYYY-MM-DD" },
                { status: 400 }
            );
        }

        const [year, month, day] = startDate.split("-").map(Number);
        const check = new Date(Date.UTC(year, month - 1, day));
        if (
            check.getUTCFullYear() !== year ||
            check.getUTCMonth() !== month - 1 ||
            check.getUTCDate() !== day
        ) {
            return NextResponse.json(
                { success: false, error: "start_date is not a valid calendar date" },
                { status: 400 }
            );
        }

        // Compare in WIB so "today" means the user's today, not UTC's.
        const todayWIB = new Date(Date.now() + 7 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);
        if (startDate > todayWIB) {
            return NextResponse.json(
                { success: false, error: "start_date cannot be in the future" },
                { status: 400 }
            );
        }

        const rawStrategy = body?.strategy ?? "probe";
        if (rawStrategy !== "probe" && rawStrategy !== "updated") {
            return NextResponse.json(
                { success: false, error: "strategy must be \"probe\" or \"updated\"" },
                { status: 400 }
            );
        }
        const strategy = rawStrategy as FilteredSyncStrategy;

        const rawProject = body?.project;
        if (rawProject !== undefined && typeof rawProject !== "number") {
            return NextResponse.json(
                { success: false, error: "project must be a number when provided" },
                { status: 400 }
            );
        }
        const projectNumber = rawProject as number | undefined;
        if (
            projectNumber !== undefined &&
            !PROJECTS.some((project) => project.number === projectNumber)
        ) {
            return NextResponse.json(
                { success: false, error: `Project #${projectNumber} is not configured` },
                { status: 400 }
            );
        }

        const result = await syncGitHubProjectFiltered({
            projectNumber,
            startDate,
            strategy,
        });

        if (result.cancelled) {
            return NextResponse.json(
                {
                    success: false,
                    cancelled: true,
                    strategy: result.strategy,
                    start_date: result.start_date,
                    items_scanned: result.items_scanned,
                    items_changed: result.items_changed,
                    items_synced: result.items_synced,
                    message: result.message,
                },
                { status: 200 }
            );
        }

        return NextResponse.json(
            {
                success: true,
                strategy: result.strategy,
                start_date: result.start_date,
                since_utc: result.since_utc,
                items_scanned: result.items_scanned,
                items_changed: result.items_changed,
                items_synced: result.items_synced,
                message: result.message,
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
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("[API /sync/github-project/filtered] Error:", message);
        return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
