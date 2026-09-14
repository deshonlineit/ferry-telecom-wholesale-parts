---
name: Registration business types
description: Security boundary between customer-selected business classification and authorization roles.
---

Business applicants may select a company type such as large repair shop, small repair shop, or wholesale store. This selection is review metadata only. Every public registration must still create a pending customer account; it must never grant staff access or select an authorization role.

**Why:** A public role selector that maps directly to authorization would let applicants elevate their own permissions. Business classification is useful for account review and commercial service, but authorization remains staff-controlled.

**How to apply:** Keep public business-type options separate from the internal `customer`/`staff` role. Show the selection to staff during approval, and reject unknown business-type values server-side.