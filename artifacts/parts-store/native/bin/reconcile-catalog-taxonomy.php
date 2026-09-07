<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';

$pdo = db();
$categoryRows = $pdo->query('SELECT id,slug FROM categories')->fetchAll();
$categoryIds = array_column($categoryRows, 'id', 'slug');

$moves = [
    'charging' => ['IPA012', 'IPA013', 'IPA3010', 'IPA3016', 'IPA105034'],
    'cameras' => ['IPHXR46'],
    'flex' => ['IPA129038', 'IPA129021', 'IPAM4034'],
    'audio' => ['IPH11029', 'IPH11P18', 'IPH11PM13', 'IPH1211', 'IPHX030', 'IPHXR50', 'IPHXS025', 'IPHXSM0023'],
    'protection' => ['ZMA103'],
];

$update = $pdo->prepare('UPDATE products SET category_id=? WHERE sku=? AND category_id<>?');
$verify = $pdo->prepare('SELECT COUNT(*) FROM products WHERE sku=? AND category_id<>?');
$moved = 0;

$pdo->beginTransaction();
try {
    foreach ($moves as $slug => $skus) {
        if (!isset($categoryIds[$slug])) {
            throw new RuntimeException("Missing catalogue category: $slug");
        }
        $categoryId = (int) $categoryIds[$slug];
        foreach ($skus as $sku) {
            $update->execute([$categoryId, $sku, $categoryId]);
            $moved += $update->rowCount();
            $verify->execute([$sku, $categoryId]);
            if ((int) $verify->fetchColumn() !== 0) {
                throw new RuntimeException("Catalogue taxonomy reconciliation failed for SKU $sku");
            }
        }
    }
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    throw $error;
}

printf("Catalog taxonomy reconciled: %d product moves.\n", $moved);