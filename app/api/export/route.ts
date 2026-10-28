import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildTaskFilter, getTaskCompletion, isTaskInPeriod, KPIFilters } from "@/lib/kpi-service";
import { getBucketLookup, lookupBucket } from "@/lib/status-mapping";
import { computeStatusVisits, formatDuration, summarizeStatusVisits } from "@/lib/task-history";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        const startDateStr = searchParams.get("start_date");
        const endDateStr = searchParams.get("end_date");
        const repositories = searchParams.getAll("repository");
        const project = searchParams.get("project");

        const filters: KPIFilters = {};
        if (startDateStr) filters.startDate = new Date(startDateStr);
        if (endDateStr) filters.endDate = new Date(endDateStr);
        if (repositories.length) filters.repository = repositories;
        if (project) filters.projectNumber = parseInt(project, 10);

        const where = buildTaskFilter(filters);

        const [allTasks, bucketLookup] = await Promise.all([
            prisma.task.findMany({
                where,
                include: {
                    assignee: true,
                    labels: true,
                    histories: { orderBy: { changed_at: "asc" } },
                },
                orderBy: { created_at: "desc" },
            }),
            getBucketLookup(),
        ]);

        // Same period rule as the dashboard: finished in range, or still open.
        const tasks = allTasks.filter((t) => isTaskInPeriod(getTaskCompletion(t, bucketLookup), filters));

        // Generate CSV string
        const header = [
            "Task ID",
            "Title",
            "Assignee Name",
            "Assignee GitHub",
            "Repository",
            "Project Title",
            "Status",
            "Time in Status",
            "Story Points",
            "Type",
            "Created At",
            "Start Date",
            "End Date",
            "Closed At",
            "Labels",
            "URL"
        ];

        const escapeCsv = (str: string | null | undefined) => {
            if (!str) return '""';
            const escaped = String(str).replace(/"/g, '""');
            return `"${escaped}"`;
        };

        const rows = tasks.map(t => {
            const isDone = lookupBucket(bucketLookup, t.project_number, t.status)?.is_done === true;
            const timeInStatus = summarizeStatusVisits(
                computeStatusVisits(t.histories, t.closed_at, isDone),
            )
                .map(({ status, totalMs }) => `${status}: ${formatDuration(totalMs)}`)
                .join("; ");

            return [
                escapeCsv(t.github_issue_id),
                escapeCsv(t.title),
                escapeCsv(t.assignee?.name),
                escapeCsv(t.assignee?.github_login),
                escapeCsv(t.repository),
                escapeCsv(t.project_title),
                escapeCsv(t.status),
                escapeCsv(timeInStatus),
                escapeCsv(t.story_points?.toString()),
                escapeCsv(t.type),
                escapeCsv(t.created_at?.toISOString()),
                escapeCsv(t.start_date?.toISOString()),
                escapeCsv(t.end_date?.toISOString()),
                escapeCsv(t.closed_at?.toISOString()),
                escapeCsv(t.labels.map(l => l.name).join(", ")),
                escapeCsv(t.url),
            ];
        });

        const csvContent = [header.join(","), ...rows.map(row => row.join(","))].join("\n");

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": 'attachment; filename="tasks-export.csv"'
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("[API /export] Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
