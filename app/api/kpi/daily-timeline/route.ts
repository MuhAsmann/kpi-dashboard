import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBucketLookup, lookupBucket } from "@/lib/status-mapping";

export interface DailyWorkEntry {
    hour: number;
    issueNumber: number | null;
    issueTitle: string;
    issueUrl: string | null;
    status: string;
    repository: string | null;
    userId: string | null;
    username: string | null;
    avatarUrl: string | null;
    workLogId: string;
    isContinuous: boolean;
}

/**
 * GET /api/kpi/daily-work
 *
 * Returns a flat list of task-status changes that happened on a given day,
 * each annotated with the hour, assignee info, and whether the task is
 * still ongoing (`isContinuous`).
 *
 * Query params:
 *   - date       (string, YYYY-MM-DD) — defaults to today
 *   - project    (number)             — optional project filter
 *   - repository (string)             — optional repo filter
 *   - user_id    (string)             — optional user filter
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;

        const dateParam = searchParams.get("date");
        const projectParam = searchParams.get("project");
        const repositoryParam = searchParams.get("repository");
        const userIdParam = searchParams.get("user_id");

        // Resolve start/end of the target day (server-local time, UTC)
        const targetDate = dateParam ? new Date(dateParam) : new Date();
        const dayStart = new Date(targetDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(targetDate);
        dayEnd.setUTCHours(23, 59, 59, 999);

        // Build the task-level filter so we can scope by project / repo / user
        const taskWhere: Record<string, unknown> = {
            assignee_id: { not: null },
        };
        if (projectParam) taskWhere.project_number = parseInt(projectParam, 10);
        if (repositoryParam) taskWhere.repository = repositoryParam;
        if (userIdParam) taskWhere.assignee_id = userIdParam;

        // Fetch all history entries for the target day, joined with task + assignee
        const histories = await prisma.taskHistory.findMany({
            where: {
                changed_at: { gte: dayStart, lte: dayEnd },
                task: taskWhere,
            },
            include: {
                task: {
                    include: {
                        assignee: true,
                    },
                },
            },
            orderBy: { changed_at: "asc" },
        });

        // Build the bucket lookup to determine is_done / isContinuous
        const bucketLookup = await getBucketLookup();

        const result: DailyWorkEntry[] = histories.map((h) => {
            const task = h.task;
            const bucket = lookupBucket(bucketLookup, task.project_number, h.new_status);

            // isContinuous = the status change is NOT to a "done" bucket
            // i.e. the task is still in-progress after this status change
            const isDone = bucket?.is_done === true;

            return {
                hour: new Date(h.changed_at).getUTCHours() + 7,
                issueNumber: task.github_issue_number,
                issueTitle: task.title,
                issueUrl: task.url,
                status: h.new_status,
                repository: task.repository,
                userId: task.assignee_id,
                username: task.assignee?.github_login ?? null,
                avatarUrl: task.assignee?.avatar_url ?? null,
                workLogId: h.id,
                isContinuous: !isDone,
            };
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        console.error("[API /kpi/daily-work] Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
