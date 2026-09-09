<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/SwissQrInvoice.php';
require_once __DIR__ . '/../src/operations.php';

$pdo = db();
$suffix = bin2hex(random_bytes(5));
$numbers = [];
$externalIds = [];

function paymentTestAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

function paymentTestOrder(
    PDO $pdo,
    int $customerId,
    string $number,
    string $status,
    ?string $referenceType,
    ?string $reference
): int {
    $statement = $pdo->prepare(
        'INSERT INTO orders
         (number,user_id,status,subtotal_cents,tax_cents,shipping_cents,total_cents,tax_bps,currency,
          address_json,payment_method,payment_state,payment_reference_type,payment_reference,notes,idempotency_key)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    );
    $statement->execute([
        $number, $customerId, $status, 1000, 81, 0, 1081, 810, 'CHF',
        json_encode(['name' => 'QA'], JSON_THROW_ON_ERROR), 'swiss_qr_invoice', 'open',
        $referenceType, $reference, '', 'qa-payment-import-' . $number,
    ]);
    return (int)$pdo->lastInsertId();
}

function paymentTestConcurrent(array $records): array
{
    $processes = [];
    foreach ($records as $record) {
        $encoded = base64_encode(json_encode($record, JSON_THROW_ON_ERROR));
        $command = [PHP_BINARY, __DIR__ . '/payment-import-worker.php', $encoded];
        $pipes = [];
        $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Could not start concurrent import worker.');
        $processes[] = [$process, $pipes];
    }
    $outputs = [];
    foreach ($processes as [$process, $pipes]) {
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exit = proc_close($process);
        if ($exit !== 0 || $stderr !== '') throw new RuntimeException('Concurrent import worker failed: ' . $stderr);
        $outputs[] = json_decode($stdout, true, 16, JSON_THROW_ON_ERROR);
    }
    return $outputs;
}

try {
    $staffId = (int)$pdo->query("SELECT id FROM users WHERE role='staff' AND status='active' ORDER BY id LIMIT 1")->fetchColumn();
    $customerId = (int)$pdo->query("SELECT id FROM users WHERE role='customer' AND status='active' ORDER BY id LIMIT 1")->fetchColumn();
    paymentTestAssert($staffId > 0 && $customerId > 0, 'Active test users are required.');

    $matchedNumber = 'QA-PAY-' . $suffix;
    $matchedReference = swissQrScorReference('TS-20260909-' . strtoupper($suffix));
    $matchedId = paymentTestOrder($pdo, $customerId, $matchedNumber, 'on_hold', 'SCOR', $matchedReference);
    $numbers[] = $matchedNumber;
    $matchedExternal = 'QA-MATCH-' . $suffix;
    $externalIds[] = $matchedExternal;
    $record = [
        'external_id' => $matchedExternal, 'reference' => $matchedReference,
        'amount_cents' => 1081, 'currency' => 'CHF', 'booked_at' => '2026-09-09',
    ];
    $first = financeApplyPaymentImports($pdo, $staffId, [$record]);
    paymentTestAssert($first[0]['status'] === 'matched', 'Exact reference must match.');
    $replay = financeApplyPaymentImports($pdo, $staffId, [$record]);
    paymentTestAssert($replay[0]['status'] === 'already_imported' && $replay[0]['original_status'] === 'matched', 'Replay must be idempotent.');
    $ledger = opRow('SELECT paid_cents,verified FROM invoice_accounting WHERE order_id=?', [$matchedId]);
    paymentTestAssert((int)$ledger['paid_cents'] === 1081 && (bool)$ledger['verified'], 'Matched payment must update the ledger once.');

    $changedDateRejected = false;
    try {
        financeApplyPaymentImports($pdo, $staffId, [array_replace($record, ['booked_at' => '2026-09-10'])]);
    } catch (HttpError $error) {
        $changedDateRejected = $error->status === 409;
    }
    paymentTestAssert($changedDateRejected, 'External id replay with a changed date must be rejected.');

    $cancelledNumber = 'QA-CAN-' . $suffix;
    $cancelledReference = swissQrScorReference('TS-20260908-' . strtoupper($suffix));
    $cancelledId = paymentTestOrder($pdo, $customerId, $cancelledNumber, 'cancelled', 'SCOR', $cancelledReference);
    $numbers[] = $cancelledNumber;
    $cancelledExternal = 'QA-CANCEL-' . $suffix;
    $externalIds[] = $cancelledExternal;
    $cancelled = financeApplyPaymentImports($pdo, $staffId, [[
        'external_id' => $cancelledExternal, 'reference' => $cancelledReference,
        'amount_cents' => 1081, 'currency' => 'CHF', 'booked_at' => '2026-09-09',
    ]]);
    paymentTestAssert($cancelled[0]['status'] === 'cancelled_order', 'Cancelled order payment must require review.');
    paymentTestAssert(opRow('SELECT order_id FROM invoice_accounting WHERE order_id=?', [$cancelledId]) === null, 'Cancelled order ledger must not change.');

    $currencyExternal = 'QA-CURRENCY-' . $suffix;
    $externalIds[] = $currencyExternal;
    $mismatch = financeApplyPaymentImports($pdo, $staffId, [[
        'external_id' => $currencyExternal, 'reference' => $matchedReference,
        'amount_cents' => 1081, 'currency' => 'EUR', 'booked_at' => '2026-09-09',
    ]]);
    paymentTestAssert($mismatch[0]['status'] === 'currency_mismatch', 'Currency mismatch must not post.');

    $raceNumber = 'QA-RACE-' . $suffix;
    $raceReference = swissQrScorReference('TS-20260907-' . strtoupper($suffix));
    $raceId = paymentTestOrder($pdo, $customerId, $raceNumber, 'on_hold', 'SCOR', $raceReference);
    $numbers[] = $raceNumber;
    $raceExternal = 'QA-RACE-' . $suffix;
    $externalIds[] = $raceExternal;
    $raceRecord = [
        'external_id' => $raceExternal, 'reference' => $raceReference,
        'amount_cents' => 500, 'currency' => 'CHF', 'booked_at' => '2026-09-09',
    ];
    $race = paymentTestConcurrent([$raceRecord, $raceRecord]);
    $raceStatuses = array_map(static fn(array $row): string => (string)($row['result']['status'] ?? ''), $race);
    sort($raceStatuses);
    paymentTestAssert($raceStatuses === ['already_imported', 'matched'], 'Concurrent identical imports must match once and replay once.');
    $raceLedger = opRow('SELECT paid_cents FROM invoice_accounting WHERE order_id=?', [$raceId]);
    paymentTestAssert((int)$raceLedger['paid_cents'] === 500, 'Concurrent identical imports must post once.');

    $conflictNumber = 'QA-CONFLICT-' . $suffix;
    $conflictReference = swissQrScorReference('TS-20260906-' . strtoupper($suffix));
    $conflictId = paymentTestOrder($pdo, $customerId, $conflictNumber, 'on_hold', 'SCOR', $conflictReference);
    $numbers[] = $conflictNumber;
    $conflictExternal = 'QA-CONFLICT-' . $suffix;
    $externalIds[] = $conflictExternal;
    $conflictBase = [
        'external_id' => $conflictExternal, 'reference' => $conflictReference,
        'amount_cents' => 400, 'currency' => 'CHF', 'booked_at' => '2026-09-09',
    ];
    $conflict = paymentTestConcurrent([$conflictBase, array_replace($conflictBase, ['amount_cents' => 600])]);
    $httpStatuses = array_map(static fn(array $row): int => (int)$row['http_status'], $conflict);
    sort($httpStatuses);
    paymentTestAssert($httpStatuses === [201, 409], 'Concurrent conflicting imports must accept one and reject one.');
    $conflictLedger = opRow('SELECT paid_cents FROM invoice_accounting WHERE order_id=?', [$conflictId]);
    paymentTestAssert(in_array((int)$conflictLedger['paid_cents'], [400, 600], true), 'Concurrent conflict must post exactly one amount.');

    $legacyNumber = 'QA-NON-' . $suffix;
    paymentTestOrder($pdo, $customerId, $legacyNumber, 'on_hold', null, null);
    $numbers[] = $legacyNumber;
    $legacy = opRow('SELECT payment_reference_type,payment_reference FROM orders WHERE number=?', [$legacyNumber]);
    paymentTestAssert($legacy['payment_reference_type'] === null && $legacy['payment_reference'] === null, 'Legacy NON storage must remain empty.');

    echo "payment import integration tests passed\n";
} finally {
    if ($externalIds) {
        $marks = implode(',', array_fill(0, count($externalIds), '?'));
        $pdo->prepare("DELETE FROM imported_payments WHERE external_id IN ($marks)")->execute($externalIds);
    }
    if ($numbers) {
        $marks = implode(',', array_fill(0, count($numbers), '?'));
        $ids = $pdo->prepare("SELECT id FROM orders WHERE number IN ($marks)");
        $ids->execute($numbers);
        $orderIds = array_map('intval', $ids->fetchAll(PDO::FETCH_COLUMN));
        if ($orderIds) {
            $orderMarks = implode(',', array_fill(0, count($orderIds), '?'));
            $pdo->prepare("DELETE FROM invoice_accounting WHERE order_id IN ($orderMarks)")->execute($orderIds);
        }
        $pdo->prepare("DELETE FROM orders WHERE number IN ($marks)")->execute($numbers);
    }
}