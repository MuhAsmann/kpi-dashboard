import { NextRequest, NextResponse } from "next/server";
import { syncGitHubProject } from "@/lib/sync-service";
import { getRecentSyncLogs } from "@/lib/repository";

export async function POST(request: NextRequest) {
    try {
        const result = await syncGitHubProject();
        return NextResponse.json(
            {
                success: true,
                message: result.message,
                items_synced: result.items_synced,
            },
            { status: 200 }
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        console.error("[API /sync/github-project] Error:", message);
        return NextResponse.json(
            { success: false, error: message },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    try {
        const logs = await getRecentSyncLogs();
        return NextResponse.json({ logs }, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
