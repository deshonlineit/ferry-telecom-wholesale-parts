---
name: Invoice delivery model
description: How finished invoices reach a B2B customer in the isolated PHP shop — no accounting integration.
---

Invoices reach the customer two ways only: emailed to an address the customer
sets themselves, and downloadable by the customer from their own document
archive. There is no bookkeeping/accounting integration (Bexio or otherwise),
and one must not be added on the assumption that "invoices need to go somewhere".

**Why:** the owner rejected an accounting coupling outright and asked instead for
a self-service arrangement the customer controls: their own billing email, an
optional copy address, an own-reference field that can be made mandatory, and a
document overview they can filter by quarter, bulk-download as a ZIP and export
as CSV. The value is customer autonomy, not system-to-system sync.

**How to apply:** when invoice delivery, dunning, or export work comes up, extend
the customer-facing billing preferences and the document archive. Preferences
are only real when the checkout and the invoice renderer read them — a saved
preference that nothing consumes is a broken feature, not a stub. Keep proof of
each delivery as a record rather than inferring it from the order.
