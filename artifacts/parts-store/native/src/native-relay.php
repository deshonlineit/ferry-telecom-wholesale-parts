<?php
declare(strict_types=1);

/**
 * Native paid-order staging only. This module never contains a Picqer host,
 * API key, or direct warehouse HTTP client.
 */
function nativeRelayCutover(): ?DateTimeImmutable
{
    $value = trim((string)getenv('PICQER_CUTOVER_AT'));
    if ($value === '') return null;
    try { return new DateTimeImmutable($value, new DateTimeZone('UTC')); } catch (Throwable) { return null; }
}

function nativeRelayLeaseIsOwned(?array $row, string $owner, int $nowEpoch): bool
{
    if ($row === null || !isset($row['locked_owner'], $row['locked_until'])) return false;
    return hash_equals($owner, (string)$row['locked_owner'])
        && strtotime((string)$row['locked_until'] . ' UTC') > $nowEpoch + 20;
}

function nativeRelayQueuePaidOrder(PDO $pdo, int $orderId, string $eventId): void
{
    // Once snapshotted, mutable profile/address edits and later provider event
    // ids cannot alter or invalidate the first paid transition provenance.
    $existing = $pdo->prepare('SELECT content_hash FROM native_picqer_order_snapshots WHERE native_order_id=? FOR UPDATE');
    $existing->execute([(string)$orderId]);
    if ($existing->fetch(PDO::FETCH_ASSOC) !== false) return;
    $cutover = nativeRelayCutover();
    if ($cutover === null) return;
    $orderStatement = $pdo->prepare(
        'SELECT o.id,o.number,o.status,o.payment_state,o.created_at,o.total_cents,o.subtotal_cents,o.shipping_cents,o.tax_cents,o.currency,o.address_json,u.name,u.company,u.email
         FROM orders o JOIN users u ON u.id=o.user_id WHERE o.id=? FOR UPDATE'
    );
    $orderStatement->execute([$orderId]);
    $order = $orderStatement->fetch(PDO::FETCH_ASSOC);
    if (!$order) return;
    if (in_array((string)$order['status'], ['cancelled', 'refunded', 'completed'], true)
        || (string)$order['payment_state'] !== 'paid') return;
    $created = new DateTimeImmutable((string)$order['created_at'], new DateTimeZone('UTC'));
    // Cutover is both an eligibility boundary and a required worker safety gate.
    if ($created < $cutover || new DateTimeImmutable('now', new DateTimeZone('UTC')) < $cutover) return;
    $itemsStatement = $pdo->prepare(
        'SELECT sku,name,quantity,price_cents AS unit_price_cents,total_cents FROM order_items WHERE order_id=? ORDER BY id'
    );
    $itemsStatement->execute([$orderId]);
    $items = $itemsStatement->fetchAll(PDO::FETCH_ASSOC);
    if (!$items) return;
    $snapshot = [
        'schema_version' => 1, 'native_order_id' => (string)$order['id'],
        'order_created_at' => $created->format(DATE_ATOM),
        'order_number' => (string)$order['number'], 'currency' => (string)$order['currency'],
        'total_cents' => (int)$order['total_cents'],
        'subtotal_cents' => (int)$order['subtotal_cents'], 'shipping_cents' => (int)$order['shipping_cents'],
        'tax_cents' => (int)$order['tax_cents'],
        'customer' => ['name' => (string)$order['name'], 'company' => (string)$order['company'], 'email' => (string)$order['email']],
        'address' => json_decode((string)$order['address_json'], true, 32, JSON_THROW_ON_ERROR),
        'items' => array_map(static fn(array $item): array => [
            'sku' => (string)$item['sku'], 'name' => (string)$item['name'],
            'quantity' => (int)$item['quantity'], 'unit_price_cents' => (int)$item['unit_price_cents'],
            'total_cents' => (int)$item['total_cents'],
        ], $items),
    ];
    $encoded = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $hash = hash('sha256', $encoded);
    $statement = $pdo->prepare(dbDriver() === 'pgsql'
        ? 'INSERT INTO native_picqer_order_snapshots(native_order_id,event_id,content_hash,order_created_at,snapshot_json)
           VALUES(?,?,?,?,?) ON CONFLICT (native_order_id) DO NOTHING'
        : 'INSERT INTO native_picqer_order_snapshots(native_order_id,event_id,content_hash,order_created_at,snapshot_json)
           VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE content_hash=content_hash');
    $statement->execute([(string)$orderId, $eventId, $hash, $created->format('Y-m-d H:i:s'), $encoded]);
    $statement = $pdo->prepare(dbDriver() === 'pgsql'
        ? 'INSERT INTO native_picqer_outbox(native_order_id,event_id,content_hash,order_created_at,snapshot_json)
           VALUES(?,?,?,?,?) ON CONFLICT (native_order_id) DO NOTHING'
        : 'INSERT INTO native_picqer_outbox(native_order_id,event_id,content_hash,order_created_at,snapshot_json)
           VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE content_hash=content_hash');
    $statement->execute([(string)$orderId, $eventId, $hash, $created->format('Y-m-d H:i:s'), $encoded]);
}