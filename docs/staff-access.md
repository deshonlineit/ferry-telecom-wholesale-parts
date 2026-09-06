# Staff access

The prototype's account role lives on the authenticated account as
`publicMetadata.role`. Only the server-side identity administration can set
this value. The accepted staff roles are `staff` and `admin`; a missing role
or any other value is a regular customer.

To grant or revoke access, an authorized operator updates that role on the
intended account in the identity administration. For installations already
using it, the server-only `STAFF_USER_IDS` configuration remains an explicit
comma-separated allowlist of exact account IDs. Remove an account from that
list as well when revoking it. Do not expose the list in frontend settings.
Development and production accounts are separate; do not promote customers
automatically or infer staff status from an email address or pricing group.

- Every `/api/admin/*` request requires a verified session and a current
  server-side staff check. Visitors receive 401; customers receive 403.
- `/api/me/access` returns the read-only `isStaff` flag using the same policy.
  The storefront uses this flag for the Admin link and the entire `/admin`
  page tree, including direct links. Lookup failures do not grant access.
- Customer registration and profile updates cannot assign roles.
  Client-writable `unsafeMetadata`, request bodies and browser storage are
  never authorization sources.
- API authorization is checked on every request, so removing a role blocks
  the next request even if the user still has a valid session.

This does not change the separate PHP test shop's database-backed staff role
or staff login restrictions.

## Verification

Run the authorization tests against the local development API. They create and
remove their own synthetic accounts and do not alter existing product stock.
Never run development fixtures against production accounts or a live store.

```sh
node --test artifacts/api-server/tests/staff-policy.test.mjs
node artifacts/api-server/tests/staff-authorization.test.mjs
```