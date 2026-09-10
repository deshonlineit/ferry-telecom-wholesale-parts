---
name: Deployment port gating
description: Production services must bind their declared ports before running external initialization.
---

Every dynamic artifact service included in one Autoscale deployment must open its declared port within the platform timeout. The HTTP listener must start before migrations, connector access, webhook registration, synchronization, or data backfills.

**Why:** One healthy service was insufficient: publishing waited for all declared dynamic ports and terminated the deployment when the API delayed `listen()` until after Stripe and database initialization.

**How to apply:** Bind first and expose a lightweight health endpoint immediately. Run external initialization after the listener starts, log failures without silently hiding them, and keep feature-specific failures from taking down unrelated routes.