<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/media.php';

$downloadDirectory = dirname(__DIR__) . '/storage/catalog-downloads';
if (!is_dir($downloadDirectory)) {
    fwrite(STDERR, "Catalog download directory does not exist.\n");
    exit(1);
}

$files = glob($downloadDirectory . '/*.img') ?: [];
natsort($files);
$imported = 0;
$skipped = 0;
$errors = [];

foreach ($files as $file) {
    $name = basename($file);
    if (!preg_match('/^([1-9]\d*)\.img$/D', $name, $match)) {
        $skipped++;
        continue;
    }
    $productId = (int) $match[1];
    try {
        if (mediaImportCatalogImage($productId, $file)) {
            $imported++;
        } else {
            $skipped++;
        }
    } catch (HttpError $error) {
        $errors[] = ['product_id' => $productId, 'error' => $error->getMessage()];
    } catch (Throwable) {
        $errors[] = ['product_id' => $productId, 'error' => 'Unexpected local image processing failure.'];
    }
}

echo json_encode(
    ['imported' => $imported, 'skipped' => $skipped, 'errors' => $errors],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
) . PHP_EOL;
exit($errors === [] ? 0 : 2);