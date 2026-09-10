<?php
declare(strict_types=1);

/**
 * B2B ordering workspace.
 *
 * Everything a returning trade buyer needs between "I know what I need" and
 * "my bookkeeping is done": bulk SKU entry, saved order lists, reordering,
 * back-in-stock alerts, the dispatch cut-off promise, billing delivery
 * preferences and the self-service document archive.
 *
 * Ownership always comes from the session user; a client supplied user id is
 * never trusted.  Money stays in EUR cents internally and is converted through
 * the shared currency context, exactly like the cart.
 */

require_once __DIR__ . '/commerce.php';

const WORKSPACE_MAX_BULK_LINES = 250;
const WORKSPACE_MAX_ARCHIVE_DOCUMENTS = 120;
/** Byte budget for one bulk download, so a wide period cannot exhaust memory. */
const WORKSPACE_MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

/** Products a buyer may act on, priced for their group in their currency. */
function workspaceProductSelect(): string
{
    return 'SELECT p.id, p.sku, p.name, p.image_url, p.stock, p.minimum_quantity, p.quality, p.active,
                   p.expected_restock_date,
                   COALESCE(gp.price_eur_cents, p.list_price_eur_cents) AS price_eur_cents
            FROM products p
            LEFT JOIN group_prices gp ON gp.product_id = p.id AND gp.group_id = ?';
}

/** @return array<string,mixed> */
function workspacePresentProduct(array $row, array $context): array
{
    $eurPrice = $row['price_eur_cents'] === null ? null : (int) $row['price_eur_cents'];
    $price = null;
    if ($eurPrice !== null) {
        $price = $context['currency'] === 'CHF'
            ? currencyConvert($eurPrice, 'EUR', 'CHF', $context['exchange_rate'])
            : $eurPrice;
    }
    return [
        'product_id' => (int) $row['id'],
        'sku' => (string) $row['sku'],
        'name' => (string) $row['name'],
        'image_url' => (string) $row['image_url'],
        'quality' => (string) ($row['quality'] ?? ''),
        'stock' => (int) $row['stock'],
        'minimum_quantity' => max(1, (int) $row['minimum_quantity']),
        'price_cents' => $price,
        'currency' => $context['currency'],
        'expected_restock_date' => $row['expected_restock_date'] ?? null,
    ];
}

function workspaceCurrencyContext(): array
{
    $context = currencyContext();
    if (!$context['pricing_ready']) {
        throw new HttpError(503, 'Pricing is not initialized.');
    }
    return $context;
}

/**
 * Resolve a customer typed code to a single product.  Exact SKU wins; a unique
 * prefix or name hit is accepted so a buyer pasting a shortened supplier code
 * still lands on the right part.  Ambiguity is reported, never guessed.
 *
 * @return array{status:string,row:?array}
 */
function workspaceResolveCode(PDO $pdo, string $code, int $groupId): array
{
    $needle = trim($code);
    if ($needle === '') {
        return ['status' => 'empty', 'row' => null];
    }
    $statement = $pdo->prepare(workspaceProductSelect() . ' WHERE p.sku = ? LIMIT 2');
    $statement->execute([$groupId, $needle]);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    if (count($rows) === 1) {
        return ['status' => (int) $rows[0]['active'] === 1 ? 'ok' : 'inactive', 'row' => $rows[0]];
    }

    $like = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $needle);
    $statement = $pdo->prepare(
        workspaceProductSelect() . ' WHERE p.active = 1 AND (p.sku LIKE ? OR p.name LIKE ?) ORDER BY p.sku LIMIT 6'
    );
    $statement->execute([$groupId, $like . '%', '%' . $like . '%']);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    if ($rows === []) {
        return ['status' => 'not_found', 'row' => null];
    }
    if (count($rows) > 1) {
        return ['status' => 'ambiguous', 'row' => null, 'matches' => array_slice($rows, 0, 5)];
    }
    return ['status' => 'ok', 'row' => $rows[0]];
}

/**
 * Turn raw customer input into resolved, priced order lines.
 *
 * @param list<array<string,mixed>> $lines
 * @return list<array<string,mixed>>
 */
function workspaceResolveLines(array $lines, int $groupId, array $context): array
{
    if (count($lines) > WORKSPACE_MAX_BULK_LINES) {
        throw new HttpError(422, 'Too many order lines in one request.');
    }
    $pdo = db();
    $resolved = [];
    foreach ($lines as $index => $line) {
        if (!is_array($line)) {
            throw new HttpError(422, 'An order line is malformed.');
        }
        $code = text((string) ($line['code'] ?? ''), 190);
        $requested = integer($line['quantity'] ?? 1, 0, 100000);
        $entry = [
            'index' => (int) $index,
            'code' => $code,
            'requested_quantity' => $requested,
            'quantity' => $requested,
            'status' => 'ok',
            'product' => null,
            'matches' => [],
        ];
        if ($code === '') {
            $entry['status'] = 'empty';
            $resolved[] = $entry;
            continue;
        }
        $match = workspaceResolveCode($pdo, $code, $groupId);
        if ($match['status'] !== 'ok') {
            $entry['status'] = $match['status'];
            if ($match['status'] === 'ambiguous') {
                $entry['matches'] = array_map(
                    static fn(array $row): array => workspacePresentProduct($row, $context),
                    $match['matches'] ?? []
                );
            }
            $resolved[] = $entry;
            continue;
        }
        $product = workspacePresentProduct($match['row'], $context);
        $entry['product'] = $product;
        $resolution = workspaceResolveOrderLine($product, $requested);
        $entry['status'] = $resolution['status'];
        $entry['quantity'] = $resolution['quantity'];
        if ($product['price_cents'] !== null && $resolution['quantity'] > 0) {
            $entry['line_total_cents'] = $product['price_cents'] * $resolution['quantity'];
        }
        $resolved[] = $entry;
    }
    return $resolved;
}

/**
 * The single place that decides how much of a product a bulk-ordering path may
 * put in the cart. Quick order, saved lists and reorder all resolve here, so a
 * line cannot look orderable on one screen and then be dropped silently by the
 * writer on another.
 */
function workspaceResolveOrderLine(array $product, int $requested): array
{
    if ($product['price_cents'] === null) {
        return ['status' => 'no_price', 'quantity' => $requested];
    }
    $stock = (int) $product['stock'];
    $minimum = (int) $product['minimum_quantity'];
    if ($stock <= 0) {
        return ['status' => 'out_of_stock', 'quantity' => 0];
    }
    // Stock below the minimum order quantity cannot be ordered at all:
    // clamping to stock would produce a line checkout refuses.
    if ($stock < $minimum) {
        return ['status' => 'below_minimum', 'quantity' => 0];
    }
    $quantity = max($requested, $minimum);
    $status = $quantity !== $requested ? 'raised_to_minimum' : 'ok';
    if ($quantity > $stock) {
        $quantity = $stock;
        $status = 'reduced_to_stock';
    }
    return ['status' => $status, 'quantity' => $quantity];
}

function workspaceLineIsOrderable(array $line): bool
{
    return in_array($line['status'], ['ok', 'raised_to_minimum', 'reduced_to_stock'], true)
        && ($line['quantity'] ?? 0) > 0;
}

/**
 * Add resolved lines to the cart under the same locking order every cart
 * writer uses: the user row first, then each product row.
 *
 * @param list<array<string,mixed>> $lines
 * @return array{cart:array,added:int}
 */
function workspaceAddLinesToCart(array $lines, int $userId): array
{
    $pdo = db();
    $orderable = array_values(array_filter($lines, 'workspaceLineIsOrderable'));
    if ($orderable === []) {
        throw new HttpError(422, 'No orderable lines were supplied.');
    }
    usort(
        $orderable,
        static fn(array $a, array $b): int => $a['product']['product_id'] <=> $b['product']['product_id']
    );
    try {
        $pdo->beginTransaction();
        $statement = $pdo->prepare(
            "SELECT id,group_id FROM users WHERE id=? AND role='customer' AND status='active' FOR UPDATE"
        );
        $statement->execute([$userId]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            throw new HttpError(403, 'An active customer account is required.');
        }
        $added = 0;
        foreach ($orderable as $line) {
            $productId = (int) $line['product']['product_id'];
            $statement = $pdo->prepare(
                'SELECT stock,minimum_quantity FROM products WHERE id=? AND active=1 FOR UPDATE'
            );
            $statement->execute([$productId]);
            $product = $statement->fetch(PDO::FETCH_ASSOC);
            if (!$product) {
                throw new HttpError(409, 'A product became unavailable while the list was added.');
            }
            $statement = $pdo->prepare('SELECT quantity FROM cart_items WHERE user_id=? AND product_id=? FOR UPDATE');
            $statement->execute([$userId, $productId]);
            $existing = $statement->fetchColumn();
            $quantity = ($existing === false ? 0 : (int) $existing) + (int) $line['quantity'];
            $quantity = max($quantity, (int) $product['minimum_quantity']);
            if ($quantity > (int) $product['stock']) {
                $quantity = (int) $product['stock'];
            }
            // Never write a line the minimum order quantity forbids: stock that
            // sank below the minimum since resolution makes the line unorderable.
            if ($quantity <= 0 || $quantity < (int) $product['minimum_quantity']) {
                continue;
            }
            $statement = $pdo->prepare(
                'INSERT INTO cart_items (user_id,product_id,quantity) VALUES (?,?,?)
                 ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)'
            );
            $statement->execute([$userId, $productId, $quantity]);
            $added++;
        }
        $cart = commerceCart($userId, (int) $user['group_id']);
        $pdo->commit();
        return ['cart' => $cart, 'added' => $added];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}

/* ------------------------------------------------------------------ */
/* Quick order                                                         */
/* ------------------------------------------------------------------ */

function workspaceQuickOrderResolve(): never
{
    $user = commerceActiveCustomer();
    $context = workspaceCurrencyContext();
    $input = body();
    $lines = $input['lines'] ?? [];
    if (!is_array($lines)) {
        throw new HttpError(422, 'Order lines must be a list.');
    }
    $resolved = workspaceResolveLines(array_values($lines), (int) $user['group_id'], $context);
    $orderable = array_values(array_filter($resolved, 'workspaceLineIsOrderable'));
    $total = array_sum(array_map(static fn(array $line): int => (int) ($line['line_total_cents'] ?? 0), $orderable));
    respond([
        'lines' => $resolved,
        'currency' => $context['currency'],
        'orderable_count' => count($orderable),
        'total_cents' => $total,
    ]);
}

function workspaceQuickOrderAdd(): never
{
    $user = commerceActiveCustomer();
    $context = workspaceCurrencyContext();
    $input = body();
    $lines = $input['lines'] ?? [];
    if (!is_array($lines)) {
        throw new HttpError(422, 'Order lines must be a list.');
    }
    $resolved = workspaceResolveLines(array_values($lines), (int) $user['group_id'], $context);
    $result = workspaceAddLinesToCart($resolved, (int) $user['id']);
    respond([
        'cart' => $result['cart'],
        'added' => $result['added'],
        'lines' => $resolved,
    ]);
}

/* ------------------------------------------------------------------ */
/* Saved order lists                                                   */
/* ------------------------------------------------------------------ */

function workspaceListSummaries(int $userId): array
{
    $statement = db()->prepare(
        'SELECT l.id, l.name, l.created_at, l.updated_at, COUNT(i.product_id) AS item_count
         FROM order_lists l
         LEFT JOIN order_list_items i ON i.list_id = l.id
         WHERE l.user_id = ?
         GROUP BY l.id, l.name, l.created_at, l.updated_at
         ORDER BY l.updated_at DESC, l.id DESC'
    );
    $statement->execute([$userId]);
    return array_map(static fn(array $row): array => [
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'item_count' => (int) $row['item_count'],
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
    ], $statement->fetchAll(PDO::FETCH_ASSOC));
}

function workspaceOwnedList(int $listId, int $userId): array
{
    $statement = db()->prepare('SELECT id,name,created_at,updated_at FROM order_lists WHERE id=? AND user_id=?');
    $statement->execute([$listId, $userId]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        throw new HttpError(404, 'Order list not found.');
    }
    return $row;
}

function workspaceListDetail(int $listId): never
{
    $user = commerceActiveCustomer();
    $context = workspaceCurrencyContext();
    $list = workspaceOwnedList($listId, (int) $user['id']);
    $statement = db()->prepare(
        workspaceProductSelect()
        . ' JOIN order_list_items li ON li.product_id = p.id
            WHERE li.list_id = ?
            ORDER BY li.added_at, p.sku'
    );
    $statement->execute([(int) $user['group_id'], $listId]);
    $quantities = db()->prepare('SELECT product_id,quantity FROM order_list_items WHERE list_id=?');
    $quantities->execute([$listId]);
    $quantityByProduct = $quantities->fetchAll(PDO::FETCH_KEY_PAIR);
    $items = [];
    $total = 0;
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $product = workspacePresentProduct($row, $context);
        $product['active'] = (int) $row['active'] === 1;
        $product['quantity'] = max(1, (int) ($quantityByProduct[(int) $row['id']] ?? 1));
        // Stock under the minimum order quantity cannot be ordered at all, so it
        // must not count towards the preview total either.
        $product['orderable'] = $product['active']
            && $product['price_cents'] !== null
            && $product['stock'] >= max(1, (int) $product['minimum_quantity']);
        $product['order_quantity'] = $product['orderable']
            ? min(max($product['quantity'], (int) $product['minimum_quantity']), (int) $product['stock'])
            : 0;
        if ($product['orderable']) {
            $total += $product['price_cents'] * $product['order_quantity'];
        }
        $items[] = $product;
    }
    respond([
        'list' => [
            'id' => (int) $list['id'],
            'name' => (string) $list['name'],
            'created_at' => $list['created_at'],
            'updated_at' => $list['updated_at'],
        ],
        'items' => $items,
        'currency' => $context['currency'],
        'total_cents' => $total,
    ]);
}

function workspaceCreateList(): never
{
    $user = commerceActiveCustomer();
    $input = body();
    $name = text($input['name'] ?? '', 120);
    if ($name === '') {
        throw new HttpError(422, 'A list name is required.');
    }
    $pdo = db();
    $statement = $pdo->prepare('SELECT COUNT(*) FROM order_lists WHERE user_id=?');
    $statement->execute([(int) $user['id']]);
    if ((int) $statement->fetchColumn() >= 50) {
        throw new HttpError(422, 'The maximum number of order lists has been reached.');
    }
    $statement = $pdo->prepare('SELECT id FROM order_lists WHERE user_id=? AND name=?');
    $statement->execute([(int) $user['id'], $name]);
    if ($statement->fetchColumn() !== false) {
        throw new HttpError(409, 'A list with this name already exists.');
    }
    $pdo->prepare('INSERT INTO order_lists (user_id,name) VALUES (?,?)')->execute([(int) $user['id'], $name]);
    $listId = (int) $pdo->lastInsertId();
    audit('order_list.create', 'order_list', $listId, ['name' => $name]);
    respond(['list' => ['id' => $listId, 'name' => $name, 'item_count' => 0], 'lists' => workspaceListSummaries((int) $user['id'])], 201);
}

function workspaceRenameList(int $listId): never
{
    $user = commerceActiveCustomer();
    workspaceOwnedList($listId, (int) $user['id']);
    $name = text(body()['name'] ?? '', 120);
    if ($name === '') {
        throw new HttpError(422, 'A list name is required.');
    }
    $statement = db()->prepare('SELECT id FROM order_lists WHERE user_id=? AND name=? AND id<>?');
    $statement->execute([(int) $user['id'], $name, $listId]);
    if ($statement->fetchColumn() !== false) {
        throw new HttpError(409, 'A list with this name already exists.');
    }
    db()->prepare('UPDATE order_lists SET name=? WHERE id=? AND user_id=?')
        ->execute([$name, $listId, (int) $user['id']]);
    respond(['lists' => workspaceListSummaries((int) $user['id'])]);
}

function workspaceDeleteList(int $listId): never
{
    $user = commerceActiveCustomer();
    workspaceOwnedList($listId, (int) $user['id']);
    db()->prepare('DELETE FROM order_lists WHERE id=? AND user_id=?')->execute([$listId, (int) $user['id']]);
    audit('order_list.delete', 'order_list', $listId, []);
    respond(['lists' => workspaceListSummaries((int) $user['id'])]);
}

function workspaceListAddItem(int $listId): never
{
    $user = commerceActiveCustomer();
    workspaceOwnedList($listId, (int) $user['id']);
    $input = body();
    $productId = integer($input['product_id'] ?? null, 1);
    $quantity = integer($input['quantity'] ?? 1, 1, 100000);
    $pdo = db();
    $statement = $pdo->prepare('SELECT id FROM products WHERE id=? AND active=1');
    $statement->execute([$productId]);
    if ($statement->fetchColumn() === false) {
        throw new HttpError(404, 'Product not found.');
    }
    $statement = $pdo->prepare('SELECT COUNT(*) FROM order_list_items WHERE list_id=?');
    $statement->execute([$listId]);
    if ((int) $statement->fetchColumn() >= 500) {
        throw new HttpError(422, 'This list has reached its maximum size.');
    }
    $pdo->prepare(
        'INSERT INTO order_list_items (list_id,product_id,quantity) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE quantity=VALUES(quantity)'
    )->execute([$listId, $productId, $quantity]);
    $pdo->prepare('UPDATE order_lists SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$listId]);
    respond(['lists' => workspaceListSummaries((int) $user['id'])], 201);
}

function workspaceListRemoveItem(int $listId, int $productId): never
{
    $user = commerceActiveCustomer();
    workspaceOwnedList($listId, (int) $user['id']);
    db()->prepare('DELETE FROM order_list_items WHERE list_id=? AND product_id=?')->execute([$listId, $productId]);
    db()->prepare('UPDATE order_lists SET updated_at=CURRENT_TIMESTAMP WHERE id=?')->execute([$listId]);
    respond(['lists' => workspaceListSummaries((int) $user['id'])]);
}

function workspaceListToCart(int $listId): never
{
    $user = commerceActiveCustomer();
    $context = workspaceCurrencyContext();
    workspaceOwnedList($listId, (int) $user['id']);
    $statement = db()->prepare(
        workspaceProductSelect()
        . ' JOIN order_list_items li ON li.product_id = p.id
            WHERE li.list_id = ? AND p.active = 1
            ORDER BY p.id'
    );
    $statement->execute([(int) $user['group_id'], $listId]);
    $quantities = db()->prepare('SELECT product_id,quantity FROM order_list_items WHERE list_id=?');
    $quantities->execute([$listId]);
    $quantityByProduct = $quantities->fetchAll(PDO::FETCH_KEY_PAIR);

    $lines = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $product = workspacePresentProduct($row, $context);
        $requested = max(1, (int) ($quantityByProduct[(int) $row['id']] ?? 1));
        $line = [
            'code' => $product['sku'],
            'requested_quantity' => $requested,
            'quantity' => $requested,
            'status' => 'ok',
            'product' => $product,
        ];
        $resolution = workspaceResolveOrderLine($product, $requested);
        $line['status'] = $resolution['status'];
        $line['quantity'] = $resolution['quantity'];
        $lines[] = $line;
    }
    if ($lines === []) {
        throw new HttpError(422, 'This list has no orderable products.');
    }
    $result = workspaceAddLinesToCart($lines, (int) $user['id']);
    respond(['cart' => $result['cart'], 'added' => $result['added'], 'lines' => $lines]);
}

/* ------------------------------------------------------------------ */
/* Reorder                                                             */
/* ------------------------------------------------------------------ */

function workspaceReorder(int $orderId): never
{
    $user = commerceActiveCustomer();
    $context = workspaceCurrencyContext();
    $statement = db()->prepare('SELECT id FROM orders WHERE id=? AND user_id=?');
    $statement->execute([$orderId, (int) $user['id']]);
    if ($statement->fetchColumn() === false) {
        throw new HttpError(404, 'Order not found.');
    }
    $statement = db()->prepare(
        workspaceProductSelect()
        . ' JOIN (SELECT DISTINCT product_id FROM order_items WHERE order_id = ?) oi
                ON oi.product_id = p.id
            WHERE p.active = 1
            ORDER BY p.id'
    );
    $statement->execute([(int) $user['group_id'], $orderId]);
    $products = $statement->fetchAll(PDO::FETCH_ASSOC);
    $wanted = db()->prepare('SELECT product_id, SUM(quantity) FROM order_items WHERE order_id=? GROUP BY product_id');
    $wanted->execute([$orderId]);
    $quantityByProduct = $wanted->fetchAll(PDO::FETCH_KEY_PAIR);

    $lines = [];
    foreach ($products as $row) {
        $product = workspacePresentProduct($row, $context);
        $requested = max(1, (int) ($quantityByProduct[(int) $row['id']] ?? 1));
        $line = [
            'code' => $product['sku'],
            'requested_quantity' => $requested,
            'quantity' => $requested,
            'status' => 'ok',
            'product' => $product,
        ];
        $resolution = workspaceResolveOrderLine($product, $requested);
        $line['status'] = $resolution['status'];
        $line['quantity'] = $resolution['quantity'];
        $lines[] = $line;
    }
    if ($lines === [] || array_filter($lines, 'workspaceLineIsOrderable') === []) {
        throw new HttpError(422, 'None of the products on this order can be reordered right now.');
    }
    $result = workspaceAddLinesToCart($lines, (int) $user['id']);
    respond(['cart' => $result['cart'], 'added' => $result['added'], 'lines' => $lines]);
}

/* ------------------------------------------------------------------ */
/* Back-in-stock alerts                                                */
/* ------------------------------------------------------------------ */

function workspaceAlertRows(int $userId, array $context): array
{
    $statement = db()->prepare(
        workspaceProductSelect()
        . ' JOIN stock_alerts sa ON sa.product_id = p.id
            WHERE sa.user_id = ?
            ORDER BY sa.created_at DESC'
    );
    $statement->execute([$context['group_id'], $userId]);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    $states = db()->prepare('SELECT product_id,status,created_at,notified_at FROM stock_alerts WHERE user_id=?');
    $states->execute([$userId]);
    $stateByProduct = [];
    foreach ($states->fetchAll(PDO::FETCH_ASSOC) as $state) {
        $stateByProduct[(int) $state['product_id']] = $state;
    }
    $alerts = [];
    foreach ($rows as $row) {
        $product = workspacePresentProduct($row, $context);
        $state = $stateByProduct[(int) $row['id']] ?? [];
        $product['alert_status'] = $product['stock'] > 0 ? 'available' : (string) ($state['status'] ?? 'waiting');
        $product['requested_at'] = $state['created_at'] ?? null;
        $product['notified_at'] = $state['notified_at'] ?? null;
        $alerts[] = $product;
    }
    return $alerts;
}

function workspaceListAlerts(): never
{
    $user = commerceActiveCustomer();
    $context = workspaceCurrencyContext();
    $context['group_id'] = (int) $user['group_id'];
    respond(['alerts' => workspaceAlertRows((int) $user['id'], $context), 'currency' => $context['currency']]);
}

function workspaceCreateAlert(): never
{
    $user = commerceActiveCustomer();
    $productId = integer(body()['product_id'] ?? null, 1);
    $statement = db()->prepare('SELECT id,stock FROM products WHERE id=? AND active=1');
    $statement->execute([$productId]);
    $product = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$product) {
        throw new HttpError(404, 'Product not found.');
    }
    $statement = db()->prepare('SELECT COUNT(*) FROM stock_alerts WHERE user_id=?');
    $statement->execute([(int) $user['id']]);
    if ((int) $statement->fetchColumn() >= 200) {
        throw new HttpError(422, 'The maximum number of stock alerts has been reached.');
    }
    db()->prepare(
        "INSERT INTO stock_alerts (user_id,product_id,status) VALUES (?,?,'waiting')
         ON DUPLICATE KEY UPDATE status='waiting', notified_at=NULL"
    )->execute([(int) $user['id'], $productId]);
    respond(['watching' => true, 'product_id' => $productId], 201);
}

function workspaceDeleteAlert(int $productId): never
{
    $user = commerceActiveCustomer();
    db()->prepare('DELETE FROM stock_alerts WHERE user_id=? AND product_id=?')
        ->execute([(int) $user['id'], $productId]);
    respond(['watching' => false, 'product_id' => $productId]);
}

/* ------------------------------------------------------------------ */
/* Dispatch promise                                                    */
/* ------------------------------------------------------------------ */

function workspaceDispatchPromise(?DateTimeImmutable $now = null): array
{
    $settings = settings();
    $timezoneName = (string) ($settings['order_cutoff_timezone'] ?? 'Europe/Zurich');
    try {
        $timezone = new DateTimeZone($timezoneName);
    } catch (Throwable) {
        $timezone = new DateTimeZone('Europe/Zurich');
        $timezoneName = 'Europe/Zurich';
    }
    $cutoff = (string) ($settings['order_cutoff_time'] ?? '17:00');
    if (!preg_match('/^([01][0-9]|2[0-3]):([0-5][0-9])$/', $cutoff, $parts)) {
        $cutoff = '17:00';
        $parts = [null, '17', '00'];
    }
    $now = ($now ?? new DateTimeImmutable('now'))->setTimezone($timezone);
    $cutoffToday = $now->setTime((int) $parts[1], (int) $parts[2], 0);
    $isWorkday = (int) $now->format('N') <= 5;
    $shipsToday = $isWorkday && $now < $cutoffToday;

    $dispatch = $shipsToday ? $now : $now->modify('+1 day')->setTime(9, 0, 0);
    while ((int) $dispatch->format('N') > 5) {
        $dispatch = $dispatch->modify('+1 day')->setTime(9, 0, 0);
    }
    return [
        'cutoff_time' => $cutoff,
        'timezone' => $timezoneName,
        'now' => $now->format(DateTimeInterface::ATOM),
        'ships_today' => $shipsToday,
        'dispatch_date' => $dispatch->format('Y-m-d'),
        'seconds_until_cutoff' => $shipsToday ? max(0, $cutoffToday->getTimestamp() - $now->getTimestamp()) : 0,
    ];
}

function workspaceGetDispatchPromise(): never
{
    respond(['dispatch' => workspaceDispatchPromise()]);
}

/* ------------------------------------------------------------------ */
/* Billing preferences                                                 */
/* ------------------------------------------------------------------ */

function workspaceBillingPreferences(int $userId, string $accountEmail): array
{
    $statement = db()->prepare(
        'SELECT invoice_email,copy_email,auto_send,reference_label,reference_required,updated_at
         FROM billing_preferences WHERE user_id=?'
    );
    $statement->execute([$userId]);
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    $invoiceEmail = (string) ($row['invoice_email'] ?? '');
    return [
        'invoice_email' => $invoiceEmail,
        'copy_email' => (string) ($row['copy_email'] ?? ''),
        'auto_send' => (int) ($row['auto_send'] ?? 1) === 1,
        'reference_label' => (string) ($row['reference_label'] ?? ''),
        'reference_required' => (int) ($row['reference_required'] ?? 0) === 1,
        'updated_at' => $row['updated_at'] ?? null,
        'account_email' => $accountEmail,
        'effective_email' => $invoiceEmail !== '' ? $invoiceEmail : $accountEmail,
    ];
}

function workspaceGetBillingPreferences(): never
{
    $user = commerceActiveCustomer();
    $statement = db()->prepare(
        'SELECT id,order_id,document_kind,recipient,copy_recipient,status,created_at
         FROM invoice_deliveries WHERE user_id=? ORDER BY created_at DESC, id DESC LIMIT 20'
    );
    $statement->execute([(int) $user['id']]);
    $deliveries = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'],
        'order_id' => (int) $row['order_id'],
        'document_kind' => (string) $row['document_kind'],
        'recipient' => (string) $row['recipient'],
        'copy_recipient' => (string) $row['copy_recipient'],
        'status' => (string) $row['status'],
        'created_at' => $row['created_at'],
    ], $statement->fetchAll(PDO::FETCH_ASSOC));
    respond([
        'preferences' => workspaceBillingPreferences((int) $user['id'], (string) $user['email']),
        'deliveries' => $deliveries,
    ]);
}

function workspaceValidateEmail(string $value, string $field): string
{
    if ($value === '') {
        return '';
    }
    if (!filter_var($value, FILTER_VALIDATE_EMAIL) || strlen($value) > 190) {
        throw new HttpError(422, $field . ' is not a valid email address.');
    }
    return mb_strtolower($value);
}

function workspaceSaveBillingPreferences(): never
{
    $user = commerceActiveCustomer();
    $input = body();
    $invoiceEmail = workspaceValidateEmail(text($input['invoice_email'] ?? '', 190), 'The billing email address');
    $copyEmail = workspaceValidateEmail(text($input['copy_email'] ?? '', 190), 'The copy address');
    $autoSend = !empty($input['auto_send']) ? 1 : 0;
    $referenceLabel = text($input['reference_label'] ?? '', 80);
    $referenceRequired = !empty($input['reference_required']) ? 1 : 0;
    if ($referenceRequired === 1 && $referenceLabel === '') {
        $referenceLabel = 'Purchase order';
    }
    db()->prepare(
        'INSERT INTO billing_preferences
           (user_id,invoice_email,copy_email,auto_send,reference_label,reference_required)
         VALUES (?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE invoice_email=VALUES(invoice_email), copy_email=VALUES(copy_email),
           auto_send=VALUES(auto_send), reference_label=VALUES(reference_label),
           reference_required=VALUES(reference_required)'
    )->execute([(int) $user['id'], $invoiceEmail, $copyEmail, $autoSend, $referenceLabel, $referenceRequired]);
    audit('billing_preferences.update', 'user', (int) $user['id'], ['auto_send' => (bool) $autoSend]);
    respond(['preferences' => workspaceBillingPreferences((int) $user['id'], (string) $user['email'])]);
}

/* ------------------------------------------------------------------ */
/* Document archive                                                    */
/* ------------------------------------------------------------------ */

/** @return array{from:?string,to:?string,label:string} */
function workspaceResolvePeriod(array $query): array
{
    $period = text($query['period'] ?? 'all', 20);
    $year = isset($query['year']) && $query['year'] !== ''
        ? integer($query['year'], 2000, 2100)
        : (int) date('Y');
    if ($period === 'year') {
        return ['from' => sprintf('%04d-01-01', $year), 'to' => sprintf('%04d-12-31', $year), 'label' => (string) $year];
    }
    if (preg_match('/^q([1-4])$/', $period, $parts)) {
        $quarter = (int) $parts[1];
        $startMonth = ($quarter - 1) * 3 + 1;
        $start = new DateTimeImmutable(sprintf('%04d-%02d-01', $year, $startMonth));
        $end = $start->modify('+3 months')->modify('-1 day');
        return ['from' => $start->format('Y-m-d'), 'to' => $end->format('Y-m-d'), 'label' => 'Q' . $quarter . ' ' . $year];
    }
    if ($period === 'custom') {
        $from = text($query['from'] ?? '', 10);
        $to = text($query['to'] ?? '', 10);
        foreach ([$from, $to] as $value) {
            if ($value !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
                throw new HttpError(422, 'A date filter must use the YYYY-MM-DD format.');
            }
        }
        return ['from' => $from ?: null, 'to' => $to ?: null, 'label' => trim($from . ' - ' . $to)];
    }
    return ['from' => null, 'to' => null, 'label' => 'All'];
}

function workspaceInvoiceAvailable(array $order): bool
{
    return (string) $order['payment_method'] === 'swiss_qr_invoice'
        || (string) $order['payment_method'] === 'pay_later'
        || ((string) $order['payment_method'] === 'stripe' && (string) $order['payment_state'] === 'paid')
        || (string) $order['status'] === 'completed';
}

/**
 * Collect every document the signed-in customer may download in a period.
 *
 * @return list<array<string,mixed>>
 */
function workspaceCollectDocuments(int $userId, array $period, string $type): array
{
    $pdo = db();
    $documents = [];

    if ($type === 'all' || $type === 'invoice') {
        $sql = 'SELECT o.id,o.number,o.status,o.total_cents,o.currency,o.created_at,o.payment_method,
                       o.payment_state,o.customer_reference,
                       ia.verified,ia.due_date,ia.paid_cents,
                       COALESCE(ca.credited_cents,0) AS credited_cents
                FROM orders o
                LEFT JOIN invoice_accounting ia ON ia.order_id = o.id
                LEFT JOIN (SELECT target_order_id, SUM(amount_cents) AS credited_cents
                           FROM credit_applications GROUP BY target_order_id) ca
                       ON ca.target_order_id = o.id
                WHERE o.user_id = ?';
        $parameters = [$userId];
        if ($period['from'] !== null) {
            $sql .= ' AND o.created_at >= ?';
            $parameters[] = $period['from'] . ' 00:00:00';
        }
        if ($period['to'] !== null) {
            $sql .= ' AND o.created_at <= ?';
            $parameters[] = $period['to'] . ' 23:59:59';
        }
        $sql .= ' ORDER BY o.created_at DESC, o.id DESC';
        $statement = $pdo->prepare($sql);
        $statement->execute($parameters);
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!workspaceInvoiceAvailable($row)) {
                continue;
            }
            $verified = (int) ($row['verified'] ?? 0) === 1;
            $paid = (int) ($row['paid_cents'] ?? 0);
            $credited = (int) $row['credited_cents'];
            $total = (int) $row['total_cents'];
            $cancelled = (string) $row['status'] === 'cancelled';
            $outstanding = null;
            if ($cancelled) {
                $outstanding = 0;
            } elseif ((string) $row['payment_state'] === 'paid') {
                $outstanding = 0;
            } elseif ($verified) {
                $outstanding = max(0, $total - $paid - $credited);
            }
            $status = 'unknown';
            if ($cancelled) {
                $status = 'cancelled';
            } elseif ($outstanding === 0) {
                $status = 'paid';
            } elseif ($outstanding !== null) {
                $dueDate = $row['due_date'] ?? null;
                $overdue = $dueDate !== null && $dueDate < date('Y-m-d');
                $status = $overdue ? 'overdue' : ($paid > 0 ? 'partial' : 'open');
            }
            $documents[] = [
                'type' => 'invoice',
                'id' => (int) $row['id'],
                'document_number' => 'TEST-INV-' . (string) $row['number'],
                'order_id' => (int) $row['id'],
                'order_number' => (string) $row['number'],
                'issued_at' => $row['created_at'],
                'currency' => (string) $row['currency'],
                'amount_cents' => $total,
                'paid_cents' => $verified ? $paid : null,
                'outstanding_cents' => $outstanding,
                'due_date' => $row['due_date'] ?? null,
                'payment_status' => $status,
                'payment_method' => (string) $row['payment_method'],
                'customer_reference' => (string) ($row['customer_reference'] ?? ''),
                'download_path' => '/documents/' . (int) $row['id'] . '/invoice.pdf',
            ];
        }
    }

    if ($type === 'all' || $type === 'credit_note') {
        $sql = 'SELECT cn.id,cn.number,cn.issued_cents,cn.currency,cn.created_at,cn.return_id,
                       o.number AS order_number,o.id AS order_id
                FROM customer_credit_notes cn
                JOIN orders o ON o.id = cn.order_id
                WHERE cn.user_id = ? AND cn.status = \'issued\'';
        $parameters = [$userId];
        if ($period['from'] !== null) {
            $sql .= ' AND cn.created_at >= ?';
            $parameters[] = $period['from'] . ' 00:00:00';
        }
        if ($period['to'] !== null) {
            $sql .= ' AND cn.created_at <= ?';
            $parameters[] = $period['to'] . ' 23:59:59';
        }
        $sql .= ' ORDER BY cn.created_at DESC, cn.id DESC';
        $statement = $pdo->prepare($sql);
        $statement->execute($parameters);
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $documents[] = [
                'type' => 'credit_note',
                'id' => (int) $row['id'],
                'return_id' => (int) $row['return_id'],
                'document_number' => (string) $row['number'],
                'order_id' => (int) $row['order_id'],
                'order_number' => (string) $row['order_number'],
                'issued_at' => $row['created_at'],
                'currency' => (string) $row['currency'],
                'amount_cents' => -1 * (int) $row['issued_cents'],
                'paid_cents' => null,
                'outstanding_cents' => null,
                'due_date' => null,
                'payment_status' => 'credited',
                'payment_method' => '',
                'customer_reference' => '',
                'download_path' => '/documents/returns/' . (int) $row['return_id'] . '/credit-note.pdf',
            ];
        }

        // A return refunded through the payment provider issues no account
        // credit note, but it does produce a credit document the customer can
        // download. Enumerating by settlement keeps those in the overview,
        // the CSV and the archive instead of only in the order history.
        $sql = 'SELECT rs.id,rs.amount_cents,rs.currency,
                       COALESCE(rs.settled_at,rs.created_at) AS issued_at,
                       r.id AS return_id,r.number AS return_number,
                       o.number AS order_number,o.id AS order_id
                FROM return_settlements rs
                JOIN returns r ON r.id = rs.return_id
                JOIN orders o ON o.id = r.order_id
                LEFT JOIN customer_credit_notes cn ON cn.settlement_id = rs.id
                WHERE r.user_id = ? AND rs.status = \'succeeded\' AND cn.id IS NULL';
        $parameters = [$userId];
        if ($period['from'] !== null) {
            $sql .= ' AND COALESCE(rs.settled_at,rs.created_at) >= ?';
            $parameters[] = $period['from'] . ' 00:00:00';
        }
        if ($period['to'] !== null) {
            $sql .= ' AND COALESCE(rs.settled_at,rs.created_at) <= ?';
            $parameters[] = $period['to'] . ' 23:59:59';
        }
        $sql .= ' ORDER BY issued_at DESC, rs.id DESC';
        $statement = $pdo->prepare($sql);
        $statement->execute($parameters);
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $documents[] = [
                'type' => 'credit_note',
                'id' => (int) $row['id'],
                'return_id' => (int) $row['return_id'],
                'document_number' => (string) $row['return_number'],
                'order_id' => (int) $row['order_id'],
                'order_number' => (string) $row['order_number'],
                'issued_at' => $row['issued_at'],
                'currency' => (string) $row['currency'],
                'amount_cents' => -1 * (int) $row['amount_cents'],
                'paid_cents' => null,
                'outstanding_cents' => null,
                'due_date' => null,
                'payment_status' => 'refunded',
                'payment_method' => '',
                'customer_reference' => '',
                'download_path' => '/documents/returns/' . (int) $row['return_id'] . '/credit-note.pdf',
            ];
        }
    }

    usort($documents, static function (array $a, array $b): int {
        $compare = strcmp((string) $b['issued_at'], (string) $a['issued_at']);
        return $compare !== 0 ? $compare : ($b['id'] <=> $a['id']);
    });
    return $documents;
}

function workspaceDocumentTotals(array $documents): array
{
    $totals = [];
    foreach ($documents as $document) {
        $currency = (string) $document['currency'];
        if (!isset($totals[$currency])) {
            $totals[$currency] = [
                'currency' => $currency,
                'document_count' => 0,
                'amount_cents' => 0,
                'outstanding_cents' => 0,
                'outstanding_known' => true,
            ];
        }
        $totals[$currency]['document_count']++;
        $totals[$currency]['amount_cents'] += (int) $document['amount_cents'];
        if ($document['outstanding_cents'] === null) {
            if ($document['type'] === 'invoice') {
                $totals[$currency]['outstanding_known'] = false;
            }
        } else {
            $totals[$currency]['outstanding_cents'] += (int) $document['outstanding_cents'];
        }
    }
    return array_values($totals);
}

function workspaceDocumentYears(int $userId): array
{
    $statement = db()->prepare(
        // A provider refund issues no credit note and is dated by its
        // settlement, so a year in which nothing else happened would drop out
        // of the selector while its document is still downloadable.
        'SELECT DISTINCT YEAR(created_at) AS y FROM orders WHERE user_id=?
         UNION SELECT DISTINCT YEAR(created_at) FROM customer_credit_notes WHERE user_id=?
         UNION SELECT DISTINCT YEAR(COALESCE(rs.settled_at,rs.created_at))
           FROM return_settlements rs
           JOIN returns r ON r.id = rs.return_id
           LEFT JOIN customer_credit_notes cn ON cn.settlement_id = rs.id
           WHERE r.user_id=? AND rs.status=\'succeeded\' AND cn.id IS NULL
         ORDER BY y DESC'
    );
    $statement->execute([$userId, $userId, $userId]);
    $years = array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    $currentYear = (int) date('Y');
    if (!in_array($currentYear, $years, true)) {
        array_unshift($years, $currentYear);
    }
    return $years;
}

function workspaceListDocuments(): never
{
    $user = commerceActiveCustomer();
    $period = workspaceResolvePeriod($_GET);
    $type = text($_GET['type'] ?? 'all', 20);
    if (!in_array($type, ['all', 'invoice', 'credit_note'], true)) {
        throw new HttpError(422, 'Unknown document type filter.');
    }
    $documents = workspaceCollectDocuments((int) $user['id'], $period, $type);
    respond([
        'documents' => $documents,
        'totals' => workspaceDocumentTotals($documents),
        'period' => $period,
        'years' => workspaceDocumentYears((int) $user['id']),
        'archive_limit' => WORKSPACE_MAX_ARCHIVE_DOCUMENTS,
        'preferences' => workspaceBillingPreferences((int) $user['id'], (string) $user['email']),
    ]);
}

function workspaceCsvCell(string $value): string
{
    $value = str_replace(["\r", "\n"], ' ', $value);
    if (preg_match('/^[=+\-@]/', $value) === 1) {
        $value = "'" . $value;
    }
    return '"' . str_replace('"', '""', $value) . '"';
}

function workspaceExportDocumentsCsv(): never
{
    $user = commerceActiveCustomer();
    $period = workspaceResolvePeriod($_GET);
    $type = text($_GET['type'] ?? 'all', 20);
    if (!in_array($type, ['all', 'invoice', 'credit_note'], true)) {
        throw new HttpError(422, 'Unknown document type filter.');
    }
    $documents = workspaceCollectDocuments((int) $user['id'], $period, $type);
    $rows = [[
        'date', 'document_number', 'document_type', 'order_number', 'currency',
        'amount', 'paid', 'outstanding', 'due_date', 'payment_status', 'reference',
    ]];
    foreach ($documents as $document) {
        $rows[] = [
            substr((string) $document['issued_at'], 0, 10),
            (string) $document['document_number'],
            (string) $document['type'],
            (string) $document['order_number'],
            (string) $document['currency'],
            number_format(((int) $document['amount_cents']) / 100, 2, '.', ''),
            $document['paid_cents'] === null ? '' : number_format(((int) $document['paid_cents']) / 100, 2, '.', ''),
            $document['outstanding_cents'] === null
                ? '' : number_format(((int) $document['outstanding_cents']) / 100, 2, '.', ''),
            (string) ($document['due_date'] ?? ''),
            (string) $document['payment_status'],
            (string) $document['customer_reference'],
        ];
    }
    $csv = '';
    foreach ($rows as $row) {
        $csv .= implode(';', array_map('workspaceCsvCell', $row)) . "\r\n";
    }
    $filename = 'documents-' . preg_replace('/[^a-z0-9]+/i', '-', strtolower($period['label'] ?: 'all')) . '.csv';
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . (string) strlen($csv));
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    echo $csv;
    exit;
}

/** Render one invoice PDF for the archive, reusing the single invoice path. */
function workspaceInvoiceBytes(int $orderId, int $userId): ?array
{
    require_once __DIR__ . '/media.php';
    $statement = db()->prepare(
        'SELECT o.*,u.name AS account_name,u.company AS account_company,u.email AS customer_email,
                u.tax_registration_type,u.tax_registration_number
         FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=? AND o.user_id=?'
    );
    $statement->execute([$orderId, $userId]);
    $order = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$order || !workspaceInvoiceAvailable($order)) {
        return null;
    }
    $statement = db()->prepare(
        'SELECT name,sku,quantity,price_cents,total_cents FROM order_items WHERE order_id=? ORDER BY id'
    );
    $statement->execute([$orderId]);
    $items = $statement->fetchAll(PDO::FETCH_ASSOC);
    $address = json_decode((string) $order['address_json'], true);
    if (!is_array($address)) {
        $address = [];
    }
    $number = 'TEST-INV-' . (string) $order['number'];
    return ['name' => strtolower($number) . '.pdf', 'bytes' => mediaRenderInvoicePdf($order, $items, $address, $number)];
}

/**
 * Renders one archived document. Returns null when the document has no
 * downloadable PDF yet, so one unfinished document never fails a bulk
 * download. Both renderers re-check ownership themselves.
 *
 * @param array<string,mixed> $document
 * @return array{name:string,bytes:string}|null
 */
function workspaceArchiveDocumentBytes(array $document, int $userId): ?array
{
    try {
        if ((string) $document['type'] === 'credit_note') {
            // Loaded on use: the router loads this module before media.
            require_once __DIR__ . '/media.php';
            return mediaRenderCreditNotePdf((int) $document['return_id']);
        }
        return workspaceInvoiceBytes((int) $document['order_id'], $userId);
    } catch (HttpError $error) {
        // A document that is not (yet) issuable is skipped; a server fault is not.
        if ($error->status >= 500) {
            throw $error;
        }
        return null;
    }
}

function workspaceDownloadArchive(): never
{
    $user = commerceActiveCustomer();
    $period = workspaceResolvePeriod($_GET);
    $type = text($_GET['type'] ?? 'all', 20);
    if (!in_array($type, ['all', 'invoice', 'credit_note'], true)) {
        throw new HttpError(422, 'Unknown document type filter.');
    }
    $documents = workspaceCollectDocuments((int) $user['id'], $period, $type);
    if ($documents === []) {
        throw new HttpError(404, 'There are no documents in this period.');
    }
    if (count($documents) > WORKSPACE_MAX_ARCHIVE_DOCUMENTS) {
        throw new HttpError(422, 'Select a shorter period; a bulk download holds at most '
            . WORKSPACE_MAX_ARCHIVE_DOCUMENTS . ' documents.');
    }
    if (!class_exists('ZipArchive')) {
        throw new HttpError(503, 'Bulk download is unavailable on this server.');
    }
    $temporary = tempnam(sys_get_temp_dir(), 'ferrydocs');
    if ($temporary === false) {
        throw new HttpError(500, 'The download could not be prepared.');
    }
    @chmod($temporary, 0600);
    $zip = new ZipArchive();
    $state = ['open' => false];
    // One idempotent cleanup for every exit. Reverting the pending entries
    // first stops the archive from being written out again when the handle is
    // released, which would recreate the file just deleted.
    $discard = static function () use ($zip, &$state, $temporary): void {
        if ($state['open']) {
            $state['open'] = false;
            $zip->unchangeAll();
            @$zip->close();
        }
        if (is_file($temporary)) {
            @unlink($temporary);
        }
    };
    // A client disconnect or fatal error skips the finally below.
    register_shutdown_function($discard);
    try {
        if ($zip->open($temporary, ZipArchive::OVERWRITE) !== true) {
            throw new HttpError(500, 'The download could not be prepared.');
        }
        $state['open'] = true;
        $index = [[
            'date', 'document_number', 'document_type', 'order_number',
            'currency', 'amount', 'payment_status',
        ]];
        $written = 0;
        $budget = WORKSPACE_MAX_ARCHIVE_BYTES;
        $usedNames = [];
        foreach ($documents as $document) {
            $pdf = workspaceArchiveDocumentBytes($document, (int) $user['id']);
            if ($pdf === null) {
                continue;
            }
            $budget -= strlen($pdf['bytes']);
            if ($budget < 0) {
                throw new HttpError(422, 'Select a shorter period; this bulk download is too large.');
            }
            $name = $pdf['name'];
            $suffix = 1;
            while (isset($usedNames[$name])) {
                $name = preg_replace('/\.pdf$/', '', $pdf['name']) . '-' . (++$suffix) . '.pdf';
            }
            $usedNames[$name] = true;
            if (!$zip->addFromString($name, $pdf['bytes'])) {
                throw new HttpError(500, 'The download could not be prepared.');
            }
            unset($pdf);
            $index[] = [
                substr((string) $document['issued_at'], 0, 10),
                (string) $document['document_number'],
                (string) $document['type'],
                (string) $document['order_number'],
                (string) $document['currency'],
                number_format(((int) $document['amount_cents']) / 100, 2, '.', ''),
                (string) $document['payment_status'],
            ];
            $written++;
        }
        if ($written === 0) {
            throw new HttpError(404, 'There are no documents in this period.');
        }
        $csv = '';
        foreach ($index as $row) {
            $csv .= implode(';', array_map('workspaceCsvCell', $row)) . "\r\n";
        }
        if (!$zip->addFromString('index.csv', $csv)) {
            throw new HttpError(500, 'The download could not be prepared.');
        }
        if (!$zip->close()) {
            throw new HttpError(500, 'The download could not be completed.');
        }
        $state['open'] = false;
        $size = filesize($temporary);
        if ($size === false) {
            throw new HttpError(500, 'The download could not be completed.');
        }
        $slug = preg_replace('/[^a-z0-9]+/i', '-', strtolower($period['label'] ?: 'all'));
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="documents-' . $slug . '.zip"');
        header('Content-Length: ' . (string) $size);
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        readfile($temporary);
    } finally {
        $discard();
    }
    exit;
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

function handleWorkspace(string $method, string $route): bool
{
    if ($route !== '/workspace' && !str_starts_with($route, '/workspace/')) {
        return false;
    }
    $path = substr($route, strlen('/workspace'));
    if ($path === '') {
        return false;
    }
    if ($method === 'GET' && $path === '/dispatch-promise') {
        workspaceGetDispatchPromise();
    }
    if ($method === 'POST' && $path === '/quick-order/resolve') {
        workspaceQuickOrderResolve();
    }
    if ($method === 'POST' && $path === '/quick-order/add') {
        workspaceQuickOrderAdd();
    }
    if ($method === 'GET' && $path === '/order-lists') {
        $user = commerceActiveCustomer();
        respond(['lists' => workspaceListSummaries((int) $user['id'])]);
    }
    if ($method === 'POST' && $path === '/order-lists') {
        workspaceCreateList();
    }
    if (preg_match('#^/order-lists/([1-9][0-9]*)$#', $path, $matches) === 1) {
        if ($method === 'GET') {
            workspaceListDetail((int) $matches[1]);
        }
        if ($method === 'PATCH') {
            workspaceRenameList((int) $matches[1]);
        }
        if ($method === 'DELETE') {
            workspaceDeleteList((int) $matches[1]);
        }
    }
    if ($method === 'POST' && preg_match('#^/order-lists/([1-9][0-9]*)/items$#', $path, $matches) === 1) {
        workspaceListAddItem((int) $matches[1]);
    }
    if ($method === 'DELETE'
        && preg_match('#^/order-lists/([1-9][0-9]*)/items/([1-9][0-9]*)$#', $path, $matches) === 1) {
        workspaceListRemoveItem((int) $matches[1], (int) $matches[2]);
    }
    if ($method === 'POST' && preg_match('#^/order-lists/([1-9][0-9]*)/add-to-cart$#', $path, $matches) === 1) {
        workspaceListToCart((int) $matches[1]);
    }
    if ($method === 'POST' && preg_match('#^/orders/([1-9][0-9]*)/reorder$#', $path, $matches) === 1) {
        workspaceReorder((int) $matches[1]);
    }
    if ($method === 'GET' && $path === '/stock-alerts') {
        workspaceListAlerts();
    }
    if ($method === 'POST' && $path === '/stock-alerts') {
        workspaceCreateAlert();
    }
    if ($method === 'DELETE' && preg_match('#^/stock-alerts/([1-9][0-9]*)$#', $path, $matches) === 1) {
        workspaceDeleteAlert((int) $matches[1]);
    }
    if ($method === 'GET' && $path === '/billing-preferences') {
        workspaceGetBillingPreferences();
    }
    if ($method === 'PUT' && $path === '/billing-preferences') {
        workspaceSaveBillingPreferences();
    }
    if ($method === 'GET' && $path === '/documents') {
        workspaceListDocuments();
    }
    if ($method === 'GET' && $path === '/documents/export.csv') {
        workspaceExportDocumentsCsv();
    }
    if ($method === 'GET' && $path === '/documents/archive.zip') {
        workspaceDownloadArchive();
    }
    return false;
}
