<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/bootstrap.php';
if (getenv('NODE_ENV') !== 'production' || getenv('LIVE_INTEGRATIONS') !== '1'
    || getenv('PICQER_RELAY_ENABLED') !== '1') { fwrite(STDERR, "Native stock pull is disabled.\n"); exit(1); }
$secret = (string)getenv('PICQER_RELAY_SECRET');
$endpoint = trim((string)getenv('PICQER_RELAY_STOCK_ENDPOINT'));
if ($secret === '' || !preg_match('#^https://#i', $endpoint) || str_contains(strtolower($endpoint), 'picqer')) { fwrite(STDERR, "Unsafe stock endpoint configuration.\n"); exit(1); }
for ($page = 1; ; $page++) {
    $timestamp = (string)time();
    $eventId = 'stock-' . $page . '-' . gmdate('YmdHis');
    $url = $endpoint . (str_contains($endpoint, '?') ? '&' : '?') . 'limit=100&page=' . $page;
    $path = (string)(parse_url($url, PHP_URL_PATH) ?: '') . '?' . (string)(parse_url($url, PHP_URL_QUERY) ?: '');
    $signature = hash_hmac('sha256', "v1.$timestamp.$eventId.GET $path", $secret);
    $context = stream_context_create(['http' => ['method' => 'GET', 'ignore_errors' => true, 'timeout' => 15,
        'header' => "X-Ferry-Relay-Timestamp: $timestamp\r\nX-Ferry-Relay-Event-Id: $eventId\r\nX-Ferry-Relay-Signature: $signature\r\n"]]);
    $response = @file_get_contents($url, false, $context);
    if ($response === false) { fwrite(STDERR, "Stock feed request failed.\n"); exit(1); }
    $responseSignature = '';
    foreach (($http_response_header ?? []) as $header) {
        if (stripos($header, 'x-ferry-stock-signature:') === 0) $responseSignature = trim(substr($header, strlen('x-ferry-stock-signature:')));
    }
    if ($responseSignature === '' || !hash_equals(hash_hmac('sha256', $response, $secret), $responseSignature)) {
        fwrite(STDERR, "Stock feed signature failed.\n"); exit(1);
    }
    $data = json_decode($response, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($data['rows'] ?? null)) { fwrite(STDERR, "Invalid stock feed.\n"); exit(1); }
    $pdo = db();
    $pdo->beginTransaction();
    $current = $pdo->prepare('SELECT version FROM native_stock_state WHERE sku=? FOR UPDATE');
    $productCheck = $pdo->prepare('SELECT id FROM products WHERE id=? AND sku=? FOR UPDATE');
    $reservations = $pdo->prepare(
        "SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id=oi.order_id
         WHERE oi.sku=? AND o.status NOT IN ('completed','cancelled','refunded','shipped')
         AND NOT EXISTS (SELECT 1 FROM native_fulfilment_state f
           WHERE f.native_order_id=CAST(o.id AS CHAR) AND f.reservation_acknowledged=1)"
    );
    $upsert = $pdo->prepare('INSERT INTO native_stock_state(sku,native_product_id,free_stock,version,content_hash,updated_at)
      VALUES(?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE
      native_product_id=VALUES(native_product_id),free_stock=VALUES(free_stock),version=VALUES(version),
      content_hash=VALUES(content_hash),updated_at=UTC_TIMESTAMP()');
    foreach ($data['rows'] as $row) {
        if (!is_array($row) || !is_string($row['sku'] ?? null) || !is_int($row['free_stock'] ?? null) || $row['free_stock'] < 0
            || !is_string($row['version'] ?? null) || !ctype_digit($row['version']) || !is_string($row['content_hash'] ?? null)) { $pdo->rollBack(); fwrite(STDERR, "Invalid stock row.\n"); exit(1); }
        $version = (int)$row['version']; $current->execute([$row['sku']]); $prior = $current->fetchColumn();
        if ($prior !== false && (int)$prior >= $version) continue;
        $nativeId = (string)($row['native_product_id'] ?? '');
        $productCheck->execute([(int)$nativeId, $row['sku']]);
        if ($productCheck->fetchColumn() === false) { $pdo->rollBack(); fwrite(STDERR, "Stock product mapping mismatch.\n"); exit(1); }
        $reservations->execute([$row['sku']]);
        $sellable = max(0, $row['free_stock'] - (int)$reservations->fetchColumn());
        $upsert->execute([(string)$row['sku'], $nativeId, $row['free_stock'], $version, $row['content_hash']]);
        $product = $pdo->prepare('UPDATE products SET stock=? WHERE id=? AND sku=?');
        $product->execute([$sellable, (int)$nativeId, $row['sku']]);
    }
    $pdo->commit();
    if (count($data['rows']) < 100) break;
}
echo "Native stock applied.\n";