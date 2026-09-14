---
name: Preview account credentials
description: Safety boundary for recoverable staff and repairshop test logins in the published preview shop.
---

The published preview shop may recover the two exact seeded test accounts from dedicated environment secrets, but this mechanism must remain disabled when the shop enters live mode.

**Why:** Seeded passwords are one-way hashes and the repairshop seed originally used an unrecoverable random password. Direct production database writes are unavailable to the agent, while the owner needs stable test access after database copies and republishes.

**How to apply:** Keep separate secrets for the staff and repairshop accounts, require at least 12 characters, compare with constant-time equality, and update only the exact active seeded account after a matching preview-mode login. Never generalize this to arbitrary users or enable it in live mode.