---
name: Radix Select empty values
description: shadcn/Radix Select items must not use value=""
---
Rule: never render `<SelectItem value="">` — Radix Select v2 throws at render time; use sentinels like "all"/"none" and map them to undefined/null before API calls.
**Why:** an admin page crashed on load and a completion review rejected the task for it.
**How to apply:** any filter "All ..." option or optional-field select in shadcn UIs.
