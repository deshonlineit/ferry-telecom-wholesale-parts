---
name: Swiss QR reference activation
description: The bank prerequisite for enabling structured references on Swiss QR invoices.
---

Keep Swiss QR invoices on NON until the account owner has explicit bank confirmation for either SCOR on the existing classic IBAN or QRR with a separately issued QR-IBAN.

**Why:** On 2026-09-09 the account owner confirmed that neither structured reference model had yet been confirmed by the bank. Activating the wrong IBAN/reference combination can make payment slips invalid or unprocessable.

**How to apply:** Treat bank confirmation as an operational prerequisite. SCOR may use the classic IBAN only when supported; QRR must use a valid QR-IBAN. Never rewrite historical NON snapshots when activating a new model.