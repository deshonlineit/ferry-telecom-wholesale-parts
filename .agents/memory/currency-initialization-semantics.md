---
name: Nullable currency initialization semantics
description: Prevent retained legacy prices from resurrecting deliberately cleared group overrides during rate refresh.
---

Treat initial EUR conversion and subsequent exchange-rate refresh as separate operations. Never use a recurring “fill all NULL EUR values” pass once price administration is enabled.

**Why:** A NULL EUR group price means deliberate inheritance after an override is cleared, while before migration it meant not yet converted. Retaining original CHF values for provenance creates a tempting but unsafe fallback: a recurring initialization pass silently restores the old override.

**How to apply:** Complete initial conversion transactionally under an explicit initialization state, then preserve later NULL choices. New imports and price editors must write canonical EUR values themselves. Historical prices and original source columns must never become an implicit recurring synchronization source.