import { NextRequest, NextResponse } from "next/server";
import { PROJECTS } from "@/lib/projects";
import { getStatuses } from "@/lib/kpi-service";
import { getProjectBuckets, getBucketLookup, saveStatusMappings, StatusMappingEntry } from "@/lib/status-mapping";

export async function GET(request: NextRequest) {
    try {
        const projectParam = request.nextUrl.searchParams.get("project");
        const targetProjects = projectParam
            ? PROJECTS.filter((p) => p.number === parseInt(projectParam, 10))
            : PROJECTS;

        const bucketLookup = await getBucketLookup();

        const projects = await Promise.all(
            targetProjects.map(async (p) => {
                const [statuses, buckets] = await Promise.all([
                    getStatuses(p.number),
                    getProjectBuckets(p.number),
                ]);
                return {
                    number: p.number,
                    label: p.label,
                    buckets,
                    statuses: statuses.map((status) => ({
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
