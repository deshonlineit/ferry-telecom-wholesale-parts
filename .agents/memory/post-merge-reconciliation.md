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
