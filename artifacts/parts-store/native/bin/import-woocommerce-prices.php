<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';

$csvPath = $argv[1] ?? '';
$apply = in_array('--apply', $argv, true);
if ($csvPath === '' || !is_file($csvPath)) {
    throw new RuntimeException('Usage: php bin/import-woocommerce-prices.php <export.csv> [--apply]');
}

function wcPriceCents(string $value): ?int
{
    $value = trim(str_replace(',', '.', $value));
    if ($value === '' || !is_numeric($value)) return null;
    $cents = (int) round((float) $value * 100);
    return $cents > 0 ? $cents : null;
}

$priceColumns = [
    'Repairshop — test' => 'Meta: BigRepairShopCustomerAccount_wholesale_price',
    'Wholesale — test' => 'Meta: wholesale_customer_wholesale_price',
    'Partner — test' => 'Meta: partner_customerpp_wholesale_price',
];
$purchaseColumn = 'Meta: Purchase_Price';

$handle = fopen($csvPath, 'rb');
$headers = $handle ? fgetcsv($handle, 0, ',', '"', '') : false;
if (!is_array($headers)) {
    throw new RuntimeException('The WooCommerce export cannot be read.');
}
$headers[0] = ltrim((string) $headers[0], "\xEF\xBB\xBF");
foreach (array_merge(['Published', 'SKU'], array_values($priceColumns)) as $required) {
    if (!in_array($required, $headers, true)) {
        throw new RuntimeException("Required WooCommerce column is missing: {$required}");
    }
}

$source = [];
while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    $values = array_slice(array_pad($values, count($headers), ''), 0, count($headers));
    $row = array_combine($headers, $values);
    if ($row === false || trim((string) ($row['Published'] ?? '')) !== '1') continue;
    $sku = trim((string) ($row['SKU'] ?? ''));
    if ($sku === '') continue;
    if (isset($source[$sku])) {
        throw new RuntimeException("Published WooCommerce SKU occurs more than once: {$sku}");
    }
    $prices = [];
    foreach ($priceColumns as $groupName => $column) {
        $prices[$groupName] = wcPriceCents((string) ($row[$column] ?? ''));
    }
    $source[$sku] = [
        'prices' => $prices,
        'purchase_price_eur_cents' => wcPriceCents((string) ($row[$purchaseColumn] ?? '')),
        'complete' => !in_array(null, $prices, true),
    ];
}
fclose($handle);

$pdo = db();
$groups = [];
foreach ($pdo->query('SELECT id,name FROM customer_groups ORDER BY id') as $group) {
    $groups[(string) $group['name']] = (int) $group['id'];
}
foreach (array_keys($priceColumns) as $groupName) {
    if (!isset($groups[$groupName])) {
        throw new RuntimeException("Required customer group is missing: {$groupName}");
    }
}

$products = [];
foreach ($pdo->query('SELECT id,sku,publication_status,purchase_price_eur_cents FROM products ORDER BY id') as $product) {
    $products[(string) $product['sku']] = $product;
}

$complete = 0;
$incomplete = 0;
$missingProducts = [];
foreach ($source as $sku => $row) {
    if (!isset($products[$sku])) {
        $missingProducts[] = $sku;
        continue;
    }
    $row['complete'] ? $complete++ : $incomplete++;
}
$plan = [
    'mode' => $apply ? 'apply' : 'preview',
    'source_sha256' => hash_file('sha256', $csvPath),
    'published_source_skus' => count($source),
    'complete_price_sets' => $complete,
    'incomplete_price_sets_to_draft' => $incomplete,
    'source_skus_missing_from_catalog' => count($missingProducts),
    'missing_examples' => array_slice($missingProducts, 0, 20),
    'mapping' => $priceColumns,
];
if (!$apply) {
    echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
    exit;
}

$storage = dirname(__DIR__) . '/storage';
if (!is_dir($storage) && !mkdir($storage, 0700, true) && !is_dir($storage)) {
    throw new RuntimeException('Cannot create protected storage.');
}
$backup = [
    'created_at_utc' => gmdate(DATE_ATOM),
    'source_sha256' => $plan['source_sha256'],
    'products' => $pdo->query(
        'SELECT id,sku,publication_status,purchase_price_eur_cents FROM products ORDER BY id'
    )->fetchAll(PDO::FETCH_ASSOC),
    'group_prices' => $pdo->query(
        'SELECT product_id,group_id,price_cents,price_eur_cents FROM group_prices ORDER BY product_id,group_id'
    )->fetchAll(PDO::FETCH_ASSOC),
];
$backupPath = $storage . '/catalog-prices-before-wc-import-' . gmdate('Ymd-His') . '.json';
file_put_contents(
    $backupPath,
    json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR),
    LOCK_EX
);

$updateComplete = $pdo->prepare(
    "UPDATE products SET purchase_price_eur_cents=?,publication_status='visible',
     pricing_version=pricing_version+1 WHERE id=?"
);
$updateIncomplete = $pdo->prepare(
    "UPDATE products SET purchase_price_eur_cents=?,publication_status='draft',
     pricing_version=pricing_version+1 WHERE id=?"
);
$clearPrices = $pdo->prepare('UPDATE group_prices SET price_eur_cents=NULL WHERE product_id=?');
$upsert = $pdo->prepare(dbDriver() === 'pgsql'
    ? 'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,0,?)
       ON CONFLICT (product_id,group_id) DO UPDATE SET price_eur_cents=EXCLUDED.price_eur_cents'
    : 'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,0,?)
       ON DUPLICATE KEY UPDATE price_eur_cents=VALUES(price_eur_cents)');

$pdo->beginTransaction();
try {
    foreach ($source as $sku => $row) {
        if (!isset($products[$sku])) continue;
        $productId = (int) $products[$sku]['id'];
        if (!$row['complete']) {
            $clearPrices->execute([$productId]);
            $updateIncomplete->execute([$row['purchase_price_eur_cents'], $productId]);
            continue;
        }
        foreach ($row['prices'] as $groupName => $price) {
            $upsert->execute([$productId, $groups[$groupName], $price]);
        }
        $updateComplete->execute([$row['purchase_price_eur_cents'], $productId]);
    }
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

$plan['backup'] = basename($backupPath);
$plan['visible_with_three_prices'] = (int) $pdo->query(
    "SELECT COUNT(*) FROM products p WHERE p.active=TRUE AND p.publication_status='visible'
     AND (SELECT COUNT(*) FROM group_prices gp WHERE gp.product_id=p.id AND gp.price_eur_cents IS NOT NULL)=3"
)->fetchColumn();
$plan['draft_after'] = (int) $pdo->query(
    "SELECT COUNT(*) FROM products WHERE active=TRUE AND publication_status='draft'"
)->fetchColumn();
echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;