---
name: Post-merge reconciliation checklist
description: What breaks after task-agent merges in this monorepo and how to fix it fast
---
After task-agent merges land on main, typecheck/tests often break for reasons NOT in the merged code itself:

**Rule:** after any merge that touches `lib/api-spec/openapi.yaml` or DB schema, run this before debugging anything else:
1. `cd lib/api-spec && pnpm run codegen`, then sed the zod import in `lib/api-zod/src/generated/api.ts` to `zod/v4` (see orval-zod-v4.md).
2. Apply any new additive columns to the dev DB via executeSql (drizzle-kit push needs TTY).
3. `pnpm install` if the merge changed dependency versions/overrides.
4. Restart affected workflows; one-shot test workflows that hit the API 502 if run while the API server is rebuilding — rerun them after the server is up.

**Why:** generated client/zod code and the dev DB are not part of the merge; stale codegen caused a production deploy build failure once. Merges have also silently dropped middleware lines (e.g. a `router.use(requireCustomer)`) — spot-check auth guards after merges.

**Rule:** Audit automatically merged files as well as files explicitly reported as conflicted. Compare the staged change size and intent with the original task patch.

**Why:** Automatic merges have replaced unrelated native admin handlers with repeated fragments and substituted product/category/customer API handlers with model/order code. Such corrupted files had no conflict markers.

**How to apply:** Investigate disproportionate diffs before continuing a rebase, then run typechecking, native syntax and shared-script regression checks. Preserve verified route logic and authorization from both branches rather than repairing only the first error in a corrupted merge.

**Rule:** A responding port does not prove that the latest managed workflow is running. Check for an obsolete process when a restarted service fails to build or reports an occupied port.

**Why:** A leftover API process continued serving older code while the current workflow failed after merges. A leftover preview process also made a second server silently choose another port, hiding the mismatch behind a “running” status.

**How to apply:** Compare workflow state, configured/listening ports and process ownership before diagnosing browser-specific failures. Stop only the positively identified obsolete process, then restart the existing managed workflow; do not create a replacement service or treat an old HTTP response as validation of the merged code.

**Rule:** Inspect the entire affected handler after a structural merge conflict, not only the marked sections. When unmarked code is inconsistent, reconstruct from the original index versions and combine their intended behavior.

**Why:** Structural merge damage can extend outside conflict markers; a marker-free file is not necessarily a valid combination of both implementations.

**How to apply:** Compare both original sides, retain access-control and validation changes, regenerate shared contracts, and use typechecks plus focused API regressions to confirm the combined result.
