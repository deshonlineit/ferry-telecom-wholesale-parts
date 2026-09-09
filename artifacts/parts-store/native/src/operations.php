<?php
declare(strict_types=1);

require_once __DIR__ . '/admin-finance.php';
require_once __DIR__ . '/pricing-admin.php';

/*
 * Staff operations, returns and CSV import for the isolated test shop.
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

function opReturnDetail(int $id): array
{
    $return = opRow('SELECT r.id,r.number,r.order_id,r.user_id,r.status,r.reason,r.credit_cents,r.note,r.created_at,o.currency FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id=?', [$id]);
    if ($return === null) throw new HttpError(404, 'Return not found.');
    foreach (['id','order_id','user_id','credit_cents'] as $key) $return[$key] = (int)$return[$key];
    $order = opRow('SELECT o.id,o.number,o.user_id,o.status,o.payment_method,o.payment_state,o.currency,o.subtotal_cents,o.shipping_cents,o.tax_cents,o.total_cents,u.name customer_name,u.email customer_email FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=?', [(int)$return['order_id']]);
    if ($order !== null) foreach (['id','user_id','subtotal_cents','shipping_cents','tax_cents','total_cents'] as $key) $order[$key] = (int)$order[$key];
    $items = opRows(
        "SELECT ri.id return_item_id,ri.order_item_id,oi.product_id,oi.name,oi.sku,ri.quantity,
                oi.quantity ordered_quantity,oi.price_cents,d.received_quantity,d.restock_quantity,d.disposition,
                COALESCE((SELECT SUM(ri2.quantity) FROM return_items ri2 JOIN returns r2 ON r2.id=ri2.return_id
                          WHERE ri2.order_item_id=ri.order_item_id AND ri2.return_id<>ri.return_id AND r2.status<>'rejected'),0) previously_returned_quantity
         FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id
         LEFT JOIN return_item_dispositions d ON d.return_item_id=ri.id
         WHERE ri.return_id=? ORDER BY ri.id",
        [$id]
    );
    foreach ($items as &$item) foreach (['return_item_id','order_item_id','product_id','quantity','ordered_quantity','previously_returned_quantity','price_cents','received_quantity','restock_quantity'] as $key) if ($item[$key] !== null) $item[$key] = (int)$item[$key];
    unset($item);
    $settlement = opRow('SELECT id,idempotency_key,kind,status,amount_cents,currency,provider_reference,error_message,created_at,settled_at FROM return_settlements WHERE return_id=?', [$id]);
    if ($settlement !== null) foreach (['id','amount_cents'] as $key) $settlement[$key] = (int)$settlement[$key];
    $creditNote = $settlement === null ? null : opRow('SELECT id,number,issued_cents,remaining_cents,currency,status,created_at FROM customer_credit_notes WHERE settlement_id=?', [(int)$settlement['id']]);
    if ($creditNote !== null) foreach (['id','issued_cents','remaining_cents'] as $key) $creditNote[$key] = (int)$creditNote[$key];
    $applications = $creditNote === null ? [] : opRows('SELECT ca.target_order_id,ca.amount_cents,o.number order_number FROM credit_applications ca JOIN orders o ON o.id=ca.target_order_id WHERE ca.credit_note_id=? ORDER BY ca.id', [(int)$creditNote['id']]);
    foreach ($applications as &$application) foreach (['target_order_id','amount_cents'] as $key) $application[$key] = (int)$application[$key];
    unset($application);
    return ['return' => $return, 'order' => $order, 'items' => $items,
        'events' => opRows('SELECT status,note,created_at FROM return_events WHERE return_id=? ORDER BY id', [$id]),
        'settlement' => $settlement, 'credit_note' => $creditNote, 'credit_applications' => $applications];
}

function opSettleReturn(int $returnId, array $input, int $staffId): array
{
    $key = text($input['idempotency_key'] ?? '', 100);
    if ($key === '') throw new HttpError(422, 'An idempotency key is required.');
    if (!isset($input['lines']) || !is_array($input['lines']) || $input['lines'] === []) throw new HttpError(422, 'Received line dispositions are required.');
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $return = opRow('SELECT r.*,o.number order_number,o.subtotal_cents,o.tax_cents,o.shipping_cents,o.tax_bps,o.currency,o.payment_method,o.payment_state,o.total_cents FROM returns r JOIN orders o ON o.id=r.order_id WHERE r.id=? FOR UPDATE', [$returnId]);
        if ($return === null) throw new HttpError(404, 'Return not found.');
        $existing = opRow('SELECT id,idempotency_key,kind,status,amount_cents,currency,provider_reference,error_message,snapshot FROM return_settlements WHERE return_id=? OR idempotency_key=? FOR UPDATE', [$returnId, $key]);
        if ($existing !== null) {
            if (!hash_equals((string)$existing['idempotency_key'], $key)) throw new HttpError(409, 'This return already has a settlement.');
            if ((string)$existing['kind'] === 'stripe_refund' && in_array((string)$existing['status'], ['pending','failed'], true)) {
                if ((string)$existing['status'] === 'failed') $pdo->prepare('UPDATE return_settlements SET status="pending",error_message=NULL WHERE id=?')->execute([(int)$existing['id']]);
                $snapshot = opJson($existing['snapshot']);
                $pdo->commit();
                return ['settlement_id'=>(int)$existing['id'], 'status'=>'pending', 'kind'=>'stripe_refund',
                    'amount_cents'=>(int)$existing['amount_cents'], 'bridge'=>['settlement_id'=>(int)$existing['id'],
                    'return_id'=>$returnId,'amount_cents'=>(int)$existing['amount_cents'],'currency'=>(string)$existing['currency'],
                    'order_id'=>(int)($snapshot['order_id'] ?? 0),'order_number'=>(string)($snapshot['order_number'] ?? ''),
                    'payment_intent_id'=>(string)($snapshot['payment_intent_id'] ?? ''),'idempotency_key'=>$key]];
            }
            $pdo->commit(); return ['settlement_id'=>(int)$existing['id'], 'status'=>$existing['status'], 'kind'=>$existing['kind']];
        }
        if ((string)$return['status'] !== 'approved') throw new HttpError(409, 'Only an approved return can be settled.');
        $lines = opRows('SELECT ri.id,ri.quantity,oi.product_id,oi.price_cents FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=? ORDER BY ri.id FOR UPDATE', [$returnId]);
        $provided = [];
        foreach ($input['lines'] as $line) {
            if (!is_array($line)) throw new HttpError(422, 'Invalid return line.');
            $lineId = integer($line['return_item_id'] ?? null, 1, 2147483647);
            if (isset($provided[$lineId])) throw new HttpError(422, 'Duplicate return line.');
            $provided[$lineId] = $line;
        }
        if (count($provided) !== count($lines)) throw new HttpError(422, 'Provide a disposition for every selected return line.');
        $net = 0; $snapshotLines = [];
        foreach ($lines as $line) {
            $id = (int)$line['id']; if (!isset($provided[$id])) throw new HttpError(422, 'A disposition line does not belong to this return.');
            $in = $provided[$id]; $received = integer($in['received_quantity'] ?? null, 0, (int)$line['quantity']);
            $restock = integer($in['restock_quantity'] ?? 0, 0, $received);
            $disposition = text($in['disposition'] ?? '', 20);
            if (!in_array($disposition, ['restock','quarantine','writeoff'], true) || ($disposition !== 'restock' && $restock !== 0)) throw new HttpError(422, 'Invalid stock disposition.');
            $amount = $received * (int)$line['price_cents']; $net += $amount;
            $snapshotLines[] = ['return_item_id'=>$id,'product_id'=>(int)$line['product_id'],'received_quantity'=>$received,'restock_quantity'=>$restock,'disposition'=>$disposition,'unit_net_cents'=>(int)$line['price_cents'],'net_cents'=>$amount];
        }
        $prior = opRows(
            "SELECT rs.snapshot FROM return_settlements rs
             JOIN returns prior_return ON prior_return.id=rs.return_id
             WHERE rs.return_id<>? AND rs.status='succeeded' AND prior_return.order_id=? FOR UPDATE",
            [$returnId, (int)$return['order_id']]
        );
        $priorNet = 0; $priorTax = 0;
        foreach ($prior as $row) { $s = opJson($row['snapshot']); $priorNet += (int)($s['net_cents'] ?? 0); $priorTax += (int)($s['tax_cents'] ?? 0); }
        $shippingTax = opMulDivRoundHalfUp((int)$return['shipping_cents'], (int)$return['tax_bps'], 10000);
        $pool = max(0, (int)$return['tax_cents'] - $shippingTax);
        $target = (int)$return['subtotal_cents'] > 0 ? opMulDivFloor($priorNet + $net, $pool, (int)$return['subtotal_cents']) : 0;
        $tax = max(0, min($pool - $priorTax, $target - $priorTax)); $amount = $net + $tax;
        if ($amount <= 0) throw new HttpError(422, 'No received merchandise is available to settle.');
        $paymentAttempt = opRow("SELECT provider_id,payload,payment_method FROM payment_attempts WHERE order_id=? AND payment_method IN ('stripe','twint') AND state='paid' AND provider_id IS NOT NULL AND provider_id<>'' ORDER BY id DESC LIMIT 1", [(int)$return['order_id']]);
        $paymentPayload = $paymentAttempt === null ? null : opJson($paymentAttempt['payload']);
        $paymentIntentId = is_array($paymentPayload) ? text($paymentPayload['payment_intent_id'] ?? '', 190) : '';
        $isStripe = (string)$return['payment_method'] === 'stripe' && (string)$return['payment_state'] === 'paid'
            && $paymentAttempt !== null && preg_match('/^pi_[A-Za-z0-9]+$/', $paymentIntentId) === 1;
        $isWallee = (string)$return['payment_method'] === 'twint' && (string)$return['payment_state'] === 'paid'
            && $paymentAttempt !== null && ctype_digit((string)$paymentAttempt['provider_id']);
        if ($isStripe || $isWallee) {
            $paidLimit = (int)$return['total_cents'];
            $refundKind = $isWallee ? 'twint_refund' : 'stripe_refund';
            $refunded = (int)(opRow(
                "SELECT COALESCE(SUM(rs.amount_cents),0) amount FROM return_settlements rs
                 JOIN returns prior_return ON prior_return.id=rs.return_id
                  WHERE rs.status='succeeded' AND rs.kind=? AND prior_return.order_id=?",
                [$refundKind, (int)$return['order_id']]
            )['amount'] ?? 0);
            if ($amount > $paidLimit - $refunded) throw new HttpError(409, 'Refund exceeds confirmed paid funds.');
        }
        $snapshot = ['order_id'=>(int)$return['order_id'],'order_number'=>(string)$return['order_number'],'return_id'=>$returnId,'net_cents'=>$net,'tax_cents'=>$tax,'payment_intent_id'=>$paymentIntentId,'lines'=>$snapshotLines];
        $providerRefund = $isStripe || $isWallee;
        $kind = $isStripe ? 'stripe_refund' : ($isWallee ? 'twint_refund' : 'invoice_credit'); $state = $providerRefund ? 'pending' : 'succeeded';
        $pdo->prepare('INSERT INTO return_settlements(return_id,idempotency_key,kind,status,amount_cents,currency,snapshot,created_by,settled_at) VALUES(?,?,?,?,?,?,?,?,?)')->execute([$returnId,$key,$kind,$state,$amount,(string)$return['currency'],json_encode($snapshot, JSON_THROW_ON_ERROR),$staffId,$providerRefund ? null : gmdate('Y-m-d H:i:s')]);
        $settlementId = (int)$pdo->lastInsertId();
        foreach ($snapshotLines as $line) {
            $pdo->prepare('INSERT INTO return_item_dispositions(return_item_id,received_quantity,restock_quantity,disposition,recorded_by) VALUES(?,?,?,?,?)')->execute([$line['return_item_id'],$line['received_quantity'],$line['restock_quantity'],$line['disposition'],$staffId]);
            if ($line['restock_quantity'] > 0) {
                $pdo->prepare('UPDATE products SET stock=stock+? WHERE id=?')->execute([$line['restock_quantity'],$line['product_id']]);
                $pdo->prepare("INSERT INTO return_stock_movements(return_item_id,product_id,quantity,kind,created_by) VALUES(?, ?, ?, 'restock', ?)")->execute([$line['return_item_id'],$line['product_id'],$line['restock_quantity'],$staffId]);
            }
        }
        if (!$providerRefund) {
            $tmp = 'TMP-CN-' . bin2hex(random_bytes(8));
            $pdo->prepare('INSERT INTO customer_credit_notes(number,user_id,order_id,return_id,settlement_id,issued_cents,remaining_cents,currency,snapshot,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')->execute([$tmp,(int)$return['user_id'],(int)$return['order_id'],$returnId,$settlementId,$amount,$amount,(string)$return['currency'],json_encode($snapshot, JSON_THROW_ON_ERROR),$staffId]);
            $noteId = (int)$pdo->lastInsertId(); $number = opNumber('CN', $noteId); $pdo->prepare('UPDATE customer_credit_notes SET number=? WHERE id=?')->execute([$number,$noteId]);
            $targets = opRows(
                "SELECT o.id,o.total_cents,COALESCE(ia.paid_cents,0) paid_cents,
                        COALESCE((SELECT SUM(ca.amount_cents) FROM credit_applications ca WHERE ca.target_order_id=o.id),0) applied_cents
                 FROM orders o LEFT JOIN invoice_accounting ia ON ia.order_id=o.id
                 WHERE o.user_id=? AND o.currency=? AND o.status<>'cancelled'
                   AND o.payment_method IN ('pay_later','swiss_qr_invoice')
                 ORDER BY (o.id=?) DESC,o.created_at,o.id FOR UPDATE",
                [(int)$return['user_id'], (string)$return['currency'], (int)$return['order_id']]
            );
            $remainingCredit = $amount;
            foreach ($targets as $target) {
                if ($remainingCredit <= 0) break;
                $open = max(0, (int)$target['total_cents'] - (int)$target['paid_cents'] - (int)$target['applied_cents']);
                $applied = min($remainingCredit, $open);
                if ($applied <= 0) continue;
                $pdo->prepare('INSERT INTO credit_applications(credit_note_id,target_order_id,amount_cents) VALUES(?,?,?)')->execute([$noteId,(int)$target['id'],$applied]);
                $remainingCredit -= $applied;
            }
            $pdo->prepare('UPDATE customer_credit_notes SET remaining_cents=? WHERE id=?')->execute([$remainingCredit,$noteId]);
            $pdo->prepare('UPDATE returns SET status="credited",credit_cents=? WHERE id=?')->execute([$amount,$returnId]);
        }
        $pdo->prepare('INSERT INTO return_events(return_id,status,note) VALUES(?,?,?)')->execute([$returnId,$providerRefund ? 'settlement_pending' : 'credited', 'Settlement ' . $kind . ' prepared by staff #' . $staffId]);
        audit('return.settlement_' . $state, 'return', $returnId, ['settlement_id'=>$settlementId,'amount_cents'=>$amount,'by'=>$staffId]);
        $pdo->commit();
        return ['settlement_id'=>$settlementId,'kind'=>$kind,'status'=>$state,'amount_cents'=>$amount,'bridge'=>($isStripe || $isWallee) ? ['kind'=>$kind,'settlement_id'=>$settlementId,'return_id'=>$returnId,'order_id'=>(int)$return['order_id'],'order_number'=>(string)$return['order_number'],'amount_cents'=>$amount,'currency'=>(string)$return['currency'],'payment_intent_id'=>$paymentIntentId,'transaction_id'=>$isWallee ? (int)$paymentAttempt['provider_id'] : null,'idempotency_key'=>$key] : null];
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function opProviderRefundBridge(array $payload): array
{
    $secret = getenv('NATIVE_STRIPE_BRIDGE_SECRET');
    if (!is_string($secret) || $secret === '') $secret = getenv('NATIVE_S2S_SECRET');
    if (!is_string($secret) || $secret === '') throw new HttpError(503, 'Stripe refund bridge authentication is unavailable.');
    if (($payload['kind'] ?? '') === 'twint_refund') {
        $request = ['transactionId'=>(int)$payload['transaction_id'],'amount'=>(int)$payload['amount_cents'],'currency'=>'CHF','idempotencyKey'=>(string)$payload['idempotency_key']];
        $curl = curl_init('http://localhost:80/api/wallee/native/refund');
    } else {
    $request = ['returnId'=>(string)$payload['return_id'],'settlementId'=>(string)$payload['settlement_id'],
        'orderId'=>(string)$payload['order_id'],'orderNumber'=>(string)$payload['order_number'],
        'amount'=>(int)$payload['amount_cents'],'currency'=>strtolower((string)$payload['currency']),
        'paymentIntentId'=>(string)$payload['payment_intent_id'],'idempotencyKey'=>(string)$payload['idempotency_key']];
    $curl = curl_init('http://localhost:80/api/stripe/native/refund');
    }
    if ($curl === false) throw new HttpError(503, 'Payment-provider refund bridge is unavailable.');
    curl_setopt_array($curl, [CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>15,CURLOPT_HTTPHEADER=>['Content-Type: application/json','X-Native-Stripe-Bridge-Secret: '.$secret],CURLOPT_POSTFIELDS=>json_encode($request, JSON_THROW_ON_ERROR)]);
    $raw = curl_exec($curl); $status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE); $error = curl_error($curl); curl_close($curl);
    if (!is_string($raw) || $status < 200 || $status >= 300) return ['ok'=>false,'error'=>'Payment-provider refund bridge failed (HTTP '.$status.($error !== '' ? ')' : ')')];
    $response = json_decode($raw, true); return is_array($response) ? ['ok'=>true,'response'=>$response] : ['ok'=>false,'error'=>'Payment-provider refund bridge returned invalid JSON.'];
}

function opFinalizeProviderSettlement(int $settlementId, array $bridge, int $staffId): array
{
    $pdo = db(); $pdo->beginTransaction();
    try {
        $s = opRow('SELECT * FROM return_settlements WHERE id=? FOR UPDATE', [$settlementId]);
        if ($s === null) throw new HttpError(404, 'Settlement not found.');
        if ((string)$s['status'] !== 'pending') { $pdo->commit(); return ['settlement_id'=>$settlementId,'status'=>$s['status'],'kind'=>$s['kind']]; }
        if (!($bridge['ok'] ?? false)) {
            $pdo->prepare('UPDATE return_settlements SET status="failed",error_message=? WHERE id=?')->execute([text($bridge['error'] ?? 'Provider refund failed.', 1000),$settlementId]);
            $pdo->prepare('INSERT INTO return_events(return_id,status,note) VALUES(?,"settlement_failed",?)')->execute([(int)$s['return_id'],'Provider refund failed; retry with the same settlement idempotency key.']);
            $pdo->commit(); return ['settlement_id'=>$settlementId,'status'=>'failed','kind'=>(string)$s['kind']];
        }
        $ref = text(($bridge['response']['id'] ?? $bridge['response']['refund_id'] ?? ''), 190);
        if (($s['kind'] ?? '') === 'twint_refund' && strtoupper((string)($bridge['response']['status'] ?? 'PENDING')) !== 'SUCCESSFUL') {
            $pdo->prepare('UPDATE return_settlements SET provider_reference=?,error_message=? WHERE id=?')->execute([$ref === '' ? null : $ref,'Wallee accepted the refund; completion remains pending.', $settlementId]);
            $pdo->commit();
            return ['settlement_id'=>$settlementId,'status'=>'pending','kind'=>'twint_refund'];
        }
        $pdo->prepare('UPDATE return_settlements SET status="succeeded",provider_reference=?,settled_at=UTC_TIMESTAMP() WHERE id=?')->execute([$ref === '' ? null : $ref,$settlementId]);
        $pdo->prepare('UPDATE returns SET status="credited",credit_cents=? WHERE id=?')->execute([(int)$s['amount_cents'],(int)$s['return_id']]);
        $pdo->prepare('INSERT INTO return_events(return_id,status,note) VALUES(?,"credited",?)')->execute([(int)$s['return_id'],'Provider refund settled by staff #'.$staffId]);
        audit('return.settlement_succeeded', 'return', (int)$s['return_id'], ['settlement_id'=>$settlementId,'by'=>$staffId]);
        $pdo->commit(); return ['settlement_id'=>$settlementId,'status'=>'succeeded','kind'=>(string)$s['kind']];
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}

function opReturns(string $method, string $path): bool
{
    if (preg_match('#^/admin/orders/(\d+)/returns$#', $path, $match) && $method === 'POST') {
        $staff = requireStaff();
        $input = body();
        $orderId = opId($match[1]);
        $reason = text($input['reason'] ?? '', 5000);
        $note = text($input['note'] ?? '', 5000);
        $key = text($input['idempotency_key'] ?? '', 100);
        if ($reason === '' || $key === '') throw new HttpError(422, 'A reason and idempotency key are required.');
        if (!isset($input['items']) || !is_array($input['items']) || $input['items'] === []) throw new HttpError(422, 'At least one return item is required.');
        $requested = [];
        foreach ($input['items'] as $item) {
            if (!is_array($item)) throw new HttpError(422, 'Invalid return item.');
            $itemId = integer($item['order_item_id'] ?? $item['item_id'] ?? null, 1, 2147483647);
            if (isset($requested[$itemId])) throw new HttpError(422, 'Duplicate return item.');
            $requested[$itemId] = integer($item['quantity'] ?? null, 1, 100000000);
        }
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $replay = opRow('SELECT return_id FROM return_creation_keys WHERE idempotency_key=? FOR UPDATE', [$key]);
            if ($replay !== null) {
                $pdo->commit();
                $detail = opReturnDetail((int)$replay['return_id']);
                respond($detail);
            }
            $order = opRow('SELECT id,user_id,status FROM orders WHERE id=? FOR UPDATE', [$orderId]);
            if ($order === null || (string)$order['status'] === 'cancelled') throw new HttpError(404, 'Order not found.');
            $ids = array_keys($requested); sort($ids, SORT_NUMERIC);
            $marks = implode(',', array_fill(0, count($ids), '?'));
            $q = $pdo->prepare("SELECT id,quantity FROM order_items WHERE order_id=? AND id IN ($marks) ORDER BY id FOR UPDATE");
            $q->execute([$orderId, ...$ids]);
            $ordered = [];
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $row) $ordered[(int)$row['id']] = (int)$row['quantity'];
            if (count($ordered) !== count($ids)) throw new HttpError(422, 'A return item does not belong to this order.');
            $q = $pdo->prepare("SELECT ri.order_item_id,ri.quantity FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=? AND r.status<>'rejected' AND ri.order_item_id IN ($marks) FOR UPDATE");
            $q->execute([$orderId, ...$ids]); $used = [];
            foreach ($q->fetchAll(PDO::FETCH_ASSOC) as $row) $used[(int)$row['order_item_id']] = ($used[(int)$row['order_item_id']] ?? 0) + (int)$row['quantity'];
            foreach ($requested as $itemId => $quantity) if ($quantity + ($used[$itemId] ?? 0) > $ordered[$itemId]) throw new HttpError(409, 'Return quantity exceeds the quantity available.');
            $tmp = 'TMP-' . bin2hex(random_bytes(10));
            $pdo->prepare('INSERT INTO returns(number,user_id,order_id,status,reason,credit_cents,note) VALUES(?,?,?,"submitted",?,0,?)')->execute([$tmp, (int)$order['user_id'], $orderId, $reason, $note]);
            $returnId = (int)$pdo->lastInsertId(); $number = opNumber('RET', $returnId);
            $pdo->prepare('UPDATE returns SET number=? WHERE id=?')->execute([$number, $returnId]);
            $insert = $pdo->prepare('INSERT INTO return_items(return_id,order_item_id,quantity) VALUES(?,?,?)');
            foreach ($requested as $itemId => $quantity) $insert->execute([$returnId, $itemId, $quantity]);
            $pdo->prepare('INSERT INTO return_creation_keys(idempotency_key,return_id) VALUES(?,?)')->execute([$key, $returnId]);
            $pdo->prepare('INSERT INTO return_events(return_id,status,note) VALUES(?,"submitted",?)')->execute([$returnId, 'Staff RMA created: ' . $note]);
            audit('return.staff_created', 'return', $returnId, ['order_id' => $orderId, 'by' => (int)$staff['id']]);
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
        respond(opReturnDetail($returnId), 201);
    }
    if (preg_match('#^/admin/returns/(\d+)/settle$#', $path, $match) && $method === 'POST') {
        $staff = requireStaff();
        $result = opSettleReturn(opId($match[1]), body(), (int)$staff['id']);
        if (($result['bridge'] ?? null) !== null) {
            $bridge = opProviderRefundBridge($result['bridge']);
            $result = opFinalizeProviderSettlement((int)$result['settlement_id'], $bridge, (int)$staff['id']);
        }
        respond(['return' => opReturnDetail(opId($match[1])), 'settlement' => $result]);
    }
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
        if ($admin) {
            respond(opReturnDetail($id));
        }
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
            'approved' => ['rejected'],
            'rejected' => [],
            'credited' => [],
        ];
        if (!in_array($status, ['approved', 'rejected'], true)) throw new HttpError(422, 'Invalid return status.');
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
    if (preg_match('#^/admin/customers/(\d+)/detail$#', $path, $match) && $method === 'GET') {
        requireStaff();
        $customerId = opId($match[1]);
        $customer = opRow(
            "SELECT id,name,email,company,role,group_id,status,phone,website,business_activity,
             tax_registration_type,tax_registration_number,newsletter_opt_in,terms_accepted_at,created_at
             FROM users WHERE id=? AND role='customer'",
            [$customerId]
        );
        if ($customer === null) throw new HttpError(404, 'Customer not found.');
        $customer['id'] = (int)$customer['id'];
        $customer['group_id'] = (int)$customer['group_id'];
        $customer['newsletter_opt_in'] = (bool)$customer['newsletter_opt_in'];
        $customer['payment_entitlements'] = array_column(
            opRows('SELECT payment_method,enabled FROM customer_payment_entitlements WHERE user_id=?', [$customerId]),
            'enabled',
            'payment_method'
        );
        foreach ($customer['payment_entitlements'] as &$enabled) $enabled = (bool)$enabled;
        unset($enabled);
        $customer['payment_entitlements']['pay_later'] =
            (bool)($customer['payment_entitlements']['pay_later'] ?? false)
            || (bool)($customer['payment_entitlements']['swiss_qr_invoice'] ?? false);
        unset($customer['payment_entitlements']['swiss_qr_invoice']);
        $billing = opRow('SELECT label,name,company,line1,line2,postal_code,city,country,updated_at FROM billing_addresses WHERE user_id=?', [$customerId]);
        $shipping = opRows('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,id ASC', [$customerId]);
        if ($billing === null && $shipping !== []) {
            $billing = commerceAddressRow($shipping[0]);
            unset($billing['id'], $billing['is_default']);
            $billing['derived_from_primary_shipping'] = true;
        }
        $orders = opRows(
            'SELECT id,number,status,subtotal_cents,tax_cents,shipping_cents,shipping_method_code,shipping_method_name,
             shipping_carrier,total_cents,created_at,payment_method,payment_state,currency,address_json
             FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 20',
            [$customerId]
        );
        foreach ($shipping as &$address) $address = commerceAddressRow($address);
        unset($address);
        foreach ($orders as &$order) {
            $addressJson = opJson($order['address_json']);
            $order = commerceOrderSummary($order);
            $order['address_json'] = $addressJson;
        }
        unset($order);
        respond(['customer' => $customer, 'billing_address' => $billing, 'shipping_addresses' => $shipping, 'recent_orders' => $orders]);
    }
    if (preg_match('#^/admin/customers/(\d+)/billing$#', $path, $match) && $method === 'PUT') {
        $staff = requireStaff();
        $customerId = opId($match[1]);
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $customer = opRow("SELECT id FROM users WHERE id=? AND role='customer' FOR UPDATE", [$customerId]);
            if ($customer === null) throw new HttpError(404, 'Customer not found.');
            $existing = opRow('SELECT * FROM billing_addresses WHERE user_id=? FOR UPDATE', [$customerId]);
            $values = commerceAddressInput(body(), $existing);
            unset($values['is_default']);
            $pdo->prepare(
                'INSERT INTO billing_addresses(user_id,label,name,company,line1,line2,postal_code,city,country)
                 VALUES(?,?,?,?,?,?,?,?,?)
                 ON DUPLICATE KEY UPDATE label=VALUES(label),name=VALUES(name),company=VALUES(company),
                 line1=VALUES(line1),line2=VALUES(line2),postal_code=VALUES(postal_code),city=VALUES(city),
                 country=VALUES(country),updated_at=CURRENT_TIMESTAMP'
            )->execute([$customerId, $values['label'], $values['name'], $values['company'], $values['line1'],
                $values['line2'], $values['postal_code'], $values['city'], $values['country']]);
            audit('customer.billing_address_updated', 'user', $customerId, ['actor_id' => (int)$staff['id'], 'customer_id' => $customerId]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        respond(['billing_address' => opRow('SELECT label,name,company,line1,line2,postal_code,city,country,updated_at FROM billing_addresses WHERE user_id=?', [$customerId])]);
    }
    if (preg_match('#^/admin/customers/(\d+)/addresses(?:/(\d+))?$#', $path, $match)
        && in_array($method, ['POST', 'PATCH', 'DELETE'], true)) {
        $staff = requireStaff();
        $customerId = opId($match[1]);
        $addressId = isset($match[2]) ? opId($match[2]) : null;
        if (($method === 'POST') !== ($addressId === null)) return false;
        $pdo = db();
        try {
            $pdo->beginTransaction();
            $customer = opRow("SELECT id FROM users WHERE id=? AND role='customer' FOR UPDATE", [$customerId]);
            if ($customer === null) throw new HttpError(404, 'Customer not found.');
            $addresses = opRows('SELECT * FROM addresses WHERE user_id=? ORDER BY id FOR UPDATE', [$customerId]);
            $existing = null;
            foreach ($addresses as $address) if ((int)$address['id'] === $addressId) $existing = $address;
            if ($addressId !== null && $existing === null) throw new HttpError(404, 'Address not found.');
            if ($method === 'DELETE') {
                if (count($addresses) === 1) throw new HttpError(422, 'Cannot delete the last shipping address.');
                $pdo->prepare('DELETE FROM addresses WHERE id=? AND user_id=?')->execute([$addressId, $customerId]);
                if ((bool)$existing['is_default']) {
                    $pdo->prepare('UPDATE addresses SET is_default=1 WHERE user_id=? ORDER BY id ASC LIMIT 1')->execute([$customerId]);
                }
                audit('customer.shipping_address_deleted', 'address', $addressId, ['actor_id' => (int)$staff['id'], 'customer_id' => $customerId]);
            } else {
                $values = commerceAddressInput(body(), $existing);
                $makeDefault = $values['is_default'] || ($method === 'POST' && $addresses === []);
                if ($existing !== null && (bool)$existing['is_default'] && !$makeDefault) $makeDefault = true;
                if ($makeDefault) $pdo->prepare('UPDATE addresses SET is_default=0 WHERE user_id=?')->execute([$customerId]);
                if ($method === 'POST') {
                    $pdo->prepare('INSERT INTO addresses(user_id,label,name,company,line1,line2,postal_code,city,country,is_default) VALUES(?,?,?,?,?,?,?,?,?,?)')
                        ->execute([$customerId, $values['label'], $values['name'], $values['company'], $values['line1'], $values['line2'],
                            $values['postal_code'], $values['city'], $values['country'], $makeDefault ? 1 : 0]);
                    $addressId = (int)$pdo->lastInsertId();
                    $action = 'customer.shipping_address_created';
                } else {
                    $pdo->prepare('UPDATE addresses SET label=?,name=?,company=?,line1=?,line2=?,postal_code=?,city=?,country=?,is_default=? WHERE id=? AND user_id=?')
                        ->execute([$values['label'], $values['name'], $values['company'], $values['line1'], $values['line2'],
                            $values['postal_code'], $values['city'], $values['country'], $makeDefault ? 1 : 0, $addressId, $customerId]);
                    $action = 'customer.shipping_address_updated';
                }
                audit($action, 'address', $addressId, ['actor_id' => (int)$staff['id'], 'customer_id' => $customerId]);
            }
            $remaining = opRows('SELECT * FROM addresses WHERE user_id=? ORDER BY id FOR UPDATE', [$customerId]);
            if ($remaining !== []) {
                $defaultId = (int)$remaining[0]['id'];
                foreach ($remaining as $address) {
                    if ((bool)$address['is_default']) {
                        $defaultId = (int)$address['id'];
                        break;
                    }
                }
                $pdo->prepare('UPDATE addresses SET is_default=0 WHERE user_id=?')->execute([$customerId]);
                $pdo->prepare('UPDATE addresses SET is_default=1 WHERE id=? AND user_id=?')->execute([$defaultId, $customerId]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
        $shipping = opRows('SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,id ASC', [$customerId]);
        respond(['shipping_addresses' => array_map('commerceAddressRow', $shipping)]);
    }
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
        $customers = opRows("SELECT u.id,u.name,u.email,u.company,u.phone,u.website,u.business_activity,
            u.tax_registration_type,u.tax_registration_number,u.newsletter_opt_in,u.terms_accepted_at,
            u.group_id,u.status,u.created_at,a.line1,a.line2,a.postal_code,a.city,a.country
            FROM users u LEFT JOIN addresses a ON a.id=(
                SELECT a2.id FROM addresses a2 WHERE a2.user_id=u.id ORDER BY a2.is_default DESC,a2.id LIMIT 1
            ) WHERE u.role='customer' ORDER BY u.id DESC");
        foreach ($customers as &$customer) {
            $customer['id'] = (int)$customer['id']; $customer['group_id'] = (int)$customer['group_id'];
            $customer['newsletter_opt_in'] = (bool)$customer['newsletter_opt_in'];
            $entitlements = opRows('SELECT payment_method,enabled FROM customer_payment_entitlements WHERE user_id=?', [$customer['id']]);
            $customer['payment_entitlements'] = array_column($entitlements, 'enabled', 'payment_method');
            foreach ($customer['payment_entitlements'] as &$enabled) $enabled = (bool)$enabled;
            unset($enabled);
            $customer['payment_entitlements']['pay_later'] =
                (bool)($customer['payment_entitlements']['pay_later'] ?? false)
                || (bool)($customer['payment_entitlements']['swiss_qr_invoice'] ?? false);
            unset($customer['payment_entitlements']['swiss_qr_invoice']);
        }
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
        $entitlementsChanged = false;
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
        if (array_key_exists('payment_entitlements', $input)) {
            if (!is_array($input['payment_entitlements'])) throw new HttpError(422, 'Payment entitlements must be an object.');
            foreach ($input['payment_entitlements'] as $method => $enabled) {
                if (!is_string($method) || !in_array($method, ['stripe', 'twint', 'pay_later', 'swiss_qr_invoice'], true)
                    || !is_bool($enabled)) throw new HttpError(422, 'Invalid payment entitlement.');
                db()->prepare(
                    'INSERT INTO customer_payment_entitlements(user_id,payment_method,enabled,granted_by,granted_at,revoked_by,revoked_at)
                     VALUES(?,?,?,?,UTC_TIMESTAMP(),NULL,NULL)
                     ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),
                     granted_by=IF(VALUES(enabled)=1,VALUES(granted_by),granted_by),
                     granted_at=IF(VALUES(enabled)=1,UTC_TIMESTAMP(),granted_at),
                     revoked_by=IF(VALUES(enabled)=0,VALUES(granted_by),NULL),
                     revoked_at=IF(VALUES(enabled)=0,UTC_TIMESTAMP(),NULL)'
                )->execute([$id, $method, $enabled ? 1 : 0, (int)$staff['id']]);
                if ($method === 'pay_later') {
                    db()->prepare(
                        "UPDATE customer_payment_entitlements SET enabled=0,revoked_by=?,revoked_at=UTC_TIMESTAMP()
                         WHERE user_id=? AND payment_method='swiss_qr_invoice'"
                    )->execute([(int)$staff['id'], $id]);
                }
            }
            $entitlementsChanged = true;
        }
        if ($fields !== []) {
            $sets = implode(',', array_map(static fn(string $f): string => "$f=?", array_keys($fields)));
            db()->prepare("UPDATE users SET $sets WHERE id=?")->execute([...array_values($fields), $id]);
        }
        audit('customer.updated', 'user', $id, ['fields' => array_merge(array_keys($fields), $entitlementsChanged ? ['payment_entitlements'] : []), 'by' => (int)$staff['id']]);
        $updated = opRow('SELECT id,name,email,company,group_id,status,created_at FROM users WHERE id=?', [$id]) ?? [];
        $updated['id'] = (int)$updated['id']; $updated['group_id'] = (int)$updated['group_id'];
        $updated['payment_entitlements'] = array_column(
            opRows('SELECT payment_method,enabled FROM customer_payment_entitlements WHERE user_id=?', [$id]), 'enabled', 'payment_method'
        );
        foreach ($updated['payment_entitlements'] as &$enabled) $enabled = (bool)$enabled;
        unset($enabled);
        $updated['payment_entitlements']['pay_later'] =
            (bool)($updated['payment_entitlements']['pay_later'] ?? false)
            || (bool)($updated['payment_entitlements']['swiss_qr_invoice'] ?? false);
        unset($updated['payment_entitlements']['swiss_qr_invoice']);
        respond(['customer' => $updated]);
    }
    if ($path === '/admin/settings' && $method === 'GET') {
        requireStaff();
        respond(['settings' => [
            'currency' => 'EUR',
            'low_stock_threshold' => opSetting('low_stock_threshold', 5),
        ], 'safety' => ['test_mode' => true, 'live_connections' => 0, 'external_endpoints' => false]]);
    }
    if ($path === '/admin/settings' && $method === 'PATCH') {
        $staff = requireStaff();
        $input = body();
        $removed = ['tax_bps', 'shipping_eur_cents', 'free_shipping_eur_cents'];
        foreach ($removed as $name) {
            if (array_key_exists($name, $input)) {
                throw new HttpError(422, "$name is no longer configurable; VAT and shipping are determined by delivery country.");
            }
        }
        $limits = ['low_stock_threshold' => 100000000];
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
            'low_stock_threshold' => opSetting('low_stock_threshold', 5),
        ], 'safety' => ['test_mode' => true, 'live_connections' => 0, 'external_endpoints' => false]]);
    }
    if ($path === '/admin/diagnostics' && $method === 'GET') {
        requireStaff();
        $page = integer($_GET['page'] ?? 1, 1, 100000);
        $limit = integer($_GET['limit'] ?? 25, 1, 100);
        $severity = strtolower(text($_GET['severity'] ?? '', 20));
        $category = text($_GET['category'] ?? '', 100);
        $status = strtolower(text($_GET['status'] ?? '', 12));
        $search = text($_GET['search'] ?? '', 100);
        if ($severity !== '' && !in_array($severity, ['debug', 'info', 'warning', 'error', 'critical'], true)) throw new HttpError(422, 'Invalid severity filter.');
        if ($status !== '' && !in_array($status, ['open', 'resolved'], true)) throw new HttpError(422, 'Invalid status filter.');
        $where = []; $params = [];
        if ($severity !== '') { $where[] = 'severity=?'; $params[] = $severity; }
        if ($category !== '') { $where[] = 'category=?'; $params[] = $category; }
        if ($status === 'open') $where[] = 'resolved_at IS NULL';
        if ($status === 'resolved') $where[] = 'resolved_at IS NOT NULL';
        if ($search !== '') { $where[] = '(reference LIKE ? OR summary LIKE ? OR category LIKE ?)'; $params = [...$params, "%$search%", "%$search%", "%$search%"]; }
        $condition = $where ? ' WHERE ' . implode(' AND ', $where) : '';
        $count = db()->prepare('SELECT COUNT(*) FROM diagnostics' . $condition); $count->execute($params);
        $total = (int)$count->fetchColumn(); $pages = max(1, (int)ceil($total / $limit)); $page = min($page, $pages);
        $statement = db()->prepare('SELECT id,reference,severity,category,summary,request_method,request_path,occurred_at,resolved_at,resolved_by
            FROM diagnostics' . $condition . ' ORDER BY id DESC LIMIT ' . $limit . ' OFFSET ' . (($page - 1) * $limit));
        $statement->execute($params); $rows = $statement->fetchAll();
        foreach ($rows as &$row) { $row['id'] = (int)$row['id']; $row['resolved_by'] = $row['resolved_by'] === null ? null : (int)$row['resolved_by']; }
        unset($row);
        $counts = db()->query("SELECT severity,COUNT(*) total,SUM(resolved_at IS NULL) open_total FROM diagnostics GROUP BY severity")->fetchAll();
        respond(['diagnostics' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'limit' => $limit, 'counts' => $counts]);
    }
    if (preg_match('#^/admin/diagnostics/(\d+)$#', $path, $matches) && $method === 'GET') {
        requireStaff(); $id = integer($matches[1], 1);
        $statement = db()->prepare('SELECT id,reference,severity,category,summary,context_json,request_method,request_path,occurred_at,resolved_at,resolved_by FROM diagnostics WHERE id=?');
        $statement->execute([$id]); $diagnostic = $statement->fetch();
        if (!$diagnostic) throw new HttpError(404, 'Diagnostic not found.');
        $diagnostic['id'] = (int)$diagnostic['id'];
        $diagnostic['resolved_by'] = $diagnostic['resolved_by'] === null ? null : (int)$diagnostic['resolved_by'];
        $diagnostic['context_json'] = redactDiagnostic(opJson($diagnostic['context_json']));
        respond(['diagnostic' => $diagnostic]);
    }
    if (preg_match('#^/admin/diagnostics/(\d+)$#', $path, $matches) && $method === 'PATCH') {
        $staff = requireStaff(); $id = integer($matches[1], 1); $state = strtolower(text(body()['status'] ?? '', 12));
        if (!in_array($state, ['resolved', 'open'], true)) throw new HttpError(422, 'Status must be resolved or open.');
        $existing = db()->prepare('SELECT id FROM diagnostics WHERE id=?');
        $existing->execute([$id]);
        if (!$existing->fetchColumn()) throw new HttpError(404, 'Diagnostic not found.');
        $statement = db()->prepare('UPDATE diagnostics SET resolved_at=?,resolved_by=? WHERE id=?');
        $statement->execute([$state === 'resolved' ? gmdate('Y-m-d H:i:s') : null, $state === 'resolved' ? (int)$staff['id'] : null, $id]);
        audit('diagnostic.' . $state, 'diagnostic', $id, ['reference_id' => $id]);
        respond(['id' => $id, 'status' => $state]);
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
        respond(['connections' => [
            ['name' => 'Inventory provider', 'mode' => 'isolated', 'status' => 'blocked'],
            ['name' => 'Shipment provider', 'mode' => 'isolated', 'status' => 'blocked'],
            ['name' => 'Payment provider', 'mode' => 'isolated', 'status' => 'blocked'],
        ], 'safety' => ['test_mode' => true, 'live_connections' => 0]]);
    }
    if ($path === '/admin/integrations/simulate' && $method === 'POST') {
        $staff = requireStaff();
        $event = text(body()['event'] ?? '', 30);
        if (!in_array($event, ['stock', 'shipment', 'payment'], true)) throw new HttpError(422, 'Invalid simulation event.');
        $payload = ['event' => $event, 'simulated' => true, 'local_only' => true];
        audit('integration.simulated', 'integration', 0, $payload + ['staff_id' => (int)$staff['id']]);
        respond(['event' => $payload, 'safety' => ['local_only' => true]], 201);
    }
    return false;
}

function handleOperations(string $method, string $path): bool
{
    return handleAdminFinance($method, $path)
        || handlePricingAdmin($method, $path)
        || opAdminProducts($method, $path)
        || opReturns($method, $path)
        || opImport($method, $path)
        || opAdminGeneral($method, $path);
}