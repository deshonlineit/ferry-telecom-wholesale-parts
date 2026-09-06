<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/bootstrap.php';

$pdo = db();
if ((int) $pdo->query('SELECT COUNT(*) FROM customer_groups')->fetchColumn() === 0) {
    $pdo->beginTransaction();
    try {
        $pdo->exec("INSERT INTO customer_groups(id,name) VALUES(1,'Repairshop — test'),(2,'Wholesale — test'),(3,'Partner — test')");
        $insert = $pdo->prepare("INSERT INTO users(name,email,password_hash,company,role,group_id,status) VALUES(?,?,?,?,?,?,'active')");
        foreach ([
            ['Demo Repairshop', 'customer@test.invalid', 'Demo Repairshop', 'customer', 1],
            ['Demo Medewerker', 'staff@test.invalid', 'Ferry Telecom Test', 'staff', 1],
            ['Demo Partner', 'partner@test.invalid', 'Demo Partner', 'customer', 3],
        ] as [$name, $email, $company, $role, $group]) {
            $insert->execute([$name, $email, password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT), $company, $role, $group]);
            $id = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO addresses(user_id,label,name,company,line1,line2,postal_code,city,country,is_default) VALUES(?,?,?,?,?,?,?,?,?,1)')
                ->execute([$id, 'Testadres', $name, $company, 'Voorbeeldstraat 1', '', '8000', 'Zürich', 'CH']);
        }
        $insert = $pdo->prepare('INSERT INTO settings(name,value) VALUES(?,?)');
        foreach (['currency' => 'CHF', 'tax_bps' => '810', 'shipping_cents' => '950', 'free_shipping_cents' => '25000', 'low_stock_threshold' => '5', 'seed_version' => '1'] as $name => $value) {
            $insert->execute([$name, $value]);
        }
        $insert = $pdo->prepare('INSERT INTO buyback_items(model,grade,price_cents) VALUES(?,?,?)');
        foreach (['iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 16 Pro', 'Samsung Galaxy S24'] as $index => $model) {
            $insert->execute([$model, 'Werkende OLED, gebroken glas — test', 1200 + $index * 650]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }
}
$staffPassword = getenv('NATIVE_STAFF_PASSWORD');
if (is_string($staffPassword) && $staffPassword !== '') {
    if (strlen($staffPassword) < 12) {
        throw new RuntimeException('The staff password must have at least 12 characters.');
    }
    $query = $pdo->query("SELECT id,password_hash FROM users WHERE email='staff@test.invalid'");
    $staff = $query->fetch();
    if ($staff && !password_verify($staffPassword, $staff['password_hash'])) {
        $pdo->prepare('UPDATE users SET password_hash=? WHERE id=?')
            ->execute([password_hash($staffPassword, PASSWORD_DEFAULT), $staff['id']]);
    }
}
unset($staffPassword);
if ((int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn() > 0) {
    echo "Existing isolated catalog retained.\n";
    exit;
}
$files = glob(WORKSPACE_ROOT . '/attached_assets/0_product_export_2026-07-30*.csv');
if (!$files) {
    throw new RuntimeException('The offline product export is missing.');
}
$handle = fopen($files[0], 'r');
$headers = fgetcsv($handle, 0, ',', '"', '');
$headers[0] = ltrim($headers[0], "\xEF\xBB\xBF");
$categories = [
    'screens' => 'Displays & touchscreens', 'batteries' => 'Batterijen', 'charging' => 'Laadpoorten',
    'cameras' => "Camera's", 'housing' => 'Behuizing & achterglas', 'flex' => 'Flexkabels & knoppen',
    'audio' => 'Speakers & audio', 'adhesive' => 'Adhesive & afdichting', 'tools' => 'Reparatiegereedschap',
    'protection' => 'Hoesjes & bescherming', 'accessories' => 'Kabels & accessoires', 'other' => 'Overige onderdelen',
];
$pdo->beginTransaction();
$categoryIds = [];
$brandIds = [];
$modelIds = [];
$count = 0;
$imagesToFetch = [];
$insertProduct = $pdo->prepare('INSERT INTO products(sku,name,description,category_id,brand_id,quality,stock,list_price_cents,featured) VALUES(?,?,?,?,?,?,?,?,?)');
$insertPrice = $pdo->prepare('INSERT INTO group_prices(product_id,group_id,price_cents) VALUES(?,?,?)');
$insertLink = $pdo->prepare('INSERT IGNORE INTO product_models(product_id,model_id) VALUES(?,?)');
try {
    foreach ($categories as $slug => $name) {
        $pdo->prepare('INSERT INTO categories(name,slug) VALUES(?,?)')->execute([$name, $slug]);
        $categoryIds[$slug] = (int) $pdo->lastInsertId();
    }
    foreach (['Apple', 'Samsung', 'Google', 'Huawei', 'Xiaomi', 'OnePlus', 'Oppo', 'Motorola', 'Nokia', 'Sony', 'Universal'] as $brand) {
        $pdo->prepare('INSERT INTO brands(name) VALUES(?)')->execute([$brand]);
        $brandIds[$brand] = (int) $pdo->lastInsertId();
    }
    while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
        $values = array_slice(array_pad($values, count($headers), ''), 0, count($headers));
        $row = array_combine($headers, $values);
        $sku = trim($row['sku'] ?? '');
        $eligible = (float) str_replace(',', '.', $row['meta:BigRepairShopCustomerAccount_wholesale_price'] ?? '0') > 0;
        if (($row['post_status'] ?? '') !== 'publish' || !$sku || !$eligible) {
            continue;
        }
        $name = html_entity_decode(strip_tags($row['post_title'] ?? ''), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $lower = mb_strtolower($name);
        $brand = 'Universal';
        foreach (['Apple' => '/iphone|ipad|apple|macbook|airpod|imac|iwatch/i', 'Samsung' => '/samsung|galaxy/i', 'Google' => '/pixel|google/i', 'Huawei' => '/huawei|honor/i', 'Xiaomi' => '/xiaomi|redmi|poco/i', 'OnePlus' => '/oneplus/i', 'Oppo' => '/oppo/i', 'Motorola' => '/motorola/i', 'Nokia' => '/nokia/i', 'Sony' => '/sony|xperia/i'] as $candidate => $pattern) {
            if (preg_match($pattern, $name)) {
                $brand = $candidate;
                break;
            }
        }
        $category = 'other';
        foreach ([
            'adhesive' => '/adhesive|sticker|seal|glue|tape/i',
            'tools' => '/screwdriver|tweezer|solder|pry|opening tool|repair tool|mat\b|pliers|multimeter/i',
            'protection' => '/tempered|protector|case\b|cover with|leather|silicone case/i',
            'housing' => '/back glass|back cover|housing|middle frame|rear cover/i',
            'screens' => '/lcd|oled|display|digitizer|touchscreen|screen assembly/i',
            'batteries' => '/battery|batteries/i',
            'charging' => '/charging port|dock connector|charging flex|usb connector/i',
            'cameras' => '/camera/i',
            'audio' => '/speaker|microphone|earpiece|buzzer/i',
            'flex' => '/flex|button|sensor/i',
            'accessories' => '/cable|charger|adapter|headset|earphone|power bank|wireless charging/i',
        ] as $candidate => $pattern) {
            if (preg_match($pattern, $name)) {
                $category = $candidate;
                break;
            }
        }
        $quality = trim($row['attribute:pa_quality'] ?? $row['attribute:Quality'] ?? '');
        if (!$quality) {
            preg_match('/\b(Service Pack|Refurbished|Original|OEM|Premium|Aftermarket|Incell|Soft OLED|Hard OLED)\b/i', $name, $qualityMatch);
            $quality = $qualityMatch[1] ?? 'Standaard';
        }
        $stock = max(0, min(100000, (int) ($row['stock'] ?? 0)));
        $price = match ($category) {
            'screens' => 1900 + (crc32($sku) % 17000),
            'batteries' => 900 + (crc32($sku) % 3900),
            'tools' => 500 + (crc32($sku) % 8500),
            default => 250 + (crc32($sku) % 4900),
        };
        $description = trim(html_entity_decode(strip_tags($row['post_excerpt'] ?: ($row['post_content'] ?? '')), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $description = mb_substr(preg_replace('/\s+/u', ' ', $description), 0, 5000);
        if (!$description) {
            $description = $name . '. Productgegevens uit de offline catalogusexport. Controleer model en kwaliteit vóór gebruik.';
        }
        $featured = $stock > 0 && preg_match('/iphone (14|15|16|17)|galaxy s2[3456]/i', $name) && in_array($category, ['screens', 'batteries', 'cameras', 'charging'], true);
        $insertProduct->execute([$sku, mb_substr($name, 0, 500), $description, $categoryIds[$category], $brandIds[$brand], mb_substr($quality, 0, 100), $stock, $price, (int) $featured]);
        $id = (int) $pdo->lastInsertId();
        foreach ([1 => 1.0, 2 => 0.93, 3 => 0.88] as $group => $factor) {
            $insertPrice->execute([$id, $group, (int) round($price * $factor)]);
        }
        $tags = preg_split('/[|,]/', $row['tax:product_tag'] ?? '');
        foreach ($tags as $tag) {
            $tag = trim(html_entity_decode(strip_tags($tag), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
            if (!$tag || mb_strlen($tag) > 150 || !preg_match('/iphone|ipad|apple watch|macbook|galaxy|samsung|pixel|huawei|xiaomi|redmi|oneplus|oppo|nokia|motorola|xperia/i', $tag)) {
                continue;
            }
            $modelKey = $brand . ':' . $tag;
            if (!isset($modelIds[$modelKey])) {
                $pdo->prepare('INSERT INTO device_models(brand_id,name) VALUES(?,?)')->execute([$brandIds[$brand], $tag]);
                $modelIds[$modelKey] = (int) $pdo->lastInsertId();
            }
            $insertLink->execute([$id, $modelIds[$modelKey]]);
        }
        $imageUrl = explode('!', $row['images'] ?? '')[0];
        $imageUrl = preg_replace('#^http://#', 'https://', trim($imageUrl));
        if (preg_match('#^https://(?:www\.)?ferrytelecom\.com/wp-content/uploads/#i', $imageUrl)) {
            $imagesToFetch[] = ['id' => $id, 'sku' => $sku, 'url' => $imageUrl, 'category' => $category];
        }
        $count++;
    }
    fclose($handle);
    $pdo->commit();
    if (!is_dir(NATIVE_ROOT . '/storage')) {
        mkdir(NATIVE_ROOT . '/storage', 0700, true);
    }
    file_put_contents(NATIVE_ROOT . '/storage/image-import-manifest.json', json_encode($imagesToFetch, JSON_THROW_ON_ERROR));
    echo "Imported {$count} offline catalog products; synthetic test prices; " . count($modelIds) . " source-tag models.\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fclose($handle);
    throw $error;
}