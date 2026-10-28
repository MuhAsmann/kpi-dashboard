// Shared bucket shape — safe to import from client components. Server-side
// DB helpers live in lib/status-mapping.ts.
export interface KpiBucketInfo {
    id: string;
    label: string;
    is_done: boolean;
    category: string;
}

// Whose clock runs while a task sits in a bucket. Only "active" time counts
// toward a developer's engineering time; "done" is reserved for the Done bucket.
export const BUCKET_CATEGORIES = ["queue", "active", "waiting", "testing", "done"] as const;
export type BucketCategory = (typeof BUCKET_CATEGORIES)[number];

export const BUCKET_CATEGORY_LABELS: Record<BucketCategory, string> = {
    queue: "Queue",
    active: "Active",
    waiting: "Waiting / blocked",
    testing: "Testing",
    done: "Done",
};

export function isBucketCategory(value: unknown): value is BucketCategory {
    return typeof value === "string" && (BUCKET_CATEGORIES as readonly string[]).includes(value);
}
