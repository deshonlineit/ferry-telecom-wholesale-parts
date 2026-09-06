<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';

$csv = WORKSPACE_ROOT . '/attached_assets/0_product_export_2026-07-30-06-25-56_1785436150044.csv';
$handle = fopen($csv, 'rb');
if ($handle === false) {
    throw new RuntimeException('The authorized product export cannot be read.');
}
$headers = fgetcsv($handle, 0, ',', '"', '');
if (!is_array($headers)) {
    throw new RuntimeException('The authorized product export has no header.');
}
$headers[0] = ltrim((string) $headers[0], "\xEF\xBB\xBF");
$source = [];
while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    $row = array_combine($headers, array_slice(array_pad($values, count($headers), ''), 0, count($headers)));
    $sku = trim((string) ($row['sku'] ?? ''));
    if ($sku !== '' && !isset($source[$sku])) {
        $source[$sku] = trim((string) ($row['images'] ?? ''));
    }
}
fclose($handle);

$gaps = [];
$reasonCounts = ['no_exact_sku_row' => 0, 'blank_primary_photo_source' => 0, 'unapproved_primary_photo_source' => 0];
foreach (db()->query('SELECT sku FROM products ORDER BY id') as $product) {
    $sku = (string) $product['sku'];
    if (!array_key_exists($sku, $source)) {
        $reason = 'no_exact_sku_row';
    } elseif ($source[$sku] === '') {
        $reason = 'blank_primary_photo_source';
    } else {
        $url = preg_replace('#^http://#i', 'https://', trim(explode('!', $source[$sku], 2)[0]));
        $parts = parse_url((string) $url);
        if (is_array($parts)
            && strtolower((string) ($parts['scheme'] ?? '')) === 'https'
            && in_array(strtolower((string) ($parts['host'] ?? '')), ['ferrytelecom.com', 'www.ferrytelecom.com'], true)
            && str_starts_with((string) ($parts['path'] ?? ''), '/wp-content/uploads/')) {
            continue;
        }
        $reason = 'unapproved_primary_photo_source';
    }
    $reasonCounts[$reason]++;
    $gaps[] = ['sku' => $sku, 'reason' => $reason];
}
$report = [
    'created_at_utc' => gmdate(DATE_ATOM),
    'source_csv' => basename($csv),
    'mapping' => 'exact_native_sku',
    'missing_source_mapping_count' => count($gaps),
    'reason_counts' => $reasonCounts,
    'products' => $gaps,
];
file_put_contents(
    dirname(__DIR__) . '/storage/catalog-photo-missing-source-report.json',
    json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n",
    LOCK_EX
);
echo json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;