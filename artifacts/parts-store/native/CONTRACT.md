# Native test shop implementation contract

This is a separate, framework-free application. Never change the existing React app, PostgreSQL data or any production service. No Composer, npm, external fonts or runtime libraries. Use PHP 8.4, PDO MySQL, native browser APIs and authored CSS/SVG.

## Safety and paths
- Public base: `/test-shop/`, API base: `/test-shop/api/`. JavaScript reads `window.APP_BASE`.
- All files under this `native/` directory. `public/` is the only document root.
- The PHP server runs with an empty environment except local runtime paths. Outbound network/process/mail functions are disabled. MySQL listens only on a local socket, never TCP.
- All stock, prices, orders, users and documents are isolated test records. Always label the environment; never claim a live connection. No real card forms, emails or fulfillment.
- PHP files declare strict types. Shared procedural helpers live in `src/bootstrap.php`; route modules expose `function handleX(string $method, string $path): bool`. Return true when handled; they call `respond($data, $status=200)` which exits. Throw `HttpError($status, $message)` on expected errors.
- Helpers: `db(): PDO`, `body(): array`, `currentUser(): ?array` (id, name, email, company, role, group_id, status), `requireUser(): array`, `requireStaff(): array`, `integer(mixed $value, int $min=0, int $max=1000000): int`, `text(mixed $value, int $max=255): string`, `audit(string $action, string $entity, int $entityId, array $details=[]): void`, `enqueue(string $kind,array $payload): void`, `basePath(): string`, `money(int $cents): float`.
- Authentication and CSRF checked centrally for all non-GET API operations; public auth/register/login/demo endpoints are CSRF-protected too. Frontend gets CSRF via GET session then sends `X-CSRF-Token`.
- All errors JSON `{"error":"Human message"}`. Never return SQL/stack traces.
- Money is integer cents, stock integer, pricing group chosen on server. Every product response has own `price_cents` or null for guest. Non-staff must never receive all group prices.
- All schema names and columns are in `database/schema.sql`. Do not change schema without telling the main agent.

## API
GET `/session` -> `{user,csrf,test_mode:true,capabilities:{live_stock:false,payments:false,email:false},currency:"CHF"}`
POST `/auth/demo` `{persona:"customer"|"partner"}` -> `{user,csrf}` (only isolated synthetic customer personas). Staff demo is prohibited; staff must authenticate normally.
POST `/auth/login` `{email,password}`; POST `/auth/register` `{name,email,password,company}` (pending approval); POST `/auth/logout`.
POST `/auth/forgot` `{email}` -> generic success (reset message goes into staff-only test mail inbox). POST `/auth/reset` `{token,password}`.
GET `/catalog` -> `{categories:[{id,name,slug,count}],brands:[{id,name}],models:[{id,brand_id,name}],qualities:[string],total}`
Category facets additionally have `image_url` (possibly empty); brand/model facets have active-product `count`. No model-frequency cutoff. Counts are read from the isolated database.
GET `/products?q=&category=&brand=&model=&quality=&stock=&sort=&page=&limit=` -> `{products:[Product],total,page,pages}`
Search understands model/SKU punctuation and Dutch/English part-category terms. `featured=1` filters featured records; `stock=out_of_stock` is also supported. Out-of-range page numbers are clamped. Explicit own-group price sorting is unchanged.
GET `/search/suggestions?q=` -> `{products:[Product],categories:[{id,name,slug,count,image_url}],models:[{id,brand_id,name,count}],total}`. Bounded suggestions, never client-group prices or new compatibility inference; queries shorter than two characters return empty suggestions.
GET `/products/:id` -> `{product:Product,images:[{id,url}],models:[{id,name}],related:[Product]}`
Product: id,sku,name,description,category_id,brand_id,quality,stock,price_cents,list_price_cents (staff only),image_url,featured,minimum_quantity.
GET `/cart` -> `{items:[{product_id,name,sku,image_url,quantity,stock,minimum_quantity,price_cents,total_cents}],subtotal_cents,shipping_cents,tax_cents,total_cents,currency:"CHF"}`
POST `/cart` `{product_id,quantity}` (sets quantity, 0 removes). DELETE `/cart` clears.
POST `/checkout` `{address_id,payment_method:"test_invoice"|"test_card",notes,idempotency_key}` -> `{order:{id,number,total_cents,status}}`. Require owned address, lock products & cart transactionally, reprice/revalidate stock and minimum quantity, snapshot prices/addresses, atomic stock decrement on local DB only. Enqueue test events only.
GET `/orders` -> `{orders:[{id,number,status,subtotal_cents,tax_cents,shipping_cents,total_cents,created_at,payment_method}]}`
GET `/orders/:id` -> `{order,items:[{id,product_id,name,sku,quantity,price_cents,total_cents}],address,events:[{status,note,created_at}]}`
GET `/profile` -> `{user}`. PATCH `/profile` `{name,company}` (not role/group/email).
GET `/addresses` -> `{addresses:[{id,label,name,company,line1,line2,postal_code,city,country,is_default}]}`
POST `/addresses`, PATCH `/addresses/:id` same fields; DELETE `/addresses/:id`. Ownership on every call.
GET `/returns` -> `{returns:[{id,number,order_id,status,reason,created_at,credit_cents}]}`
POST `/returns` `{order_id,reason,items:[{order_item_id,quantity}]}` -> `{return:{id,number,status}}`
GET `/returns/:id` -> `{return,items:[{name,quantity,price_cents}],events:[...]}`
GET `/documents/:orderId/invoice.pdf` and `/documents/:orderId/packing-slip.pdf` -> authenticated owned PDF, TEST watermark.
GET `/documents/returns/:returnId/credit-note.pdf` -> only approved/credited owned return.
GET `/buyback` -> `{items:[{id,model,grade,price_cents,active}]}`
POST `/buyback/requests` `{items:[{item_id,quantity}],notes}` -> `{request:{id,number,total_cents,status}}`
GET `/buyback/requests` -> `{requests:[...]}`

## Staff API (requireStaff)
GET `/admin/dashboard` -> `{stats:{products,orders,customers,revenue_cents,low_stock,open_returns},recent_orders:[...],low_stock:[Product],safety:{test_mode:true,live_connections:0}}`
GET `/admin/products?q=&page=&limit=` same listing + list_price_cents. POST `/admin/products` and PATCH `/admin/products/:id`: sku,name,description,category_id,brand_id,quality,stock,list_price_cents,minimum_quantity,featured; optional `group_prices:[{group_id,price_cents}]`. GET `/admin/products/:id` -> `{product,group_prices,images,model_ids}`. PATCH supports `model_ids:[int]`. DELETE archives (`active=0`), never erase order history.
POST `/admin/products/:id/images` multipart file -> `{images:[...]}` (WebP responsive conversion, local private originals). DELETE `/admin/images/:id`.
POST `/admin/import` multipart `file` CSV with sku,name,category,brand,quality,stock,price. Validate all rows before transaction; preview with `preview=1`; commit `preview=0`; no remote fetches. Return `{rows,created,updated,errors:[...]}`.
GET `/admin/customers` -> `{customers:[...],groups:[{id,name}]}`
PATCH `/admin/customers/:id` `{status:"active"|"pending"|"blocked",group_id}`. Do not allow changing own staff status/group.
GET `/admin/orders` -> `{orders:[...customer_name]}`
PATCH `/admin/orders/:id` `{status:"processing"|"shipped"|"completed"|"cancelled",tracking,note}`. State transitions validated. Cancellation restores test stock exactly once, no duplicate rollback.
GET `/admin/returns` -> `{returns:[...customer_name]}`
GET `/admin/returns/:id` -> `{return,items,events}` (staff only; customer detail remains ownership-scoped).
PATCH `/admin/returns/:id` `{status:"approved"|"rejected"|"credited",note}`; compute credit from returned order-item snapshots, no arbitrary client amount; no automatic restock (damaged goods).
GET `/admin/messages` -> `{messages:[{id,kind,payload,status,created_at}]}` (local email/outbox, never sends).
GET `/admin/integrations` -> `{connections:[{name,mode:"isolated",status:"blocked"}],events:[...]}`.
POST `/admin/integrations/simulate` `{event:"stock"|"shipment"|"payment"}` -> creates explicit locally simulated record; NEVER remote API.
GET `/admin/settings` -> `{settings:{currency,tax_bps,shipping_cents,free_shipping_cents,low_stock_threshold},safety:{...}}`
PATCH `/admin/settings` permitted numeric tax/shipping/threshold fields only; never allow toggling safety, currencies or external endpoints.
GET `/admin/audit` -> `{events:[{id,action,entity,entity_id,details,created_at}]}`
GET `/admin/buyback` -> `{items,requests}`. POST `/admin/buyback` / PATCH `/admin/buyback/:id` fields model,grade,price_cents,active. PATCH `/admin/buyback/requests/:id` `{status:"received"|"assessed"|"completed"|"rejected",note}`.

## File ownership
- Main agent: bootstrap.php, auth.php, catalog.php, router.php, database/schema.sql, bin/, infra, contract, data import, safety and integration tests.
- Commerce agent: src/commerce.php (cart, checkout, orders, addresses/profile, staff orders).
- Operations agent: src/operations.php (staff products/customers/dashboard/settings/integrations/audit/import, returns/credits, buyback). Cooperate with media module.
- Media agent: src/media.php (uploads, document PDFs), authored PDF utility, isolated image import utility if useful.
- Design agent: public/index.php, public/assets/* (CSS/native JS), frontend only. Split JS modules by storefront/account/staff to keep files readable. No fake buttons. Use complete API and clear errors/loading/empty states. Staff data visible only after role check. Own-price formatting in CHF.