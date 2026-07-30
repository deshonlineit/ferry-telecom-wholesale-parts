---
name: Orval zod codegen import fix
description: Codegen emits zod v4 API but imports zod v3 root; patch the import after every codegen run
---

Orval v8 generates `lib/api-zod/src/generated/api.ts` with zod v4 calls (`zod.int()`) but imports `from 'zod'` (v3 root), so `pnpm --filter @workspace/api-spec run codegen` fails its chained typecheck with TS2339 `Property 'int' does not exist`.

**Why:** installed zod (3.25.x) exposes the v4 API only at the `zod/v4` subpath.

**How to apply:** after every codegen run, patch the import and re-run the lib typecheck:

```bash
sed -i "s|import \* as zod from 'zod';|import * as zod from 'zod/v4';|" lib/api-zod/src/generated/api.ts
pnpm run typecheck:libs
```
