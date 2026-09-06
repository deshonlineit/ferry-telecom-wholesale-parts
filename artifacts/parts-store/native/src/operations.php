<?php
declare(strict_types=1);

require_once __DIR__ . '/admin-finance.php';
require_once __DIR__ . '/pricing-admin.php';

/*
 * Staff operations, returns, buyback and CSV import for the isolated test shop.
 * Authentication and CSRF are enforced by the central router/bootstrap.
 */

function opRow(string $sql, array $params = []): ?array
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    return $row === false ? null : $row;
}

function opRows(string $sql, array $params = []): array
{
    $statement = db()->prepare($sql);
    $statement->execute($params);
    return $statement->fetchAll(PDO::FETCH_ASSOC);
}

function opJson(mixed $value): mixed
{
    if (!is_string($value)) {
        return $value;
    }
    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
}

function opBool(mixed $value): int
{
    if ($value === true || $value === 1 || $value === '1') {
        return 1;
    }
    if ($value === false || $value === 0 || $value === '0') {
        return 0;
    }
    throw new HttpError(422, 'Expected a boolean value.');
}

function opId(string $value): int
{
    return integer($value, 1, 2147483647);
}

function opProduct(array $row): array
{
    foreach (['id', 'category_id', 'brand_id', 'stock', 'list_price_cents', 'minimum_quantity',
        'purchase_price_eur_cents', 'list_price_eur_cents', 'pricing_version'] as $key) {
        if (array_key_exists($key, $row) && $row[$key] !== null) {
            $row[$key] = (int)$row[$key];
        }
    }
    if (array_key_exists('featured', $row)) {
        $row['featured'] = (bool)$row['featured'];
    }
    if (array_key_exists('active', $row)) {
        $row['active'] = (bool)$row['active'];
    }
    $row['price_cents'] = isset($row['list_price_eur_cents']) ? (int)$row['list_price_eur_cents'] : null;
    return $row;
}

function opSetting(string $name, int $default): int
{
    $row = opRow('SELECT value FROM settings WHERE name = ?', [$name]);
    if ($row === null || !preg_match('/^\d+$/', (string)$row['value'])) {
        return $default;
    }
    return (int)$row['value'];
}

function opNumber(string $prefix, int $id): string
{
    return $prefix . '-' . gmdate('Ymd') . '-' . str_pad((string)$id, 6, '0', STR_PAD_LEFT);
}

/** Exact floor(($value * $multiplier) / $divisor) without float conversion or integer overflow. */
function opMulDivFloor(int $value, int $multiplier, int $divisor): int
{
    if ($value < 0 || $multiplier < 0 || $divisor <= 0) {
        throw new LogicException('Invalid integer allocation operands.');
    }
    $whole = intdiv($value, $divisor) * $multiplier;
    $operand = $value % $divisor;
    $remainder = 0;
    $fraction = 0;
    $bits = decbin($multiplier);
    for ($index = 0, $length = strlen($bits); $index < $length; $index++) {
        $doubled = $remainder * 2 + ($bits[$index] === '1' ? $operand : 0);
        $fraction = $fraction * 2 + intdiv($doubled, $divisor);
        $remainder = $doubled % $divisor;
    }
    return $whole + $fraction;
}

/** Exact round-half-up(($value * $multiplier) / $divisor), also avoiding overflow. */
function opMulDivRoundHalfUp(int $value, int $multiplier, int $divisor): int
{
    $rounded = opMulDivFloor($value, $multiplier, $divisor);
    $operand = $value % $divisor;
    $remainder = 0;
    foreach (str_split(decbin($multiplier)) as $bit) {
        $remainder = ($remainder * 2 + ($bit === '1' ? $operand : 0)) % $divisor;
    }
    return $rounded + ($remainder * 2 >= $divisor ? 1 : 0);
}

function opReplaceRelations(int $productId, array $input, string $kind): void
{
    if ($kind === 'models') {
        $ids = [];
        foreach ($input as $value) {
            $ids[] = integer($value, 1, 2147483647);
        }
        $ids = array_values(array_unique($ids));
        if ($ids !== []) {
            $marks = implode(',', array_fill(0, count($ids), '?'));
            $statement = db()->prepare("SELECT COUNT(*) FROM device_models WHERE id IN ($marks)");
            $statement->execute($ids);
            if ((int)$statement->fetchColumn() !== count($ids)) {
                throw new HttpError(422, 'One or more models do not exist.');
            }
        }
        db()->prepare('DELETE FROM product_models WHERE product_id = ?')->execute([$productId]);
        $insert = db()->prepare('INSERT INTO product_models(product_id,model_id) VALUES(?,?)');
        foreach ($ids as $id) {
            $insert->execute([$productId, $id]);
        }
        return;
    }

    $prices = [];
    foreach ($input as $entry) {
        if (!is_array($entry)) {
            throw new HttpError(422, 'Invalid group price.');
        }
        $groupId = integer($entry['group_id'] ?? null, 1, 2147483647);
        if (isset($prices[$groupId])) {
            throw new HttpError(422, 'Duplicate customer group price.');
        }
        if (!array_key_exists('price_eur_cents', $entry)) {
            throw new HttpError(422, 'A group price requires price_eur_cents.');
        }
        $prices[$groupId] = $entry['price_eur_cents'] === null
            ? null : integer($entry['price_eur_cents'], 0, 100000000);
    }
    if ($prices !== []) {
        $ids = array_keys($prices);
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $statement = db()->prepare("SELECT COUNT(*) FROM customer_groups WHERE id IN ($marks)");
        $statement->execute($ids);
        if ((int)$statement->fetchColumn() !== count($ids)) {
            throw new HttpError(422, 'One or more customer groups do not exist.');
        }
    }
    /* Clearing a canonical override must never delete its retained CHF source row. */
    db()->prepare('UPDATE group_prices SET price_eur_cents=NULL WHERE product_id = ?')->execute([$productId]);
    $insert = db()->prepare(
        'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,0,?)
         ON DUPLICATE KEY UPDATE price_eur_cents=VALUES(price_eur_cents)'
    );
    foreach ($prices as $groupId => $price) {
        if ($price === null) continue;
        $insert->execute([$productId, $groupId, $price]);
    }
}

function opProductPayload(array $input, bool $create): array
{
    $allowed = ['sku', 'name', 'description', 'category_id', 'brand_id', 'quality', 'stock',
        'purchase_price_eur_cents', 'list_price_eur_cents', 'minimum_quantity', 'featured'];
    $result = [];
    foreach ($allowed as $field) {
        if (!array_key_exists($field, $input)) {
            continue;
        }
        $result[$field] = match ($field) {
            'sku' => text($input[$field], 190),
            'name' => text($input[$field], 500),
            'description' => text($input[$field], 20000),
            'quality' => text($input[$field], 100),
            'category_id', 'brand_id' => ($input[$field] === null || $input[$field] === '')
                ? null : integer($input[$field], 1, 2147483647),
            'stock' => integer($input[$field], 0, 100000000),
            'purchase_price_eur_cents' => $input[$field] === null || $input[$field] === ''
                ? null : integer($input[$field], 0, 100000000),
            'list_price_eur_cents' => integer($input[$field], 0, 100000000),
            'minimum_quantity' => integer($input[$field], 1, 100000000),
            'featured' => opBool($input[$field]),
        };
    }
    if ($create) {
        foreach (['sku', 'name', 'description', 'quality', 'stock', 'list_price_eur_cents'] as $required) {
            if (!array_key_exists($required, $result)) {
                throw new HttpError(422, "Missing product field: $required.");
            }
        }
        $result['minimum_quantity'] ??= 1;
        $result['featured'] ??= 0;
    }
    if (isset($result['sku']) && $result['sku'] === '') {
        throw new HttpError(422, 'SKU is required.');
    }
    if (isset($result['name']) && $result['name'] === '') {
        throw new HttpError(422, 'Product name is required.');
    }
    return $result;
}

function opAdminProducts(string $method, string $path): bool
{
    if ($path === '/admin/products' && $method === 'GET') {
        requireStaff();
        $q = trim((string)($_GET['q'] ?? ''));
        $page = integer($_GET['page'] ?? 1, 1, 1000000);
        $limit = integer($_GET['limit'] ?? 25, 1, 100);
        $status = (string)($_GET['status'] ?? 'all');
        if (!in_array($status, ['all', 'active', 'archived'], true)) {
            throw new HttpError(422, 'Invalid product status.');
        }
        $where = ' WHERE 1=1';
        $params = [];
        if ($q !== '') {
            $where .= ' AND (p.name LIKE ? OR p.sku LIKE ?)';
            $params[] = '%' . $q . '%';
            $params[] = '%' . $q . '%';
        }
        foreach (['category' => 'category_id', 'brand' => 'brand_id'] as $query => $column) {
            if (isset($_GET[$query]) && $_GET[$query] !== '') {
                $where .= " AND p.$column = ?";
                $params[] = integer($_GET[$query], 1, 2147483647);
            }
        }
        if (isset($_GET['model']) && $_GET['model'] !== '') {
            $where .= ' AND EXISTS (SELECT 1 FROM product_models pm WHERE pm.product_id=p.id AND pm.model_id=?)';
            $params[] = integer($_GET['model'], 1, 2147483647);
        }
        if (isset($_GET['quality']) && $_GET['quality'] !== '') {
            $where .= ' AND p.quality = ?';
            $params[] = text($_GET['quality'], 100);
        }
        $stock = (string)($_GET['stock'] ?? '');
        if ($stock === 'in_stock') {
            $where .= ' AND p.stock > 0';
        } elseif ($stock === 'out_of_stock') {
            $where .= ' AND p.stock = 0';
        } elseif ($stock === 'low_stock') {
            $where .= ' AND p.stock <= ?';
            $params[] = opSetting('low_stock_threshold', 5);
        } elseif ($stock !== '') {
            throw new HttpError(422, 'Invalid stock filter.');
        }
        $statusWhere = match ($status) {
            'active' => ' AND p.active=1',
            'archived' => ' AND p.active=0',
            default => '',
        };
        $sort = (string)($_GET['sort'] ?? '');
        $orderBy = match ($sort) {
            '', 'newest' => 'p.updated_at DESC,p.id DESC',
            'price_asc' => 'p.list_price_eur_cents ASC,p.id ASC',
            'price_desc' => 'p.list_price_eur_cents DESC,p.id ASC',
            'name_asc' => 'p.name ASC,p.id ASC',
            'stock_asc' => 'p.stock ASC,p.id ASC',
            'stock_desc' => 'p.stock DESC,p.id ASC',
            default => throw new HttpError(422, 'Invalid product sort.'),
        };
        $countsStatement = db()->prepare(
            'SELECT COUNT(*) `all`,COALESCE(SUM(p.active=1),0) active,COALESCE(SUM(p.active=0),0) archived'
            . ' FROM products p' . $where
        );
        $countsStatement->execute($params);
        $counts = $countsStatement->fetch(PDO::FETCH_ASSOC) ?: ['all' => 0, 'active' => 0, 'archived' => 0];
        foreach ($counts as $key => $value) $counts[$key] = (int)$value;
        $featuredTotal = (int)db()->query('SELECT COUNT(*) FROM products WHERE featured=1')->fetchColumn();
        $count = db()->prepare('SELECT COUNT(*) FROM products p' . $where . $statusWhere);
        $count->execute($params);
        $total = (int)$count->fetchColumn();
        $pages = max(1, (int)ceil($total / $limit));
        $page = min($page, $pages);
        $offset = ($page - 1) * $limit;
        $statement = db()->prepare(
            'SELECT p.* FROM products p' . $where . $statusWhere . " ORDER BY $orderBy LIMIT ? OFFSET ?"
        );
        $index = 1;
        foreach ($params as $param) {
            $statement->bindValue($index++, $param, is_int($param) ? PDO::PARAM_INT : PDO::PARAM_STR);
        }
        $statement->bindValue($index++, $limit, PDO::PARAM_INT);
        $statement->bindValue($index, $offset, PDO::PARAM_INT);
        $statement->execute();
        respond([
            'products' => array_map('opProduct', $statement->fetchAll(PDO::FETCH_ASSOC)),
            'total' => $total,
            'page' => $page,
            'pages' => $pages,
            'status' => $status,
            'counts' => $counts,
            'featured_total' => $featuredTotal,
            'stock_threshold' => opSetting('low_stock_threshold', 5),
        ]);
    }
    if (preg_match('#^/admin/products/(\d+)/restore$#', $path, $match) && $method === 'POST') {
        $staff = requireStaff();
        $id = opId($match[1]);
        $statement = db()->prepare('UPDATE products SET active=1 WHERE id=?');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0 && opRow('SELECT id FROM products WHERE id=?', [$id]) === null) {
            throw new HttpError(404, 'Product not found.');
        }
        audit('product.restored', 'product', $id, ['by' => (int)$staff['id']]);
        respond(['product' => opProduct(opRow('SELECT * FROM products WHERE id=?', [$id]) ?? [])]);
    }
    if ($path === '/admin/products' && $method === 'POST') {
        $staff = requireStaff();
        $input = body();
        $fields = opProductPayload($input, true);
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $columns = array_keys($fields);
            $sql = 'INSERT INTO products(' . implode(',', $columns) . ') VALUES('
                . implode(',', array_fill(0, count($columns), '?')) . ')';
            $pdo->prepare($sql)->execute(array_values($fields));
            $id = (int)$pdo->lastInsertId();
            if (array_key_exists('group_prices', $input)) {
                if (!is_array($input['group_prices'])) throw new HttpError(422, 'Invalid group prices.');
                opReplaceRelations($id, $input['group_prices'], 'prices');
            }
            if (array_key_exists('model_ids', $input)) {
                if (!is_array($input['model_ids'])) throw new HttpError(422, 'Invalid model IDs.');
                opReplaceRelations($id, $input['model_ids'], 'models');
            }
            audit('product.created', 'product', $id, [
                'by' => (int)$staff['id'], 'pricing_after' => pricingSnapshot($id),
            ]);
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ((string)$e->getCode() === '23000') throw new HttpError(422, 'SKU or product relation already exists.');
            throw $e;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        respond(['product' => opProduct(opRow('SELECT * FROM products WHERE id=?', [$id]) ?? [])], 201);
    }
    if (preg_match('#^/admin/products/(\d+)$#', $path, $match)) {
        $staff = requireStaff();
        $id = opId($match[1]);
        $existing = opRow('SELECT * FROM products WHERE id=?', [$id]);
        if ($existing === null) throw new HttpError(404, 'Product not found.');
        if ($method === 'GET') {
            $prices = opRows('SELECT group_id,price_eur_cents FROM group_prices WHERE product_id=? AND price_eur_cents IS NOT NULL ORDER BY group_id', [$id]);
            foreach ($prices as &$price) {
                $price['group_id'] = (int)$price['group_id'];
                $price['price_eur_cents'] = (int)$price['price_eur_cents'];
            }
            unset($price);
            $models = opRows('SELECT model_id FROM product_models WHERE product_id=? ORDER BY model_id', [$id]);
            $images = opRows('SELECT id,url,variants FROM images WHERE product_id=? ORDER BY id', [$id]);
            foreach ($images as &$image) {
                $image['id'] = (int)$image['id'];
                $image['variants'] = opJson($image['variants']);
            }
            unset($image);
            respond(['product' => opProduct($existing), 'group_prices' => $prices, 'images' => $images,
                'model_ids' => array_map(static fn(array $r): int => (int)$r['model_id'], $models)]);
        }
        if ($method === 'PATCH') {
            $input = body();
            $fields = opProductPayload($input, false);
            $priceTouched = array_key_exists('purchase_price_eur_cents', $fields)
                || array_key_exists('list_price_eur_cents', $fields)
                || array_key_exists('group_prices', $input);
            $expectedVersion = null;
            if ($priceTouched) {
                if (!array_key_exists('pricing_version', $input)) {
                    throw new HttpError(409, 'pricing_version is required when changing prices.');
                }
                $expectedVersion = integer($input['pricing_version'], 0, 2147483647);
            }
            $pdo = db();
            try {
                $pdo->beginTransaction();
                $priceBefore = null;
                if ($priceTouched) {
                    $locked = opRow('SELECT pricing_version FROM products WHERE id=? FOR UPDATE', [$id]);
                    if ($locked === null) throw new HttpError(404, 'Product not found.');
                    if ((int)$locked['pricing_version'] !== $expectedVersion) {
                        throw new HttpError(409, 'Pricing changed. Reload the product and retry.');
                    }
                    $priceBefore = pricingSnapshot($id);
                }
                if ($fields !== []) {
                    $sets = implode(',', array_map(static fn(string $f): string => "$f=?", array_keys($fields)));
                    $pdo->prepare("UPDATE products SET $sets WHERE id=?")->execute([...array_values($fields), $id]);
                }
                if (array_key_exists('group_prices', $input)) {
                    if (!is_array($input['group_prices'])) throw new HttpError(422, 'Invalid group prices.');
                    opReplaceRelations($id, $input['group_prices'], 'prices');
                }
                if ($priceTouched) {
                    $pdo->prepare('UPDATE products SET pricing_version=pricing_version+1 WHERE id=?')->execute([$id]);
                }
                if (array_key_exists('model_ids', $input)) {
                    if (!is_array($input['model_ids'])) throw new HttpError(422, 'Invalid model IDs.');
                    opReplaceRelations($id, $input['model_ids'], 'models');
                }
                $auditDetails = ['fields' => array_keys($fields), 'by' => (int)$staff['id']];
                if ($priceTouched) {
                    $auditDetails['pricing_before'] = $priceBefore;
                    $auditDetails['pricing_after'] = pricingSnapshot($id);
                }
                audit('product.updated', 'product', $id, $auditDetails);
                $pdo->commit();
            } catch (PDOException $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                if ((string)$e->getCode() === '23000') throw new HttpError(422, 'SKU or product relation already exists.');
                throw $e;
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $e;
            }
            respond(['product' => opProduct(opRow('SELECT * FROM products WHERE id=?', [$id]) ?? [])]);
        }
        if ($method === 'DELETE') {
            db()->prepare('UPDATE products SET active=0 WHERE id=?')->execute([$id]);
            audit('product.archived', 'product', $id, ['by' => (int)$staff['id']]);
            respond(['success' => true]);
        }
    }
    return false;
}

function opReturns(string $method, string $path): bool
{
    if ($path === '/returns' && $method === 'GET') {
        $user = requireUser();
        $rows = opRows(
            'SELECT r.id,r.number,r.order_id,r.status,r.reason,r.created_at,r.credit_cents,o.currency
             FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.user_id=? ORDER BY r.id DESC',
            [(int)$user['id']]
        );
        foreach ($rows as &$row) {
            foreach (['id', 'order_id', 'credit_cents'] as $key) $row[$key] = (int)$row[$key];
        }
        unset($row);
        respond(['returns' => $rows]);
    }
    if ($path === '/returns' && $method === 'POST') {
        $user = requireUser();
        $input = body();
        $orderId = integer($input['order_id'] ?? null, 1, 2147483647);
        $reason = text($input['reason'] ?? '', 5000);
        if ($reason === '') throw new HttpError(422, 'A return reason is required.');
        if (!isset($input['items']) || !is_array($input['items']) || $input['items'] === []) {
            throw new HttpError(422, 'At least one return item is required.');
        }
        $requested = [];
        foreach ($input['items'] as $item) {
            if (!is_array($item)) throw new HttpError(422, 'Invalid return item.');
            $itemId = integer($item['order_item_id'] ?? null, 1, 2147483647);
            if (isset($requested[$itemId])) throw new HttpError(422, 'Duplicate return item.');
            $requested[$itemId] = integer($item['quantity'] ?? null, 1, 100000000);
        }
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $order = opRow('SELECT id,user_id,status FROM orders WHERE id=? FOR UPDATE', [$orderId]);
            if ($order === null || (int)$order['user_id'] !== (int)$user['id']) {
                throw new HttpError(404, 'Order not found.');
            }
            if (!in_array((string)$order['status'], ['shipped', 'completed'], true)) {
                throw new HttpError(409, 'Only shipped or completed orders can be returned.');
            }
            $ids = array_keys($requested);
            sort($ids, SORT_NUMERIC);
            $marks = implode(',', array_fill(0, count($ids), '?'));
            $statement = $pdo->prepare("SELECT id,quantity FROM order_items WHERE order_id=? AND id IN ($marks) ORDER BY id FOR UPDATE");
            $statement->execute([$orderId, ...$ids]);
            $ordered = [];
            foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) $ordered[(int)$row['id']] = (int)$row['quantity'];
            if (count($ordered) !== count($ids)) throw new HttpError(422, 'A return item does not belong to this order.');
            $usedStatement = $pdo->prepare(
                "SELECT ri.order_item_id,ri.quantity
                 FROM return_items ri JOIN returns r ON r.id=ri.return_id
                 WHERE r.order_id=? AND r.status <> 'rejected' AND ri.order_item_id IN ($marks)
                 FOR UPDATE"
            );
            $usedStatement->execute([$orderId, ...$ids]);
            $used = [];
            foreach ($usedStatement->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $used[(int)$row['order_item_id']] = ($used[(int)$row['order_item_id']] ?? 0) + (int)$row['quantity'];
            }
            foreach ($requested as $itemId => $quantity) {
                if ($quantity + ($used[$itemId] ?? 0) > $ordered[$itemId]) {
                    throw new HttpError(409, 'Return quantity exceeds the quantity available.');
                }
            }
            $temporary = 'TMP-' . bin2hex(random_bytes(10));
            $pdo->prepare('INSERT INTO returns(number,user_id,order_id,status,reason,credit_cents,note) VALUES(?,?,?,"submitted",?,0,"")')
                ->execute([$temporary, (int)$user['id'], $orderId, $reason]);
            $returnId = (int)$pdo->lastInsertId();
            $number = opNumber('RET', $returnId);
            $pdo->prepare('UPDATE returns SET number=? WHERE id=?')->execute([$number, $returnId]);
            $insert = $pdo->prepare('INSERT INTO return_items(return_id,order_item_id,quantity) VALUES(?,?,?)');
            foreach ($requested as $itemId => $quantity) $insert->execute([$returnId, $itemId, $quantity]);
            $pdo->prepare('INSERT INTO return_events(return_id,status,note) VALUES(?,"submitted","Return submitted")')->execute([$returnId]);
            audit('return.created', 'return', $returnId, ['order_id' => $orderId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        respond(['return' => ['id' => $returnId, 'number' => $number, 'status' => 'submitted']], 201);
    }
    if (preg_match('#^/(admin/)?returns/(\d+)$#', $path, $match) && $method === 'GET') {
        $admin = $match[1] === 'admin/';
        $user = $admin ? requireStaff() : requireUser();
        $id = opId($match[2]);
        $return = opRow(
            'SELECT r.id,r.number,r.order_id,r.status,r.reason,r.credit_cents,r.note,r.created_at,o.currency
             FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id=?'
                . ($admin ? '' : ' AND r.user_id=?'),
            $admin ? [$id] : [$id, (int)$user['id']]
        );
        if ($return === null) throw new HttpError(404, 'Return not found.');
        foreach (['id', 'order_id', 'credit_cents'] as $key) $return[$key] = (int)$return[$key];
        $items = opRows('SELECT oi.name,ri.quantity,oi.price_cents FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=? ORDER BY ri.id', [$id]);
        foreach ($items as &$item) {
            $item['quantity'] = (int)$item['quantity'];
            $item['price_cents'] = (int)$item['price_cents'];
        }
        unset($item);
        $events = opRows('SELECT status,note,created_at FROM return_events WHERE return_id=? ORDER BY id', [$id]);
        respond(['return' => $return, 'items' => $items, 'events' => $events]);
    }
    if ($path === '/admin/returns' && $method === 'GET') {
        requireStaff();
        $rows = opRows(
            'SELECT r.id,r.number,r.order_id,r.status,r.reason,r.credit_cents,r.created_at,
                    u.name customer_name,o.currency
             FROM returns r JOIN users u ON u.id=r.user_id JOIN orders o ON o.id=r.order_id
             ORDER BY r.id DESC'
        );
        foreach ($rows as &$row) foreach (['id', 'order_id', 'credit_cents'] as $key) $row[$key] = (int)$row[$key];
        unset($row);
        respond(['returns' => $rows]);
    }
    if (preg_match('#^/admin/returns/(\d+)$#', $path, $match) && $method === 'PATCH') {
        $staff = requireStaff();
        $id = opId($match[1]);
        $input = body();
        $status = text($input['status'] ?? '', 30);
        $note = text($input['note'] ?? '', 5000);
        $transitions = [
            'submitted' => ['approved', 'rejected'],
            'approved' => ['credited', 'rejected'],
            'rejected' => [],
            'credited' => [],
        ];
        if (!in_array($status, ['approved', 'rejected', 'credited'], true)) throw new HttpError(422, 'Invalid return status.');
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $locator = opRow('SELECT order_id FROM returns WHERE id=?', [$id]);
            if ($locator === null) throw new HttpError(404, 'Return not found.');
            $order = opRow(
                'SELECT id,subtotal_cents,tax_cents,shipping_cents,tax_bps FROM orders WHERE id=? FOR UPDATE',
                [(int)$locator['order_id']]
            );
            if ($order === null) throw new HttpError(404, 'Order not found.');
            $return = opRow('SELECT * FROM returns WHERE id=? FOR UPDATE', [$id]);
            if ($return === null || (int)$return['order_id'] !== (int)$order['id']) {
                throw new HttpError(409, 'Return changed while it was being reviewed.');
            }
            $old = (string)$return['status'];
            if (!in_array($status, $transitions[$old] ?? [], true)) throw new HttpError(409, 'Invalid return status transition.');

            /*
             * Lock every return line for this order in one deterministic order. Credited
             * rows are immutable. Approved rows only contain a preview and reserve no tax;
             * final integer allocation is recalculated when the row becomes credited.
             */
            $lines = opRows(
                'SELECT r.id return_id,r.status,r.credit_cents,ri.id return_item_id,ri.quantity,oi.price_cents
                 FROM returns r
                 JOIN return_items ri ON ri.return_id=r.id
                 JOIN order_items oi ON oi.id=ri.order_item_id
                 WHERE r.order_id=?
                 ORDER BY r.id,ri.id FOR UPDATE',
                [(int)$order['id']]
            );
            $merchandise = [];
            $storedCredits = [];
            $states = [];
            foreach ($lines as $line) {
                $returnId = (int)$line['return_id'];
                $states[$returnId] = (string)$line['status'];
                $storedCredits[$returnId] = (int)$line['credit_cents'];
                $quantity = (int)$line['quantity'];
                $unitPrice = (int)$line['price_cents'];
                if ($unitPrice > 0 && $quantity > intdiv(PHP_INT_MAX, $unitPrice)) {
                    throw new HttpError(409, 'Return amount exceeds supported integer range.');
                }
                $lineAmount = $quantity * $unitPrice;
                if ($lineAmount > PHP_INT_MAX - ($merchandise[$returnId] ?? 0)) {
                    throw new HttpError(409, 'Return amount exceeds supported integer range.');
                }
                $merchandise[$returnId] = ($merchandise[$returnId] ?? 0) + $lineAmount;
            }
            $currentMerchandise = $merchandise[$id] ?? 0;
            $creditedMerchandise = 0;
            $allocatedTax = 0;
            foreach ($states as $returnId => $state) {
                if ($state !== 'credited' || $returnId === $id) continue;
                if ($merchandise[$returnId] > PHP_INT_MAX - $creditedMerchandise) {
                    throw new HttpError(409, 'Cumulative return amount exceeds supported integer range.');
                }
                $creditedMerchandise += $merchandise[$returnId];
                $rowTax = $storedCredits[$returnId] - $merchandise[$returnId];
                if ($rowTax < 0) throw new HttpError(409, 'Stored return credit is inconsistent.');
                if ($rowTax > PHP_INT_MAX - $allocatedTax) {
                    throw new HttpError(409, 'Cumulative return tax exceeds supported integer range.');
                }
                $allocatedTax += $rowTax;
            }
            $orderSubtotal = (int)$order['subtotal_cents'];
            /*
             * Isolated-test return policy: delivery and its VAT are never refunded.
             * Commerce stores combined merchandise + shipping VAT in tax_cents, so
             * subtract shipping VAT using the same round-half-up calculation as
             * intdiv(shipping_cents * tax_bps + 5000, 10000), overflow-safely.
             */
            $shippingTax = opMulDivRoundHalfUp(
                (int)$order['shipping_cents'],
                (int)$order['tax_bps'],
                10000
            );
            $merchandiseTaxPool = max(0, (int)$order['tax_cents'] - $shippingTax);
            if ($allocatedTax > $merchandiseTaxPool) {
                throw new HttpError(409, 'Stored credited return tax exceeds the order merchandise VAT.');
            }
            $targetTaxTotal = $orderSubtotal > 0
                ? opMulDivFloor($creditedMerchandise + $currentMerchandise, $merchandiseTaxPool, $orderSubtotal)
                : 0;
            $newTax = max(0, min($merchandiseTaxPool - $allocatedTax, $targetTaxTotal - $allocatedTax));
            if ($status === 'approved' || $status === 'credited') {
                $credit = $currentMerchandise + $newTax;
            } else {
                $credit = 0;
            }
            $pdo->prepare('UPDATE returns SET status=?,note=?,credit_cents=? WHERE id=?')->execute([$status, $note, $credit, $id]);
            $pdo->prepare('INSERT INTO return_events(return_id,status,note) VALUES(?,?,?)')->execute([$id, $status, $note]);
            audit('return.' . $status, 'return', $id, ['credit_cents' => $credit, 'by' => (int)$staff['id']]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        respond(['return' => ['id' => $id, 'status' => $status, 'credit_cents' => $credit]]);
    }
    return false;
}

function opBuyback(string $method, string $path): bool
{
    if ($path === '/buyback' && $method === 'GET') {
        $rows = opRows('SELECT id,model,grade,price_cents,active FROM buyback_items WHERE active=1 ORDER BY model,grade');
        foreach ($rows as &$row) {
            $row['id'] = (int)$row['id']; $row['price_cents'] = (int)$row['price_cents']; $row['active'] = (bool)$row['active'];
        }
        unset($row);
        respond(['items' => $rows]);
    }
    if ($path === '/buyback/requests' && $method === 'GET') {
        $user = requireUser();
        $rows = opRows('SELECT id,number,status,items_json,total_cents,notes,note,created_at FROM buyback_requests WHERE user_id=? ORDER BY id DESC', [(int)$user['id']]);
        foreach ($rows as &$row) {
            $row['id'] = (int)$row['id']; $row['total_cents'] = (int)$row['total_cents'];
            $row['items'] = opJson($row['items_json']); unset($row['items_json']);
        }
        unset($row);
        respond(['requests' => $rows]);
    }
    if ($path === '/buyback/requests' && $method === 'POST') {
        $user = requireUser();
        $input = body();
        if (!isset($input['items']) || !is_array($input['items']) || $input['items'] === []) throw new HttpError(422, 'At least one buyback item is required.');
        $quantities = [];
        foreach ($input['items'] as $entry) {
            if (!is_array($entry)) throw new HttpError(422, 'Invalid buyback item.');
            $itemId = integer($entry['item_id'] ?? null, 1, 2147483647);
            if (isset($quantities[$itemId])) throw new HttpError(422, 'Duplicate buyback item.');
            $quantities[$itemId] = integer($entry['quantity'] ?? null, 1, 100000);
        }
        $ids = array_keys($quantities);
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $statement = db()->prepare("SELECT id,model,grade,price_cents FROM buyback_items WHERE active=1 AND id IN ($marks)");
        $statement->execute($ids);
        $items = [];
        $total = 0;
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $id = (int)$row['id'];
            $quantity = $quantities[$id];
            $price = (int)$row['price_cents'];
            $items[] = ['item_id' => $id, 'model' => $row['model'], 'grade' => $row['grade'],
                'quantity' => $quantity, 'price_cents' => $price, 'total_cents' => $price * $quantity];
            $total += $price * $quantity;
        }
        if (count($items) !== count($ids)) throw new HttpError(422, 'A buyback item is unavailable.');
        $notes = text($input['notes'] ?? '', 5000);
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $temporary = 'TMP-' . bin2hex(random_bytes(10));
            $pdo->prepare('INSERT INTO buyback_requests(number,user_id,status,items_json,total_cents,notes,note) VALUES(?,?,"submitted",?,?,?,"")')
                ->execute([$temporary, (int)$user['id'], json_encode($items, JSON_THROW_ON_ERROR), $total, $notes]);
            $id = (int)$pdo->lastInsertId();
            $number = opNumber('BB', $id);
            $pdo->prepare('UPDATE buyback_requests SET number=? WHERE id=?')->execute([$number, $id]);
            audit('buyback_request.created', 'buyback_request', $id, ['total_cents' => $total]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        respond(['request' => ['id' => $id, 'number' => $number, 'total_cents' => $total, 'status' => 'submitted']], 201);
    }
    if ($path === '/admin/buyback' && $method === 'GET') {
        requireStaff();
        $items = opRows('SELECT id,model,grade,price_cents,active FROM buyback_items ORDER BY model,grade');
        foreach ($items as &$item) {
            $item['id'] = (int)$item['id']; $item['price_cents'] = (int)$item['price_cents']; $item['active'] = (bool)$item['active'];
        }
        unset($item);
        $requests = opRows('SELECT b.id,b.number,b.status,b.items_json,b.total_cents,b.notes,b.note,b.created_at,u.name customer_name FROM buyback_requests b JOIN users u ON u.id=b.user_id ORDER BY b.id DESC');
        foreach ($requests as &$request) {
            $request['id'] = (int)$request['id']; $request['total_cents'] = (int)$request['total_cents'];
            $request['items'] = opJson($request['items_json']); unset($request['items_json']);
        }
        unset($request);
        respond(['items' => $items, 'requests' => $requests]);
    }
    if ($path === '/admin/buyback' && $method === 'POST') {
        $staff = requireStaff();
        $input = body();
        $model = text($input['model'] ?? '', 190);
        $grade = text($input['grade'] ?? '', 60);
        if ($model === '' || $grade === '') throw new HttpError(422, 'Model and grade are required.');
        $price = integer($input['price_cents'] ?? null, 0, 100000000);
        $active = array_key_exists('active', $input) ? opBool($input['active']) : 1;
        try {
            db()->prepare('INSERT INTO buyback_items(model,grade,price_cents,active) VALUES(?,?,?,?)')->execute([$model, $grade, $price, $active]);
        } catch (PDOException $e) {
            if ((string)$e->getCode() === '23000') throw new HttpError(422, 'That model and grade already exist.');
            throw $e;
        }
        $id = (int)db()->lastInsertId();
        audit('buyback_item.created', 'buyback_item', $id, ['by' => (int)$staff['id']]);
        respond(['item' => ['id' => $id, 'model' => $model, 'grade' => $grade, 'price_cents' => $price, 'active' => (bool)$active]], 201);
    }
    if (preg_match('#^/admin/buyback/(\d+)$#', $path, $match) && $method === 'PATCH') {
        $staff = requireStaff();
        $id = opId($match[1]);
        if (opRow('SELECT id FROM buyback_items WHERE id=?', [$id]) === null) throw new HttpError(404, 'Buyback item not found.');
        $input = body();
        $fields = [];
        foreach (['model', 'grade', 'price_cents', 'active'] as $field) {
            if (!array_key_exists($field, $input)) continue;
            $fields[$field] = match ($field) {
                'model' => text($input[$field], 190),
                'grade' => text($input[$field], 60),
                'price_cents' => integer($input[$field], 0, 100000000),
                'active' => opBool($input[$field]),
            };
        }
        if (isset($fields['model']) && $fields['model'] === '' || isset($fields['grade']) && $fields['grade'] === '') throw new HttpError(422, 'Model and grade cannot be empty.');
        if ($fields !== []) {
            $sets = implode(',', array_map(static fn(string $f): string => "$f=?", array_keys($fields)));
            try {
                db()->prepare("UPDATE buyback_items SET $sets WHERE id=?")->execute([...array_values($fields), $id]);
            } catch (PDOException $e) {
                if ((string)$e->getCode() === '23000') throw new HttpError(422, 'That model and grade already exist.');
                throw $e;
            }
        }
        audit('buyback_item.updated', 'buyback_item', $id, ['fields' => array_keys($fields), 'by' => (int)$staff['id']]);
        $item = opRow('SELECT id,model,grade,price_cents,active FROM buyback_items WHERE id=?', [$id]) ?? [];
        $item['id'] = (int)$item['id']; $item['price_cents'] = (int)$item['price_cents']; $item['active'] = (bool)$item['active'];
        respond(['item' => $item]);
    }
    if (preg_match('#^/admin/buyback/requests/(\d+)$#', $path, $match) && $method === 'PATCH') {
        $staff = requireStaff();
        $id = opId($match[1]);
        $input = body();
        $status = text($input['status'] ?? '', 30);
        $note = text($input['note'] ?? '', 5000);
        $transitions = ['submitted' => ['received', 'rejected'], 'received' => ['assessed', 'rejected'],
            'assessed' => ['completed', 'rejected'], 'completed' => [], 'rejected' => []];
        $request = opRow('SELECT status FROM buyback_requests WHERE id=?', [$id]);
        if ($request === null) throw new HttpError(404, 'Buyback request not found.');
        if (!in_array($status, $transitions[(string)$request['status']] ?? [], true)) throw new HttpError(409, 'Invalid buyback request status transition.');
        db()->prepare('UPDATE buyback_requests SET status=?,note=? WHERE id=?')->execute([$status, $note, $id]);
        audit('buyback_request.' . $status, 'buyback_request', $id, ['by' => (int)$staff['id']]);
        respond(['request' => ['id' => $id, 'status' => $status, 'note' => $note]]);
    }
    return false;
}

function opImport(string $method, string $path): bool
{
    if ($path !== '/admin/import' || $method !== 'POST') return false;
    $staff = requireStaff();
    if (!isset($_FILES['file']) || !is_array($_FILES['file']) || (int)($_FILES['file']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new HttpError(422, 'A CSV file is required.');
    }
    $file = $_FILES['file'];
    if ((int)($file['size'] ?? 0) > 5 * 1024 * 1024) throw new HttpError(413, 'CSV file is too large.');
    $handle = fopen((string)$file['tmp_name'], 'rb');
    if ($handle === false) throw new HttpError(422, 'Could not read CSV file.');
    $header = fgetcsv($handle);
    $required = ['sku', 'name', 'category', 'brand', 'quality', 'stock', 'price'];
    if ($header === false) throw new HttpError(422, 'CSV file is empty.');
    $header = array_map(static fn(string $v): string => strtolower(trim($v)), $header);
    if (array_diff($required, $header) !== []) throw new HttpError(422, 'CSV header must contain sku,name,category,brand,quality,stock,price.');
    $indexes = array_flip($header);
    $rows = [];
    $errors = [];
    $seen = [];
    $line = 1;
    $dataRows = 0;
    while (($csv = fgetcsv($handle)) !== false) {
        $line++;
        if (count($csv) === 1 && trim((string)$csv[0]) === '') continue;
        $dataRows++;
        try {
            foreach ($required as $column) {
                if (!array_key_exists($indexes[$column], $csv)) throw new HttpError(422, "Missing $column.");
            }
            $sku = text(trim((string)$csv[$indexes['sku']]), 190);
            $name = text(trim((string)$csv[$indexes['name']]), 500);
            $category = text(trim((string)$csv[$indexes['category']]), 140);
            $brand = text(trim((string)$csv[$indexes['brand']]), 140);
            $quality = text(trim((string)$csv[$indexes['quality']]), 100);
            if ($sku === '' || $name === '' || $category === '' || $brand === '' || $quality === '') throw new HttpError(422, 'Required text value is empty.');
            if (isset($seen[$sku])) throw new HttpError(422, 'Duplicate SKU in file.');
            $seen[$sku] = true;
            if (!preg_match('/^\d+$/', trim((string)$csv[$indexes['stock']]))) throw new HttpError(422, 'Stock must be a non-negative integer.');
            $stock = integer(trim((string)$csv[$indexes['stock']]), 0, 100000000);
            $priceRaw = trim((string)$csv[$indexes['price']]);
            if (!preg_match('/^\d+(?:\.\d{1,2})?$/', $priceRaw)) throw new HttpError(422, 'Price must be a non-negative amount with at most two decimals.');
            [$whole, $fraction] = array_pad(explode('.', $priceRaw, 2), 2, '');
            $price = integer(integer($whole, 0, 1000000) * 100 + (int)str_pad($fraction, 2, '0'), 0, 100000000);
            $rows[] = compact('sku', 'name', 'category', 'brand', 'quality', 'stock', 'price');
        } catch (HttpError $e) {
            $errors[] = ['line' => $line, 'error' => $e->getMessage()];
        }
        if (count($rows) + count($errors) > 10000) {
            $errors[] = ['line' => $line, 'error' => 'CSV exceeds 10,000 data rows.'];
            break;
        }
    }
    fclose($handle);
    if ($dataRows === 0) $errors[] = ['line' => 2, 'error' => 'CSV has no data rows.'];
    $preview = (string)($_GET['preview'] ?? $_POST['preview'] ?? '1') !== '0';
    if ($errors === []) {
        $categories = [];
        foreach (opRows('SELECT id,name FROM categories') as $category) {
            $categories[(string)$category['name']] = (int)$category['id'];
        }
        $brands = [];
        foreach (opRows('SELECT id,name FROM brands') as $brand) {
            $brands[(string)$brand['name']] = (int)$brand['id'];
        }
        foreach ($rows as $index => &$row) {
            if (!isset($categories[$row['category']])) {
                $errors[] = ['line' => $index + 2, 'error' => 'Unknown category: ' . $row['category'] . '.'];
            }
            if (!isset($brands[$row['brand']])) {
                $errors[] = ['line' => $index + 2, 'error' => 'Unknown brand: ' . $row['brand'] . '.'];
            }
            $row['category_id'] = $categories[$row['category']] ?? null;
            $row['brand_id'] = $brands[$row['brand']] ?? null;
        }
        unset($row);
    }
    if ($errors !== []) respond(['rows' => $dataRows, 'created' => 0, 'updated' => 0, 'errors' => $errors], 422);
    $pricingVersions = [];
    $versionLookup = db()->prepare('SELECT pricing_version FROM products WHERE sku=?');
    foreach ($rows as $row) {
        $versionLookup->execute([$row['sku']]);
        $version = $versionLookup->fetchColumn();
        $pricingVersions[$row['sku']] = $version === false ? null : (int)$version;
    }
    if ($preview) {
        $created = count(array_filter($pricingVersions, static fn(mixed $version): bool => $version === null));
        respond([
            'rows' => count($rows), 'created' => $created, 'updated' => count($rows) - $created,
            'errors' => [], 'preview' => true, 'pricing_versions' => $pricingVersions,
        ]);
    }
    $postedVersions = $_POST['pricing_versions'] ?? null;
    if (is_string($postedVersions)) {
        try {
            $postedVersions = json_decode($postedVersions, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new HttpError(422, 'pricing_versions must be valid JSON.');
        }
    }
    if (!is_array($postedVersions) || count($postedVersions) !== count($rows)) {
        throw new HttpError(422, 'Confirmation requires the complete preview pricing_versions map.');
    }
    foreach ($rows as $row) {
        $sku = $row['sku'];
        if (!array_key_exists($sku, $postedVersions)) {
            throw new HttpError(422, "Missing preview pricing version for SKU $sku.");
        }
        $version = $postedVersions[$sku];
        if ($version !== null && (!is_int($version) || $version < 0 || $version > 2147483647)) {
            throw new HttpError(422, "Invalid preview pricing version for SKU $sku.");
        }
    }
    $pdo = db();
    $created = 0;
    $updated = 0;
    try {
        $pdo->beginTransaction();
        $existing = $pdo->prepare('SELECT id,pricing_version FROM products WHERE sku=? FOR UPDATE');
        $lockedBySku = [];
        $lockSkus = array_keys($pricingVersions);
        sort($lockSkus, SORT_STRING);
        foreach ($lockSkus as $sku) {
            $existing->execute([$sku]);
            $locked = $existing->fetch(PDO::FETCH_ASSOC);
            $lockedBySku[$sku] = $locked ?: null;
            $expected = $postedVersions[$sku];
            if (($locked === false && $expected !== null)
                || ($locked !== false && ($expected === null || (int)$locked['pricing_version'] !== $expected))) {
                throw new HttpError(409, "Pricing changed for SKU $sku. Preview the CSV again.");
            }
        }
        $insert = $pdo->prepare(
            'INSERT INTO products(sku,name,description,category_id,brand_id,quality,stock,list_price_cents,list_price_eur_cents,minimum_quantity,active)
             VALUES(?,?,"",?,?,?,?,0,?,1,1)'
        );
        $update = $pdo->prepare(
            'UPDATE products SET name=?,category_id=?,brand_id=?,quality=?,stock=?,
             list_price_eur_cents=?,pricing_version=pricing_version+1,active=1 WHERE id=?'
        );
        foreach ($rows as $row) {
            $locked = $lockedBySku[$row['sku']];
            if ($locked === null) {
                $insert->execute([$row['sku'], $row['name'], $row['category_id'], $row['brand_id'], $row['quality'], $row['stock'], $row['price']]);
                $newId = (int)$pdo->lastInsertId();
                audit('product.imported_created', 'product', $newId, [
                    'pricing_before' => null, 'pricing_after' => pricingSnapshot($newId), 'by' => (int)$staff['id'],
                ]);
                $created++;
            } else {
                $id = (int)$locked['id'];
                $pricingBefore = pricingSnapshot((int)$id);
                $update->execute([$row['name'], $row['category_id'], $row['brand_id'], $row['quality'], $row['stock'], $row['price'], (int)$id]);
                audit('product.imported_updated', 'product', (int)$id, [
                    'pricing_before' => $pricingBefore, 'pricing_after' => pricingSnapshot((int)$id), 'by' => (int)$staff['id'],
                ]);
                $updated++;
            }
        }
        audit('products.imported', 'product', 0, ['rows' => count($rows), 'created' => $created, 'updated' => $updated, 'by' => (int)$staff['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
    respond(['rows' => count($rows), 'created' => $created, 'updated' => $updated, 'errors' => [],
        'preview' => false, 'pricing_versions' => $pricingVersions]);
}

function opAdminGeneral(string $method, string $path): bool
{
    if ($path === '/admin/dashboard' && $method === 'GET') {
        requireStaff();
        $threshold = opSetting('low_stock_threshold', 5);
        $stats = opRow(
            "SELECT
             (SELECT COUNT(*) FROM products WHERE active=1) products,
             (SELECT COUNT(*) FROM orders) orders,
             (SELECT COUNT(*) FROM users WHERE role='customer') customers,
             (SELECT COUNT(*) FROM products WHERE active=1 AND stock<=?) low_stock,
             (SELECT COUNT(*) FROM returns WHERE status IN ('submitted','approved')) open_returns",
            [$threshold]
        ) ?? [];
        foreach ($stats as $key => $value) $stats[$key] = (int)$value;
        $revenue = [];
        foreach (opRows("SELECT currency,COALESCE(SUM(total_cents),0) total_cents FROM orders WHERE status<>'cancelled' GROUP BY currency ORDER BY currency") as $row) {
            $revenue[] = ['currency' => (string)$row['currency'], 'total_cents' => (int)$row['total_cents']];
        }
        $stats['revenue_by_currency'] = $revenue;
        $recent = opRows('SELECT o.id,o.number,o.status,o.total_cents,o.currency,o.created_at,u.name customer_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 8');
        foreach ($recent as &$row) { $row['id'] = (int)$row['id']; $row['total_cents'] = (int)$row['total_cents']; }
        unset($row);
        $low = opRows('SELECT * FROM products WHERE active=1 AND stock<=? ORDER BY stock,id LIMIT 20', [$threshold]);
        $allInvoices = financeLoadInvoices();
        $finance = financeSummary($allInvoices);
        $invoiceAttention = financeInvoiceAttention($allInvoices, 6);
        respond(['stats' => $stats, 'recent_orders' => $recent, 'low_stock' => array_map('opProduct', $low),
            'finance' => $finance, 'invoice_attention' => $invoiceAttention,
            'safety' => ['test_mode' => true, 'live_connections' => 0]]);
    }
    if ($path === '/admin/customers' && $method === 'GET') {
        requireStaff();
        $customers = opRows("SELECT id,name,email,company,group_id,status,created_at FROM users WHERE role='customer' ORDER BY id DESC");
        foreach ($customers as &$customer) { $customer['id'] = (int)$customer['id']; $customer['group_id'] = (int)$customer['group_id']; }
        unset($customer);
        $groups = opRows('SELECT id,name FROM customer_groups ORDER BY id');
        foreach ($groups as &$group) $group['id'] = (int)$group['id'];
        unset($group);
        respond(['customers' => $customers, 'groups' => $groups]);
    }
    if (preg_match('#^/admin/customers/(\d+)$#', $path, $match) && $method === 'PATCH') {
        $staff = requireStaff();
        $id = opId($match[1]);
        if ($id === (int)$staff['id']) throw new HttpError(403, 'You cannot modify your own staff access.');
        $customer = opRow("SELECT id FROM users WHERE id=? AND role='customer'", [$id]);
        if ($customer === null) throw new HttpError(404, 'Customer not found.');
        $input = body();
        $fields = [];
        if (array_key_exists('status', $input)) {
            $status = text($input['status'], 30);
            if (!in_array($status, ['active', 'pending', 'blocked'], true)) throw new HttpError(422, 'Invalid customer status.');
            $fields['status'] = $status;
        }
        if (array_key_exists('group_id', $input)) {
            $groupId = integer($input['group_id'], 1, 2147483647);
            if (opRow('SELECT id FROM customer_groups WHERE id=?', [$groupId]) === null) throw new HttpError(422, 'Customer group not found.');
            $fields['group_id'] = $groupId;
        }
        if ($fields !== []) {
            $sets = implode(',', array_map(static fn(string $f): string => "$f=?", array_keys($fields)));
            db()->prepare("UPDATE users SET $sets WHERE id=?")->execute([...array_values($fields), $id]);
        }
        audit('customer.updated', 'user', $id, ['fields' => array_keys($fields), 'by' => (int)$staff['id']]);
        $updated = opRow('SELECT id,name,email,company,group_id,status,created_at FROM users WHERE id=?', [$id]) ?? [];
        $updated['id'] = (int)$updated['id']; $updated['group_id'] = (int)$updated['group_id'];
        respond(['customer' => $updated]);
    }
    if ($path === '/admin/settings' && $method === 'GET') {
        requireStaff();
        respond(['settings' => [
            'currency' => 'EUR',
            'tax_bps' => opSetting('tax_bps', 810),
            'shipping_eur_cents' => opSetting('shipping_eur_cents', 0),
            'free_shipping_eur_cents' => opSetting('free_shipping_eur_cents', 0),
            'low_stock_threshold' => opSetting('low_stock_threshold', 5),
        ], 'safety' => ['test_mode' => true, 'live_connections' => 0, 'external_endpoints' => false]]);
    }
    if ($path === '/admin/settings' && $method === 'PATCH') {
        $staff = requireStaff();
        $input = body();
        $limits = ['tax_bps' => 10000, 'shipping_eur_cents' => 100000000,
            'free_shipping_eur_cents' => 100000000, 'low_stock_threshold' => 100000000];
        $changed = [];
        foreach ($limits as $name => $max) {
            if (!array_key_exists($name, $input)) continue;
            $changed[$name] = integer($input[$name], 0, $max);
        }
        $statement = db()->prepare('INSERT INTO settings(name,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)');
        foreach ($changed as $name => $value) $statement->execute([$name, (string)$value]);
        audit('settings.updated', 'settings', 0, ['fields' => array_keys($changed), 'by' => (int)$staff['id']]);
        respond(['settings' => [
            'currency' => 'EUR',
            'tax_bps' => opSetting('tax_bps', 810),
            'shipping_eur_cents' => opSetting('shipping_eur_cents', 0),
            'free_shipping_eur_cents' => opSetting('free_shipping_eur_cents', 0),
            'low_stock_threshold' => opSetting('low_stock_threshold', 5),
        ], 'safety' => ['test_mode' => true, 'live_connections' => 0, 'external_endpoints' => false]]);
    }
    if ($path === '/admin/messages' && $method === 'GET') {
        requireStaff();
        $rows = opRows('SELECT id,kind,payload,status,created_at FROM messages ORDER BY id DESC LIMIT 200');
        foreach ($rows as &$row) { $row['id'] = (int)$row['id']; $row['payload'] = opJson($row['payload']); }
        unset($row);
        respond(['messages' => $rows]);
    }
    if ($path === '/admin/audit' && $method === 'GET') {
        requireStaff();
        $rows = opRows('SELECT id,action,entity,entity_id,details,created_at FROM audit_events ORDER BY id DESC LIMIT 500');
        foreach ($rows as &$row) { $row['id'] = (int)$row['id']; $row['entity_id'] = (int)$row['entity_id']; $row['details'] = opJson($row['details']); }
        unset($row);
        respond(['events' => $rows]);
    }
    if ($path === '/admin/integrations' && $method === 'GET') {
        requireStaff();
        $events = opRows("SELECT id,kind,payload,status,created_at FROM messages WHERE kind LIKE 'simulation.%' ORDER BY id DESC LIMIT 100");
        foreach ($events as &$event) { $event['id'] = (int)$event['id']; $event['payload'] = opJson($event['payload']); }
        unset($event);
        respond(['connections' => [
            ['name' => 'Inventory provider', 'mode' => 'isolated', 'status' => 'blocked'],
            ['name' => 'Shipment provider', 'mode' => 'isolated', 'status' => 'blocked'],
            ['name' => 'Payment provider', 'mode' => 'isolated', 'status' => 'blocked'],
        ], 'events' => $events, 'safety' => ['test_mode' => true, 'live_connections' => 0]]);
    }
    if ($path === '/admin/integrations/simulate' && $method === 'POST') {
        $staff = requireStaff();
        $event = text(body()['event'] ?? '', 30);
        if (!in_array($event, ['stock', 'shipment', 'payment'], true)) throw new HttpError(422, 'Invalid simulation event.');
        $payload = ['event' => $event, 'simulated' => true, 'local_only' => true, 'staff_id' => (int)$staff['id']];
        enqueue('simulation.' . $event, $payload);
        $id = (int)db()->lastInsertId();
        audit('integration.simulated', 'message', $id, $payload);
        respond(['event' => ['id' => $id, 'kind' => 'simulation.' . $event, 'payload' => $payload,
            'status' => 'captured'], 'safety' => ['local_only' => true]], 201);
    }
    return false;
}

function handleOperations(string $method, string $path): bool
{
    return handleAdminFinance($method, $path)
        || handlePricingAdmin($method, $path)
        || opAdminProducts($method, $path)
        || opReturns($method, $path)
        || opBuyback($method, $path)
        || opImport($method, $path)
        || opAdminGeneral($method, $path);
}