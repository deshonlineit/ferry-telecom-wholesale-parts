<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/operations.php';

if (appProduction()) {
    throw new RuntimeException('Incorrect product photo integration tests are forbidden in production.');
}
assertIsolated();

$pdo = db();
$suffix = bin2hex(random_bytes(5));
$productIds = [];

function photoReportAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

try {
    $staff = opRow("SELECT id,name FROM users WHERE role='staff' AND status='active' ORDER BY id LIMIT 1");
    photoReportAssert($staff !== null, 'An active staff fixture is required.');

    $insertProduct = $pdo->prepare(
        'INSERT INTO products(sku,name,description,quality,stock) VALUES(?,?,?,?,?)'
    );
    foreach (['reported', 'clean'] as $kind) {
        $insertProduct->execute([
            'QA-PHOTO-' . strtoupper($kind) . '-' . $suffix,
            'QA photo report ' . $kind,
            '',
            'QA',
            0,
        ]);
        $productIds[$kind] = (int)$pdo->lastInsertId();
    }

    $insertAudit = $pdo->prepare(
        'INSERT INTO audit_events(user_id,action,entity,entity_id,details,created_at)
         VALUES(?,?,?,?,?,?)'
    );
    $insertAudit->execute([
        (int)$staff['id'], 'image.incorrect_unlinked', 'product', $productIds['reported'],
        json_encode(['reason' => 'Oude reden'], JSON_THROW_ON_ERROR), '2026-09-13 08:00:00',
    ]);
    $insertAudit->execute([
        (int)$staff['id'], 'product.updated', 'product', $productIds['reported'],
        json_encode(['reason' => 'Deze andere auditactie mag niet winnen'], JSON_THROW_ON_ERROR),
        '2026-09-13 10:00:00',
    ]);
    $insertAudit->execute([
        (int)$staff['id'], 'image.incorrect_unlinked', 'product', $productIds['reported'],
        json_encode(['reason' => 'Nieuwste reden'], JSON_THROW_ON_ERROR), '2026-09-13 09:00:00',
    ]);

    $report = opLatestImageReport($productIds['reported']);
    photoReportAssert($report !== null, 'The reported product must expose a report.');
    photoReportAssert($report['reason'] === 'Nieuwste reden', 'The newest photo report reason must win.');
    photoReportAssert($report['staff'] === [
        'id' => (int)$staff['id'],
        'name' => (string)$staff['name'],
    ], 'The newest photo report must expose its staff member.');
    photoReportAssert($report['created_at'] === '2026-09-13 09:00:00', 'The newest photo report timestamp must be returned.');
    photoReportAssert(opLatestImageReport($productIds['clean']) === null, 'A product without a photo report must return null.');

    echo "incorrect product photo integration test passed\n";
} finally {
    if ($productIds !== []) {
        $ids = array_values($productIds);
        $marks = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("DELETE FROM audit_events WHERE entity='product' AND entity_id IN ($marks)")->execute($ids);
        $pdo->prepare("DELETE FROM products WHERE id IN ($marks)")->execute($ids);
    }
}