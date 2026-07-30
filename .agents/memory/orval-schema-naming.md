---
name: Orval schema naming collisions
description: How to name OpenAPI component schemas so orval codegen doesn't clash
---

Orval generates zod consts named after each operationId (e.g. operation `setProductImage` → `SetProductImageParams`, `SetProductImageBody`, `SetProductImageResponse`).

**Why:** Defining a component schema with one of those derived names (e.g. `SetProductImageResponse`) makes `@workspace/api-zod` re-export the name twice and typecheck fails with TS2308 "already exported a member".

**How to apply:** When adding paths + schemas to `lib/api-spec/openapi.yaml`, never name a component schema `<OperationIdPascal>{Params,Body,Response}`. In server code, import the operation-derived zod consts (they exist regardless of your component schema names).
