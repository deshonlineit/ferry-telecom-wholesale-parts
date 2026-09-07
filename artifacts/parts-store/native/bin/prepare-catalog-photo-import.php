<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';

function catalogPhotoProtectedSignature(PDO $pdo): array
{
    $products = hash_init('sha256');
    $query = $pdo->query(
        'SELECT id,sku,name,description,category_id,brand_id,quality,stock,list_price_cents,featured,active,created_at
         FROM products ORDER BY id'
    );
    while ($row = $query->fetch(PDO::FETCH_NUM)) {
        hash_update($products, json_encode($row, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE) . "\n");
    }
    $prices = hash_init('sha256');
    $query = $pdo->query('SELECT product_id,group_id,price_cents FROM group_prices ORDER BY product_id,group_id');
    while ($row = $query->fetch(PDO::FETCH_NUM)) {
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

require_once dirname(__DIR__) . '/src/catalog-photo-source.php';

$csvPath = $argv[1] ?? WORKSPACE_ROOT . '/attached_assets/0_product_export_2026-07-30-06-25-56_1785436150044.csv';
if (!is_file($csvPath)) {
    throw new RuntimeException('The authorized product export is missing.');
}

$pdo = db();
$nativeProducts = [];
foreach ($pdo->query('SELECT id,sku FROM products ORDER BY id') as $product) {
    $nativeProducts[(string) $product['sku']] = (int) $product['id'];
}

$handle = fopen($csvPath, 'rb');
if ($handle === false) {
    throw new RuntimeException('The authorized product export cannot be read.');
}
$headers = fgetcsv($handle, 0, ',', '"', '');
if (!is_array($headers)) {
    throw new RuntimeException('The authorized product export has no header.');
}
$headers[0] = ltrim((string) $headers[0], "\xEF\xBB\xBF");
$manifestByProduct = [];
$sourceRows = 0;
$sourceRowsWithImages = 0;
$invalidSourceUrls = 0;
$duplicateSkuRowsIgnored = 0;
$rowNumber = 1;
while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    $rowNumber++;
    $sourceRows++;
    $values = array_slice(array_pad($values, count($headers), ''), 0, count($headers));
    $row = array_combine($headers, $values);
    if (array_key_exists('Published', $row) && trim((string) $row['Published']) !== '1') {
        continue;
    }
    $sku = trim((string) ($row['sku'] ?? $row['SKU'] ?? ''));
    $images = trim((string) ($row['images'] ?? $row['Images'] ?? ''));
    if ($images !== '') {
        $sourceRowsWithImages++;
    }
    if ($sku === '' || !array_key_exists($sku, $nativeProducts) || $images === '') {
        continue;
    }
    $url = catalogPhotoSourceUrl($images);
    if ($url === null) {
        $invalidSourceUrls++;
        continue;
    }
    $productId = $nativeProducts[$sku];
    if (isset($manifestByProduct[$productId])) {
        $duplicateSkuRowsIgnored++;
        continue;
    }
    $manifestByProduct[$productId] = [
        'product_id' => $productId,
        'sku' => $sku,
        'source_url' => $url,
        'source_csv_row' => $rowNumber,
        'mapping' => 'exact_native_sku',
    ];
}
fclose($handle);
ksort($manifestByProduct, SORT_NUMERIC);

$storage = dirname(__DIR__) . '/storage';
if (!is_dir($storage) && !mkdir($storage, 0700, true) && !is_dir($storage)) {
    throw new RuntimeException('Native storage directory could not be created.');
}
$withImages = (int) $pdo->query('SELECT COUNT(DISTINCT product_id) FROM images')->fetchColumn();
$baseline = [
    'created_at_utc' => gmdate(DATE_ATOM),
    'source_csv' => basename($csvPath),
    'mapping_provenance' => 'CSV sku matched byte-for-byte to current isolated native products.sku; WooCommerce ID was not used.',
    'native_product_count' => count($nativeProducts),
    'native_existing_image_count' => $withImages,
    'source_row_count' => $sourceRows,
    'source_rows_with_images' => $sourceRowsWithImages,
    'mapped_primary_photo_count' => count($manifestByProduct),
    'native_missing_source_mapping_count' => count($nativeProducts) - count($manifestByProduct),
    'invalid_or_unapproved_source_url_count' => $invalidSourceUrls,
    'duplicate_mapped_sku_rows_ignored' => $duplicateSkuRowsIgnored,
    'protected_signatures' => catalogPhotoProtectedSignature($pdo),
];
file_put_contents(
    $storage . '/catalog-photo-import-manifest.json',
    json_encode(['metadata' => $baseline, 'items' => array_values($manifestByProduct)], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n",
    LOCK_EX
);
file_put_contents(
    $storage . '/catalog-photo-import-baseline.json',
    json_encode($baseline, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n",
    LOCK_EX
);
echo json_encode($baseline, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
