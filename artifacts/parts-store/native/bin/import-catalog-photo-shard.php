<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/media.php';

if ($argc !== 3
    || filter_var($argv[1], FILTER_VALIDATE_INT) === false
    || filter_var($argv[2], FILTER_VALIDATE_INT) === false) {
    fwrite(STDERR, "Usage: php import-catalog-photo-shard.php SHARD_INDEX SHARD_COUNT\n");
    exit(64);
}
$shard = (int) $argv[1];
$shardCount = (int) $argv[2];
if ($shardCount < 1 || $shardCount > 8 || $shard < 0 || $shard >= $shardCount) {
    fwrite(STDERR, "Shard index must be in [0, SHARD_COUNT), and SHARD_COUNT must be 1..8.\n");
    exit(64);
}

$nativeRoot = dirname(__DIR__);
$manifest = json_decode(
    (string) @file_get_contents($nativeRoot . '/storage/catalog-photo-import-manifest.json'),
    true,
    64,
    JSON_THROW_ON_ERROR
);
$items = $manifest['items'] ?? null;
if (!is_array($items)) {
    throw new RuntimeException('Run prepare-catalog-photo-import.php first.');
}

$imported = 0;
$alreadyPresent = 0;
$errors = [];
foreach ($items as $item) {
    $productId = (int) ($item['product_id'] ?? 0);
    if ($productId < 1 || $productId % $shardCount !== $shard) {
        continue;
    }
    $source = $nativeRoot . '/storage/catalog-downloads/' . $productId . '.img';
    if (!is_file($source)) {
        $errors[] = ['product_id' => $productId, 'sku' => (string) ($item['sku'] ?? ''), 'error' => 'Verified download is missing.'];
        continue;
    }
    try {
        if (mediaImportCatalogImage($productId, $source)) {
            $imported++;
        } else {
            $alreadyPresent++;
        }
    } catch (Throwable $error) {
        $errors[] = [
            'product_id' => $productId,
            'sku' => (string) ($item['sku'] ?? ''),
            'error' => $error instanceof HttpError ? $error->getMessage() : 'Unexpected local image processing failure.',
        ];
    }
}
$report = [
    'shard_index' => $shard,
    'shard_count' => $shardCount,
    'imported' => $imported,
    'already_present' => $alreadyPresent,
    'errors' => $errors,
    'completed_at_utc' => gmdate(DATE_ATOM),
];
file_put_contents(
    $nativeRoot . '/storage/catalog-photo-import-shard-' . $shard . '-of-' . $shardCount . '.json',
    json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n",
    LOCK_EX
);
echo json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
exit($errors === [] ? 0 : 2);