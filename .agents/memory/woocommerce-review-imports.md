---
name: WooCommerce review imports
description: Safety and precision rules for loading fresh production exports into the isolated visual-review shop.
---

Fresh WooCommerce exports may omit different numbers of trailing empty metadata
columns per row. Core fields through SKU, name, publication, stock, categories,
brands and images remain aligned, but trailing wholesale metadata must not be
trusted until its row/header alignment is separately proven.

**Why:** a fresh export had a 131-column header and variable 111–131-field rows.
Blindly requiring equal lengths would reject usable core catalogue data, while
blindly consuming trailing values could assign them to the wrong metadata field.

**How to apply:** import only published products unless the owner chooses
otherwise. Reconcile and mutate strictly by exact SKU, preview create/update/
deactivate totals, preserve a pre-import backup, and verify zero SKU and stock
differences against the source after commit.

Existing per-product download files prove only that an image was previously
verified; they do not prove it belongs to the URL in a fresh export.

**Why:** product-ID download paths can survive while the WooCommerce image URL
changes.

**How to apply:** rematerialize every product download from the fresh
URL-keyed verified cache, then replace local image records/variants. Require
zero download/import errors and identical protected non-image signatures before
calling the visual review exact.