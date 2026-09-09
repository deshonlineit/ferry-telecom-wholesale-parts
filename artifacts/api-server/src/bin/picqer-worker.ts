import { processPicqerOutbox } from "../lib/picqer";

const dryRun = process.argv.includes("--dry-run");
const index = process.argv.indexOf("--limit");
const limit = index >= 0 ? Number(process.argv[index + 1]) : 20;
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be 1..100");
processPicqerOutbox(limit, dryRun).then((result) => console.log(JSON.stringify(result))).catch((error) => {
  console.error("Picqer worker failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});