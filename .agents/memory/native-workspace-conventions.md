---
name: Native PHP module and account-screen conventions
description: How cross-module calls and account-screen chrome work in the isolated PHP shop.
---

## Cross-module calls need a lazy require at the call site

Modules in the native PHP shop are loaded in a fixed order by the router, so
calling a function from a module that loads later fails at runtime even though
the code reads correctly. A top-level require is not the fix: it creates a load
cycle. Put `require_once` immediately above the call instead.

**Why:** this failure mode is invisible to per-file syntax checks and to any
test that does not actually issue the request, so it reaches the browser as a
500 on a path that was never exercised end to end.

**How to apply:** when a feature reaches across modules, add the require at the
call site and cover that route with a request-level check, not a lint pass.

## Account screens render through the account shell

Customer workspace screens must render through the shared account layout rather
than emitting their own page wrapper, or they lose the account navigation while
still looking correct in isolation.
