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
 * GET /api/kpi/daily-timeline
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

        // Calculate WIB local date string and boundaries (UTC+7)
        const now = new Date();
        const wibNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const defaultDateStr = wibNow.toISOString().split("T")[0];
        const dateStr = dateParam || defaultDateStr;

        const [year, month, day] = dateStr.split("-").map(Number);

        // dayStart and dayEnd in UTC corresponding to 00:00:00.000 WIB and 23:59:59.999 WIB
        const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 7 * 60 * 60 * 1000);
        const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999) - 7 * 60 * 60 * 1000);

        // Determine hour range (9 to 17 max) to evaluate on target date
        const isToday = dateStr === defaultDateStr;
        const isPast = dateStr < defaultDateStr;

        const minHour = 9;
        let maxHour = 17;
        if (isToday) {
            maxHour = Math.min(17, wibNow.getUTCHours());
        } else if (!isPast) {
            // Future date -> no entries yet
            return NextResponse.json([], { status: 200 });
        }

        // Scope task filter by project / repo / user
        const taskWhere: Record<string, unknown> = {
            assignee_id: { not: null },
            created_at: { lte: dayEnd },
        };
        if (projectParam) taskWhere.project_number = parseInt(projectParam, 10);
        if (repositoryParam) taskWhere.repository = repositoryParam;
        if (userIdParam) taskWhere.assignee_id = userIdParam;

        // Fetch all tasks matching filter created on/before dayEnd, with assignee & histories up to dayEnd
        const tasks = await prisma.task.findMany({
            where: taskWhere,
            include: {
                assignee: true,
                histories: {
                    where: {
                        changed_at: { lte: dayEnd },
                    },
                    orderBy: { changed_at: "asc" },
                },
            },
        });

        // Build status bucket lookup map
        const bucketLookup = await getBucketLookup();

        const isOngoingStatus = (projectNumber: number | null, status: string): boolean => {
            const bucket = lookupBucket(bucketLookup, projectNumber, status);
            return bucket?.is_done !== true;
        };

        const result: DailyWorkEntry[] = [];

        for (const task of tasks) {
            const histories = task.histories;

            // Helper to get latest status of the task at timestamp t
            const getStatusAt = (t: Date) => {
                let latestHistory = null;
                for (const h of histories) {
                    if (new Date(h.changed_at) <= t) {
                        latestHistory = h;
                    } else {
                        break;
                    }
                }
                if (latestHistory) {
                    return {
                        status: latestHistory.new_status,
                        historyId: latestHistory.id,
                        changedAt: new Date(latestHistory.changed_at),
                    };
                }
                // No history before t: if task was created on/before t, use initial task status
                if (new Date(task.created_at) <= t) {
                    return {
                        status: task.status,
                        historyId: null,
                        changedAt: new Date(task.created_at),
                    };
                }
                return null; // Task did not exist yet at time t
            };

            // Evaluate each work hour (9 to maxHour) on target day
            for (let h = minHour; h <= maxHour; h++) {
                const hourStart = new Date(Date.UTC(year, month - 1, day, h, 0, 0, 0) - 7 * 60 * 60 * 1000);
                const hourEnd = new Date(Date.UTC(year, month - 1, day, h, 59, 59, 999) - 7 * 60 * 60 * 1000);

                // Find status changes that occurred during this hour
                const changesInHour = histories.filter((hist) => {
                    const changedAt = new Date(hist.changed_at);
                    return changedAt >= hourStart && changedAt <= hourEnd;
                });

                if (changesInHour.length > 0) {
                    // Status changes happened in this hour
                    for (const hist of changesInHour) {
                        const ongoing = isOngoingStatus(task.project_number, hist.new_status);
                        result.push({
                            hour: h,
                            issueNumber: task.github_issue_number,
                            issueTitle: task.title,
                            issueUrl: task.url,
                            status: hist.new_status,
                            repository: task.repository,
                            userId: task.assignee_id,
                            username: task.assignee?.github_login ?? null,
                            avatarUrl: task.assignee?.avatar_url ?? null,
                            workLogId: hist.id,
                            isContinuous: ongoing,
                        });
                    }
                } else {
                    // No status change in this hour: check status at start of hour
                    const state = getStatusAt(hourStart);
                    if (state) {
                        const ongoing = isOngoingStatus(task.project_number, state.status);
                        if (ongoing) {
                            result.push({
                                hour: h,
                                issueNumber: task.github_issue_number,
                                issueTitle: task.title,
                                issueUrl: task.url,
                                status: state.status,
                                repository: task.repository,
                                userId: task.assignee_id,
                                username: task.assignee?.github_login ?? null,
                                avatarUrl: task.assignee?.avatar_url ?? null,
                                workLogId: state.historyId ? `${state.historyId}_h${h}` : `${task.id}_h${h}`,
                                isContinuous: true,
                            });
                        }
                    }
                }
            }
        }

        // Sort results by hour ascending, then by username/issueNumber for consistency
        result.sort((a, b) => {
            if (a.hour !== b.hour) return a.hour - b.hour;
            const userA = a.username || "";
            const userB = b.username || "";
            if (userA !== userB) return userA.localeCompare(userB);
            return (a.issueNumber || 0) - (b.issueNumber || 0);
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "An unknown error occurred";
        console.error("[API /kpi/daily-timeline] Error:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
