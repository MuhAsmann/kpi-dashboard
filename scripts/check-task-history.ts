import assert from "node:assert";
import { computeStatusVisits, summarizeStatusVisits, formatDuration } from "../lib/task-history.ts";

// Scenario: TODO 50m -> In progress 2h -> Ready to review 1h -> In progress 30m -> Ready to review (still open)
const MIN = 60_000;
const HOUR = 60 * MIN;
const t0 = new Date("2026-08-01T00:00:00Z").getTime();

const histories = [
    { old_status: null, new_status: "TODO", changed_at: new Date(t0) },
    { old_status: "TODO", new_status: "In progress", changed_at: new Date(t0 + 50 * MIN) },
    { old_status: "In progress", new_status: "Ready to review", changed_at: new Date(t0 + 50 * MIN + 2 * HOUR) },
    { old_status: "Ready to review", new_status: "In progress", changed_at: new Date(t0 + 50 * MIN + 2 * HOUR + 1 * HOUR) },
    { old_status: "In progress", new_status: "Ready to review", changed_at: new Date(t0 + 50 * MIN + 2 * HOUR + 1 * HOUR + 30 * MIN) },
];
// task still open, 45m into the final ("Ready to review") visit
const now = t0 + 50 * MIN + 2 * HOUR + 1 * HOUR + 30 * MIN + 45 * MIN;

const visits = computeStatusVisits(histories, null, false, now);
assert.strictEqual(visits.length, 5);
assert.strictEqual(visits[0].status, "TODO");
assert.strictEqual(visits[0].durationMs, 50 * MIN);
assert.strictEqual(visits[1].status, "In progress");
assert.strictEqual(visits[1].durationMs, 2 * HOUR);
assert.strictEqual(visits[2].status, "Ready to review");
assert.strictEqual(visits[2].durationMs, 1 * HOUR);
assert.strictEqual(visits[3].status, "In progress");
assert.strictEqual(visits[3].durationMs, 30 * MIN);
assert.strictEqual(visits[4].status, "Ready to review");
assert.strictEqual(visits[4].durationMs, 45 * MIN); // still open -> ends at `now`

const summary = summarizeStatusVisits(visits);
const byStatus = Object.fromEntries(summary.map((s) => [s.status, s.totalMs]));
assert.strictEqual(byStatus["TODO"], 50 * MIN);
assert.strictEqual(byStatus["In progress"], 2 * HOUR + 30 * MIN); // summed across both visits
assert.strictEqual(byStatus["Ready to review"], 1 * HOUR + 45 * MIN);

assert.strictEqual(formatDuration(2 * HOUR + 30 * MIN), "2h 30m");
assert.strictEqual(formatDuration(50 * MIN), "50m");
assert.strictEqual(formatDuration(26 * HOUR + 15 * MIN), "1d 2h");

// Done task with no closed_at: last visit stops counting immediately, doesn't run to `now`.
const doneNoClosedAt = computeStatusVisits(
    [{ old_status: "TODO", new_status: "Done", changed_at: new Date(t0) }],
    null,
    true,
    now
);
assert.strictEqual(doneNoClosedAt[0].durationMs, 0);

// Done task with closed_at: last visit ends at closed_at, not `now`.
const doneWithClosedAt = computeStatusVisits(
    [{ old_status: "TODO", new_status: "Done", changed_at: new Date(t0) }],
    new Date(t0 + 3 * HOUR),
    true,
    now
);
assert.strictEqual(doneWithClosedAt[0].durationMs, 3 * HOUR);

// No history at all.
assert.deepStrictEqual(computeStatusVisits([], null, false, now), []);

console.log("task-history checks passed");
