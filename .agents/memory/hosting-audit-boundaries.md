---
name: Hosting audit boundaries
description: Avoid treating hosting schema metadata or installed source as proof of full WordPress behavior.
---

The hosting API's database-schema export may return only database-level DDL, not table definitions. A successful response with no CREATE TABLE statements is not evidence of an empty database or a completed schema audit.

**Why:** During read-only research, populated database metadata accompanied exports containing only CREATE DATABASE and server-version information. Treating the parsed table count as zero would misrepresent migration scope.

**How to apply:** Record table structure and active WordPress settings as unverified until a suitable sanitized export or separately authorized read-only query provides them. Do not create remote PHP probes or change production access settings to work around missing visibility.

Some older cPanel documentation links redirect to a generic API index. Use the current operation-specific Markdown documentation; verify it names the intended endpoint and parameters rather than assuming a successful page fetch is the right reference.