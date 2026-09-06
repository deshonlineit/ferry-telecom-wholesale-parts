<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/lib/ecb-reference.php';

if (in_array('--fetch-only', $argv, true)) {
    try {
        echo json_encode(ecbFetchReference(), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES) . "\n";
        exit(0);
    } catch (Throwable $error) {
        fwrite(STDERR, "ECB fetch failed: " . ($error instanceof EcbReferenceError ? $error->getMessage() : get_class($error)) . "\n");
        exit(1);
    }
}

require_once __DIR__ . '/../src/bootstrap.php';

function synchronizeEcbReference(): void
{
    assertIsolated();
    $lock = fopen(NATIVE_ROOT . '/storage/ecb-sync.lock', 'c');
    if (!$lock) throw new EcbReferenceError('De koersvergrendeling kon niet worden geopend.');
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        return;
    }
    try {
        $rate = ecbFetchReference();
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $existing = $pdo->query("SELECT rate_ppm,rate_date FROM exchange_rates WHERE base_currency='EUR' AND quote_currency='CHF' FOR UPDATE")->fetch();
            if ($existing && $existing['rate_date'] > $rate['rate_date']) {
                $pdo->rollBack();
                echo "ECB: oudere referentie genegeerd; opgeslagen koers behouden.\n";
                return;
            }
            $write = $pdo->prepare("INSERT INTO exchange_rates(base_currency,quote_currency,rate_ppm,rate_date,fetched_at,source_url)
                VALUES('EUR','CHF',?,?,UTC_TIMESTAMP(),?)
                ON DUPLICATE KEY UPDATE rate_ppm=VALUES(rate_ppm),rate_date=VALUES(rate_date),
                    fetched_at=VALUES(fetched_at),source_url=VALUES(source_url)");
            $write->execute([$rate['rate_ppm'], $rate['rate_date'], $rate['source_url']]);
            if (!$existing || (int) $existing['rate_ppm'] !== $rate['rate_ppm'] || $existing['rate_date'] !== $rate['rate_date']) {
                audit('exchange_rate.refresh', 'exchange_rate', 0, [
                    'source' => 'ECB', 'rate_ppm' => $rate['rate_ppm'], 'rate_date' => $rate['rate_date'],
                    'previous_rate_ppm' => $existing ? (int) $existing['rate_ppm'] : null,
                ]);
            }
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
        $initialization = currencyInitializeEurPrices();
        echo json_encode(['source' => 'ECB', 'rate_date' => $rate['rate_date'],
            'rate_ppm' => $rate['rate_ppm'], 'eur_initialization' => $initialization], JSON_THROW_ON_ERROR) . "\n";
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

$watch = in_array('--watch', $argv, true);
do {
    if ($watch) sleep(3600);
    try {
        synchronizeEcbReference();
    } catch (Throwable $error) {
        $message = $error instanceof EcbReferenceError ? $error->getMessage() : get_class($error);
        fwrite(STDERR, "ECB update unavailable; previous reference retained: {$message}\n");
        if (!$watch) exit(1);
    }
} while ($watch);