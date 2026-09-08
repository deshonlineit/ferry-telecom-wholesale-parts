---
name: Commerce pricing readiness
description: Defines the isolation boundary for products that do not yet have an assigned canonical EUR price.
---

An active catalogue product without an assigned EUR base price is individually
unorderable, but must not make commerce globally unavailable. Correctly priced
products and empty carts must continue to work.

**Why:** the imported catalogue can legitimately contain an active item awaiting
price assignment. Treating catalogue-wide price completeness as a readiness
condition caused that single item to return HTTP 503 for every customer's cart,
including empty carts and carts containing only fully priced products.

**How to apply:** catalogue listings expose an individually missing price as
null and keep rendering neighbouring products. Keep strict null-price rejection
at cart-item pricing, quote, and checkout boundaries. Do not derive global
commerce readiness from a count of all active products with null prices.

Treat imported 0.00/0.01 catalogue prices as missing-price sentinels, never as
commercial prices; stock availability is a separate concern.

**Why:** WooCommerce exports use 0.01 for products awaiting pricing, including
both stocked and out-of-stock items. Displaying it as CHF 0.01 misleads buyers
and can make a sentinel-priced stocked product appear orderable.

**How to apply:** normalize sentinel values to null at import and migration,
preserve any independently assigned customer-group price, show an unavailable
price state to signed-in buyers, and reject null-priced products at cart entry.