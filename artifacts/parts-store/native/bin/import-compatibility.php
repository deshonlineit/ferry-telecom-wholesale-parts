<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/device-family-metadata.php';

if (PHP_SAPI !== 'cli') {
    throw new RuntimeException('This test-only importer must be run from the CLI.');
}

$csvCandidates = [
    WORKSPACE_ROOT . '/attached_assets/wc-product-export-7-9-2026-1788776855452_1788776961156.csv',
    WORKSPACE_ROOT . '/attached_assets/0_product_export_2026-07-30-06-25-56_1785436150044.csv',
];
$csvPath = null;
foreach ($csvCandidates as $candidatePath) {
    if (is_file($candidatePath)) {
        $csvPath = $candidatePath;
        break;
    }
}
if ($csvPath === null) {
    throw new RuntimeException('No offline catalog export is available for compatibility import.');
}

/**
 * Split taxonomy values on top-level pipes and commas. Commas inside labels
 * such as "MacBook Air (A1466, Mid 2013)" are intentionally retained.
 *
 * @return list<string>
 */
function compatibilityTaxonomyValues(string $value): array
{
    $parts = [];
    $part = '';
    $parentheses = 0;
    $length = strlen($value);
    for ($index = 0; $index < $length; $index++) {
        $character = $value[$index];
        if ($character === '(') {
            $parentheses++;
        } elseif ($character === ')' && $parentheses > 0) {
            $parentheses--;
        }
        if (($character === '|' || $character === ',') && $parentheses === 0) {
            if (trim($part) !== '') {
                $parts[] = trim($part);
            }
            $part = '';
            continue;
        }
        $part .= $character;
    }
    if (trim($part) !== '') {
        $parts[] = trim($part);
    }
    return $parts;
}

function compatibilityClean(string $value): string
{
    $value = html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim((string) preg_replace('/\s+/u', ' ', $value));
}

/**
 * Return the manufacturer only when the label itself identifies a model.
 * This deliberately excludes manufacturer, quality, campaign, and generic
 * family labels.
 */
function compatibilityTagBrand(string $label): ?string
{
    if (preg_match('/^iPhone\s+(?:[4-9](?:S|C)?|1[0-9])(?:\b|\/)|^iPhone\s+(?:X|XR|XS|SE)\b/iu', $label)) {
        return 'Apple';
    }
    if (preg_match('/^(?:iPad\s+(?:[2-9]|\d{2}|Air\b|Mini\b|Pro\b)|Apple Watch Series\s+\d|MacBook(?:\s+(?:Air|Pro|Retina|Unibody))?\s+.*(?:\d|A\d{4})|iMac\s+.*(?:\d|A\d{4})|AirPods\s+(?:\d|Pro|Max))/iu', $label)) {
        return 'Apple';
    }
    if (preg_match('/^(?:(?:Samsung\s+)?Galaxy\s+.*\d|Samsung\s+(?:Galaxy\s+)?[A-Z]*\d)/iu', $label)) {
        return 'Samsung';
    }
    if (preg_match('/^(?:Google\s+)?Pixel\s+(?:\d|Fold\b)/iu', $label)) {
        return 'Google';
    }
    if (preg_match('/^(?:Xiaomi\s+)?(?:Mi|Redmi|Poco|Pocophone)\s+.*\d/iu', $label)) {
        return 'Xiaomi';
    }
    if (preg_match('/^(?:Huawei\s+)?(?:P(?:\d| Smart\b)|Mate\s+\d|Ascend Mate\s+\d|Y\d|Nova(?:\s+\d|\s+Plus\b))/iu', $label)) {
        return 'Huawei';
    }
    if (preg_match('/^(?:Huawei\s+)?Honor\s+.*\d/iu', $label)) {
        return 'Honor';
    }
    if (preg_match('/^(?:OnePlus|Oppo|Motorola|Nokia|Sony Xperia|Xperia)\s+.*\d/iu', $label)) {
        return match (true) {
            preg_match('/^OnePlus/iu', $label) === 1 => 'OnePlus',
            preg_match('/^Oppo/iu', $label) === 1 => 'Oppo',
            preg_match('/^Motorola/iu', $label) === 1 => 'Motorola',
            preg_match('/^Nokia/iu', $label) === 1 => 'Nokia',
            default => 'Sony',
        };
    }
    return null;
}

/** @return array{0:string,1:string}|null */
function compatibilityCategoryCandidate(string $path): ?array
{
    $levels = array_values(array_filter(
        array_map(static fn(string $part): string => compatibilityClean($part), explode('>', $path)),
        static fn(string $part): bool => $part !== ''
    ));
    if (count($levels) < 2) {
        return null;
    }
    $root = mb_strtolower($levels[0]);
    $brand = match ($root) {
        'apple parts' => 'Apple',
        'samsung parts' => 'Samsung',
        'google pixel parts' => 'Google',
        'xiaomi parts' => 'Xiaomi',
        'p series', 'mate series', 'y series', 'nova series' => 'Huawei',
        'honor series' => 'Honor',
        default => null,
    };
    if ($brand === null) {
        return null;
    }

    $leaf = $levels[count($levels) - 1];
    $generic = [
        'apple parts', 'iphone', 'ipad', 'macbook', 'macbook air', 'macbook pro',
        'samsung parts', 'google pixel parts', 'xiaomi parts', 'mi series',
        'redmi series', 'poco series', 'p series', 'mate series', 'y series',
        'nova series', 'honor series',
    ];
    if (in_array(mb_strtolower($leaf), $generic, true)
        || preg_match('/\b(?:parts?|accessor(?:y|ies)|cases?|covers?|tempered|glass|cables?|chargers?|quality|assembly|batter(?:y|ies))\b/iu', $leaf)) {
        return null;
    }

    $detectedBrand = compatibilityTagBrand($leaf);
    if ($detectedBrand === null || $detectedBrand !== $brand) {
        return null;
    }
    return [$brand, $leaf];
}

/** @return string|null */
function compatibilityCategoryBrand(string $path): ?string
{
    $root = mb_strtolower(compatibilityClean(explode('>', $path, 2)[0]));
    return match ($root) {
        'apple parts' => 'Apple',
        'samsung parts' => 'Samsung',
        'google pixel parts' => 'Google',
        'xiaomi parts' => 'Xiaomi',
        'p series', 'mate series', 'y series', 'nova series' => 'Huawei',
        'honor series' => 'Honor',
        default => null,
    };
}

$pdo = db();
$products = [];
foreach ($pdo->query('SELECT id,sku FROM products') as $product) {
    $products[trim((string) $product['sku'])] = (int) $product['id'];
}

$handle = fopen($csvPath, 'r');
if ($handle === false) {
    throw new RuntimeException('Unable to open the offline catalog export.');
}
$headers = fgetcsv($handle, 0, ',', '"', '');
if (!is_array($headers)) {
    throw new RuntimeException('The offline catalog export has no header.');
}
$headers[0] = ltrim((string) $headers[0], "\xEF\xBB\xBF");
$column = static function (array $possibilities) use ($headers): string {
    foreach ($possibilities as $possibility) {
        if (in_array($possibility, $headers, true)) return $possibility;
    }
    throw new RuntimeException('Compatibility export is missing: ' . implode(' or ', $possibilities));
};
$skuColumn = $column(['sku', 'SKU']);
$categoriesColumn = $column(['tax:product_cat', 'Categories']);
$tagsColumn = $column(['tax:product_tag', 'Tags']);

$candidates = [];
$categoryBrands = [];
$stats = [
    'csv_rows' => 0,
    'malformed_rows' => 0,
    'matched_rows' => 0,
    'unmatched_skus' => 0,
    'duplicate_sku_rows' => 0,
    'tag_values_seen' => 0,
    'tag_values_skipped' => 0,
    'conflicting_tag_values_skipped' => 0,
    'category_branches_seen' => 0,
    'category_branches_outside_policy' => 0,
    'recognized_category_branches_skipped' => 0,
];
$seenSkus = [];

while (($values = fgetcsv($handle, 0, ',', '"', '')) !== false) {
    $stats['csv_rows']++;
    if (count($values) !== count($headers)) {
        $stats['malformed_rows']++;
    }
    $values = array_slice(array_pad($values, count($headers), ''), 0, count($headers));
    $row = array_combine($headers, $values);
    if ($row === false) {
        $stats['malformed_rows']++;
        continue;
    }
    $sku = trim((string) ($row[$skuColumn] ?? ''));
    if ($sku === '' || !isset($products[$sku])) {
        if ($sku !== '') {
            $stats['unmatched_skus']++;
        }
        continue;
    }
    $stats['matched_rows']++;
    if (isset($seenSkus[$sku])) {
        $stats['duplicate_sku_rows']++;
    }
    $seenSkus[$sku] = true;
    $productId = $products[$sku];

    $rowCategoryBrands = [];
    foreach (compatibilityTaxonomyValues((string) ($row[$categoriesColumn] ?? '')) as $path) {
        $stats['category_branches_seen']++;
        $sourceBrand = compatibilityCategoryBrand($path);
        if ($sourceBrand === null) {
            $stats['category_branches_outside_policy']++;
            continue;
        }
        $categoryBrands[$productId][$sourceBrand] = true;
        $rowCategoryBrands[$sourceBrand] = true;
        $candidate = compatibilityCategoryCandidate($path);
        if ($candidate === null) {
            $stats['recognized_category_branches_skipped']++;
            continue;
        }
        [$brand, $name] = $candidate;
        $name = deviceCanonicalModelName($name);
        $key = mb_strtolower($brand . "\0" . $name);
        $candidates[$productId][$key] ??= ['brand' => $brand, 'name' => $name, 'tag' => false, 'category' => false];
        $candidates[$productId][$key]['category'] = true;
    }

    foreach (compatibilityTaxonomyValues((string) ($row[$tagsColumn] ?? '')) as $tag) {
        $stats['tag_values_seen']++;
        $tag = compatibilityClean($tag);
        $brand = compatibilityTagBrand($tag);
        if ($brand === null || mb_strlen($tag) > 190) {
            $stats['tag_values_skipped']++;
            continue;
        }
        if (count($rowCategoryBrands) === 1 && !isset($rowCategoryBrands[$brand])) {
            $stats['conflicting_tag_values_skipped']++;
            continue;
        }
        $tag = deviceCanonicalModelName($tag);
        $key = mb_strtolower($brand . "\0" . $tag);
        $candidates[$productId][$key] ??= ['brand' => $brand, 'name' => $tag, 'tag' => false, 'category' => false];
        $candidates[$productId][$key]['tag'] = true;
    }
}
fclose($handle);

$pdo->beginTransaction();
try {
    $brandIds = [];
    foreach ($pdo->query('SELECT id,name FROM brands') as $brand) {
        $brandIds[mb_strtolower((string) $brand['name'])] = (int) $brand['id'];
    }
    $insertBrand = $pdo->prepare('INSERT INTO brands(name) VALUES(?)');
    $findModel = $pdo->prepare('SELECT id FROM device_models WHERE brand_id=? AND name=?');
    $insertModel = $pdo->prepare('INSERT INTO device_models(brand_id,name) VALUES(?,?)');
    $insertLink = $pdo->prepare('INSERT IGNORE INTO product_models(product_id,model_id) VALUES(?,?)');
    $insertSource = $pdo->prepare(
        "INSERT INTO product_model_sources(product_id,model_id,source,evidence)
         VALUES(?,?,'source_taxonomy',?)
         ON DUPLICATE KEY UPDATE evidence=VALUES(evidence)"
    );

    $pdo->exec('DELETE FROM product_models');
    $pdo->exec('DELETE FROM product_model_sources');
    $modelIds = [];
    $linkedProducts = [];
    $tagLinks = 0;
    $categoryLinks = 0;
    $bothLinks = 0;
    $links = 0;
    $brandUpdates = 0;
    $brandAmbiguities = 0;

    foreach ($products as $productId) {
        $productCandidates = $candidates[$productId] ?? [];
        $candidateBrands = [];
        foreach ($productCandidates as $candidate) {
            $brandName = $candidate['brand'];
            $brandKey = mb_strtolower($brandName);
            if (!isset($brandIds[$brandKey])) {
                $insertBrand->execute([$brandName]);
                $brandIds[$brandKey] = (int) $pdo->lastInsertId();
            }
            $brandId = $brandIds[$brandKey];
            $modelKey = $brandId . "\0" . mb_strtolower($candidate['name']);
            if (!isset($modelIds[$modelKey])) {
                $findModel->execute([$brandId, $candidate['name']]);
                $modelId = $findModel->fetchColumn();
                if ($modelId === false) {
                    $insertModel->execute([$brandId, $candidate['name']]);
                    $modelId = (int) $pdo->lastInsertId();
                }
                $modelIds[$modelKey] = (int) $modelId;
            }
            $insertLink->execute([$productId, $modelIds[$modelKey]]);
            $linkInserted = $insertLink->rowCount() > 0;
            $sourceEvidence = $candidate['tag'] && $candidate['category']
                ? 'taxonomy tag and category'
                : ($candidate['tag'] ? 'taxonomy tag' : 'taxonomy category');
            $insertSource->execute([$productId, $modelIds[$modelKey], $sourceEvidence]);
            if ($linkInserted) {
                $links++;
                $linkedProducts[$productId] = true;
                $tagLinks += (int) $candidate['tag'];
                $categoryLinks += (int) $candidate['category'];
                $bothLinks += (int) ($candidate['tag'] && $candidate['category']);
            }
            $candidateBrands[$brandName] = true;
        }

        // Taxonomy brands describe compatible devices, not the manufacturer of
        // the replacement part or accessory. Never overwrite products.brand_id.
        $exactBrands = $candidateBrands ?: ($categoryBrands[$productId] ?? []);
        if (count($exactBrands) > 1) {
            $brandAmbiguities++;
        }
    }
    $deletedModels = $pdo->exec(
        'DELETE FROM device_models WHERE NOT EXISTS (SELECT 1 FROM product_models WHERE model_id=device_models.id)'
    );
    $pdo->commit();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $error;
}

$distinctModels = (int) $pdo->query('SELECT COUNT(*) FROM device_models')->fetchColumn();
$productsWithoutCandidates = count($products) - count($linkedProducts);
$notesPath = NATIVE_ROOT . '/data/compatibility-notes.md';
if (!is_dir(dirname($notesPath)) && !mkdir(dirname($notesPath), 0755, true) && !is_dir(dirname($notesPath))) {
    throw new RuntimeException('Unable to create the compatibility notes directory.');
}
$notes = <<<MARKDOWN
# Offline compatibility import

## Provenance policy

- Test catalog only. The importer reads the fixed local WooCommerce CSV and the isolated native database; it makes no remote calls and reads no other database.
- Products are matched only by the CSV `sku` to the existing native `products.sku`.
- Compatibility comes only from model-shaped values explicitly present in `tax:product_tag`, or from model leaf categories below an exact device/manufacturer branch (`APPLE PARTS`, `SAMSUNG PARTS`, `GOOGLE PIXEL PARTS`, `XIAOMI PARTS`, Huawei P/Mate/Y/Nova branches, or `HONOR Series`).
- Pipe and top-level comma separators are supported; commas inside parentheses remain part of a label. Every accepted candidate is linked through `product_models`; there is no primary model and no occurrence threshold.
- Generic manufacturers, model families such as `Mi Series`, campaign tags, qualities, accessories, and part-type category leaves are not interpreted as models. Titles are not mined for compatibility. A tag that contradicts the row's one exact category manufacturer is skipped rather than reported as verified.
- A product brand is updated only when accepted model evidence has one manufacturer, or (when no model was accepted) one exact category manufacturer. Conflicting manufacturers leave the existing product brand unchanged.

## Last local run

| Measure | Count |
|---|---:|
| Existing native products | %{products} |
| CSV data rows read | %{csv_rows} |
| CSV rows matched by exact SKU | %{matched_rows} |
| CSV rows with SKU absent from native catalog | %{unmatched_skus} |
| Repeated matched SKU rows merged | %{duplicate_sku_rows} |
| Structurally irregular CSV rows padded/truncated | %{malformed_rows} |
| Accepted many-to-many links | %{links} |
| Products with at least one accepted model | %{linked_products} |
| Distinct accepted models | %{models} |
| Links supported by tags | %{tag_links} |
| Links supported by model leaf categories | %{category_links} |
| Links supported by both sources | %{both_links} |
| Products without conservative model evidence | %{without_candidates} |
| Non-model/ambiguous tag occurrences skipped | %{tag_skipped} |
| Model-shaped tags conflicting with one exact category manufacturer skipped | %{conflicting_tags} |
| Recognized manufacturer branches with non-model/ambiguous leaves skipped | %{category_skipped} |
| Category branches outside the model-source policy skipped | %{category_outside} |
| Products with conflicting exact manufacturer evidence | %{brand_ambiguities} |
| Product brand assignments refreshed from exact evidence | %{brand_updates} |
| Prior unreferenced model records removed | %{deleted_models} |

## Limitations

The counts above describe evidence available in the export, not guaranteed physical fit. Combined or unusually worded labels are retained only when the source itself declares them as a model-shaped tag/leaf; the importer does not split them into guessed devices. Products in generic accessory/family branches, products represented only by vague tags, and native SKUs absent from the export intentionally remain without compatibility links.
MARKDOWN;
$replacements = [
    '%{products}' => count($products),
    '%{csv_rows}' => $stats['csv_rows'],
    '%{matched_rows}' => $stats['matched_rows'],
    '%{unmatched_skus}' => $stats['unmatched_skus'],
    '%{duplicate_sku_rows}' => $stats['duplicate_sku_rows'],
    '%{malformed_rows}' => $stats['malformed_rows'],
    '%{links}' => $links,
    '%{linked_products}' => count($linkedProducts),
    '%{models}' => $distinctModels,
    '%{tag_links}' => $tagLinks,
    '%{category_links}' => $categoryLinks,
    '%{both_links}' => $bothLinks,
    '%{without_candidates}' => $productsWithoutCandidates,
    '%{tag_skipped}' => $stats['tag_values_skipped'],
    '%{conflicting_tags}' => $stats['conflicting_tag_values_skipped'],
    '%{category_skipped}' => $stats['recognized_category_branches_skipped'],
    '%{category_outside}' => $stats['category_branches_outside_policy'],
    '%{brand_ambiguities}' => $brandAmbiguities,
    '%{brand_updates}' => $brandUpdates,
    '%{deleted_models}' => $deletedModels,
];
file_put_contents($notesPath, strtr($notes, array_map('strval', $replacements)) . "\n");

echo "Compatibility import complete: {$links} links, " . count($linkedProducts)
    . " products, {$distinctModels} models; {$brandAmbiguities} brand ambiguities.\n";
echo "Skipped {$stats['tag_values_skipped']} non-model tags and "
    . "{$stats['recognized_category_branches_skipped']} ambiguous/non-model recognized category branches.\n";