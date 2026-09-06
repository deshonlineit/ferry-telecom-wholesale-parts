<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/media.php';

$nativeRoot = dirname(__DIR__);
$manifest = json_decode((string) @file_get_contents($nativeRoot . '/storage/catalog-photo-import-manifest.json'), true, 64, JSON_THROW_ON_ERROR);
$baseline = json_decode((string) @file_get_contents($nativeRoot . '/storage/catalog-photo-import-baseline.json'), true, 64, JSON_THROW_ON_ERROR);
$downloadReport = json_decode((string) @file_get_contents($nativeRoot . '/storage/catalog-photo-download-report.json'), true, 64, JSON_THROW_ON_ERROR);
$items = $manifest['items'] ?? [];
if (!is_array($items) || !is_array($baseline) || !is_array($downloadReport)) {
    throw new RuntimeException('Prepare and download reports are required.');
}

function finalProtectedSignature(PDO $pdo): array
{
    $products = hash_init('sha256');
    foreach ($pdo->query('SELECT id,sku,name,description,category_id,brand_id,quality,stock,list_price_cents,featured,active,created_at FROM products ORDER BY id', PDO::FETCH_NUM) as $row) {
        hash_update($products, json_encode($row, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE) . "\n");
    }
    $prices = hash_init('sha256');
    foreach ($pdo->query('SELECT product_id,group_id,price_cents FROM group_prices ORDER BY product_id,group_id', PDO::FETCH_NUM) as $row) {
        hash_update($prices, json_encode($row, JSON_THROW_ON_ERROR) . "\n");
    }
    return [
        'products_except_image_url_sha256' => hash_final($products),
        'group_prices_sha256' => hash_final($prices),
        'stock_sum' => (int) $pdo->query('SELECT COALESCE(SUM(stock),0) FROM products')->fetchColumn(),
        'list_price_cents_sum' => (int) $pdo->query('SELECT COALESCE(SUM(list_price_cents),0) FROM products')->fetchColumn(),
        'group_price_cents_sum' => (int) $pdo->query('SELECT COALESCE(SUM(price_cents),0) FROM group_prices')->fetchColumn(),
    ];
}

$imported = 0;
$alreadyPresent = 0;
$notDownloaded = [];
$importErrors = [];
foreach ($items as $item) {
    $productId = (int) ($item['product_id'] ?? 0);
    $path = $nativeRoot . '/storage/catalog-downloads/' . $productId . '.img';
    if (!is_file($path)) {
        $notDownloaded[] = ['product_id' => $productId, 'sku' => (string) ($item['sku'] ?? '')];
        continue;
    }
    try {
        if (mediaImportCatalogImage($productId, $path)) {
            $imported++;
        } else {
            $alreadyPresent++;
        }
    } catch (Throwable $error) {
        $importErrors[] = [
            'product_id' => $productId,
            'sku' => (string) ($item['sku'] ?? ''),
            'error' => $error instanceof HttpError ? $error->getMessage() : 'Unexpected local image processing failure.',
        ];
    }
}

$pdo = db();
$after = finalProtectedSignature($pdo);
$expected = $baseline['protected_signatures'] ?? [];
$protectedUnchanged = is_array($expected) && hash_equals(
    hash('sha256', json_encode($expected, JSON_THROW_ON_ERROR)),
    hash('sha256', json_encode($after, JSON_THROW_ON_ERROR))
);
$verificationSkus = ['IPH15PL06', 'IPH15PL46', 'IPH15PL42', 'IPH15PRM06', 'IPH15PRM43'];
$verify = $pdo->prepare(
    'SELECT p.id,p.sku,p.image_url,i.url,i.variants
     FROM products p LEFT JOIN images i ON i.product_id=p.id WHERE p.sku=? ORDER BY i.id LIMIT 1'
);
$skuVerification = [];
foreach ($verificationSkus as $sku) {
    $verify->execute([$sku]);
    $row = $verify->fetch();
    $skuVerification[$sku] = [
        'found' => (bool) $row,
        'has_local_image' => $row
            && is_string($row['image_url'])
            && str_starts_with($row['image_url'], '/test-shop/media/products/')
            && $row['url'] === $row['image_url'],
        'variants' => $row ? count((array) json_decode((string) $row['variants'], true)) : 0,
    ];
}
$nativeCount = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
$imageCount = (int) $pdo->query('SELECT COUNT(DISTINCT product_id) FROM images')->fetchColumn();
$localImageCount = (int) $pdo->query("SELECT COUNT(*) FROM products WHERE image_url LIKE '/test-shop/media/products/%'")->fetchColumn();
$report = [
    'completed_at_utc' => gmdate(DATE_ATOM),
    'source_csv' => $baseline['source_csv'] ?? null,
    'mapping_provenance' => $baseline['mapping_provenance'] ?? null,
    'native_product_count' => $nativeCount,
    'source_rows_with_images' => $baseline['source_rows_with_images'] ?? null,
    'mapped_primary_photo_count' => count($items),
    'native_missing_source_mapping_count' => $baseline['native_missing_source_mapping_count'] ?? null,
    'download_failed_unique_url_count' => $downloadReport['failed_unique_url_count'] ?? null,
    'newly_imported_count' => $imported,
    'already_present_count' => $alreadyPresent,
    'not_downloaded_count' => count($notDownloaded),
    'import_error_count' => count($importErrors),
    'products_with_image_count' => $imageCount,
    'products_with_local_image_url_count' => $localImageCount,
    'coverage_percent' => $nativeCount > 0 ? round(100 * $imageCount / $nativeCount, 2) : 0,
    'protected_stock_price_and_product_fields_unchanged' => $protectedUnchanged,
    'protected_signatures_before' => $expected,
    'protected_signatures_after' => $after,
    'required_sku_verification' => $skuVerification,
    'not_downloaded' => $notDownloaded,
    'import_errors' => $importErrors,
];
file_put_contents(
    $nativeRoot . '/storage/catalog-photo-final-report.json',
    json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n",
    LOCK_EX
);
echo json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
exit($protectedUnchanged && $notDownloaded === [] && $importErrors === [] ? 0 : 2);
