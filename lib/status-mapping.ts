import { prisma } from "@/lib/prisma";
import { KpiBucketInfo } from "@/lib/kpi-buckets";

export type { KpiBucketInfo } from "@/lib/kpi-buckets";

/**
 * Get a project's KPI buckets, ordered for display. Every project needs at
 * least the required "Done" bucket to compute completion — if none exist
 * yet (first time this project is configured), it's created lazily here.
 * Everything beyond Done is entirely up to the team.
 */
export async function getProjectBuckets(projectNumber: number): Promise<KpiBucketInfo[]> {
    let buckets = await prisma.projectBucket.findMany({
        where: { project_number: projectNumber },
        orderBy: { sort_order: "asc" },
    });

    if (buckets.length === 0) {
        const done = await prisma.projectBucket.create({
            data: { project_number: projectNumber, label: "Done", is_done: true, sort_order: 0 },
        });
        buckets = [done];
    }

    return buckets;
}

export async function addProjectBucket(projectNumber: number, label: string): Promise<KpiBucketInfo> {
    const trimmed = label.trim();
    if (!trimmed) throw new Error("Bucket name can't be empty");

    const maxOrder = await prisma.projectBucket.aggregate({
        where: { project_number: projectNumber },
        _max: { sort_order: true },
    });

    return prisma.projectBucket.create({
        data: {
            project_number: projectNumber,
            label: trimmed,
            is_done: false,
            sort_order: (maxOrder._max.sort_order ?? -1) + 1,
        },
    });
}

export async function deleteProjectBucket(bucketId: string): Promise<void> {
    const bucket = await prisma.projectBucket.findUnique({ where: { id: bucketId } });
    if (!bucket) return;
    if (bucket.is_done) throw new Error("The Done bucket is required and can't be removed");

    // Statuses pointed at this bucket fall back to unmapped (FK is
    // onDelete: SetNull), not silently reassigned to another bucket.
    await prisma.projectBucket.delete({ where: { id: bucketId } });
}

export interface StatusMappingEntry {
    project_number: number;
    raw_status: string;
    bucket_id: string | null;
}

export async function saveStatusMappings(entries: StatusMappingEntry[]): Promise<void> {
    await Promise.all(
        entries.map((e) =>
            prisma.statusMapping.upsert({
                where: {
                    project_number_raw_status: {
                        project_number: e.project_number,
                        raw_status: e.raw_status,
                    },
                },
                update: { bucket_id: e.bucket_id },
                create: e,
            })
        )
    );
}

/** `${project_number}:${raw_status}` -> bucket, for KPI computation. */
export async function getBucketLookup(): Promise<Map<string, KpiBucketInfo>> {
    const rows = await prisma.statusMapping.findMany({
        where: { bucket_id: { not: null } },
        include: { bucket: true },
    });

    const map = new Map<string, KpiBucketInfo>();
    for (const r of rows) {
        if (r.bucket) map.set(`${r.project_number}:${r.raw_status}`, r.bucket);
    }
    return map;
}

export function lookupBucket(
    lookup: Map<string, KpiBucketInfo>,
    projectNumber: number | null,
    status: string
): KpiBucketInfo | null {
    if (projectNumber == null) return null;
    return lookup.get(`${projectNumber}:${status}`) ?? null;
}
