---
name: RMA settlement policy
description: Business rules for partial returns, provider refunds, invoice credits, and returned stock.
---

Returns are created from an order with explicit lines and quantities. Receiving
and stock disposition are independent from financial settlement. Only an
explicit Restock disposition returns units to saleable stock; quarantine and
write-off never do.

Paid Stripe or Wallee/TWINT merchandise is refunded through its original
provider payment and is not credited until the provider confirms success.
An accepted but pending asynchronous refund must remain pending. Deferred-payment returns
issue a numbered credit note: apply it to the originating unpaid invoice first,
then other open invoices for the same customer and currency, oldest first. Any
remainder stays as customer account credit.

**Why:** Customers often send back only part of an order and may bypass
self-service RMA submission. A status dropdown cannot safely represent money,
tax, stock, or external-provider state, and an unpaid invoice must not trigger a
cash refund.

**How to apply:** use immutable settlement, credit-application, and stock
movement records with idempotency and deterministic line/tax allocation. Never
allow a status-only transition to create credit, over-return ordered quantity,
over-refund captured funds, or duplicate stock on retry.