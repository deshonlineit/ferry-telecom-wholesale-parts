<?php
declare(strict_types=1);

require __DIR__ . '/../src/bootstrap.php';

$pdo = db();
$manufacturerRules = [
    'Joyroom' => static fn(string $sku, string $name): bool =>
        str_starts_with(strtoupper($sku), 'JRP') || preg_match('/^joyroom\b/i', $name) === 1,
    'PanzerGlass' => static fn(string $sku, string $name): bool =>
        str_starts_with(strtoupper($sku), 'PANZ') || preg_match('/^panzerglass\b/i', $name) === 1,
    'Dosdude1' => static fn(string $sku, string $name): bool =>
        preg_match('/^dosdude1\b/i', $name) === 1,
    'UGREEN' => static fn(string $sku, string $name): bool =>
        preg_match('/^ugreen\b/i', $name) === 1,
    'Dux Ducis' => static fn(string $sku, string $name): bool =>
        preg_match('/^dux(?:\s+ducis)?\b/i', $name) === 1,
    'OROBO' => static fn(string $sku, string $name): bool =>
        preg_match('/^orobo\b/i', $name) === 1,
];
$deviceBrands = ['apple', 'samsung', 'google', 'huawei', 'honor', 'xiaomi', 'oneplus', 'oppo', 'motorola', 'nokia', 'sony'];

$pdo->beginTransaction();
try {
    $brandIds = [];
    foreach ($pdo->query('SELECT id,name FROM brands') as $brand) {
        $brandIds[mb_strtolower((string)$brand['name'])] = (int)$brand['id'];
    }
    $insertBrand = $pdo->prepare('INSERT INTO brands(name) VALUES(?)');
    foreach (array_merge(['Universal'], array_keys($manufacturerRules)) as $brandName) {
        $key = mb_strtolower($brandName);
        if (!isset($brandIds[$key])) {
            $insertBrand->execute([$brandName]);
            $brandIds[$key] = (int)$pdo->lastInsertId();
        }
    }

    $updates = [];
    $products = $pdo->query(
        'SELECT p.id,p.sku,p.name,p.brand_id,b.name brand_name
         FROM products p JOIN brands b ON b.id=p.brand_id'
    );
    foreach ($products as $product) {
        $sku = (string)$product['sku'];
        $name = (string)$product['name'];
        $currentBrand = (string)$product['brand_name'];
        $targetBrand = null;
        foreach ($manufacturerRules as $brandName => $matches) {
            if ($matches($sku, $name)) {
                $targetBrand = $brandName;
                break;
            }
        }
        if ($targetBrand === null && in_array(mb_strtolower($currentBrand), $deviceBrands, true)) {
            $quoted = preg_quote($currentBrand, '/');
            $explicitOriginal = preg_match(
                '/^(?:genuine\s+|original\s+)?' . $quoted . '\b|(?:\s[-–]\s' . $quoted . ')$/i',
                $name
            ) === 1;
            $targetBrand = $explicitOriginal ? $currentBrand : 'Universal';
        }
        if ($targetBrand !== null && (int)$product['brand_id'] !== $brandIds[mb_strtolower($targetBrand)]) {
            $updates[(int)$product['id']] = $brandIds[mb_strtolower($targetBrand)];
        }
    }
    $update = $pdo->prepare('UPDATE products SET brand_id=? WHERE id=?');
    foreach ($updates as $productId => $brandId) {
        $update->execute([$brandId, $productId]);
    }
    $pdo->commit();
    echo 'Manufacturer reconciliation: ' . count($updates)
        . " product(s) corrected from explicit maker evidence; compatibility links retained.\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}