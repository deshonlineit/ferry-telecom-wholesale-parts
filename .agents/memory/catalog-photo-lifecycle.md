---
name: Catalog photo lifecycle
description: Gallery unlinking is different from permanent media erasure.
---

In the React/API prototype, removing a public product photo from a gallery unlinks it; it is not a promise to erase its stored bytes or revoke existing public links.

**Why:** Existing order snapshots and other products may reuse a catalog photo URL. Treating every gallery edit as permanent file deletion can break those references. Catalog images are intentionally public; this policy must not be extended to private customer attachments.

**How to apply:** Keep staff wording explicit about gallery removal. If permanent erasure is requested, handle reference checks, authorization, storage cleanup failures, and cache behavior as a separate media-lifecycle change. Preserve the native PHP service's existing explicit deletion behavior rather than silently imposing prototype semantics on it.

Canonicalize and deduplicate object aliases before publication side effects, not merely in the saved gallery.

**Why:** A raw object path and its serving URL can name the same file. Parallel publication of both aliases can trigger a storage metadata conflict even when both writes set the same visibility.

**How to apply:** Treat upload paths, serving URLs, and normalized signed URLs as one identity before changing object metadata; keep that case in integration coverage.