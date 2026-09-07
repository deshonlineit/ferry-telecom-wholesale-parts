<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

$csvPath = $argv[1] ?? '';
$outputPath = $argv[2] ?? '';
if ($csvPath === '' || !is_file($csvPath)) {
    throw new RuntimeException('Usage: php bin/audit-woocommerce-export.php <export.csv> [report.json]');
}

$handle = fopen($csvPath, 'rb');
if ($handle === false) {
    throw new RuntimeException('Cannot read the WooCommerce export.');
}
$headers = fgetcsv($handle, 0, ',', '"', '');
if (!is_array($headers)) {
    throw new RuntimeException('The export has no header row.');
}
$headers[0] = ltrim((string) $headers[0], "\xEF\xBB\xBF");

$source = [];
$duplicates = [];
$types = [];
$published = 0;
$withSku = 0;
$withImages = 0;
$withNumericStock = 0;
$stockSum = 0;
$malformed = 0;
$rows = 0;
$fieldCounts = [];

while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    $rows++;
    $fieldCounts[count($values)] = ($fieldCounts[count($values)] ?? 0) + 1;
    if (count($values) !== count($headers)) {
        $malformed++;
    }
    $values = array_slice(array_pad($values, count($headers), ''), 0, count($headers));
    $row = array_combine($headers, $values);
    if ($row === false) {
        continue;
    }
    $type = trim((string) ($row['Type'] ?? ''));
    $types[$type === '' ? '(empty)' : $type] = ($types[$type === '' ? '(empty)' : $type] ?? 0) + 1;
    if (trim((string) ($row['Published'] ?? '')) === '1') {
        $published++;
    }
    $sku = trim((string) ($row['SKU'] ?? ''));
    if ($sku === '') {
        continue;
    }
    $withSku++;
    if (isset($source[$sku])) {
        $duplicates[$sku] = ($duplicates[$sku] ?? 1) + 1;
        continue;
    }
    $images = trim((string) ($row['Images'] ?? ''));
    if ($images !== '') {
        $withImages++;
    }
    $stock = trim((string) ($row['Stock'] ?? ''));
    if ($stock !== '' && is_numeric($stock)) {
        $withNumericStock++;
        $stockSum += (int) round((float) $stock);
    }
    $source[$sku] = [
        'id' => trim((string) ($row['ID'] ?? '')),
        'type' => $type,
        'name' => trim((string) ($row['Name'] ?? '')),
        'published' => trim((string) ($row['Published'] ?? '')) === '1',
        'in_stock' => trim((string) ($row['In stock?'] ?? '')) === '1',
        'stock' => $stock,
        'categories' => trim((string) ($row['Categories'] ?? '')),
        'tags' => trim((string) ($row['Tags'] ?? '')),
        'brand' => trim((string) ($row['Brands'] ?? '')),
        'images' => $images,
    ];
}
fclose($handle);

$native = [];
foreach (db()->query(
    'SELECT p.id,p.sku,p.name,p.stock,p.active,p.image_url,
            c.name AS category,b.name AS brand,
            (SELECT COUNT(*) FROM images i WHERE i.product_id=p.id) AS image_count
     FROM products p
     LEFT JOIN categories c ON c.id=p.category_id
     LEFT JOIN brands b ON b.id=p.brand_id
     ORDER BY p.sku'
) as $row) {
    $native[(string) $row['sku']] = $row;
}

$matched = array_intersect_key($source, $native);
$sourceOnly = array_values(array_diff(array_keys($source), array_keys($native)));
$nativeOnly = array_values(array_diff(array_keys($native), array_keys($source)));
$differences = [
    'name' => 0,
    'stock' => 0,
    'published' => 0,
    'source_has_image_native_missing' => 0,
];
$examples = [
    'source_only' => array_slice($sourceOnly, 0, 25),
    'native_only' => array_slice($nativeOnly, 0, 25),
    'name' => [],
    'stock' => [],
    'published' => [],
    'image_missing' => [],
];

foreach ($matched as $sku => $row) {
    $current = $native[$sku];
    if ($row['name'] !== trim((string) $current['name'])) {
        $differences['name']++;
        if (count($examples['name']) < 20) {
            $examples['name'][] = ['sku' => $sku, 'source' => $row['name'], 'native' => $current['name']];
        }
    }
    if ($row['stock'] !== '' && is_numeric($row['stock']) && (int) round((float) $row['stock']) !== (int) $current['stock']) {
        $differences['stock']++;
        if (count($examples['stock']) < 20) {
            $examples['stock'][] = ['sku' => $sku, 'source' => (int) round((float) $row['stock']), 'native' => (int) $current['stock']];
        }
    }
    if ($row['published'] !== (bool) $current['active']) {
        $differences['published']++;
        if (count($examples['published']) < 20) {
            $examples['published'][] = ['sku' => $sku, 'source' => $row['published'], 'native' => (bool) $current['active']];
        }
    }
    if ($row['images'] !== '' && (int) $current['image_count'] === 0 && trim((string) $current['image_url']) === '') {
        $differences['source_has_image_native_missing']++;
        if (count($examples['image_missing']) < 20) {
            $examples['image_missing'][] = $sku;
        }
    }
}

ksort($types);
ksort($fieldCounts);
$report = [
    'source' => [
        'file' => basename($csvPath),
        'sha256' => hash_file('sha256', $csvPath),
        'bytes' => filesize($csvPath),
        'header_columns' => count($headers),
        'row_field_counts' => $fieldCounts,
        'rows' => $rows,
        'malformed_rows' => $malformed,
        'types' => $types,
        'published_rows' => $published,
        'rows_with_sku' => $withSku,
        'unique_skus' => count($source),
        'duplicate_skus' => count($duplicates),
        'duplicate_sku_examples' => array_slice(array_keys($duplicates), 0, 25),
        'rows_with_images' => $withImages,
        'rows_with_numeric_stock' => $withNumericStock,
        'numeric_stock_sum' => $stockSum,
    ],
    'native' => [
        'products' => count($native),
        'active_products' => (int) db()->query('SELECT COUNT(*) FROM products WHERE active=1')->fetchColumn(),
        'stock_sum' => (int) db()->query('SELECT COALESCE(SUM(stock),0) FROM products')->fetchColumn(),
        'products_with_images' => (int) db()->query(
            "SELECT COUNT(*) FROM products p WHERE p.image_url<>'' OR EXISTS(SELECT 1 FROM images i WHERE i.product_id=p.id)"
        )->fetchColumn(),
    ],
    'reconciliation' => [
        'matched_unique_skus' => count($matched),
        'source_only_skus' => count($sourceOnly),
        'native_only_skus' => count($nativeOnly),
        'differences' => $differences,
        'examples' => $examples,
    ],
    'safe_to_import' => count($headers) === 111 && $malformed === 0 && !$duplicates,
    'notes' => [
        'All comparisons are read-only and keyed by exact SKU.',
        'Blank WooCommerce stock values are not treated as zero.',
        'The source is not safe to import until row/header alignment and duplicate SKUs are resolved.',
    ],
];

$json = json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
if ($outputPath !== '') {
    $directory = dirname($outputPath);
    if (!is_dir($directory)) {
        mkdir($directory, 0775, true);
    }
    file_put_contents($outputPath, $json . PHP_EOL);
}
echo $json . PHP_EOL;