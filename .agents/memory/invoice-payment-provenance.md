---
name: Invoice payment provenance
description: Why historical order PDFs must not be interpreted as confirmed payment or unpaid debt.
---

Treat missing payment evidence as “Te controleren”, not as paid or confirmed unpaid.

**Why:** The native shop originally generated invoice PDFs from orders without maintaining a payment ledger or agreed due dates. Neither an invoice PDF, the selected payment method nor a completed shipment establishes whether money was received.

**How to apply:** Preserve this distinction in imports, migrations and financial summaries. Confirmed payment records determine the receivable; fulfillment status must not substitute for payment evidence. Do not manufacture due dates to populate overdue figures.