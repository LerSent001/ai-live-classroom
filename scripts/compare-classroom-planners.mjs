// Read-only historical report. The old paid multi-provider benchmark is retired.
// Usage: node scripts/compare-classroom-planners.mjs [saved-comparison-directory]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((value) => value.startsWith("--"))) {
  throw new Error("This command only reads an existing report; paid model comparison has been removed.");
}
const directory = args[0] ?? "output/planner-comparison/2026-09-22T08-42-25-869Z";
const summary = JSON.parse(readFileSync(join(directory, "summary.json"), "utf8"));
console.log(JSON.stringify({ readOnly: true, newProviderRequests: 0, directory, historicalSummary: summary }, null, 2));
