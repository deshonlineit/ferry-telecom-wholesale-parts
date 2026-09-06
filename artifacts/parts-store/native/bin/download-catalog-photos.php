<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

const PHOTO_MAX_BYTES = 15_000_000;
const PHOTO_CONCURRENCY = 4;

$nativeRoot = dirname(__DIR__);
require_once $nativeRoot . '/src/catalog-photo-source.php';
$manifestPath = $nativeRoot . '/storage/catalog-photo-import-manifest.json';
$manifest = json_decode((string) @file_get_contents($manifestPath), true, 64, JSON_THROW_ON_ERROR);
$items = $manifest['items'] ?? null;
if (!is_array($items)) {
    throw new RuntimeException('Run prepare-catalog-photo-import.php first.');
}
if (!extension_loaded('curl') || !extension_loaded('fileinfo')) {
    throw new RuntimeException('PHP curl and fileinfo are required.');
}

$downloadDir = $nativeRoot . '/storage/catalog-downloads';
$cacheDir = $nativeRoot . '/storage/catalog-photo-cache';
foreach ([$downloadDir, $cacheDir] as $directory) {
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        throw new RuntimeException('Catalog photo storage could not be created.');
    }
}

function verifyCatalogDownload(string $path): ?array
{
    if (!is_file($path) || ($size = filesize($path)) === false || $size < 1 || $size > PHOTO_MAX_BYTES) {
        return null;
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        return null;
    }
    $dimensions = @getimagesize($path);
    $width = (int) ($dimensions[0] ?? 0);
    $height = (int) ($dimensions[1] ?? 0);
    if ($width < 1 || $height < 1 || $height > intdiv(20_000_000, $width)) {
        return null;
    }
    return ['bytes' => $size, 'mime' => $mime, 'width' => $width, 'height' => $height];
}

function normalizeCatalogDownload(string $path): bool
{
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($path);
    if ($mime !== 'image/avif') {
        return verifyCatalogDownload($path) !== null;
    }
    if (!function_exists('imagecreatefromavif') || !function_exists('imagepng')) {
        return false;
    }
    $dimensions = @getimagesize($path);
    $width = (int) ($dimensions[0] ?? 0);
    $height = (int) ($dimensions[1] ?? 0);
    if ($width < 1 || $height < 1 || $height > intdiv(20_000_000, $width)) {
        return false;
    }
    $image = @imagecreatefromavif($path);
    if (!$image instanceof GdImage) {
        return false;
    }
    imagealphablending($image, false);
    imagesavealpha($image, true);
    $normalized = $path . '.png';
    $saved = imagepng($image, $normalized, 6);
    imagedestroy($image);
    if (!$saved || verifyCatalogDownload($normalized) === null) {
        @unlink($normalized);
        return false;
    }
    if (!rename($normalized, $path)) {
        @unlink($normalized);
        return false;
    }
    return true;
}

function installProductDownload(string $cachePath, string $destination): void
{
    $temporary = $destination . '.tmp.' . bin2hex(random_bytes(4));
    if (!@link($cachePath, $temporary) && !copy($cachePath, $temporary)) {
        throw new RuntimeException('A verified catalog photo could not be copied into place.');
    }
    if (!rename($temporary, $destination)) {
        @unlink($temporary);
        throw new RuntimeException('A catalog photo could not be installed atomically.');
    }
}

$byUrl = [];
foreach ($items as $item) {
    $url = (string) ($item['source_url'] ?? '');
    $productId = (int) ($item['product_id'] ?? 0);
    if ($productId < 1 || catalogPhotoSourceUrl($url) !== $url || $url === '') {
        throw new RuntimeException('The photo manifest contains an invalid product or unauthorized source URL.');
    }
    $byUrl[$url][] = $item;
}

$report = [
    'started_at_utc' => gmdate(DATE_ATOM),
    'mapped_product_count' => count($items),
    'unique_source_url_count' => count($byUrl),
    'reused_verified_product_files' => 0,
    'reused_verified_cache_urls' => 0,
    'downloaded_unique_urls' => 0,
    'downloaded_product_files' => 0,
    'failures' => [],
];
$queue = [];
foreach ($byUrl as $url => $urlItems) {
    $allReady = true;
    foreach ($urlItems as $item) {
        if (verifyCatalogDownload($downloadDir . '/' . (int) $item['product_id'] . '.img') === null) {
            $allReady = false;
        } else {
            $report['reused_verified_product_files']++;
        }
    }
    if ($allReady) {
        continue;
    }
    $cachePath = $cacheDir . '/' . hash('sha256', $url) . '.img';
    if (verifyCatalogDownload($cachePath) !== null) {
        foreach ($urlItems as $item) {
            $destination = $downloadDir . '/' . (int) $item['product_id'] . '.img';
            if (verifyCatalogDownload($destination) === null) {
                installProductDownload($cachePath, $destination);
                $report['downloaded_product_files']++;
            }
        }
        $report['reused_verified_cache_urls']++;
        continue;
    }
    $queue[] = ['url' => $url, 'items' => $urlItems, 'cache' => $cachePath, 'attempt' => 0];
}

$multi = curl_multi_init();
$active = [];
while ($queue !== [] || $active !== []) {
    while (count($active) < PHOTO_CONCURRENCY && $queue !== []) {
        $job = array_shift($queue);
        $job['attempt']++;
        $job['temporary'] = $job['cache'] . '.part.' . bin2hex(random_bytes(4));
        $stream = fopen($job['temporary'], 'wb');
        if ($stream === false) {
            throw new RuntimeException('A temporary download file could not be opened.');
        }
        $handle = curl_init($job['url']);
        curl_setopt_array($handle, [
            CURLOPT_FILE => $stream,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 12,
            CURLOPT_TIMEOUT => 50,
            CURLOPT_USERAGENT => 'FerryTelecom-IsolatedCatalogPhotoImport/1.0',
            CURLOPT_FAILONERROR => false,
            CURLOPT_NOPROGRESS => false,
            CURLOPT_XFERINFOFUNCTION => static function ($curl, float $downloadTotal, float $downloaded): int {
                return $downloadTotal > PHOTO_MAX_BYTES || $downloaded > PHOTO_MAX_BYTES ? 1 : 0;
            },
        ]);
        curl_multi_add_handle($multi, $handle);
        $active[(int) $handle] = ['handle' => $handle, 'stream' => $stream, 'job' => $job];
    }
    do {
        $status = curl_multi_exec($multi, $running);
    } while ($status === CURLM_CALL_MULTI_PERFORM);
    if ($running > 0) {
        curl_multi_select($multi, 1.0);
    }
    while (($done = curl_multi_info_read($multi)) !== false) {
        $key = (int) $done['handle'];
        $current = $active[$key];
        unset($active[$key]);
        $handle = $current['handle'];
        $job = $current['job'];
        fclose($current['stream']);
        $httpCode = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $curlError = curl_error($handle);
        curl_multi_remove_handle($multi, $handle);
        curl_close($handle);
        $verified = $done['result'] === CURLE_OK && $httpCode === 200
            && normalizeCatalogDownload($job['temporary']);
        if ($verified && rename($job['temporary'], $job['cache'])) {
            foreach ($job['items'] as $item) {
                installProductDownload($job['cache'], $downloadDir . '/' . (int) $item['product_id'] . '.img');
                $report['downloaded_product_files']++;
            }
            $report['downloaded_unique_urls']++;
        } else {
            @unlink($job['temporary']);
            if ($job['attempt'] < 3) {
                usleep(200000 * (2 ** ($job['attempt'] - 1)));
                $queue[] = $job;
            } else {
                $report['failures'][] = [
                    'product_ids' => array_map(static fn(array $item): int => (int) $item['product_id'], $job['items']),
                    'skus' => array_map(static fn(array $item): string => (string) $item['sku'], $job['items']),
                    'http_status' => $httpCode,
                    'error' => $curlError !== '' ? $curlError : ($httpCode !== 200 ? 'HTTP ' . $httpCode : 'Downloaded response was not a safe supported image.'),
                ];
            }
        }
    }
}
curl_multi_close($multi);
$verifiedProducts = 0;
$verifiedUrls = 0;
foreach ($byUrl as $urlItems) {
    $urlComplete = true;
    foreach ($urlItems as $item) {
        if (verifyCatalogDownload($downloadDir . '/' . (int) $item['product_id'] . '.img') !== null) {
            $verifiedProducts++;
        } else {
            $urlComplete = false;
        }
    }
    if ($urlComplete) {
        $verifiedUrls++;
    }
}
$report['completed_at_utc'] = gmdate(DATE_ATOM);
$report['failed_unique_url_count'] = count($report['failures']);
$report['overall_verified_product_file_count'] = $verifiedProducts;
$report['overall_successful_unique_url_count'] = $verifiedUrls;
file_put_contents(
    $nativeRoot . '/storage/catalog-photo-download-report.json',
    json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . "\n",
    LOCK_EX
);
echo json_encode($report, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL;
exit($report['failures'] === [] ? 0 : 2);
