<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/bootstrap.php';
if (getenv('NODE_ENV') !== 'production' || getenv('LIVE_INTEGRATIONS') !== '1' || getenv('PICQER_RELAY_ENABLED') !== '1') exit("Native fulfilment pull is disabled.\n");
$secret = (string)getenv('PICQER_RELAY_SECRET'); $endpoint = trim((string)getenv('PICQER_RELAY_FULFILMENT_ENDPOINT'));
if ($secret === '' || !preg_match('#^https://#i', $endpoint) || str_contains(strtolower($endpoint), 'picqer')) exit("Unsafe fulfilment endpoint.\n");
for ($page = 1; ; $page++) {
    $timestamp = (string)time(); $eventId = 'fulfilment-' . $page . '-' . gmdate('YmdHis');
    $url = $endpoint . (str_contains($endpoint, '?') ? '&' : '?') . 'limit=100&page=' . $page;
    $path = (string)parse_url($url, PHP_URL_PATH) . '?' . (string)parse_url($url, PHP_URL_QUERY);
    $sig = hash_hmac('sha256', "v1.$timestamp.$eventId.GET $path", $secret);
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'ignore_errors' => true, 'timeout' => 15,
        'header' => "X-Ferry-Relay-Timestamp: $timestamp\r\nX-Ferry-Relay-Event-Id: $eventId\r\nX-Ferry-Relay-Signature: $sig\r\n"]]);
    $body = @file_get_contents($url, false, $ctx); if ($body === false) exit("Fulfilment feed failed.\n");
    $responseSig = ''; foreach (($http_response_header ?? []) as $h) if (stripos($h, 'x-ferry-fulfilment-signature:') === 0) $responseSig = trim(substr($h, 28));
    if ($responseSig === '' || !hash_equals(hash_hmac('sha256', $body, $secret), $responseSig)) exit("Fulfilment signature failed.\n");
    $data = json_decode($body, true, 32, JSON_THROW_ON_ERROR); $rows = $data['rows'] ?? [];
    $pdo = db(); $pdo->beginTransaction();
    $current = $pdo->prepare("SELECT version FROM native_fulfilment_state WHERE native_order_id=? FOR UPDATE");
    $upsert = $pdo->prepare("INSERT INTO native_fulfilment_state(native_order_id,picqer_order_id,tracking,status,version,reservation_acknowledged,processed_at,updated_at)
      VALUES(?,?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE tracking=VALUES(tracking),status=VALUES(status),
      version=VALUES(version),reservation_acknowledged=VALUES(reservation_acknowledged),processed_at=VALUES(processed_at),updated_at=UTC_TIMESTAMP()");
    $mapping = $pdo->prepare("INSERT INTO native_picqer_order_mappings(native_order_id,picqer_order_id,foreign_reference)
      VALUES(?,?,?) ON DUPLICATE KEY UPDATE picqer_order_id=VALUES(picqer_order_id)");
    $orderUpdate = $pdo->prepare("UPDATE orders SET tracking=?,status='shipped' WHERE id=? AND status NOT IN ('completed','cancelled','refunded')");
    foreach ($rows as $row) {
        if (!is_array($row) || !is_string($row['native_order_id'] ?? null) || !is_string($row['picqer_order_id'] ?? null)
            || !ctype_digit($row['picqer_order_id']) || !is_string($row['version'] ?? null) || !ctype_digit($row['version'])
            || !is_string($row['tracking'] ?? null) || !is_string($row['status'] ?? null)) { $pdo->rollBack(); exit("Invalid fulfilment row.\n"); }
        $version = (int)$row['version']; $current->execute([$row['native_order_id']]); $prior = $current->fetchColumn();
        if ($prior !== false && (int)$prior >= $version) continue;
        if (!is_bool($row['reservation_acknowledged'] ?? null)) { $pdo->rollBack(); exit("Invalid fulfilment acknowledgement.\n"); }
        $mapping->execute([$row['native_order_id'], $row['picqer_order_id'], 'FERRY-' . $row['native_order_id']]);
        $upsert->execute([$row['native_order_id'], $row['picqer_order_id'], $row['tracking'], $row['status'], $version,
            $row['reservation_acknowledged'] ? 1 : 0, $row['processed_at'] ?? null]);
        if ($row['status'] === 'shipped') $orderUpdate->execute([$row['tracking'], (int)$row['native_order_id']]);
    }
    $pdo->commit(); if (count($rows) < 100) break;
}
echo "Native fulfilment applied.\n";