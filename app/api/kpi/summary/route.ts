import { NextResponse } from "next/server";
import { getDashboardSummary, getRepositories } from "@/lib/kpi-service";

export async function GET() {
    try {
        const [summary, repositories] = await Promise.all([
            getDashboardSummary(),
            getRepositories(),
        ]);

        return NextResponse.json({ summary, repositories }, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
