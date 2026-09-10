<?php
declare(strict_types=1);

/**
 * Regression coverage for the server-side commercial browse order. Everything
 * created here belongs to one transaction and is rolled back unconditionally.
 */
require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/catalog-search.php';

function hierarchyAssert(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function hierarchyPositions(array $products, array $ids): array
{
    $positions = [];
    foreach ($products as $position => $product) {
        if (in_array((int) $product['id'], $ids, true)) {
            $positions[(int) $product['id']] = $position;
        }
    }
    return $positions;
}

function hierarchyAllProducts(array $input, ?array $user): array
{
    $input['limit'] = 100;
    $input['page'] = 1;
    $result = catalogProductList($input, $user);
    $products = $result['products'];
    for ($page = 2; $page <= $result['pages']; ++$page) {
        $input['page'] = $page;
        array_push($products, ...catalogProductList($input, $user)['products']);
    }
    return $products;
}

$pdo = db();
$pdo->beginTransaction();
try {
    $categoryRows = $pdo->query('SELECT id,slug FROM categories')->fetchAll();
    $categories = array_column($categoryRows, 'id', 'slug');
    foreach (['screens', 'batteries', 'charging', 'cameras', 'flex', 'audio', 'adhesive', 'housing', 'tools', 'protection', 'accessories', 'other'] as $slug) {
        hierarchyAssert(isset($categories[$slug]), "Missing seeded category $slug");
    }

    $insertGroup = $pdo->prepare('INSERT INTO customer_groups(name) VALUES(?)');
    $insertGroup->execute(['QA hierarchy A']);
    $groupA = (int) $pdo->lastInsertId();
    $insertGroup->execute(['QA hierarchy B']);
    $groupB = (int) $pdo->lastInsertId();
    $customerA = ['id' => 0, 'role' => 'customer', 'group_id' => $groupA];
    $customerB = ['id' => 0, 'role' => 'customer', 'group_id' => $groupB];

    $insertProduct = $pdo->prepare(
        'INSERT INTO products(sku,name,description,category_id,quality,stock,list_price_eur_cents,featured,active)
         VALUES(?,?,?,?,?,?,?,?,1)'
    );
    $insertPrice = $pdo->prepare('INSERT INTO group_prices(product_id,group_id,price_cents,price_eur_cents) VALUES(?,?,?,?)');
    $add = static function (string $sku, string $name, string $category, int $stock, ?int $list, int $featured = 0)
        use ($insertProduct, $categories): int {
        $insertProduct->execute([$sku, $name, 'Transaction-only ordering fixture', $categories[$category], 'QA', $stock, $list, $featured]);
        return (int) db()->lastInsertId();
    };

    // Assigned prices deliberately reverse between the two buyer groups.
    $screenCheapA = $add('QA-HIER-SCREEN-A', 'QA Hierarchy Screen A', 'screens', 8, 9999, 1);
    $screenCheapB = $add('QA-HIER-SCREEN-B', 'QA Hierarchy Screen B', 'screens', 8, 9999, 1);
    $screenOut = $add('QA-HIER-SCREEN-OUT', 'QA Hierarchy Screen Out', 'screens', 0, 1, 1);
    $screenUnpriced = $add('QA-HIER-SCREEN-UNPRICED', 'QA Hierarchy Screen Unpriced', 'screens', 8, null, 1);
    $screenProtection = $add('QA-HIER-PANZER', 'QA PanzerGlass SAFE. by Display Protection', 'screens', 8, 1, 1);
    $tierTool = $add('QA-HIER-TIER-TOOL', 'QA Protection tier boundary tool', 'tools', 8, 1, 1);
    foreach ([
        [$screenCheapA, $groupA, 10], [$screenCheapB, $groupA, 20], [$screenOut, $groupA, 1],
        [$screenCheapA, $groupB, 20], [$screenCheapB, $groupB, 10], [$screenOut, $groupB, 1],
    ] as [$product, $group, $price]) {
        $insertPrice->execute([$product, $group, $price, $price]);
    }

    $housing = [
        $add('QA-HIER-FRAME', 'QA Frame chassis hierarchy', 'housing', 1, 10, 1),
        $add('QA-HIER-WITH-PARTS', 'QA Housing with parts hierarchy', 'housing', 1, 10, 1),
        $add('QA-HIER-COMPLETE', 'QA Complete housing hierarchy', 'housing', 1, 10, 1),
        $add('QA-HIER-OTHER', 'QA Generic housing hierarchy', 'housing', 1, 10, 1),
        $add('QA-HIER-REAR-COVER', 'QA Rear cover hierarchy', 'housing', 1, 10, 1),
        $add('QA-HIER-REAR-GLASS', 'QA Rear glass hierarchy', 'housing', 1, 10, 1),
    ];
    $exact = $add('QA-HIER-EXACT', 'QA-HIER-EXACT compatible alternative', 'tools', 1, 10);
    $alternative = $add('QA-HIER-ALT', 'QA-HIER-EXACT replacement alternative', 'tools', 1, 10);
    $zulu = $add('QA-HIER-NAME-Z', 'Zulu QA-HIER-NAME', 'tools', 1, 10);
    $alpha = $add('QA-HIER-NAME-A', 'Alpha QA-HIER-NAME', 'tools', 1, 10);

    $guest = catalogProductList(['limit' => 100], null);
    hierarchyAssert(
        !array_filter($guest['products'], static fn(array $product): bool => $product['price_cents'] !== null),
        'Guest default browsing exposed a price.'
    );
    $rank = ['screens' => 1, 'batteries' => 2, 'charging' => 3, 'cameras' => 4, 'flex' => 5, 'audio' => 6, 'adhesive' => 7,
        'housing' => 8, 'tools' => 9, 'protection' => 10, 'accessories' => 11, 'other' => 12];
    $seenRank = 0;
    foreach ($guest['products'] as $product) {
        $current = $rank[array_column($categoryRows, 'slug', 'id')[$product['category_id']] ?? ''] ?? 18;
        hierarchyAssert($current >= $seenRank, 'Guest default category order is not server-side canonical.');
        $seenRank = $current;
    }

    $screensA = hierarchyAllProducts(['category' => $categories['screens'], 'featured' => 1], $customerA);
    $positionsA = hierarchyPositions($screensA, [$screenCheapA, $screenCheapB, $screenOut]);
    hierarchyAssert($positionsA[$screenCheapA] < $positionsA[$screenCheapB] && $positionsA[$screenCheapB] < $positionsA[$screenOut],
        'Customer A screens were not stock-first then assigned-price ascending.');
    $screensB = hierarchyAllProducts(['category' => $categories['screens'], 'featured' => 1], $customerB);
    $positionsB = hierarchyPositions($screensB, [$screenCheapA, $screenCheapB]);
    hierarchyAssert($positionsB[$screenCheapB] < $positionsB[$screenCheapA], 'Different assigned groups did not change screen price order.');

    $screenSource = hierarchyAllProducts(['category' => $categories['screens'], 'featured' => 1], $customerA);
    $screenSourcePositions = hierarchyPositions($screenSource, [$screenCheapA, $screenCheapB, $screenProtection, $screenUnpriced]);
    hierarchyAssert(
        $screenSourcePositions[$screenCheapA] < $screenSourcePositions[$screenProtection]
        && $screenSourcePositions[$screenCheapB] < $screenSourcePositions[$screenProtection],
        'A display-protection product in the screens source category received real-screen priority.'
    );
    hierarchyAssert(
        $screenSourcePositions[$screenCheapB] < $screenSourcePositions[$screenUnpriced],
        'An unpriced screen was not placed after adjacent priced screens.'
    );
    $unpriced = $screenSource[array_search($screenUnpriced, array_column($screenSource, 'id'), true)];
    hierarchyAssert($unpriced['price_cents'] === null && !array_key_exists('list_price_eur_cents', $unpriced)
        && !array_key_exists('list_price_cents', $unpriced) && !array_key_exists('purchase_price_eur_cents', $unpriced),
        'An unpriced catalogue item did not safely hide private pricing fields.');
    $priced = $screenSource[array_search($screenCheapA, array_column($screenSource, 'id'), true)];
    hierarchyAssert(is_int($priced['price_cents']), 'A priced catalogue item lost its assigned price beside an unpriced item.');
    hierarchyAssert(
        (int) $screenSource[array_search($screenProtection, array_column($screenSource, 'id'), true)]['category_id'] === $categories['screens'],
        'Protection ranking changed the product source category/filter behavior.'
    );
    $featuredBrowse = hierarchyAllProducts(['featured' => 1], null);
    $tierPositions = hierarchyPositions($featuredBrowse, [$tierTool, $screenProtection]);
    hierarchyAssert($tierPositions[$screenProtection] < $tierPositions[$tierTool],
        'Products did not follow their visible sidebar category order.');

    $housings = hierarchyAllProducts(['category' => $categories['housing'], 'featured' => 1], null);
    $housingPositions = hierarchyPositions($housings, $housing);
    foreach ($housing as $id) hierarchyAssert(isset($housingPositions[$id]), 'Housing fixture missing from listing.');
    hierarchyAssert($housingPositions[$housing[0]] < $housingPositions[$housing[1]]
        && $housingPositions[$housing[1]] < $housingPositions[$housing[2]]
        && $housingPositions[$housing[2]] < $housingPositions[$housing[3]]
        && $housingPositions[$housing[3]] < $housingPositions[$housing[4]]
        && $housingPositions[$housing[4]] < $housingPositions[$housing[5]], 'Housing subtype order is incorrect.');

    $exactResults = catalogProductList(['q' => 'QA-HIER-EXACT', 'limit' => 100], null);
    hierarchyAssert((int) $exactResults['products'][0]['id'] === $exact, 'Exact SKU search precedence changed.');
    $named = catalogProductList(['q' => 'QA-HIER-NAME', 'sort' => 'name', 'limit' => 100], null);
    $namePositions = hierarchyPositions($named['products'], [$alpha, $zulu]);
    hierarchyAssert($namePositions[$alpha] < $namePositions[$zulu], 'Explicit name sort was overridden by browse order.');

    $first = catalogProductList(['category' => $categories['screens'], 'limit' => 10, 'page' => 1], $customerA);
    $second = catalogProductList(['category' => $categories['screens'], 'limit' => 10, 'page' => 2], $customerA);
    $repeat = catalogProductList(['category' => $categories['screens'], 'limit' => 10, 'page' => 1], $customerA);
    $firstIds = array_column($first['products'], 'id');
    hierarchyAssert($firstIds === array_column($repeat['products'], 'id'), 'Default pagination is not stable.');
    hierarchyAssert(!array_intersect($firstIds, array_column($second['products'], 'id')), 'Default pagination contains duplicates.');

    echo "catalog default hierarchy QA passed\n";
} finally {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
}