import { NextRequest, NextResponse } from "next/server";
import { addProjectBucket, deleteProjectBucket, updateBucketCategory } from "@/lib/status-mapping";
import { isBucketCategory } from "@/lib/kpi-buckets";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const projectNumber = Number(body?.project_number);
        const label = String(body?.label ?? "");

        if (!Number.isFinite(projectNumber) || !label.trim()) {
            return NextResponse.json({ error: "project_number and label are required" }, { status: 400 });
        }

        const bucket = await addProjectBucket(projectNumber, label);
        return NextResponse.json({ bucket }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const bucketId = String(body?.bucket_id ?? "");
        const category = body?.category;

        if (!bucketId || !isBucketCategory(category) || category === "done") {
            return NextResponse.json({ error: "bucket_id and a valid non-done category are required" }, { status: 400 });
        }

        const bucket = await updateBucketCategory(bucketId, category);
        return NextResponse.json({ bucket }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const bucketId = String(body?.bucket_id ?? "");

        if (!bucketId) {
            return NextResponse.json({ error: "bucket_id is required" }, { status: 400 });
        }

        await deleteProjectBucket(bucketId);
        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
