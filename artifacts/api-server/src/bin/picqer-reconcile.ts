import { reconcilePicqerProducts } from "../lib/picqer";
if (!process.argv.includes("--read-only-reconcile")) throw new Error("Explicit --read-only-reconcile is required");
reconcilePicqerProducts(true).then((result) => console.log(JSON.stringify(result))).catch((error) => {
  console.error("Read-only reconciliation failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});