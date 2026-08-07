// Shared bucket shape — safe to import from client components. Server-side
// DB helpers live in lib/status-mapping.ts.
export interface KpiBucketInfo {
    id: string;
    label: string;
    is_done: boolean;
}
