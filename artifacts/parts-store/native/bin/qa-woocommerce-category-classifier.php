<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/woocommerce-catalog-classifier.php';

$cases = [
    ['Back Cover Glass With Camera Lens For Samsung Galaxy S25 FE (White)', 'housing'],
    ['Back Cover Adhesive Tape for Samsung Galaxy S25 FE', 'adhesive'],
    ['Back Camera For Samsung Galaxy S25 FE', 'cameras'],
    ['Charging Port Board For Samsung Galaxy S25 FE', 'charging'],
    ['Galaxy S25 FE Black OLED Touchscreen', 'screens'],
    ['Antenna Connecting Cable For Samsung Galaxy S25 FE', 'flex'],
];

foreach ($cases as [$title, $expected]) {
    $actual = wcCategorySlug('', $title);
    if ($actual !== $expected) {
        throw new RuntimeException("$title: expected $expected, got $actual");
    }
}

echo "PASS: WooCommerce category precedence keeps S25 FE parts in their correct sections.\n";