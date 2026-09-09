<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    throw new RuntimeException('Compatibility reconciliation is CLI-only.');
}

$apply = in_array('--apply', $argv, true);
$check = in_array('--check', $argv, true);
$pdo = db();

$modelsByBrand = [];
$allModels = [];
foreach ($pdo->query(
    'SELECT dm.id,dm.brand_id,dm.name,b.name brand_name
     FROM device_models dm JOIN brands b ON b.id=dm.brand_id
     ORDER BY CHAR_LENGTH(dm.name) DESC,dm.name'
) as $model) {
    $name = trim((string) $model['name']);
    if ($name === '' || mb_strlen($name) < 4) continue;
    $normalizedModel = [
        'id' => (int) $model['id'],
        'name' => $name,
        'brand' => (string) $model['brand_name'],
    ];
    $modelsByBrand[(int) $model['brand_id']][] = $normalizedModel;
    $allModels[] = $normalizedModel;
}
$titleModels = titleEligibleModels($allModels);

$existing = [];
foreach ($pdo->query('SELECT product_id,model_id FROM product_models') as $link) {
    $existing[(int) $link['product_id']][(int) $link['model_id']] = true;
}
$titleSources = [];
foreach ($pdo->query("SELECT product_id,model_id FROM product_model_sources WHERE source='product_title'") as $source) {
    $titleSources[(int) $source['product_id']][(int) $source['model_id']] = true;
}

/** @return array{0:string,1:string}|null */
function titleModelFamily(string $model): ?array
{
    $prefixes = [
        'Apple Watch Series ', 'Samsung Galaxy ', 'Sony Xperia ', 'Google Pixel ',
        'MacBook Pro ', 'MacBook Air ', 'Galaxy ', 'iPhone ', 'iPad ', 'Pixel ',
        'Xperia ', 'OnePlus ', 'Huawei ', 'Honor ', 'Xiaomi ', 'Redmi ', 'Poco ',
        'Oppo ', 'Motorola ', 'Nokia ',
    ];
    foreach ($prefixes as $prefix) {
        if (!str_starts_with(mb_strtolower($model), mb_strtolower($prefix))) continue;
        $suffix = trim(mb_substr($model, mb_strlen($prefix)));
        if ($suffix !== '' && mb_strlen($suffix) >= 2) return [trim($prefix), $suffix];
    }
    return null;
}

/**
 * Generic family labels such as "iPhone SE" and "iPad Air" must not absorb
 * products for a specific generation when more specific models exist.
 *
 * @param list<array{id:int,name:string,brand:string}> $models
 * @return list<array{id:int,name:string,brand:string}>
 */
function titleEligibleModels(array $models): array
{
    return array_values(array_filter($models, static function (array $candidate) use ($models): bool {
        if (preg_match('/\d/u', $candidate['name']) === 1) return true;
        $candidateName = mb_strtolower($candidate['name']);
        foreach ($models as $other) {
            if ($other['id'] === $candidate['id']) continue;
            $otherName = mb_strtolower($other['name']);
            if (str_starts_with($otherName, $candidateName . ' ')
                || str_starts_with($otherName, $candidateName . ' (')) {
                return false;
            }
        }
        return true;
    }));
}

/**
 * Match complete model labels and suppress shorter labels contained in a
 * longer match at the same occurrence. Separate occurrences remain many-to-many.
 *
 * @param list<array{id:int,name:string,brand:string}> $models
 * @return list<array{id:int,name:string,brand:string}>
 */
function titleModelMatches(string $title, array $models): array
{
    $occurrences = [];
    foreach ($models as $model) {
        $modelPattern = preg_quote($model['name'], '/');
        $modelPattern = preg_replace('/\\\\\((\d{4})\\\\\)/', '\\s*\\(?$1\\)?', $modelPattern) ?? $modelPattern;
        $pattern = '/(?<![\p{L}\p{N}])' . $modelPattern . '(?![\p{L}\p{N}])/iu';
        if (preg_match_all($pattern, $title, $matches, PREG_OFFSET_CAPTURE) === false) continue;
        foreach ($matches[0] as [$matched, $offset]) {
            $occurrences[] = [
                'model' => $model,
                'start' => (int) $offset,
                'end' => (int) $offset + strlen((string) $matched),
                'length' => strlen((string) $matched),
            ];
        }
        $family = titleModelFamily($model['name']);
        if ($family === null) continue;
        [$prefix, $suffix] = $family;
        $suffixPattern = preg_quote($suffix, '/');
        $suffixPattern = preg_replace('/\\\\\((\d{4})\\\\\)/', '\\s*\\(?$1\\)?', $suffixPattern) ?? $suffixPattern;
        $shortPattern = '/' . preg_quote($prefix, '/')
                . '[^.;\n]{0,140}[\/&,]\s*\K'
            . $suffixPattern . '(?![\p{L}\p{N}])/iu';
        if (preg_match_all($shortPattern, $title, $shortMatches, PREG_OFFSET_CAPTURE) === false) continue;
        foreach ($shortMatches[0] as [$matched, $offset]) {
            $occurrences[] = [
                'model' => $model,
                'start' => (int) $offset,
                'end' => (int) $offset + strlen((string) $matched),
                'length' => strlen((string) $matched),
            ];
        }
    }
    usort($occurrences, static fn(array $a, array $b): int =>
        $a['start'] <=> $b['start'] ?: $b['length'] <=> $a['length']);

    $accepted = [];
    foreach ($occurrences as $candidate) {
        $contained = false;
        foreach ($occurrences as $other) {
            if ($other['model']['id'] === $candidate['model']['id']) continue;
            if ($other['length'] <= $candidate['length']) continue;
            if ($other['start'] <= $candidate['start'] && $other['end'] >= $candidate['end']) {
                $contained = true;
                break;
            }
        }
        if (!$contained) $accepted[$candidate['model']['id']] = $candidate['model'];
    }
    return array_values($accepted);
}

$missing = [];
$inferred = [];
$matchedProducts = [];
$products = $pdo->query(
    'SELECT p.id,p.sku,p.name,p.brand_id,c.name category
     FROM products p LEFT JOIN categories c ON c.id=p.category_id
     WHERE p.active=1
     ORDER BY p.id'
);
foreach ($products as $product) {
    $productId = (int) $product['id'];
    // A product manufacturer and its compatible device brand are independent.
    // Match model names across all device brands, never through p.brand_id.
    $matches = titleModelMatches((string) $product['name'], $titleModels);
    if ($matches !== []) $matchedProducts[$productId] = true;
    foreach ($matches as $model) {
        $inferred[$productId][$model['id']] = true;
        if (isset($existing[$productId][$model['id']])) continue;
        $missing[] = [
            'product_id' => $productId,
            'sku' => (string) $product['sku'],
            'product' => (string) $product['name'],
            'category' => (string) ($product['category'] ?? 'Uncategorised'),
            'model_id' => $model['id'],
            'model' => $model['name'],
            'brand' => $model['brand'],
        ];
    }
}

$stale = [];
foreach ($titleSources as $productId => $modelIds) {
    foreach ($modelIds as $modelId => $_) {
        if (!isset($inferred[$productId][$modelId])) $stale[] = [$productId, $modelId];
    }
}

$inserted = 0;
$removed = 0;
if ($apply && ($missing !== [] || $stale !== [] || $inferred !== [])) {
    $insert = $pdo->prepare('INSERT IGNORE INTO product_models(product_id,model_id) VALUES(?,?)');
    $insertSource = $pdo->prepare(
        "INSERT INTO product_model_sources(product_id,model_id,source,evidence)
         VALUES(?,?,'product_title',?)
         ON DUPLICATE KEY UPDATE evidence=VALUES(evidence)"
    );
    $deleteSource = $pdo->prepare(
        "DELETE FROM product_model_sources WHERE product_id=? AND model_id=? AND source='product_title'"
    );
    $deleteOrphanLink = $pdo->prepare(
        'DELETE FROM product_models WHERE product_id=? AND model_id=?
         AND NOT EXISTS (
           SELECT 1 FROM product_model_sources WHERE product_id=? AND model_id=?
         )'
    );
    $pdo->beginTransaction();
    try {
        foreach ($stale as [$productId, $modelId]) {
            $deleteSource->execute([$productId, $modelId]);
            $deleteOrphanLink->execute([$productId, $modelId, $productId, $modelId]);
            $removed += $deleteOrphanLink->rowCount();
        }
        foreach ($missing as $link) {
            $insert->execute([$link['product_id'], $link['model_id']]);
            $inserted += $insert->rowCount();
        }
        foreach ($inferred as $productId => $modelIds) {
            foreach ($modelIds as $modelId => $_) {
                $insertSource->execute([
                    $productId,
                    $modelId,
                    'Exact or qualified shorthand model name in product title',
                ]);
            }
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}

$byBrand = [];
$byCategory = [];
foreach ($missing as $link) {
    $byBrand[$link['brand']] = ($byBrand[$link['brand']] ?? 0) + 1;
    $byCategory[$link['category']] = ($byCategory[$link['category']] ?? 0) + 1;
}
arsort($byBrand);
arsort($byCategory);

$report = [
    'mode' => $apply ? 'apply' : ($check ? 'check' : 'dry-run'),
    'active_products_with_explicit_model_names' => count($matchedProducts),
    'missing_links' => count($missing),
    'stale_inferred_links' => count($stale),
    'inserted_links' => $inserted,
    'removed_stale_links' => $removed,
    'missing_by_brand' => $byBrand,
    'largest_missing_categories' => array_slice($byCategory, 0, 12, true),
    'examples' => array_slice($missing, 0, 20),
];
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . PHP_EOL;

if ($check && ($missing !== [] || $stale !== [])) exit(1);