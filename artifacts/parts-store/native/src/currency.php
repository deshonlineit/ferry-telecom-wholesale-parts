<?php
declare(strict_types=1);

const CURRENCY_BASE = 'EUR';
const CURRENCY_RATE_MAX_AGE_DAYS = 7;

function currencyExchangeRate(): ?array
{
    $statement = db()->prepare(
        "SELECT rate_ppm,rate_date,fetched_at,source_url
         FROM exchange_rates WHERE base_currency='EUR' AND quote_currency='CHF'"
    );
    $statement->execute();
    $row = $statement->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return null;
    }
    $ppm = (int) $row['rate_ppm'];
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', (string) $row['rate_date'], new DateTimeZone('UTC'));
    $today = new DateTimeImmutable('today', new DateTimeZone('UTC'));
    $fresh = $ppm > 0 && $date instanceof DateTimeImmutable
        && $date <= $today && $date >= $today->sub(new DateInterval('P' . CURRENCY_RATE_MAX_AGE_DAYS . 'D'));
    return [
        'source' => 'ECB',
        'base_currency' => CURRENCY_BASE,
        'quote_currency' => 'CHF',
        'rate_ppm' => $ppm,
        'rate' => $ppm / 1000000,
        'rate_date' => (string) $row['rate_date'],
        'fetched_at' => (string) $row['fetched_at'],
        'source_url' => (string) $row['source_url'],
        'status' => $fresh ? 'fresh' : 'stale',
    ];
}

function currencyCountry(string $country): string
{
    $country = strtoupper(trim($country));
    if (!preg_match('/^[A-Z]{2}$/', $country)) {
        throw new HttpError(422, 'Country must be a two-letter code.');
    }
    return $country === 'CH' ? 'CHF' : 'EUR';
}

/**
 * We only deliver inside Europe. This list is the source for the country field on
 * the address forms (public/assets/buyer-currency.js) and must stay in step with
 * it; bin/qa-delivery-countries.cjs guards against the two drifting apart.
 */
function currencyDeliveryCountries(): array
{
    return ['AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI',
        'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD',
        'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'UA',
        'VA', 'XK'];
}

function currencyDeliveryCountry(string $country): string
{
    $country = strtoupper(trim($country));
    if (!preg_match('/^[A-Z]{2}$/', $country)) {
        throw new HttpError(422, 'Country must be a two-letter code.');
    }
    if (!in_array($country, currencyDeliveryCountries(), true)) {
        throw new HttpError(422, 'We only deliver within Europe.');
    }
    return $country;
}

function currencyContext(?string $country = null): array
{
    startSession();
    if ($country === null) {
        $session = isset($_SESSION['currency_country'])
            ? strtoupper(trim((string) $_SESSION['currency_country']))
            : null;
        $user = currentUser();
        if ($user) {
            // The address book is the only place a customer can pick a delivery
            // country, so the cached session value may only survive while it
            // still matches one of their own addresses. Anything else (a stale
            // value, a one-off address typed at checkout) falls back to the
            // default address, which is what the order will be billed against.
            $statement = db()->prepare(
                'SELECT country FROM addresses WHERE user_id=? ORDER BY is_default DESC,id ASC'
            );
            $statement->execute([(int) $user['id']]);
            $owned = array_map(
                static fn($value): string => strtoupper(trim((string) $value)),
                $statement->fetchAll(PDO::FETCH_COLUMN)
            );
            $country = $session !== null && in_array($session, $owned, true)
                ? $session
                : ($owned[0] ?? null);
        } else {
            $country = $session;
        }
    }
    $country = strtoupper(trim($country ?? 'CH'));
    $currency = currencyCountry($country);
    $rate = currencyExchangeRate();
    // Catalogue completeness is not a commerce-wide readiness condition:
    // individual products without an assigned EUR price remain unorderable,
    // while correctly priced products and empty carts must keep working.
    $pricingReady = true;
    return [
        'country' => $country,
        'currency' => $currency,
        'base_currency' => CURRENCY_BASE,
        'exchange_rate' => $rate,
        'pricing_ready' => $pricingReady,
    ];
}

function currencyConvert(int $cents, string $from, string $to, ?array $rate = null): int
{
    $from = strtoupper($from);
    $to = strtoupper($to);
    if ($cents < 0 || !in_array($from, ['EUR', 'CHF'], true) || !in_array($to, ['EUR', 'CHF'], true)) {
        throw new InvalidArgumentException('Only non-negative EUR/CHF amounts can be converted.');
    }
    if ($from === $to) {
        return $cents;
    }
    $rate ??= currencyExchangeRate();
    if (!$rate || ($rate['status'] ?? null) !== 'fresh' || (int) ($rate['rate_ppm'] ?? 0) <= 0) {
        throw new HttpError(503, 'The EUR/CHF exchange rate is unavailable or stale.');
    }
    $ppm = (int) $rate['rate_ppm'];
    return $from === 'EUR'
        ? intdiv(($cents * $ppm) + 500000, 1000000)
        : intdiv(($cents * 1000000) + intdiv($ppm, 2), $ppm);
}

function currencyInitializeEurPrices(): array
{
    $pdo = db();
    $rate = currencyExchangeRate();
    if (!$rate || ($rate['status'] ?? null) !== 'fresh' || (int) ($rate['rate_ppm'] ?? 0) <= 0) {
        throw new RuntimeException('A valid stored EUR/CHF quote is required for initialization.');
    }
    $ppm = (int) $rate['rate_ppm'];
    try {
        $pdo->beginTransaction();
        $marker = $pdo->prepare("SELECT value FROM settings WHERE name='eur_price_initialization_rate_ppm' FOR UPDATE");
        $marker->execute();
        $stored = $marker->fetchColumn();
        if ($stored !== false) {
            $ppm = (int) $stored;
            $dateStatement = $pdo->prepare("SELECT value FROM settings WHERE name='eur_price_initialization_rate_date'");
            $dateStatement->execute();
            $rateDate = (string) ($dateStatement->fetchColumn() ?: $rate['rate_date']);
            $pdo->commit();
            return [
                'rate_ppm' => $ppm, 'rate_date' => $rateDate,
                'products_initialized' => 0, 'groups_initialized' => 0,
                'shipping_settings_initialized' => 0, 'already_initialized' => true,
            ];
        } else {
            $rateDate = (string) $rate['rate_date'];
            $insertSetting = $pdo->prepare('INSERT INTO settings(name,value) VALUES(?,?)');
            $insertSetting->execute(['eur_price_initialization_rate_ppm', (string) $ppm]);
            $insertSetting->execute(['eur_price_initialization_rate_date', $rateDate]);
        }
        $products = $pdo->prepare(
            'UPDATE products SET list_price_eur_cents=FLOOR((list_price_cents*1000000+? DIV 2)/?)
             WHERE list_price_eur_cents IS NULL'
        );
        $products->execute([$ppm, $ppm]);
        $productCount = $products->rowCount();
        $groups = $pdo->prepare(
            'UPDATE group_prices SET price_eur_cents=FLOOR((price_cents*1000000+? DIV 2)/?)
             WHERE price_eur_cents IS NULL'
        );
        $groups->execute([$ppm, $ppm]);
        $groupCount = $groups->rowCount();
        $shippingCount = 0;
        $existingSettings = settings();
        foreach (['shipping_cents' => 'shipping_eur_cents', 'free_shipping_cents' => 'free_shipping_eur_cents'] as $legacy => $eur) {
            if (!isset($existingSettings[$legacy]) || !preg_match('/^[0-9]+$/D', $existingSettings[$legacy])) {
                continue;
            }
            $statement = $pdo->prepare(
                'INSERT INTO settings(name,value) VALUES(?,?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name)'
            );
            $converted = currencyConvert((int) $existingSettings[$legacy], 'CHF', 'EUR', $rate);
            $statement->execute([$eur, (string) $converted]);
            $shippingCount += $statement->rowCount();
        }
        if ($productCount || $groupCount || $shippingCount || $stored === false) {
            audit('currency.eur_initialized', 'exchange_rate', 0, [
                'rate_ppm' => $ppm, 'rate_date' => $rateDate,
                'products' => $productCount, 'groups' => $groupCount, 'shipping_settings' => $shippingCount,
            ]);
        }
        $pdo->commit();
        return [
            'rate_ppm' => $ppm, 'rate_date' => $rateDate,
            'products_initialized' => $productCount, 'groups_initialized' => $groupCount,
            'shipping_settings_initialized' => $shippingCount,
        ];
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $error;
    }
}