# Product CSV import

The prototype product manager at `/admin/products` has an **Import CSV** action.
This belongs to the TypeScript/PostgreSQL prototype; it does not change the
separate offline PHP test shop or its no-egress boundary.

## File format

- UTF-8 CSV (an optional BOM is accepted), comma or semicolon separated.
- Maximum 1,000 product records and 1 MiB per file.
- Required headers: `sku,name,brand,price,stock`. `listPrice` is an alias for
  `price`; use one, not both.
- Optional headers: `quality,description,imageUrl,featured,model`.
- `category` and `categoryId` may be present but are ignored: categories are
  always assigned by the existing AI taxonomy, not supplier category labels.
- Headers are case-sensitive. Unknown or duplicate headers are rejected.
- Prices are ordinary nonnegative decimal currency amounts (maximum
  99999999.99), not cents. Dot or comma decimals are accepted; quote decimal
  commas in comma-delimited CSV. No currency symbols or thousands separators.
- Stock is an integer from 0 to 2147483647.
- Omitted or blank quality becomes `Standard`. Featured is `true`, `false`,
  or blank (false).
- Brand names match case-insensitively; new brands are created with successful
  product imports. An optional model must already exist for the supplied brand.
- Image URLs must use HTTP(S), without embedded credentials. The importer
  stores the URL; it does not fetch remote files.
- Quoted delimiters, doubled quotes, and newlines inside quoted fields work.

The dialog offers an example file and a downloadable result report.

## Safety and results

The staff-only endpoint is `POST /api/admin/products/import`, with JSON
`{"csv":"<file contents>"}`. The browser reads the selected file and sends its
contents; the file itself is not retained.

Each product record has exactly one result: `imported`, `duplicate`, or
`invalid`. Results include the logical CSV record number (header is row 1),
SKU, name, and explanatory message; imported records also contain the product
id and category slug.

SKU matching is case-sensitive, as in the existing product manager/database.
The first occurrence of a SKU in the file is considered; later occurrences
are reported as duplicates, even if the first occurrence was invalid.
Existing SKUs, including a concurrent insert, are reported rather than updated.
Neither existing prices nor stock are overwritten.

Row validation failures do not block other valid products. Malformed CSV,
invalid headers, and file limits reject the whole request. AI classification
uses the existing prompt in batches of 40 with at most three simultaneous
requests. Responses must classify every requested id exactly once with a
known category; failed or incomplete responses never become a default category.

All classification happens before a database transaction. Brand/product writes
then happen in one transaction. Classification or database failure leaves no
partially imported products. Two imports at a time are admitted per API
process; further requests receive 429.

Large imports can take several minutes. Keep the dialog open until the report
arrives. Disconnects detected before or during the transaction abort the work.
A connection can still be lost after commit: if no response was received, check
the product list or retry the file. Retrying safely reports already-created
SKUs and does not overwrite them. The server does not keep a job or report
history; download the report before navigating away.

## Checks

`pnpm --filter @workspace/api-server test` covers parsing, row validation,
duplicate reports, classifier completeness, batch size/concurrency, retries,
and failure-before-write behavior with isolated test doubles.

`pnpm --filter @workspace/api-server run typecheck` and
`pnpm --filter @workspace/parts-store run typecheck` verify the generated API
contract and the upload dialog.