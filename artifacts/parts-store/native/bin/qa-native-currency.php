<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/commerce.php';

function qaCurrencyAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

assertIsolated();
$pdo = db();
$pdo->beginTransaction();
try {
    $today = gmdate('Y-m-d');
    $pdo->prepare(
        "INSERT INTO exchange_rates(base_currency,quote_currency,rate_ppm,rate_date,fetched_at,source_url)
         VALUES('EUR','CHF',940500,?,UTC_TIMESTAMP(),'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml')
         ON DUPLICATE KEY UPDATE rate_ppm=VALUES(rate_ppm),rate_date=VALUES(rate_date),
          fetched_at=VALUES(fetched_at),source_url=VALUES(source_url)"
    )->execute([$today]);

    $rate = currencyExchangeRate();
    qaCurrencyAssert($rate !== null && $rate['status'] === 'fresh' && $rate['source'] === 'ECB', 'Fresh ECB quote metadata failed.');
    qaCurrencyAssert(currencyConvert(100, 'EUR', 'CHF', $rate) === 94, 'EUR to CHF half-up conversion failed.');
    qaCurrencyAssert(currencyConvert(101, 'EUR', 'CHF', $rate) === 95, 'EUR to CHF unit rounding failed.');
    qaCurrencyAssert(currencyConvert(94, 'CHF', 'EUR', $rate) === 100, 'CHF to EUR conversion failed.');
    qaCurrencyAssert(currencyCountry('ch') === 'CHF' && currencyCountry('DE') === 'EUR', 'Country routing failed.');

    $pdo->prepare('INSERT INTO customer_groups(name) VALUES(?)')->execute(['Currency QA ' . bin2hex(random_bytes(6))]);
    $groupId = (int) $pdo->lastInsertId();
    $sku = 'CURRENCY-QA-' . bin2hex(random_bytes(8));
    $pdo->prepare(
        "INSERT INTO products(sku,name,description,stock,list_price_cents,list_price_eur_cents,purchase_price_eur_cents,active)
         VALUES(?,?,?,10,1234,1000,700,0)"
    )->execute([$sku, 'Currency QA product', 'Synthetic rollback-only fixture']);
    $productId = (int) $pdo->lastInsertId();
    $pdo->prepare(
        'INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,?,?)'
    )->execute([$productId, $groupId, 1111, 900]);
    startSession();
    $_SESSION['currency_country'] = 'DE';
    $product = $pdo->query('SELECT p.*,p.list_price_cents AS `p.list_price_cents`,p.purchase_price_eur_cents AS `p.purchase_price_eur_cents` FROM products p WHERE id=' . $productId)->fetch();
    $customer = ['id' => 1, 'group_id' => $groupId, 'role' => 'customer'];
    $public = productForUser($product, $customer);
    qaCurrencyAssert($public['price_cents'] === 900 && $public['currency'] === 'EUR', 'EUR group precedence failed.');
    foreach (['list_price_cents', 'list_price_eur_cents', 'purchase_price_eur_cents', 'p.list_price_cents', 'p.purchase_price_eur_cents'] as $secret) {
        qaCurrencyAssert(!array_key_exists($secret, $public), 'Confidential price field leaked: ' . $secret);
    }
    qaCurrencyAssert(productForUser($product, null)['price_cents'] === null, 'Guest price masking failed.');
    $pdo->prepare('DELETE FROM group_prices WHERE product_id=? AND group_id=?')->execute([$productId, $groupId]);
    qaCurrencyAssert(priceFor($product, $customer) === 1000, 'Absent group override did not inherit the base EUR price.');

    $quote = [
        'country' => 'DE', 'currency' => 'EUR', 'exchange_rate' => $rate,
        'items' => [['product_id' => $productId, 'quantity' => 2, 'price_cents' => 1000, 'total_cents' => 2000]],
        'subtotal_cents' => 2000, 'shipping_cents' => 500, 'tax_cents' => 203, 'total_cents' => 2703,
    ];
    $accepted = commerceQuoteFingerprint($quote);
    $quote['items'][0]['quantity'] = 3;
    qaCurrencyAssert(!hash_equals($accepted, commerceQuoteFingerprint($quote)), 'Quote quantity drift was not detected.');

    $pdo->prepare(
        "UPDATE exchange_rates SET rate_date=DATE_SUB(UTC_DATE(),INTERVAL 8 DAY)
         WHERE base_currency='EUR' AND quote_currency='CHF'"
    )->execute();
    $stale = currencyExchangeRate();
    qaCurrencyAssert($stale !== null && $stale['status'] === 'stale', 'Stale quote detection failed.');
    try {
        currencyConvert(100, 'EUR', 'CHF', $stale);
        throw new RuntimeException('Stale conversion was accepted.');
    } catch (HttpError $error) {
        qaCurrencyAssert($error->status === 503, 'Stale conversion returned the wrong status.');
    }
    $pdo->rollBack();
    echo "native currency QA: ok\n";
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "native currency QA: failed: {$error->getMessage()}\n");
    exit(1);
}