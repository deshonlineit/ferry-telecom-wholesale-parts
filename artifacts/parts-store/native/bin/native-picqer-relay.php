<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/native-relay.php';

/**
 * One-shot native relay dispatcher. It posts only to the Ferry API relay
 * endpoint; all warehouse/Picqer HTTP remains exclusively in API code.
 */
function relayFail(string $message): never { fwrite(STDERR, $message . PHP_EOL); exit(1); }
if (!shopLiveMode() || getenv('NODE_ENV') !== 'production' || getenv('LIVE_INTEGRATIONS') !== '1'
    || getenv('PICQER_RELAY_ENABLED') !== '1') relayFail('Native relay is hard-disabled outside explicit production opt-in.');
$secret = (string)getenv('PICQER_RELAY_SECRET');
$endpoint = trim((string)getenv('PICQER_RELAY_API_ENDPOINT'));
if ($secret === '' || !preg_match('#^https://#i', $endpoint) || str_contains(strtolower($endpoint), 'picqer')) {
    relayFail('Native relay endpoint or secret is not configured safely.');
}
$cutover = nativeRelayCutover();
if ($cutover === null) relayFail('PICQER_CUTOVER_AT is required.');
$limit = 20;
foreach ($argv as $index => $arg) if ($arg === '--limit') $limit = (int)($argv[$index + 1] ?? 0);
if ($limit < 1 || $limit > 100) relayFail('--limit must be 1..100');
$dryRun = in_array('--dry-run', $argv, true);
$pdo = db();
$owner = bin2hex(random_bytes(16));
$pdo->beginTransaction();
$pdo->exec("UPDATE native_picqer_outbox SET status='pending',locked_owner=NULL,locked_until=NULL
  WHERE status='processing' AND locked_until IS NOT NULL AND locked_until < UTC_TIMESTAMP()");
$rows = $pdo->query("SELECT * FROM native_picqer_outbox
  WHERE status IN ('pending','failed') AND next_attempt_at<=UTC_TIMESTAMP()
  ORDER BY id LIMIT " . $limit . " FOR UPDATE SKIP LOCKED")->fetchAll(PDO::FETCH_ASSOC);
$leaseUntil = gmdate('Y-m-d H:i:s', time() + 900);
$claim = $pdo->prepare("UPDATE native_picqer_outbox SET status='processing',attempts=attempts+1,locked_owner=?,locked_until=? WHERE id=?");
foreach ($rows as $row) $claim->execute([$owner, $leaseUntil, (int)$row['id']]);
$pdo->commit();
$sent = 0;
foreach ($rows as $row) {
    $snapshot = json_decode((string)$row['snapshot_json'], true, 64, JSON_THROW_ON_ERROR);
    $orderCreated = isset($snapshot['order_created_at']) ? new DateTimeImmutable((string)$snapshot['order_created_at']) : null;
    if ($orderCreated === null || $orderCreated < $cutover) {
        $pdo->prepare("UPDATE native_picqer_outbox SET status='blocked',last_error='order predates cutover',locked_owner=NULL,locked_until=NULL WHERE id=? AND locked_owner=?")
            ->execute([(int)$row['id'], $owner]);
        continue;
    }
    if ($dryRun) {
        $pdo->prepare("UPDATE native_picqer_outbox SET status='pending',locked_owner=NULL,locked_until=NULL WHERE id=? AND locked_owner=?")->execute([(int)$row['id'], $owner]);
        continue;
    }
    $lease = $pdo->prepare("UPDATE native_picqer_outbox SET locked_until=DATE_ADD(GREATEST(locked_until,UTC_TIMESTAMP()),INTERVAL 15 MINUTE)
      WHERE id=? AND status='processing' AND locked_owner=? AND locked_until>UTC_TIMESTAMP()");
    $lease->execute([(int)$row['id'], $owner]);
    // MySQL reports zero affected rows when a same-second assignment leaves the
    // stored value unchanged. Ownership, not affected-row count, is the fence.
    $owned = $pdo->prepare("SELECT locked_owner,locked_until FROM native_picqer_outbox WHERE id=? AND status='processing'
      AND locked_owner=? AND locked_until>DATE_ADD(UTC_TIMESTAMP(),INTERVAL 20 SECOND)");
    $owned->execute([(int)$row['id'], $owner]);
    $ownedRow = $owned->fetch(PDO::FETCH_ASSOC);
    if (!nativeRelayLeaseIsOwned($ownedRow === false ? null : $ownedRow, $owner, time())) continue;
    $timestamp = (string)time();
    $eventId = (string)$row['event_id'];
    $body = json_encode($snapshot, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    $signature = hash_hmac('sha256', "v1.$timestamp.$eventId.$body", $secret);
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'ignore_errors' => true, 'timeout' => 15,
        'header' => "Content-Type: application/json\r\nX-Ferry-Relay-Timestamp: $timestamp\r\nX-Ferry-Relay-Event-Id: $eventId\r\nX-Ferry-Relay-Signature: $signature\r\n",
        'content' => $body,
    ]]);
    $response = @file_get_contents($endpoint, false, $context);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)) $code = (int)$match[1];
    if ($response === false || $code < 200 || $code >= 300) {
        $pdo->prepare("UPDATE native_picqer_outbox SET status='failed',last_error='relay request failed',next_attempt_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 5 MINUTE),locked_owner=NULL,locked_until=NULL WHERE id=? AND locked_owner=?")
            ->execute([(int)$row['id'], $owner]);
        continue;
    }
    $pdo->prepare("UPDATE native_picqer_outbox SET status='succeeded',last_error=NULL,locked_owner=NULL,locked_until=NULL WHERE id=? AND locked_owner=?")->execute([(int)$row['id'], $owner]);
    $sent++;
}
echo json_encode(['claimed' => count($rows), 'sent' => $sent, 'dry_run' => $dryRun], JSON_THROW_ON_ERROR) . PHP_EOL;