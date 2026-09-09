<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

function diagnosticsCheck(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$beforeMessages = (int) db()->query('SELECT COUNT(*) FROM messages')->fetchColumn();
$reference = 'qa_diag_' . bin2hex(random_bytes(6));

try {
    $storedReference = recordDiagnostic('error', 'qa.redaction', 'Failure for customer@example.test from 192.0.2.10', [
        'password' => 'never-store-this-password',
        'nested' => [
            'authorization' => 'Bearer never-store-this-token',
            'email' => 'customer@example.test',
            'ip' => '192.0.2.10',
            'safe_code' => 'CATALOG_TIMEOUT',
        ],
    ], $reference);
    diagnosticsCheck($storedReference === $reference, 'Diagnostic reference was not preserved.');

    $statement = db()->prepare('SELECT summary,context_json FROM diagnostics WHERE reference=?');
    $statement->execute([$reference]);
    $row = $statement->fetch();
    diagnosticsCheck(is_array($row), 'Diagnostic was not persisted.');

    $encoded = (string) $row['summary'] . ' ' . (string) $row['context_json'];
    foreach (['never-store-this-password', 'never-store-this-token', 'customer@example.test', '192.0.2.10'] as $forbidden) {
        diagnosticsCheck(!str_contains($encoded, $forbidden), 'Sensitive diagnostic value was stored: ' . $forbidden);
    }
    diagnosticsCheck(str_contains((string) $row['context_json'], 'CATALOG_TIMEOUT'), 'Safe diagnostic context was lost.');

    $afterMessages = (int) db()->query('SELECT COUNT(*) FROM messages')->fetchColumn();
    diagnosticsCheck($afterMessages === $beforeMessages, 'Recording a diagnostic created a local message.');

    echo "PASS: diagnostics persist recursively redacted context without creating local messages.\n";
} finally {
    $delete = db()->prepare('DELETE FROM diagnostics WHERE reference=?');
    $delete->execute([$reference]);
}