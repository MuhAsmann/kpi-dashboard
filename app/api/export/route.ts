import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        const startDateStr = searchParams.get("start_date");
        const endDateStr = searchParams.get("end_date");
        const repository = searchParams.get("repository");
        const project = searchParams.get("project");

        const where: Record<string, any> = {};

        if (startDateStr || endDateStr) {
            where.created_at = {};
            if (startDateStr) {
                where.created_at.gte = new Date(startDateStr);
            }
            if (endDateStr) {
                where.created_at.lte = new Date(endDateStr);
            }
        }

        if (repository) {
            where.repository = repository;
        }

        if (project) {
            where.project_number = parseInt(project, 10);
        }

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignee: true,
                labels: true,
            },
            orderBy: { created_at: "desc" },
        });

        // Generate CSV string
        const header = [
            "Task ID",
            "Title",
            "Assignee Name",
            "Assignee GitHub",
            "Repository",
            "Project Title",
            "Status",
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

        const rows = tasks.map(t => [
            escapeCsv(t.github_issue_id),
            escapeCsv(t.title),
            escapeCsv(t.assignee?.name),
            escapeCsv(t.assignee?.github_login),
            escapeCsv(t.repository),
            escapeCsv(t.project_title),
            escapeCsv(t.status),
            escapeCsv(t.story_points?.toString()),
            escapeCsv(t.type),
            escapeCsv(t.created_at?.toISOString()),
            escapeCsv(t.start_date?.toISOString()),
            escapeCsv(t.end_date?.toISOString()),
            escapeCsv(t.closed_at?.toISOString()),
            escapeCsv(t.labels.map(l => l.name).join(", ")),
            escapeCsv(t.url)
        ]);

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
