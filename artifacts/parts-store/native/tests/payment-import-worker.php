<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/SwissQrInvoice.php';
require_once __DIR__ . '/../src/operations.php';

try {
    $record = json_decode(base64_decode((string)($argv[1] ?? ''), true), true, 16, JSON_THROW_ON_ERROR);
    $staffId = (int)db()->query("SELECT id FROM users WHERE role='staff' AND status='active' ORDER BY id LIMIT 1")->fetchColumn();
    $result = financeApplyPaymentImports(db(), $staffId, [$record]);
    echo json_encode(['http_status' => 201, 'result' => $result[0]], JSON_THROW_ON_ERROR);
} catch (HttpError $error) {
    echo json_encode(['http_status' => $error->status, 'error' => $error->getMessage()], JSON_THROW_ON_ERROR);
}