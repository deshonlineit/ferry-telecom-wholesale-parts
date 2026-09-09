#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * The shop is English, but the database was seeded with Dutch category names, one
 * Dutch quality label, a Dutch description sentence and a Dutch demo address.
 * Those values live in MySQL, so translating the interface alone is not enough.
 *
 * This script is idempotent: it only touches rows that still carry the Dutch
 * value, so it is safe to run after every merge and safe to run twice. Keep the
 * map in step with the category list in bin/seed.php.
 */

require_once __DIR__ . '/../src/bootstrap.php';

const CATEGORY_NAMES = [
    'Batterijen' => 'Batteries',
    'Laadpoorten' => 'Charging ports',
    "Camera's" => 'Cameras',
    'Behuizing & achterglas' => 'Housings & back glass',
    'Flexkabels & knoppen' => 'Flex cables & buttons',
    'Adhesive & afdichting' => 'Adhesive & sealing',
    'Reparatiegereedschap' => 'Repair tools',
    'Hoesjes & bescherming' => 'Cases & protection',
    'Kabels & accessoires' => 'Cables & accessories',
    'Overige onderdelen' => 'Other parts',
];

const QUALITY_NAMES = [
    'Standaard' => 'Standard',
];

const DESCRIPTION_PHRASES = [
    'Productgegevens uit de offline catalogusexport. Controleer model en kwaliteit vóór gebruik.'
        => 'Product data from the offline catalogue export. Check the model and quality before use.',
];

/** Seeded demo delivery address, visible on the account and checkout pages. */
const ADDRESS_VALUES = [
    'label' => ['Testadres' => 'Test address'],
    'line1' => ['Voorbeeldstraat 1' => 'Example Street 1'],
];

try {
    $db = db();
} catch (Throwable $error) {
    fwrite(STDERR, "catalog taxonomy: database unavailable, nothing translated ({$error->getMessage()})\n");
    exit(0);
}

$renamedCategories = 0;
foreach (CATEGORY_NAMES as $dutch => $english) {
    $stmt = $db->prepare('UPDATE categories SET name = ? WHERE name = ?');
    $stmt->execute([$english, $dutch]);
    $renamedCategories += $stmt->rowCount();
}

$renamedQualities = 0;
foreach (QUALITY_NAMES as $dutch => $english) {
    $stmt = $db->prepare('UPDATE products SET quality = ? WHERE quality = ?');
    $stmt->execute([$english, $dutch]);
    $renamedQualities += $stmt->rowCount();
}

$rewrittenDescriptions = 0;
foreach (DESCRIPTION_PHRASES as $dutch => $english) {
    $stmt = $db->prepare('UPDATE products SET description = REPLACE(description, ?, ?) WHERE description LIKE ?');
    $stmt->execute([$dutch, $english, '%' . $dutch . '%']);
    $rewrittenDescriptions += $stmt->rowCount();
}

$renamedAddresses = 0;
foreach (ADDRESS_VALUES as $column => $values) {
    foreach ($values as $dutch => $english) {
        // The column name comes from the constant above, never from input.
        $stmt = $db->prepare("UPDATE addresses SET {$column} = ? WHERE {$column} = ?");
        $stmt->execute([$english, $dutch]);
        $renamedAddresses += $stmt->rowCount();
    }
}

$leftover = $db->query(
    "SELECT name FROM categories WHERE name REGEXP '(Batterij|Laadpoort|Behuizing|Flexkabel|afdichting|Reparatiegereedschap|Hoesje|accessoire|Overige)'"
)->fetchAll(PDO::FETCH_COLUMN);

printf(
    "seeded Dutch: %d categories, %d quality labels, %d descriptions, %d address fields; %d Dutch category names left.\n",
    $renamedCategories,
    $renamedQualities,
    $rewrittenDescriptions,
    $renamedAddresses,
    count($leftover)
);

if ($leftover) {
    fwrite(STDERR, 'catalog taxonomy: still Dutch: ' . implode(', ', $leftover) . "\n");
    exit(1);
}
