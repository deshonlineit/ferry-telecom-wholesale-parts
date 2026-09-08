---
name: Orval Zod postprocessing
description: Why generated Zod output needs an automatic postprocessing hook
---

Keep the automatic Orval postprocessing hook that enforces the `zod/v4` import and moves generated constraint constants ahead of schemas that reference them.

**Why:** Orval can emit Zod 4 calls against the package root and can place shared max/min constants after their first use. Either behavior breaks the generated-library TypeScript build even when the API server's narrower typecheck passes.

**How to apply:** regenerate through the API-spec package script rather than invoking Orval and manually patching its output. Keep the forced generated-library build as the definitive check after generator changes.
