---
name: Policy lists must be enforced server-side
description: Shortening a choice list in the storefront UI does not create a rule; the PHP side has to reject the excluded values and a QA check has to keep both lists identical.
---

Trimming a picker in the browser (for example, restricting delivery to European
countries) only hides options. Until the PHP write paths reject the excluded
values, any direct API call still sets them.

**Why:** the storefront's session currency and address validation accepted any
two-letter code, so the "we only deliver within Europe" promise in the UI was
decorative and a crafted request could create a non-European destination.

**How to apply:**
- Publish the allowed set once in PHP and validate it on every write path
  (session/currency change, address create and edit). Keep read paths permissive
  so stored legacy values still render and still resolve a currency.
- Allow an edit that keeps an existing out-of-policy value; reject only a change
  *to* one. Otherwise an old record becomes uneditable.
- The list now exists in both JS and PHP; a QA check parses the PHP array and
  asserts it matches the JS list exactly, because a silently drifted pair is
  worse than one long list (same failure mode as the duplicated taxonomy).
- A custom control that keeps a stored-but-unlisted value must show it as the
  current row, not fall back to the default, or confirming the panel silently
  changes the customer's country.
- Deleting the control does not retire the rows it created. Permissive read
  paths mean an out-of-policy record can still be *selected* later, so the point
  of consumption (quote, checkout, shipment) has to re-validate the stored value
  as well — validating only create and edit leaves the promise bypassable.
- A cached copy of the choice (a session country, a remembered filter) outlives
  the control that set it. Once the UI can no longer change it, resolve it from
  what the customer actually owns and discard a cached value that matches
  nothing, or stale state keeps driving prices no one can correct.
