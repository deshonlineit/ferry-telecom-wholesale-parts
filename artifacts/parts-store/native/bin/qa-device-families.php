<?php
declare(strict_types=1);
require __DIR__ . '/../src/bootstrap.php';
require __DIR__ . '/../src/catalog-search.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
function yearFor(string $family, string $name): ?int {
    return deviceModelChronology($family, $name)['release_year'];
}

check(yearFor('iphone', 'iPhone 6S') === 2015, 'iPhone 6S factual year regression');
check(yearFor('iphone', 'iPhone 5S') === 2013, 'iPhone 5S factual year regression');
check(yearFor('iphone', 'iPhone 16e') === 2025, 'iPhone 16e factual year regression');
check(yearFor('iphone', 'iPhone SE (2022)') === 2022, 'iPhone SE factual year regression');
check(yearFor('ipad', 'iPad Pro 11 inch (1st Gen)') === 2018, '11-inch iPad Pro chronology differs from 12.9-inch');
check(yearFor('ipad', 'iPad Pro 12.9 (1st Gen)') === 2015, '12.9-inch iPad Pro first generation year');
check(yearFor('samsung', 'Galaxy A03') === 2021 && yearFor('samsung', 'Galaxy A01') === 2019, 'Galaxy A03/A01 release chronology');
check(yearFor('samsung', 'Samsung Galaxy S21 FE') === 2022, 'Galaxy S21 FE release year');
check(yearFor('pixel', 'Pixel 6A') === 2022, 'Pixel A-series successor-year regression');
check(yearFor('watch', 'Apple Watch Series 1 - 38mm') === 2016, 'Apple Watch Series 1 release year');
check(deviceModelChronology('iphone', 'iPhone 16e')['release_month'] === null, 'Unverified release months must stay null');
check(deviceFamilyGroup('samsung', 'Galaxy Z Fold 6 5G')[0] === 'z', 'Galaxy Z Fold belongs to the Z group');
check(deviceCanonicalModelName('iPhone 6S Plus (10 Pack)') === 'iPhone 6S Plus', 'Pack size must not become a device model');
check(deviceFamilyGroup('iphone', 'iPhone X')[0] === 'series-x'
    && deviceFamilyGroup('iphone', 'iPhone XR')[0] === 'series-x'
    && deviceFamilyGroup('iphone', 'iPhone XS Max')[0] === 'series-x', 'X, XR and XS must share one chronological generation group');
check(deviceFamilyGroup('iphone', 'iPhone 16 Pro')[1] === 'iPhone 16 Series', 'numbered iPhones use an explicit series heading');
check(deviceFamilyGroup('iphone', 'iPhone SE (2022)')[1] === 'iPhone SE Series', 'SE models must share one explicit series heading');
check(deviceFamilyGroup('iphone', 'iPhone XS Max')[1] === 'iPhone X · XR · XS Series', 'X-family models use one explicit series heading');

$screens = db()->query("SELECT id FROM categories WHERE slug='screens'")->fetchColumn();
$facets = catalogFacets(['category' => $screens]);
check(count($facets['device_families']) >= 4, 'Expected real device families');
$families = array_column($facets['device_families'], null, 'id');
check(($families['iphone']['count'] ?? 0) > 0 && ($families['ipad']['count'] ?? 0) > 0 && ($families['samsung']['count'] ?? 0) > 0, 'Core family counts missing');
$allFacets = catalogFacets();
$iphone = array_values(array_filter($allFacets['models'], fn ($m) => $m['family'] === 'iphone' && (int) $m['count'] > 0));
check(count($iphone) > 6, 'Family browse must extend beyond autocomplete cap');
check(count(array_filter($iphone, fn ($m) => (int) $m['count'] <= 12)) > 0, 'Sparse compatible models must remain exposed');
check(count(array_filter($iphone, fn ($m) => str_contains(mb_strtolower($m['name']), 'pack'))) === 0, 'Packaging aliases must not appear as models');
$sorted = $iphone;
usort($sorted, fn ($a, $b) => ($b['order_known'] <=> $a['order_known']) ?: ($b['sort_order'] <=> $a['sort_order']));
check(str_contains($sorted[0]['name'], '17'), 'Newest iPhone generation should lead');
$ipad = array_values(array_filter($allFacets['models'], fn ($m) => $m['family'] === 'ipad' && (int) $m['count'] > 0));
check(count($ipad) > 20, 'All iPad generations should remain available');
$filtered = catalogProductList(['category' => $screens, 'family' => 'ipad', 'limit' => 1], null);
check($filtered['total'] > 0, 'Family predicate should find related products');
$predicate = catalogProductCondition(['family' => 'iphone']);
check(!str_contains($predicate['condition'], 'p.brand_id'), 'A device family must never become a product brand filter');
try {
    catalogProductList(['family' => 'not-a-family'], null);
    throw new RuntimeException('Unknown family was not rejected');
} catch (HttpError $error) {
    check($error->status === 400, 'Unknown family should be a client error');
}
echo "PASS: explicit factual metadata, contextual counts, whitelist, EXISTS filtering, sparse coverage and chronology regressions.\n";