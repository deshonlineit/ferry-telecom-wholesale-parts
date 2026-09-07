---
name: Smart-search privacy boundary
description: Rules for improving the homepage smart ordering search without collecting free-form customer text.
---

The large homepage search is the smart-order workspace; the compact header
search remains the quick general search. Smart results may recognize SKU,
device model, product/category aliases and common repair terms, then expose
quantity and direct cart add through the existing validated commerce path.

**Why:** the owner wants to understand what customers seek and shorten the
ordering cycle, but raw free-form searches can contain personal or confidential
content and must not become analytics payloads.

**How to apply:** analytics may record the recognized intent kind, catalogue
IDs, result count, result-open and successful add-to-cart outcomes. Never send
the query string itself. Search must not bypass customer pricing, stock,
minimum-quantity, authentication or additive-cart validation.