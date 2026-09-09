import { processNativePicqerOutbox } from "../lib/picqer";
const dryRun = process.argv.includes("--dry-run");
const at = process.argv.indexOf("--limit");
const limit = at >= 0 ? Number(process.argv[at + 1]) : 20;
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be 1..100");
processNativePicqerOutbox(limit, dryRun).then((result) => console.log(JSON.stringify(result))).catch((error) => {
  console.error("Native Picqer worker failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});