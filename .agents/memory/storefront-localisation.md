---
name: Storefront localisation
description: Durable language boundaries for the multilingual buyer storefront.
---

The public buyer storefront supports English, Dutch, German, French and Italian.
Every buyer-facing key must have an explicit value in all five languages.
Backoffice screens remain English.

**Why:** partial fallback left prominent catalogue and checkout text in English
even though the selected document language was correct. Dictionary parity is
required for a coherent customer experience.

**How to apply:** route all new visible text, placeholders, accessibility labels,
statuses and errors through the shared language layer. Keep product names, SKUs,
technical model names and quality labels as source data. Language controls
formatting, but never changes the independently selected CHF/EUR commerce
currency.