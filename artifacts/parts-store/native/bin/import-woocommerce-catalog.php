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
    throw new RuntimeException('Usage: php bin/import-woocommerce-catalog.php <export.csv> [--apply]');
}

function wcMoney(string $value): ?int
{
    $value = trim(str_replace(',', '.', $value));
    if ($value === '' || !is_numeric($value)) return null;
    $cents = max(0, (int) round((float) $value * 100));
    return $cents > 1 ? $cents : null;
}

function wcQuality(string $name): string
{
    if (preg_match('/\b(Service Pack|Refurbished|Original|OEM|Premium|Aftermarket|Incell|Soft OLED|Hard OLED|Pulled)\b/i', $name, $match)) {
        return ucwords(strtolower($match[1]));
    }
    if (preg_match('/\bcompatible\b/i', $name)) {
        return 'Compatible';
    }
    return 'Standard';
}

function wcCategorySlug(string $categories, string $name): string
{
    $text = mb_strtolower($categories . ' ' . $name, 'UTF-8');
    $rules = [
        'screens' => '/\b(oled|lcd|display|touchscreen|screen|digitizer)\b/u',
        'batteries' => '/\b(battery|batteries|batterij|accu)\b/u',
        'charging' => '/\b(charging port|charge port|dock connector|laadpoort)\b/u',
        'cameras' => '/\b(camera|camera lens)\b/u',
        'housing' => '/\b(housing|back glass|back cover|chassis|middle frame|battery cover)\b/u',
        'audio' => '/\b(speaker|earpiece|microphone|audio)\b/u',
        'adhesive' => '/\b(adhesive|sticker|seal|tape|glue)\b/u',
        'tools' => '/\b(tool|tools|screwdriver|tweezer|pliers|solder)\b/u',
        'protection' => '/\b(case|cover|protector|tempered glass)\b/u',
        'flex' => '/\b(flex|button|vibrator|vibration|sim tray|antenna)\b/u',
        'accessories' => '/\b(cable|adapter|charger|holder|stand|accessor)\b/u',
    ];
    foreach ($rules as $slug => $pattern) {
        if (preg_match($pattern, $text)) {
            return $slug;
        }
    }
    return 'other';
}

function wcBrandName(string $source, string $categories, string $name): string
{
    $source = trim(explode(',', $source, 2)[0]);
    if ($source !== '') {
        return $source;
    }
    $text = mb_strtolower($categories . ' ' . $name, 'UTF-8');
    $known = [
        'Apple' => ['iphone', 'ipad', 'apple watch', 'macbook', 'imac', 'airpods'],
        'Samsung' => ['samsung', 'galaxy'],
        'Google' => ['google', 'pixel'],
        'Huawei' => ['huawei', 'honor'],
        'Xiaomi' => ['xiaomi', 'redmi', 'poco'],
        'OnePlus' => ['oneplus'],
        'Oppo' => ['oppo'],
        'Motorola' => ['motorola', 'moto '],
        'Nokia' => ['nokia'],
        'Sony' => ['sony', 'xperia'],
    ];
    foreach ($known as $brand => $needles) {
        foreach ($needles as $needle) {
            if (str_contains($text, $needle)) {
                return $brand;
            }
        }
    }
    return 'Universal';
}

$handle = fopen($csvPath, 'rb');
$headers = $handle ? fgetcsv($handle, 0, ',', '"', '') : false;
if (!is_array($headers)) {
    throw new RuntimeException('The WooCommerce export cannot be read.');
}
$headers[0] = ltrim((string) $headers[0], "\xEF\xBB\xBF");
$rows = [];
$seen = [];
while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    $values = array_slice(array_pad($values, count($headers), ''), 0, count($headers));
    $row = array_combine($headers, $values);
    if ($row === false || trim((string) ($row['Published'] ?? '')) !== '1') {
        continue;
    }
    $sku = trim((string) ($row['SKU'] ?? ''));
    $name = trim((string) ($row['Name'] ?? ''));
    if ($sku === '' || $name === '' || isset($seen[$sku])) {
        throw new RuntimeException('Published rows must have unique, non-empty SKU and name values.');
    }
    $seen[$sku] = true;
    $stockText = trim((string) ($row['Stock'] ?? ''));
    $stock = $stockText !== '' && is_numeric($stockText) ? max(0, (int) round((float) $stockText)) : 0;
    $description = trim((string) (($row['Description'] ?? '') ?: ($row['Short description'] ?? '')));
    $minimum = 1;
    foreach ([
        'Meta: wholesale_customer_wholesale_minimum_order_quantity',
        'Meta: SmallRepairShopCustomerAccount_wholesale_minimum_order_quantity',
        'Meta: BigRepairShopCustomerAccount_wholesale_minimum_order_quantity',
    ] as $field) {
        $candidate = trim((string) ($row[$field] ?? ''));
        if ($candidate !== '' && ctype_digit($candidate)) {
            $minimum = max($minimum, (int) $candidate);
        }
    }
    $rows[$sku] = [
        'name' => $name,
        'description' => $description,
        'stock' => $stock,
        'price' => wcMoney((string) ($row['Regular price'] ?? '')),
        'minimum' => $minimum,
        'category_slug' => wcCategorySlug((string) ($row['Categories'] ?? ''), $name),
        'brand_name' => wcBrandName((string) ($row['Brands'] ?? ''), (string) ($row['Categories'] ?? ''), $name),
        'quality' => wcQuality($name),
    ];
}
fclose($handle);

$pdo = db();
$existing = [];
foreach ($pdo->query('SELECT id,sku FROM products ORDER BY id') as $row) {
    $existing[(string) $row['sku']] = (int) $row['id'];
}
$created = count(array_diff_key($rows, $existing));
$updated = count(array_intersect_key($rows, $existing));
$deactivated = count(array_diff_key($existing, $rows));
$plan = [
    'mode' => $apply ? 'apply' : 'preview',
    'source_sha256' => hash_file('sha256', $csvPath),
    'published_rows' => count($rows),
    'create' => $created,
    'update' => $updated,
    'deactivate_not_published' => $deactivated,
];
if (!$apply) {
    echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
    exit;
}

$storage = dirname(__DIR__) . '/storage';
if (!is_dir($storage) && !mkdir($storage, 0700, true) && !is_dir($storage)) {
    throw new RuntimeException('Cannot create protected storage.');
}
$backup = [
    'created_at_utc' => gmdate(DATE_ATOM),
    'source_sha256' => $plan['source_sha256'],
    'products' => $pdo->query('SELECT * FROM products ORDER BY id')->fetchAll(PDO::FETCH_ASSOC),
];
$backupPath = $storage . '/catalog-before-wc-import-' . gmdate('Ymd-His') . '.json';
file_put_contents($backupPath, json_encode($backup, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR), LOCK_EX);

$categories = [];
foreach ($pdo->query('SELECT id,slug FROM categories') as $row) {
    $categories[(string) $row['slug']] = (int) $row['id'];
}
$brands = [];
foreach ($pdo->query('SELECT id,name FROM brands') as $row) {
    $brands[mb_strtolower((string) $row['name'], 'UTF-8')] = (int) $row['id'];
}

$pdo->beginTransaction();
try {
    $createBrand = $pdo->prepare('INSERT INTO brands(name) VALUES(?)');
    foreach (array_unique(array_column($rows, 'brand_name')) as $brandName) {
        $key = mb_strtolower($brandName, 'UTF-8');
        if (!isset($brands[$key])) {
            $createBrand->execute([$brandName]);
            $brands[$key] = (int) $pdo->lastInsertId();
        }
    }
    $insert = $pdo->prepare(
        'INSERT INTO products
         (sku,name,description,category_id,brand_id,quality,stock,list_price_cents,list_price_eur_cents,minimum_quantity,active)
         VALUES(?,?,?,?,?,?,?,?,?,?,1)'
    );
    $update = $pdo->prepare(
        'UPDATE products SET name=?,description=?,stock=?,list_price_eur_cents=COALESCE(?,list_price_eur_cents),
         minimum_quantity=?,active=1,pricing_version=pricing_version+1 WHERE id=?'
    );
    foreach ($rows as $sku => $row) {
        $price = $row['price'];
        if (isset($existing[$sku])) {
            $update->execute([$row['name'], $row['description'], $row['stock'], $price, $row['minimum'], $existing[$sku]]);
        } else {
            $insert->execute([
                $sku,
                $row['name'],
                $row['description'],
                $categories[$row['category_slug']] ?? $categories['other'],
                $brands[mb_strtolower($row['brand_name'], 'UTF-8')],
                $row['quality'],
                $row['stock'],
                $price ?? 0,
                $price,
                $row['minimum'],
            ]);
        }
    }
    if ($rows) {
        $marks = implode(',', array_fill(0, count($rows), '?'));
        $deactivate = $pdo->prepare("UPDATE products SET active=0 WHERE sku NOT IN ($marks)");
        $deactivate->execute(array_keys($rows));
    }
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $error;
}

$plan['backup'] = basename($backupPath);
$plan['active_after'] = (int) $pdo->query('SELECT COUNT(*) FROM products WHERE active=1')->fetchColumn();
$plan['products_after'] = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
$plan['stock_after'] = (int) $pdo->query('SELECT COALESCE(SUM(stock),0) FROM products WHERE active=1')->fetchColumn();
$reportPath = $storage . '/catalog-wc-import-report.json';
file_put_contents($reportPath, json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL, LOCK_EX);
echo json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;