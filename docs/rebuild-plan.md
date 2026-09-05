# Ferry Telecom — custom PHP/MySQL rebuild plan

## Status and boundaries

This is an evidence-informed engineering plan, not a completed functional or database audit of the live WordPress website. The first authenticated source inventory is recorded in `docs/wordpress-audit.md`.

Confirmed so far:
- Read-only hosting authentication succeeded. The main WordPress source, custom child-theme modules, a separate screen-buyback WordPress installation, and custom Picqer/shipping integrations have been inventoried without changing remote files or settings.
- The separate local prototype uses React/TypeScript, an Express API, PostgreSQL, and third-party frontend/auth packages. It is not the requested target stack.
- A Picqer shipping-label endpoint and PDF generation code are present. This does not establish the entire inventory integration: stock/order synchronization ownership, configuration, warehouse selection and live webhook registrations still need verification.
- Initial competitor references are Mobileparts.shop, Foneday and GSMnet. Only public pages have been inspected, not their authenticated checkout or administration.
- Additional confirmed source-level scope includes custom RMA/credit notes, address books, group-pricing customization, invoice payment support, QR-invoice components, currency switching, secondary-site product/price transfer and a separate Shopify fulfillment script. Runtime usage and configuration must be verified individually.
- Hosting database metadata reports MariaDB 11.4.13. The requested destination remains MySQL; MariaDB compatibility is not a reason to silently change that target. The hosting schema-export response contains database-level DDL only, so table structures and active settings remain unverified.

Keep ferrytelecom.com operating unchanged. No publishing, domain/DNS changes, live orders, emails, payment attempts, stock updates, or integration reconfiguration are authorized by this plan. Research uses read-only operations; deeper functional tests use an isolated copy with side effects disabled.

Rebuild existing business capabilities first. Later removal is a separate decision: use reversible feature switches with permissions and audit records, rather than deleting functions or data silently.

## 1. Target architecture

| Layer | Proposed implementation |
| --- | --- |
| Customer interface | Semantic HTML, custom CSS, native JavaScript modules; no React, Vue, jQuery, Bootstrap or runtime UI libraries |
| Design | Ferry Telecom identity, system-safe fonts only, accessible desktop/mobile layouts, fast B2B ordering |
| API | Core PHP, versioned JSON endpoints under the same origin, explicit routing and server-side validation |
| Application structure | Small domain services for catalog, pricing, accounts, checkout, media and integrations; separate staff/customer authorization |
| Persistence | MySQL with InnoDB transactions, foreign keys, appropriate indexes and utf8mb4 |
| Background work | Durable MySQL job/outbox/inbox tables processed by PHP CLI workers or scheduled jobs, subject to hosting capabilities |
| Integration transport | PHP cURL/HTTPS; credentials only on the server |
| Media | Standard PHP GD extension with WebP support, fileinfo validation, private source archive and responsive public WebP derivatives |
| Authentication | PHP sessions and native password/security primitives, with secure cookies and role checks on every protected endpoint |
| Delivery | Static versioned CSS/JS/WebP, PHP OPcache and server compression where supported |

Laravel is excluded because it is a framework. “No libraries” is interpreted as no third-party application packages or browser libraries, not a ban on PHP's standard runtime extensions. PDO MySQL, cURL, GD/WebP, fileinfo and OpenSSL availability must be confirmed before implementation.

This architecture can be lightweight, but removing frameworks does not by itself guarantee speed or security. We must implement and test validation, access control, session security, background retries and database transactions explicitly. Do not invent cryptography or process raw card data.

### Early feasibility gate for the strict dependency ban

The existing Picqer label service uses `dompdf/dompdf`. Screen-buyback table PDF export also loads Dompdf, while the installed QR-invoice component declares `sprain/swiss-qr-bill` and `genkgo/camt`. These are specific existing dependencies, not hypothetical ones.

Before committing the full rewrite, establish which outputs/imports are actually used and prove library-free replacements for required PDF labels, invoices, QR bills and statement handling using approved non-sensitive fixtures. Validate printing, encoding, dimensions, QR readability and financial correctness. A browser print button is not automatically equivalent to downloadable/server-generated PDFs. Neither these functions nor the dependency ban may be silently discarded; an unresolved feasibility conflict requires an explicit decision.

Use a separated frontend and API without automatically choosing an SEO-hostile, blank client-rendered application. Public product/category URLs should have indexable HTML and metadata through static generation or a thin PHP delivery layer sharing the same application services. Interactive account/pricing/cart behavior uses the API. Personalized prices and responses must never enter shared caches.

## 2. Phase A — authenticated discovery and baseline

Inspect, without changing production:
- WordPress/WooCommerce versions, active and inactive plugins, theme/child theme, mu-plugins, snippets, custom hooks and scheduled jobs.
- PHP/database versions, required extensions, storage limits, cron/CLI availability, web-server configuration and backup/restore arrangements.
- Products, variants, attributes, SKU uniqueness, category hierarchy, device compatibility, media and supplier identifiers.
- Customer roles, registration/approval, assigned pricing groups, per-product prices, taxes, VAT exemptions, currencies, discounts and quantity rules.
- Customer and staff journeys: search, filtering, cart, checkout, orders, invoices, returns, refunds, notifications, imports and stock management.
- Payment/shipping/accounting integrations, email delivery, and the complete Picqer data flow.
- Public URLs, redirects, canonical tags, structured data, sitemaps, languages and any connected subdomains/services.

Read settings selectively and redact secrets. Do not copy production configuration files or raw customer records into project documentation or browser logs.

Deliverables:
1. Function inventory: existing behavior, evidence, dependencies, new implementation, acceptance scenario and verification status.
2. Data and integration map, including who owns each synchronized field.
3. Representative desktop/mobile performance baseline.
4. Risk register and effort estimate based on observed scope, not an invented completion date.

Gate: all discovered functions are accounted for; unverified behavior is clearly marked, not treated as absent.

The current source inventory is the first part of this phase, not its exit gate. The next evidence needed is active configuration and schema/aggregate information from a sanitized database export or separately authorized read-only database access, plus safe customer/staff walkthroughs. Do not upload PHP probes, execute WordPress bootstrap scripts, create backup jobs or change hosting configuration to manufacture that access.

## 3. Phase B — information architecture and visual design

Compare relevant competitor journeys, not just their homepages. Study model selection, quality explanations, stock visibility, quantity entry, quick ordering, mobile filtering and account navigation.

Design the complete store: home, category/model selection, results, product details, cart, checkout, account and staff tools. Keep important purchasing information prominent and avoid effects that delay ordering.

Support both:
- Part type → brand/model → compatible product/variant.
- Brand/model → available part types → compatible product/variant.

Model compatibility must be many-to-many: one product may fit several devices. Do not silently choose only the first compatible model or hide models solely because few products match. Distinguish actual compatibility from product manufacturers, quality labels, colors and model aliases.

Gate: reviewed visual direction and representative mobile/desktop flows, backed by real product examples and a category mapping. Category counts and filters agree with the product relationships.

## 4. Phase C — secure foundation and database design

Create a separate application and database; leave both the live WordPress store and the current prototype intact while the replacement is being developed.

Confirm a hosting/database option that provides the requested MySQL engine. The existing host currently reports MariaDB, so do not promise a same-server MySQL deployment without checking availability or receiving agreement on a compatible alternative.

Provisional entities, to refine after discovery:
- Products, variants, categories, product-category relationships, brands, models, compatibility and aliases.
- Media records and generated image sizes.
- Customers, staff, roles, customer groups, explicit group prices and addresses.
- Carts, orders, immutable order-line/tax/price/address snapshots, payment references and shipments.
- Inventory snapshots, pending reservations, warehouse/product mappings, integration events and jobs.
- Feature settings, audit events, legacy ID mappings and URL redirects.
- Returns, invoices and other domain records where the audit confirms they are needed.

The source audit now confirms that RMA return items, credit notes, address books and screen-buyback price-table synchronization must be included in the migration inventory rather than treated as optional future features. Their live data and exact state transitions are still unverified.

Use decimal-safe money calculations, transactional order creation, server-side pricing and validation. A customer can access only their account, orders and assigned prices. Admin endpoints must enforce staff permissions independently of the interface.

Security includes prepared statements, contextual output escaping, CSRF protection for cookie-authenticated writes, rate limiting, session rotation, secure/HttpOnly/SameSite cookies, expiring one-use recovery tokens, safe upload storage and secrets outside the public web root.

Account migration needs its own verified strategy. Do not assume WordPress password hashes or prototype identity records can be copied directly into native PHP authentication. If safe compatibility is not possible within the dependency rules, agree a controlled password-reset or alternative migration process. Preserve any existing login methods identified in the audit unless explicitly approved otherwise.

Gate: authorization, price isolation, sessions and transaction integrity pass representative positive and negative tests.

## 5. Phase D — repeatable data migration

- Work from an authorized snapshot, with customer data minimized/anonymized for development.
- Inspect WooCommerce storage mode and plugin-specific tables; do not assume all orders or pricing rules live in the standard post tables.
- Map source identifiers to destination identifiers, including external SKU/Picqer references.
- Migrate catalog, compatibility, images, customer/group assignments and all required order/history data.
- Build repeatable imports with checkpoints, validation, error reports and change logs.
- Preserve historical order totals, tax treatment and addresses rather than recomputing them from current prices.
- Reconcile record counts, SKU sets, group-price coverage, monetary totals and sampled relationships.
- Preserve old URLs or map them to verified redirects; avoid broad redirects to the homepage.

Gate: reconciliation passes with every exception recorded and resolved or explicitly accepted. Repeating migration does not duplicate products, customers or orders.

## 6. Phase E — functional rebuild

Implement the verified function inventory in dependency order:
1. Catalog, taxonomy, compatibility, search, filtering, product details and media.
2. Accounts, customer approval, pricing groups and staff permissions.
3. Cart, checkout, taxes/shipping, order lifecycle and existing payment behavior.
4. Account history, invoices, returns/refunds, notifications and staff workflows.
5. Integration-dependent operations and all remaining audited functions.

Preserve the existing payment provider when feasible. Prefer its hosted payment flow and documented HTTPS API so card data never enters this application. Provider-specific requirements, invoice/PDF generation, email delivery and any mandatory SDK must be audited against the no-library rule; report conflicts rather than silently dropping functionality.

Gate: every audited function has its replacement and acceptance evidence. No critical function is postponed simply to declare a smaller MVP complete.

## 7. Picqer integration workstream

Assume the owner means Picqer, but verify this against the live configuration.

Do not assume ownership: document whether Picqer or the store controls product descriptions, prices, physical stock, available-to-sell stock, reservations, customers, shipments and order status.

Proposed design:
- Browser → custom API → local MySQL for browsing. No Picqer credentials or direct Picqer calls in the frontend.
- Initial paginated synchronization and durable webhook ingestion for subsequent changes.
- For salable availability, use the documented free-stock semantics appropriate to the existing business, not raw physical-stock events indiscriminately.
- Authenticate webhooks per the current provider contract; persist them before acknowledging, then process through a worker.
- Handle duplicate/out-of-order deliveries and recover missed events through scheduled reconciliation.
- Send eligible orders through a transactional outbox with explicit external references and stored sync status.
- Reconcile ambiguous timeouts before resending order creation; do not blindly retry a potentially successful POST.
- Handle rate limits, backoff, outages, alerting and operator retries.
- Map partial shipments, cancellations, returns and stock adjustments only after confirming the current lifecycle.
- During development use a test account or read-only snapshot; outbound production writes stay disabled.

Local transactions cannot alone prevent overselling across several channels. Confirm Picqer's reservation behavior and define an authoritative checkout policy. On stale/unavailable inventory, do not silently report successful stock confirmation. Specify whether checkout waits, stops or enters an explicit pending state based on the real business rules.

Gate: tested duplicate deliveries, missed events, API limits, ambiguous timeouts, concurrent purchases and stock/order reconciliation with no duplicate external orders.

## 8. Image pipeline

For new uploads and migrated images:
1. Validate actual file type, byte size and decoded dimensions, not just filename extension.
2. Decode safely, normalize orientation, preserve required transparency and reject unsupported content explicitly.
3. Generate appropriately sized thumbnail, listing and detail WebP files, rather than serving originals everywhere.
4. Optimize encoding for the smallest practical file size under an approved visual-quality threshold.
5. Verify dimensions, file existence, MIME type and successful conversion before publishing the media record.
6. Serve width/height, responsive srcset and lazy loading below the fold; prioritize the main visible image.

“Maximum compression” must not destroy tiny connector details or product labels. Compare output on representative parts; tune quality and encoder effort separately. Do not repeatedly recompress an already lossy derivative. Keep source assets privately until migration and quality checks are accepted.

Gate: accepted uploads produce usable WebP derivatives; invalid/oversized files fail safely; no silent original-format fallback; representative detail images remain legible.

## 9. Performance and acceptance

Provisional performance targets, to validate against the measured baseline:
- No external font requests and no third-party frontend runtime/framework requests.
- Mobile Core Web Vitals targets: LCP ≤ 2.5 seconds, INP ≤ 200 ms, CLS ≤ 0.1 at the 75th percentile once real traffic is available.
- Pre-release lab measurements on representative home, catalog, model-filter, product and cart pages, with documented device/network/cache conditions.
- Separate authenticated API/load measurements on a production-sized catalog; set the p95 response-time budget after profiling the actual hosting.

Required functional evidence includes:
- Different customer groups receive correct prices without exposure through UI, API or shared caches.
- Category/model compatibility, counts, search and variants work together.
- Concurrent checkout cannot produce negative local stock or duplicate orders.
- Payment failure/retry, shipping/tax rules, Picqer outages and partial shipments behave predictably.
- Staff authorization, account isolation, recovery flows and uploads withstand negative tests.
- Keyboard/mobile usability and all required language/URL behavior are retained.

Do not equate a Lighthouse score or a clean type check with a verified ordering system.

## 10. Later transition — not authorized now

After functional acceptance and a separate explicit launch decision:
- Take verified backups, perform a migration rehearsal and verify restore.
- Define the order/stock delta-sync or controlled write-freeze window.
- Ensure only one system sends each production order, notification and webhook side effect.
- Execute final data reconciliation, URL changes and operational checks.
- Retain a rollback route that reconciles orders created during the transition rather than restoring an old database over new sales.

The current request authorizes research and planning, not this transition.

## Dependencies before final estimates

Authenticated read-only hosting access; complete source/plugin inventory; permitted database snapshot or schema/aggregate inspection; current Picqer contracts and test access; payment/shipping/email details; decisions on legacy account migration and any capabilities that conflict with a strict package ban.

## Research sources

- Picqer API: https://picqer.com/en/api
- Picqer webhook semantics, retries and queue recommendation: https://picqer.com/en/api/webhooks
- cPanel API token documentation: https://api.docs.cpanel.net/cpanel/tokens
- Public competitor references: https://www.mobileparts.shop/nl, https://foneday.shop/catalog, https://gsmnetshop.nl/