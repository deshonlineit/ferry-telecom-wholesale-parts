---
name: Rebuild db types after schema changes
description: Why new Drizzle columns appear "missing" in api-server typecheck
---
After editing `lib/db/src/schema/*`, run `pnpm exec tsc -b lib/db` from the repo root before typechecking dependents.
**Why:** TS project references resolve `@workspace/db` types from the stale `lib/db/dist/*.d.ts` build output, so new columns show as TS2339 even though the source is correct.
**How to apply:** Any time a schema/table change is made and dependent packages fail typecheck on the new fields.

Also: `drizzle-kit push` needs a TTY for confirmation prompts; for safe additive changes apply the SQL directly via `executeSql` instead.

Also applies to `lib/api-zod` and `lib/api-client-react`: TS2305 "has no exported member" for a generated export means stale dist — run `npx tsc -b lib/api-zod lib/api-client-react` (lib/api-spec has no tsconfig; skip it).
