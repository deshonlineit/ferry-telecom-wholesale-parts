<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/catalog-search.php';

$cases = [
    ['Back Cover Glass With Camera Lens For Samsung Galaxy A55', 'rear-glass'],
    ['Middle Frame for iPhone 15', 'frame-chassis'],
    ['Mid-Frame Housing For Samsung Galaxy A05', 'frame-chassis'],
    ['Battery Cover for Example Phone', 'rear-cover'],
    ['Complete Housing for Example Phone', 'complete-housing'],
    ['Back Housing W/ Small Components Pre-Installed for iPhone 13', 'housing-with-parts'],
    ['Housing with parts for Example Phone', 'housing-with-parts'],
    ['Generic Housing for Example Phone', 'other-housing'],
    ['Housing Assembly for Example Phone', 'other-housing'],
];
foreach ($cases as [$title, $expected]) {
    $actual = catalogHousingPartTypeForTitle($title);
    if ($actual !== $expected) {
        throw new RuntimeException("$title: expected $expected, got $actual");
    }
}

$housingId = catalogHousingCategoryId();
$rows = db()->prepare("SELECT name FROM products WHERE active=1 AND publication_status='visible' AND category_id=?");
$rows->execute([$housingId]);
$phpCounts = array_fill_keys(catalogHousingPartTypeIds(), 0);
foreach ($rows->fetchAll(PDO::FETCH_COLUMN) as $title) {
    ++$phpCounts[catalogHousingPartTypeForTitle((string) $title)];
}
$facets = catalogPartTypeFacets([]);
foreach ($facets as $facet) {
    if ($facet['count'] !== $phpCounts[$facet['id']]) {
        throw new RuntimeException("PHP/SQL classifier mismatch for {$facet['id']}");
    }
}
$glass = catalogProductList(['q' => 'iphone13 rear glass', 'limit' => 100], null);
foreach ($glass['products'] as $product) {
    if (($product['part_type']['id'] ?? null) !== 'rear-glass' || $product['price_cents'] !== null) {
        throw new RuntimeException('Precise rear-glass search or guest price privacy failed.');
    }
}
$frames = catalogProductList(['q' => 'frame', 'limit' => 100], null);
foreach ($frames['products'] as $product) {
    if (($product['part_type']['id'] ?? null) !== 'frame-chassis') {
        throw new RuntimeException('Precise frame search returned a different subtype.');
    }
}
$withParts = catalogProductList(['q' => 'housing with parts', 'limit' => 100], null);
foreach ($withParts['products'] as $product) {
    if (($product['part_type']['id'] ?? null) !== 'housing-with-parts') {
        throw new RuntimeException('Precise housing-with-parts search returned a different subtype.');
    }
}

$aliasGroups = [
    'rear-glass' => ['back cover glass', 'back glass', 'rear glass'],
    'frame-chassis' => ['frame', 'mid frame', 'middle frame', 'chassis'],
    'rear-cover' => ['back cover', 'rear cover', 'battery cover'],
    'housing-with-parts' => ['housing with small components', 'housing with parts', 'pre installed'],
    'complete-housing' => ['complete housing', 'housing complete', 'full housing'],
];
foreach ($aliasGroups as $part => $aliases) {
    foreach ($aliases as $alias) {
        $predicate = catalogProductCondition(['q' => $alias]);
        $query = db()->prepare('SELECT COUNT(*) FROM products p WHERE ' . $predicate['condition']);
        $query->execute($predicate['parameters']);
        $actual = (int) $query->fetchColumn();
        if ($actual !== $phpCounts[$part]) {
            throw new RuntimeException("$alias returned $actual products; expected {$phpCounts[$part]} for $part");
        }
    }
}
$modelGlass = catalogProductList(['q' => 'iphone13 back cover glass', 'limit' => 100], null);
if ($modelGlass['total'] <= 0 || $modelGlass['total'] >= $phpCounts['rear-glass']) {
    throw new RuntimeException('A model token beside a rear-glass alias did not narrow the subtype population.');
}
foreach ($modelGlass['products'] as $product) {
    if (($product['part_type']['id'] ?? null) !== 'rear-glass') {
        throw new RuntimeException('Model-constrained rear-glass alias escaped its subtype.');
    }
}
try {
    catalogProductCondition(['part' => 'not-a-part']);
    throw new RuntimeException('Invalid part was accepted.');
} catch (HttpError $error) {
    if ($error->status !== 400) {
        throw $error;
    }
}

echo json_encode([
    'housing_category_id' => $housingId,
    'counts' => $phpCounts,
    'iphone13_rear_glass' => $glass['total'],
    'frame_search' => $frames['total'],
    'housing_with_parts_search' => $withParts['total'],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . PHP_EOL;