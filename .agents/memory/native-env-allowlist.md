---
name: Native environment allowlist
description: Why native PHP runtime configuration must be explicitly forwarded through its scrubbed startup environment.
---

The native PHP server intentionally starts under a scrubbed `env -i` environment. Any new runtime configuration or secret it needs must be added to the explicit startup allowlist; presence in workspace Secrets alone does not make it visible to PHP.

**Why:** A complete, checksum-valid financial configuration remained unavailable after restart because the parent shell had the secrets but the PHP child received only the previously allowlisted bridge secret.

**How to apply:** Whenever native PHP starts consuming a new environment key, forward only that exact key in the server launch command and verify the child process can validate it without printing its value.