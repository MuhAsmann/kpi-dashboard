import { NextRequest, NextResponse } from "next/server";
import { PROJECTS } from "@/lib/projects";
import { getStatuses } from "@/lib/kpi-service";
import { fetchProjectStatusOptions } from "@/lib/github";
import { getProjectBuckets, getBucketLookup, saveStatusMappings, StatusMappingEntry } from "@/lib/status-mapping";

/**
 * The board's own "Status" column options, straight from GitHub — a status
 * stays listed here even once no task is currently sitting in it, unlike
 * `getStatuses` (which only sees what's presently in the DB). Falls back to
 * an empty list on any error so one project's GitHub hiccup doesn't break
 * the whole response; `getStatuses` still covers that project in that case.
 */
async function getLiveStatusOptions(projectNumber: number): Promise<string[]> {
    const ownerLogin = process.env.GITHUB_ORG_OR_USER;
    if (!ownerLogin) return [];
    const ownerType = (process.env.GITHUB_OWNER_TYPE || "user") as "user" | "organization";
    try {
        return await fetchProjectStatusOptions(ownerLogin, projectNumber, ownerType);
    } catch (error) {
        console.error(`[status-mapping] Failed to fetch live status options for project #${projectNumber}:`, error);
        return [];
    }
}

export async function GET(request: NextRequest) {
    try {
        const projectParam = request.nextUrl.searchParams.get("project");
        const targetProjects = projectParam
            ? PROJECTS.filter((p) => p.number === parseInt(projectParam, 10))
            : PROJECTS;

        const bucketLookup = await getBucketLookup();

        const projects = await Promise.all(
            targetProjects.map(async (p) => {
                const [dbStatuses, liveStatuses, buckets] = await Promise.all([
                    getStatuses(p.number),
                    getLiveStatusOptions(p.number),
                    getProjectBuckets(p.number),
                ]);
                const allStatuses = Array.from(new Set([...liveStatuses, ...dbStatuses])).sort();
                return {
                    number: p.number,
                    label: p.label,
                    buckets,
                    statuses: allStatuses.map((status) => ({
                        status,
                        bucket_id: bucketLookup.get(`${p.number}:${status}`)?.id ?? null,
                    })),
                };
            })
        );

        return NextResponse.json({ projects }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const entries: unknown[] = Array.isArray(body?.entries) ? body.entries : [];

        const valid: StatusMappingEntry[] = entries.filter(
            (e): e is StatusMappingEntry =>
                !!e &&
                typeof e === "object" &&
                typeof (e as StatusMappingEntry).project_number === "number" &&
                typeof (e as StatusMappingEntry).raw_status === "string" &&
                (typeof (e as StatusMappingEntry).bucket_id === "string" || (e as StatusMappingEntry).bucket_id === null)
        );

        await saveStatusMappings(valid);

        return NextResponse.json({ success: true, saved: valid.length }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
