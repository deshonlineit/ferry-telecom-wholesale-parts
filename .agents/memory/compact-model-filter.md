---
name: Compact model filter
description: Interaction rule for long device-model lists in storefront filters.
---

Storefront model pickers must open with at most eight recent or relevant concrete models. Keep a selected older model visible, make exact search the primary path, and expose the complete family-grouped list only through a clearly labelled “show all” action.

Within an already named device family, generation headings must avoid repeating the family name. For example, iPhone groups are `17 Series`, `16 Series`, and `SE Series`, while concrete model rows retain names such as `iPhone 17 Pro Max`.

**Why:** A flat list of hundreds of mixed models made the narrow product-filter sidebar hard to scan and forced customers to scroll before they could make a useful choice.

**How to apply:** Preserve existing filter URLs and selection semantics. Searches may show every real match, while the expanded complete list must remain inside a bounded internal scroll region and retain concise, newest-first generation headings.