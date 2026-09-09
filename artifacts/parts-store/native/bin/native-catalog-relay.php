<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/bootstrap.php';

if (getenv('NODE_ENV') !== 'production' || getenv('LIVE_INTEGRATIONS') !== '1'
    || getenv('PICQER_RELAY_ENABLED') !== '1') { fwrite(STDERR, "Native catalog relay is disabled.\n"); exit(1); }
$secret = (string)getenv('PICQER_RELAY_SECRET');
$endpoint = trim((string)getenv('PICQER_RELAY_CATALOG_ENDPOINT'));
if ($secret === '' || !preg_match('#^https://#i', $endpoint) || str_contains(strtolower($endpoint), 'picqer')) {
    fwrite(STDERR, "Catalog relay endpoint or secret is not configured safely.\n"); exit(1);
}
$rows = db()->query('SELECT id,sku,active FROM products ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
$products = [];
$seen = [];
foreach ($rows as $row) {
    $sku = trim((string)$row['sku']);
    $active = (bool)$row['active'];
    if ($active && ($sku === '' || isset($seen[$sku]))) { fwrite(STDERR, "Blank or duplicate active SKU.\n"); exit(1); }
    if ($active) $seen[$sku] = true;
    $products[] = ['native_product_id' => (string)$row['id'], 'sku' => $sku, 'active' => $active];
}
$body = json_encode(['schema_version' => 1, 'manifest_version' => (int)date('YmdHis'), 'complete' => true, 'products' => $products], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
$eventId = 'catalog-' . gmdate('YmdHis') . '-' . bin2hex(random_bytes(8));
$timestamp = (string)time();
$signature = hash_hmac('sha256', "v1.$timestamp.$eventId.$body", $secret);
$context = stream_context_create(['http' => ['method' => 'POST', 'ignore_errors' => true, 'timeout' => 15,
    'header' => "Content-Type: application/json\r\nX-Ferry-Relay-Timestamp: $timestamp\r\nX-Ferry-Relay-Event-Id: $eventId\r\nX-Ferry-Relay-Signature: $signature\r\n", 'content' => $body]]);
$response = @file_get_contents($endpoint, false, $context);
$code = 0;
if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)) $code = (int)$match[1];
if ($response === false || $code < 200 || $code >= 300) { fwrite(STDERR, "Catalog relay request failed.\n"); exit(1); }
echo "Catalog manifest staged.\n";