<?php
declare(strict_types=1);

/*
 * Canonical EUR staff pricing.  This file deliberately owns no schema or
 * currency initialization; those are supplied by the currency/schema layer.
 */

function pricingInteger(mixed $value, int $min = 0, int $max = 100000000): int
{
    if (!is_int($value)) {
        throw new HttpError(422, 'Price cents and versions must be JSON integers.');
    }
    if ($value < $min || $value > $max) {
        throw new HttpError(422, "Integer must be between $min and $max.");
    }
    return $value;
}

function pricingGroups(): array
{
    $rows = opRows('SELECT id,name FROM customer_groups ORDER BY id');
    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
    }
    unset($row);
    return $rows;
}

function pricingWooColumns(): array
{
    return [
        'Repairshop — test' => 'Meta: BigRepairShopCustomerAccount_wholesale_price',
        'Wholesale — test' => 'Meta: wholesale_customer_wholesale_price',
        'Partner — test' => 'Meta: partner_customerpp_wholesale_price',
    ];
}

function pricingWooMoney(string $value): ?int
{
    $value = trim(str_replace(',', '.', $value));
    if ($value === '' || !is_numeric($value)) return null;
    $cents = (int)round((float)$value * 100);
    return $cents > 0 ? $cents : null;
}

function pricingWooRows(string $path): array
{
    $handle = fopen($path, 'rb');
    $headers = $handle ? fgetcsv($handle, 0, ',', '"', '') : false;
    if (!is_array($headers)) throw new HttpError(422, 'The WooCommerce export cannot be read.');
    $headers[0] = ltrim((string)$headers[0], "\xEF\xBB\xBF");
    foreach (array_merge(['Published', 'SKU'], array_values(pricingWooColumns())) as $required) {
        if (!in_array($required, $headers, true)) throw new HttpError(422, "Required column is missing: $required");
    }
    $rows = [];
    while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
        $values = array_slice(array_pad($values, count($headers), ''), 0, count($headers));
        $row = array_combine($headers, $values);
        if ($row === false || trim((string)($row['Published'] ?? '')) !== '1') continue;
        $sku = trim((string)($row['SKU'] ?? ''));
        if ($sku === '') continue;
        if (isset($rows[$sku])) throw new HttpError(422, "Published SKU occurs more than once: $sku");
        $prices = [];
        foreach (pricingWooColumns() as $group => $column) {
            $prices[$group] = pricingWooMoney((string)($row[$column] ?? ''));
        }
        $rows[$sku] = [
            'prices' => $prices,
            'purchase' => pricingWooMoney((string)($row['Meta: Purchase_Price'] ?? '')),
            'complete' => !in_array(null, $prices, true),
        ];
    }
    fclose($handle);
    return $rows;
}

function pricingWooPlan(array $rows): array
{
    $existing = array_fill_keys(array_map('strval', db()->query('SELECT sku FROM products')->fetchAll(PDO::FETCH_COLUMN)), true);
    $complete = $incomplete = 0;
    $missing = [];
    foreach ($rows as $sku => $row) {
        if (!isset($existing[$sku])) $missing[] = $sku;
        elseif ($row['complete']) $complete++;
        else $incomplete++;
    }
    return [
        'published_source_skus' => count($rows),
        'complete_price_sets' => $complete,
        'incomplete_price_sets_to_draft' => $incomplete,
        'source_skus_missing_from_catalog' => count($missing),
        'missing_examples' => array_slice($missing, 0, 20),
        'mapping' => pricingWooColumns(),
    ];
}

function pricingWooPreview(): never
{
    requireStaff();
    $file = $_FILES['file'] ?? null;
    if (!is_array($file) || (int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new HttpError(422, 'A WooCommerce CSV export is required.');
    }
    $size = (int)($file['size'] ?? 0);
    $temporary = (string)($file['tmp_name'] ?? '');
    if ($size < 1 || $size > 8 * 1024 * 1024 || !is_uploaded_file($temporary)) {
        throw new HttpError($size > 8 * 1024 * 1024 ? 413 : 422, 'The WooCommerce CSV upload is invalid.');
    }
    $directory = dirname(__DIR__) . '/storage/price-imports';
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new HttpError(500, 'Protected import storage is unavailable.');
    }
    $token = bin2hex(random_bytes(24));
    $path = $directory . '/' . $token . '.csv';
    if (!move_uploaded_file($temporary, $path)) throw new HttpError(500, 'The uploaded export could not be retained.');
    chmod($path, 0600);
    try {
        $rows = pricingWooRows($path);
        $plan = pricingWooPlan($rows);
    } catch (Throwable $error) {
        @unlink($path);
        throw $error;
    }
    $_SESSION['pricing_woo_imports'][$token] = [
        'path' => $path, 'sha256' => hash_file('sha256', $path), 'expires' => time() + 1800,
    ];
    respond($plan + ['token' => $token, 'expires_in_seconds' => 1800]);
}

function pricingWooApply(array $input, array $staff): never
{
    $token = text($input['token'] ?? '', 100);
    $preview = $_SESSION['pricing_woo_imports'][$token] ?? null;
    unset($_SESSION['pricing_woo_imports'][$token]);
    if (!is_array($preview) || (int)$preview['expires'] < time() || !is_file((string)$preview['path'])
        || !hash_equals((string)$preview['sha256'], (string)hash_file('sha256', (string)$preview['path']))) {
        throw new HttpError(409, 'The price import preview expired. Upload the export again.');
    }
    $path = (string)$preview['path'];
    $rows = pricingWooRows($path);
    $plan = pricingWooPlan($rows);
    $pdo = db();
    $groups = [];
    foreach (pricingGroups() as $group) $groups[$group['name']] = (int)$group['id'];
    foreach (array_keys(pricingWooColumns()) as $name) {
        if (!isset($groups[$name])) throw new HttpError(409, "Required customer group is missing: $name");
    }
    $products = [];
    foreach ($pdo->query('SELECT id,sku FROM products') as $product) $products[(string)$product['sku']] = (int)$product['id'];
    $complete = $pdo->prepare("UPDATE products SET purchase_price_eur_cents=?,publication_status='visible',pricing_version=pricing_version+1 WHERE id=?");
    $incomplete = $pdo->prepare("UPDATE products SET purchase_price_eur_cents=?,publication_status='draft',pricing_version=pricing_version+1 WHERE id=?");
    $clear = $pdo->prepare('UPDATE group_prices SET price_eur_cents=NULL WHERE product_id=?');
    $upsert = $pdo->prepare(dbDriver() === 'pgsql'
        ? 'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,0,?)
           ON CONFLICT (product_id,group_id) DO UPDATE SET price_eur_cents=EXCLUDED.price_eur_cents'
        : 'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,0,?)
           ON DUPLICATE KEY UPDATE price_eur_cents=VALUES(price_eur_cents)');
    try {
        $pdo->beginTransaction();
        foreach ($rows as $sku => $row) {
            if (!isset($products[$sku])) continue;
            $productId = $products[$sku];
            if (!$row['complete']) {
                $clear->execute([$productId]);
                $incomplete->execute([$row['purchase'], $productId]);
                continue;
            }
            foreach ($row['prices'] as $group => $price) $upsert->execute([$productId, $groups[$group], $price]);
            $complete->execute([$row['purchase'], $productId]);
        }
        audit('prices.woocommerce_imported', 'catalog', 0, $plan + [
            'source_sha256' => $preview['sha256'], 'by' => (int)$staff['id'],
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    } finally {
        @unlink($path);
    }
    respond($plan + ['applied' => true]);
}

function pricingProductsByIds(array $ids): array
{
    if ($ids === []) return [];
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $rows = opRows(
        "SELECT p.id,p.sku,p.name,p.category_id,p.brand_id,p.quality,p.stock,p.active,
                p.purchase_price_eur_cents,p.list_price_eur_cents,p.pricing_version,
                c.name category_name,b.name brand_name
         FROM products p
         LEFT JOIN categories c ON c.id=p.category_id
         LEFT JOIN brands b ON b.id=p.brand_id
         WHERE p.id IN ($marks)",
        $ids
    );
    $byId = [];
    foreach ($rows as $row) $byId[(int)$row['id']] = $row;
    $prices = opRows(
        "SELECT product_id,group_id,price_eur_cents FROM group_prices
         WHERE product_id IN ($marks) AND price_eur_cents IS NOT NULL
         ORDER BY product_id,group_id",
        $ids
    );
    foreach ($prices as $price) {
        $byId[(int)$price['product_id']]['group_prices'][] = [
            'group_id' => (int)$price['group_id'],
            'price_eur_cents' => (int)$price['price_eur_cents'],
        ];
    }
    $result = [];
    foreach ($ids as $id) {
        if (!isset($byId[$id])) continue;
        $row = $byId[$id];
        foreach (['id', 'category_id', 'brand_id', 'stock', 'pricing_version'] as $key) {
            if ($row[$key] !== null) $row[$key] = (int)$row[$key];
        }
        foreach (['purchase_price_eur_cents', 'list_price_eur_cents'] as $key) {
            $row[$key] = $row[$key] === null ? null : (int)$row[$key];
        }
        $row['active'] = (bool)$row['active'];
        $row['group_prices'] ??= [];
        $result[] = $row;
    }
    return $result;
}

/** Build the common product filter without retaining request-specific static state. */
function pricingFilter(array $filters): array
{
    $where = ['1=1'];
    $params = [];
    $q = trim((string)($filters['q'] ?? ''));
    if ($q !== '') {
        if (mb_strlen($q) > 200) throw new HttpError(422, 'Search query is too long.');
        $where[] = '(p.name LIKE ? OR p.sku LIKE ?)';
        $params[] = "%$q%";
        $params[] = "%$q%";
    }
    foreach (['category' => 'category_id', 'brand' => 'brand_id'] as $input => $column) {
        if (isset($filters[$input]) && $filters[$input] !== '') {
            $where[] = "p.$column=?";
            $params[] = integer($filters[$input], 1, 2147483647);
        }
    }
    if (isset($filters['quality']) && $filters['quality'] !== '') {
        $where[] = 'p.quality=?';
        $params[] = text($filters['quality'], 100);
    }
    $stock = (string)($filters['stock'] ?? '');
    if ($stock === 'in_stock') $where[] = 'p.stock>0';
    elseif ($stock === 'out_of_stock') $where[] = 'p.stock=0';
    elseif ($stock === 'low_stock') {
        $where[] = 'p.stock<=?';
        $params[] = opSetting('low_stock_threshold', 5);
    } elseif ($stock !== '') throw new HttpError(422, 'Invalid stock filter.');
    $status = (string)($filters['status'] ?? 'all');
    if ($status === 'active') $where[] = 'p.active=TRUE';
    elseif ($status === 'archived') $where[] = 'p.active=FALSE';
    elseif ($status !== 'all' && $status !== '') throw new HttpError(422, 'Invalid product status.');
    $sort = (string)($filters['sort'] ?? 'newest');
    $order = match ($sort) {
        '', 'newest' => 'p.updated_at DESC,p.id DESC',
        'price_asc' => 'p.list_price_eur_cents ASC,p.id ASC',
        'price_desc' => 'p.list_price_eur_cents DESC,p.id ASC',
        'name_asc' => 'p.name ASC,p.id ASC',
        'name_desc' => 'p.name DESC,p.id ASC',
        'stock_asc' => 'p.stock ASC,p.id ASC',
        'stock_desc' => 'p.stock DESC,p.id ASC',
        'sku_asc' => 'p.sku ASC,p.id ASC',
        default => throw new HttpError(422, 'Invalid product sort.'),
    };
    return ['sql' => implode(' AND ', $where), 'params' => $params, 'order' => $order];
}

function pricingRate(): ?array
{
    return function_exists('currencyExchangeRate') ? currencyExchangeRate() : null;
}

function pricingValidateGroupChanges(mixed $input, array $validGroups): array
{
    if (!is_array($input)) throw new HttpError(422, 'group_prices must be an array.');
    $changes = [];
    foreach ($input as $entry) {
        if (!is_array($entry)) throw new HttpError(422, 'Invalid group price entry.');
        $groupId = pricingInteger($entry['group_id'] ?? null, 1, 2147483647);
        if (array_key_exists($groupId, $changes)) throw new HttpError(422, 'Duplicate group ID in a row.');
        if (!isset($validGroups[$groupId])) throw new HttpError(422, "Unknown customer group $groupId.");
        if (!array_key_exists('price_eur_cents', $entry)) {
            throw new HttpError(422, 'A group price entry requires price_eur_cents.');
        }
        $changes[$groupId] = $entry['price_eur_cents'] === null
            ? null : pricingInteger($entry['price_eur_cents']);
    }
    return $changes;
}

function pricingSnapshot(int $productId): array
{
    $product = opRow(
        'SELECT purchase_price_eur_cents,list_price_eur_cents,pricing_version FROM products WHERE id=?',
        [$productId]
    );
    if ($product === null) throw new HttpError(404, 'Product not found.');
    return [
        'purchase_price_eur_cents' => $product['purchase_price_eur_cents'] === null ? null : (int)$product['purchase_price_eur_cents'],
        'list_price_eur_cents' => $product['list_price_eur_cents'] === null ? null : (int)$product['list_price_eur_cents'],
        'pricing_version' => (int)$product['pricing_version'],
        'group_prices' => array_map(static fn(array $r): array => [
            'group_id' => (int)$r['group_id'],
            'price_eur_cents' => (int)$r['price_eur_cents'],
        ], opRows('SELECT group_id,price_eur_cents FROM group_prices WHERE product_id=? AND price_eur_cents IS NOT NULL ORDER BY group_id', [$productId])),
    ];
}

function pricingApplyChanges(int $id, array $changes): void
{
    $sets = [];
    $params = [];
    foreach (['purchase_price_eur_cents', 'list_price_eur_cents'] as $field) {
        if (array_key_exists($field, $changes)) {
            $sets[] = "$field=?";
            $params[] = $changes[$field];
        }
    }
    $sets[] = 'pricing_version=pricing_version+1';
    db()->prepare('UPDATE products SET ' . implode(',', $sets) . ' WHERE id=?')
        ->execute([...$params, $id]);
    foreach ($changes['group_prices'] ?? [] as $groupId => $price) {
        if ($price === null) {
            /* Keep a retained legacy CHF source row, while removing its EUR override. */
            db()->prepare('UPDATE group_prices SET price_eur_cents=NULL WHERE product_id=? AND group_id=?')->execute([$id, $groupId]);
        } else {
            db()->prepare(dbDriver() === 'pgsql'
                ? 'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents)
                   VALUES(?,?,0,?) ON CONFLICT (product_id,group_id) DO UPDATE SET price_eur_cents=EXCLUDED.price_eur_cents'
                : 'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents)
                   VALUES(?,?,0,?) ON DUPLICATE KEY UPDATE price_eur_cents=VALUES(price_eur_cents)')
                ->execute([$id, $groupId, $price]);
        }
    }
}

function pricingBulk(array $input, array $staff): never
{
    $rows = $input['rows'] ?? null;
    if (!is_array($rows) || $rows === []) throw new HttpError(422, 'rows must be a non-empty array.');
    if (count($rows) > 1000) throw new HttpError(413, 'At most 1000 rows may be updated.');
    $groups = [];
    foreach (pricingGroups() as $group) $groups[$group['id']] = true;
    $parsed = [];
    foreach ($rows as $row) {
        if (!is_array($row)) throw new HttpError(422, 'Invalid pricing row.');
        $id = pricingInteger($row['id'] ?? null, 1, 2147483647);
        if (isset($parsed[$id])) throw new HttpError(422, "Duplicate product ID $id.");
        $version = pricingInteger($row['version'] ?? null, 0, 2147483647);
        $changes = [];
        if (array_key_exists('purchase_price_eur_cents', $row)) {
            $changes['purchase_price_eur_cents'] = $row['purchase_price_eur_cents'] === null
                ? null : pricingInteger($row['purchase_price_eur_cents']);
        }
        if (array_key_exists('list_price_eur_cents', $row)) {
            if ($row['list_price_eur_cents'] === null) throw new HttpError(422, 'Base selling price cannot be null.');
            $changes['list_price_eur_cents'] = pricingInteger($row['list_price_eur_cents']);
        }
        if (array_key_exists('group_prices', $row)) {
            $changes['group_prices'] = pricingValidateGroupChanges($row['group_prices'], $groups);
        }
        if ($changes === []) throw new HttpError(422, "Product $id has no price changes.");
        $parsed[$id] = ['version' => $version, 'changes' => $changes];
    }
    ksort($parsed, SORT_NUMERIC);
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $ids = array_keys($parsed);
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $locked = opRows("SELECT id,pricing_version FROM products WHERE id IN ($marks) ORDER BY id FOR UPDATE", $ids);
        $versions = [];
        foreach ($locked as $row) $versions[(int)$row['id']] = (int)$row['pricing_version'];
        $missing = array_values(array_diff($ids, array_keys($versions)));
        if ($missing !== []) throw new HttpError(422, 'Unknown product IDs: ' . implode(', ', $missing) . '.');
        $conflicts = [];
        foreach ($parsed as $id => $row) if ($versions[$id] !== $row['version']) $conflicts[] = $id;
        if ($conflicts !== []) throw new HttpError(409, 'Pricing versions changed for product IDs: ' . implode(', ', $conflicts) . '. Reload and retry.');
        foreach ($parsed as $id => $row) {
            $before = pricingSnapshot($id);
            pricingApplyChanges($id, $row['changes']);
            $after = pricingSnapshot($id);
            audit('product.prices_updated', 'product', $id, ['before' => $before, 'after' => $after, 'by' => (int)$staff['id']]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    respond(['products' => pricingProductsByIds(array_keys($parsed)), 'currency' => 'EUR']);
}

function pricingAdjustedValue(?int $current, string $operation, int $value): int
{
    if ($current === null) throw new HttpError(422, 'The selection contains unknown purchase costs; use set with an explicit value.');
    $result = match ($operation) {
        'set' => $value,
        'add' => $current + $value,
        'percent' => intdiv($current * (10000 + $value) + 5000, 10000),
        default => throw new HttpError(422, 'Invalid adjustment operation.'),
    };
    if ($result < 0 || $result > 100000000) throw new HttpError(422, 'An adjusted price is outside the supported range.');
    return $result;
}

function pricingPreview(array $input, array $staff): never
{
    $filters = $input['filters'] ?? [];
    if (!is_array($filters)) throw new HttpError(422, 'filters must be an object.');
    $field = $input['field'] ?? null;
    if (!is_string($field)) throw new HttpError(422, 'Invalid adjustment field.');
    $groupId = null;
    if (preg_match('/^group:(\d+)$/', $field, $match)) {
        $groupId = pricingInteger((int)$match[1], 1, 2147483647);
        if (opRow('SELECT id FROM customer_groups WHERE id=?', [$groupId]) === null) throw new HttpError(422, 'Unknown customer group.');
    } elseif (!in_array($field, ['list_price_eur_cents', 'purchase_price_eur_cents'], true)) {
        throw new HttpError(422, 'Invalid adjustment field.');
    }
    $operation = $input['operation'] ?? null;
    if (!is_string($operation) || !in_array($operation, ['set', 'add', 'percent'], true)) throw new HttpError(422, 'Invalid adjustment operation.');
    if (!array_key_exists('value', $input) || !is_int($input['value'])) throw new HttpError(422, 'Adjustment value must be integer cents or basis points.');
    $value = $input['value'];
    if ($operation === 'set') pricingInteger($value);
    elseif ($operation === 'add' && ($value < -100000000 || $value > 100000000)) throw new HttpError(422, 'Invalid adjustment amount.');
    elseif ($operation === 'percent' && ($value < -10000 || $value > 1000000)) throw new HttpError(422, 'Invalid percentage adjustment.');
    $filter = pricingFilter($filters);
    $join = $groupId === null ? '' : ' LEFT JOIN group_prices gp ON gp.product_id=p.id AND gp.group_id=' . $groupId;
    $column = $groupId === null ? "p.$field" : 'gp.price_eur_cents';
    $statement = db()->prepare("SELECT p.id,p.sku,p.name,p.pricing_version,$column current_value FROM products p$join WHERE {$filter['sql']} ORDER BY p.id LIMIT 10001");
    $statement->execute($filter['params']);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) > 10000) throw new HttpError(413, 'Adjustment selects more than 10,000 products.');
    if ($rows === []) throw new HttpError(422, 'Adjustment selection is empty.');
    $selection = [];
    $samples = [];
    foreach ($rows as $row) {
        $current = $row['current_value'] === null ? null : (int)$row['current_value'];
        if ($current === null && $groupId !== null) {
            $base = opRow('SELECT list_price_eur_cents FROM products WHERE id=?', [(int)$row['id']]);
            $current = $base['list_price_eur_cents'] === null ? null : (int)$base['list_price_eur_cents'];
        }
        $next = $operation === 'set' ? $value : pricingAdjustedValue($current, $operation, $value);
        $selection[] = ['id' => (int)$row['id'], 'version' => (int)$row['pricing_version'], 'value' => $next];
        if (count($samples) < 20) $samples[] = [
            'id' => (int)$row['id'], 'sku' => $row['sku'], 'name' => $row['name'],
            'before' => $current, 'after' => $next,
        ];
    }
    startSession();
    $now = time();
    foreach (($_SESSION['pricing_previews'] ?? []) as $oldToken => $preview) {
        if (($preview['expires'] ?? 0) <= $now) unset($_SESSION['pricing_previews'][$oldToken]);
    }
    while (count($_SESSION['pricing_previews'] ?? []) >= 10) {
        array_shift($_SESSION['pricing_previews']);
    }
    $token = bin2hex(random_bytes(32));
    $_SESSION['pricing_previews'][$token] = [
        'expires' => $now + 300, 'staff_id' => (int)$staff['id'],
        'field' => $field, 'group_id' => $groupId, 'selection' => $selection,
    ];
    respond(['count' => count($selection), 'samples' => $samples, 'token' => $token,
        'expires_at' => gmdate('Y-m-d\TH:i:s\Z', $now + 300)]);
}

function pricingApplyPreview(array $input, array $staff): never
{
    $token = $input['token'] ?? null;
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) throw new HttpError(422, 'Invalid preview token.');
    startSession();
    $preview = $_SESSION['pricing_previews'][$token] ?? null;
    if (!is_array($preview)) throw new HttpError(409, 'Preview token is invalid or already used.');
    if (($preview['staff_id'] ?? 0) !== (int)$staff['id']) {
        throw new HttpError(403, 'Preview token belongs to another staff session.');
    }
    if ((int)$preview['expires'] <= time()) {
        unset($_SESSION['pricing_previews'][$token]);
        throw new HttpError(409, 'Preview token has expired.');
    }
    $selection = $preview['selection'];
    $ids = array_column($selection, 'id');
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $locked = opRows("SELECT id,pricing_version FROM products WHERE id IN ($marks) ORDER BY id FOR UPDATE", $ids);
        $versions = [];
        foreach ($locked as $row) $versions[(int)$row['id']] = (int)$row['pricing_version'];
        $conflicts = [];
        foreach ($selection as $row) {
            if (!isset($versions[$row['id']]) || $versions[$row['id']] !== $row['version']) $conflicts[] = $row['id'];
        }
        if ($conflicts !== []) throw new HttpError(409, 'Pricing versions changed for product IDs: ' . implode(', ', $conflicts) . '. Create a new preview.');
        foreach ($selection as $row) {
            $before = pricingSnapshot($row['id']);
            $changes = $preview['group_id'] === null
                ? [$preview['field'] => $row['value']]
                : ['group_prices' => [(int)$preview['group_id'] => $row['value']]];
            pricingApplyChanges($row['id'], $changes);
            audit('product.prices_adjusted', 'product', $row['id'], [
                'before' => $before, 'after' => pricingSnapshot($row['id']), 'by' => (int)$staff['id'],
            ]);
        }
        $pdo->commit();
        unset($_SESSION['pricing_previews'][$token]);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    respond(['updated' => count($selection), 'currency' => 'EUR']);
}

function handlePricingAdmin(string $method, string $path): bool
{
    if ($path === '/admin/prices/import/preview' && $method === 'POST') pricingWooPreview();
    if ($path === '/admin/prices/import/apply' && $method === 'POST') pricingWooApply(body(), requireStaff());
    if ($path === '/admin/prices' && $method === 'GET') {
        requireStaff();
        $filter = pricingFilter($_GET);
        $page = integer($_GET['page'] ?? 1, 1, 1000000);
        $limit = integer($_GET['limit'] ?? 50, 1, 500);
        $count = db()->prepare("SELECT COUNT(*) FROM products p WHERE {$filter['sql']}");
        $count->execute($filter['params']);
        $total = (int)$count->fetchColumn();
        $pages = max(1, (int)ceil($total / $limit));
        $page = min($page, $pages);
        $ids = db()->prepare("SELECT p.id FROM products p WHERE {$filter['sql']} ORDER BY {$filter['order']} LIMIT ? OFFSET ?");
        $index = 1;
        foreach ($filter['params'] as $param) $ids->bindValue($index++, $param, is_int($param) ? PDO::PARAM_INT : PDO::PARAM_STR);
        $ids->bindValue($index++, $limit, PDO::PARAM_INT);
        $ids->bindValue($index, ($page - 1) * $limit, PDO::PARAM_INT);
        $ids->execute();
        respond(['products' => pricingProductsByIds(array_map('intval', $ids->fetchAll(PDO::FETCH_COLUMN))),
            'groups' => pricingGroups(), 'total' => $total, 'page' => $page, 'pages' => $pages,
            'currency' => 'EUR', 'exchange_rate' => pricingRate()]);
    }
    if ($path === '/admin/prices/resolve' && $method === 'POST') {
        requireStaff();
        $skus = body()['skus'] ?? null;
        if (!is_array($skus) || count($skus) > 1000) throw new HttpError(422, 'skus must contain at most 1000 values.');
        $wanted = [];
        foreach ($skus as $sku) {
            if (!is_string($sku) || trim($sku) === '' || mb_strlen(trim($sku)) > 190) throw new HttpError(422, 'Invalid SKU.');
            $key = trim($sku);
            if (isset($wanted[$key])) throw new HttpError(422, "Duplicate SKU $key.");
            $wanted[$key] = true;
        }
        $found = [];
        if ($wanted !== []) {
            $marks = implode(',', array_fill(0, count($wanted), '?'));
            foreach (opRows("SELECT id,sku FROM products WHERE sku IN ($marks)", array_keys($wanted)) as $row) $found[$row['sku']] = (int)$row['id'];
        }
        $ids = [];
        $unknown = [];
        foreach (array_keys($wanted) as $sku) isset($found[$sku]) ? $ids[] = $found[$sku] : $unknown[] = $sku;
        respond(['products' => pricingProductsByIds($ids), 'groups' => pricingGroups(),
            'unknown_skus' => $unknown, 'currency' => 'EUR', 'exchange_rate' => pricingRate()]);
    }
    if ($path === '/admin/prices/bulk' && $method === 'POST') pricingBulk(body(), requireStaff());
    if ($path === '/admin/prices/adjust/preview' && $method === 'POST') {
        pricingPreview(body(), requireStaff());
    }
    if ($path === '/admin/prices/adjust/apply' && $method === 'POST') pricingApplyPreview(body(), requireStaff());
    return false;
}