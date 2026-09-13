---
name: PHP catalogue concurrency
description: Why the native PHP launcher must retain multiple workers for catalogue speed.
---

The native PHP launcher must retain multiple CLI server workers, catalogue pages must not start nonessential full-menu metadata refreshes alongside their own data requests, and request-wide reference data must be queried once rather than once per product.

**Why:** A mobile Lighthouse trace showed otherwise-fast catalogue, filtered-facet, and product requests serialized into a critical path of almost seven seconds. Parallel workers reduced the same local three-request wall time to roughly the slowest individual request. A later trace exposed one identical exchange-rate query per rendered product, making the product endpoint the remaining LCP delay.

**How to apply:** Keep a bounded worker count in both preview and production launchers. Let filtered facets and products run concurrently; defer global menu refresh on the catalogue route until menu interaction. Memoize immutable request-context lookups such as the current exchange rate for the lifetime of one PHP request. Recheck database capacity before raising the worker count.