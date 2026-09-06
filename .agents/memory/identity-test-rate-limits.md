---
name: Shared identity test rate limits
description: Authentication test throttling can span concurrent task workspaces
---
Integration tests share an identity-provider development tenant across task workspaces. Treat its rate limits as shared, not as a per-process budget.

**Why:** Concurrent completion checks exhausted token-issuance limits, causing otherwise valid isolation/profile assertions and fixture cleanup to fail with HTTP 429.

**How to apply:** Reuse unexpired session tokens in test clients and apply bounded Retry-After handling to provider calls, including cleanup. Preserve all assertions; distinguish provider throttling from an application authorization failure. Only clean up identities verified as synthetic fixtures.