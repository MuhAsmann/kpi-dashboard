import { NextRequest, NextResponse } from "next/server";
import { getDashboardSummary, getRepositories, KPIFilters } from "@/lib/kpi-service";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const filters: KPIFilters = {};

        const startDate = searchParams.get("start_date");
        const endDate = searchParams.get("end_date");
        const repository = searchParams.get("repository");
        const project = searchParams.get("project");

        if (startDate) filters.startDate = new Date(startDate);
        if (endDate) filters.endDate = new Date(endDate);
        if (repository) filters.repository = repository;
        if (project) filters.projectNumber = parseInt(project, 10);

        const [summary, repositories] = await Promise.all([
            getDashboardSummary(filters),
            getRepositories(filters.projectNumber),
        ]);

        return NextResponse.json({ summary, repositories }, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
