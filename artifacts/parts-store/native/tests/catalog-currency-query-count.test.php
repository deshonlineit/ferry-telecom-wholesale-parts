<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/catalog-search.php';

function catalogCurrencyQueryAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$pdo = db();
$pdo->beginTransaction();

try {
    $suffix = bin2hex(random_bytes(6));
    $categorySlug = 'qa-currency-count-' . $suffix;
    $insertCategory = $pdo->prepare('INSERT INTO categories(name,slug) VALUES(?,?)');
    $insertCategory->execute(['QA currency query count', $categorySlug]);
    $categoryId = (int) $pdo->lastInsertId();

    $insertProduct = $pdo->prepare(
        "INSERT INTO products
         (sku,name,description,category_id,quality,stock,list_price_eur_cents,featured,active,publication_status)
         VALUES(?,?,?,?,?,?,?,?,1,'visible')"
    );
    for ($index = 1; $index <= 3; ++$index) {
        $insertProduct->execute([
            "QA-CURRENCY-COUNT-$suffix-$index",
            "QA currency query count $index",
            'Transaction-only exchange-rate query fixture',
            $categoryId,
            'QA',
            5,
            1000 + $index,
            0,
        ]);
    }

    $exchangeRateQueries = 0;
    $productMetadataQueries = 0;
    $GLOBALS['currency_exchange_rate_query_observer'] =
        static function () use (&$exchangeRateQueries): void {
            ++$exchangeRateQueries;
        };
    $GLOBALS['catalog_product_metadata_query_observer'] =
        static function () use (&$productMetadataQueries): void {
            ++$productMetadataQueries;
        };

    $result = catalogProductList([
        'category' => $categoryId,
        'sort' => 'name',
        'limit' => 10,
    ], null);

    catalogCurrencyQueryAssert(
        count($result['products']) === 3,
        'The synthetic catalogue page must contain all three products.'
    );
    catalogCurrencyQueryAssert(
        $exchangeRateQueries === 1,
        "A multi-product catalogue request queried the exchange rate $exchangeRateQueries times instead of once."
    );
    catalogCurrencyQueryAssert(
        $productMetadataQueries === 0,
        "Product enrichment repeated the brand/category query $productMetadataQueries times."
    );
    catalogCurrencyQueryAssert(
        array_reduce(
            $result['products'],
            static fn(bool $valid, array $product): bool =>
                $valid
                && ($product['category_name'] ?? null) === 'QA currency query count'
                && array_key_exists('brand_name', $product)
                && !array_key_exists('_brand_name', $product)
                && !array_key_exists('_category_name', $product),
            true
        ),
        'Main-query product metadata was not preserved cleanly during enrichment.'
    );

    echo "catalogue query count test passed\n";
} finally {
    unset($GLOBALS['currency_exchange_rate_query_observer']);
    unset($GLOBALS['catalog_product_metadata_query_observer']);
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}