import type { CommandOutcome } from "@/lib/classroom-types";
export function youthError(status: number, code: string, message: string) {
  return Response.json({ ok: false, error: { code, message } }, { status, headers: { "cache-control": "no-store" } });
}
export function youthOutcome(outcome: CommandOutcome) {
  // The legacy runtime's conservative admission counter is not a TokenDance
  // quote or charge. Never expose the old fal price as this wallet's spend.
  return Response.json({ ok: true, outcome: { ...outcome, snapshot: {
    ...outcome.snapshot, metrics: { ...outcome.snapshot.metrics, estimatedSpendCents: null },
  } } }, { headers: { "cache-control": "no-store" } });
}
