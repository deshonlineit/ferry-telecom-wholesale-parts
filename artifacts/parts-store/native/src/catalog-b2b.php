<?php
declare(strict_types=1);

/**
 * Add public catalogue metadata without exposing internal pricing fields.
 * Metadata is fetched in two batched queries, irrespective of result size.
 */
function catalogEnrichProducts(array $products, ?array $user): array
{
    if (!$products) {
        return [];
    }
    $ids = array_values(array_unique(array_map(
        static fn(array $product): int => (int) $product['id'],
        $products
    )));
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $metadata = [];

    $statement = db()->prepare(
        "SELECT p.id,b.name AS brand_name,c.name AS category_name
         FROM products p
         LEFT JOIN brands b ON b.id=p.brand_id
         LEFT JOIN categories c ON c.id=p.category_id
         WHERE p.id IN ($marks)"
    );
    $statement->execute($ids);
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $metadata[(int) $row['id']] = [
            'brand_name' => $row['brand_name'],
            'category_name' => $row['category_name'],
            'models' => [],
        ];
    }

    $statement = db()->prepare(
        "SELECT pm.product_id,m.id,m.name
         FROM product_models pm
         JOIN device_models m ON m.id=pm.model_id
         WHERE pm.product_id IN ($marks)
         ORDER BY pm.product_id,m.name,m.id"
    );
    $statement->execute($ids);
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $metadata[(int) $row['product_id']]['models'][] = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
        ];
    }

    return array_map(static function (array $product) use ($metadata, $user): array {
        $public = catalogProductWithPartType($product, $user);
        $extra = $metadata[(int) $product['id']] ?? [
            'brand_name' => null, 'category_name' => null, 'models' => [],
        ];
        $public['brand_name'] = $extra['brand_name'];
        $public['category_name'] = $extra['category_name'];
        $public['models'] = $extra['models'];
        return $public;
    }, $products);
}

function catalogB2bSearch(array $input, ?array $user): array
{
    $search = text($input['q'] ?? '', 190);
    // A single character is a valid search: short SKU fragments and model numbers
    // are exactly what buyers type. Only an empty box has nothing to look for.
    if ($search === '') {
        throw new HttpError(422, 'Enter a search term to look for products.');
    }
    $limit = integer($input['limit'] ?? 8, 1, 50);
    $normalized = mb_strtolower($search, 'UTF-8');
    // Smart Search and the full catalogue must interpret conversational wording
    // identically: preserve product intent and discard only filler language.
    $terms = catalogTokens($search);
    if (!$terms) {
        throw new HttpError(422, 'Enter a search term to look for products.');
    }

    $where = ["p.active=TRUE", "p.publication_status='visible'"];
    $parameters = [];
    $aliases = catalogCategoryAliases();
    $matchedCategorySlugs = [];
    foreach ($terms as $term) {
        if (preg_match('/^\d{1,4}$/', $term)) {
            // A standalone number is normally a device model. Do not let it match
            // digits buried inside a SKU or supplier code such as GH82-28143A.
            $numericBoundary = '(^|[^0-9])' . preg_quote($term, '/') . '([^0-9]|$)';
            $regex = dbDriver() === 'pgsql' ? '~*' : 'REGEXP';
            $namePrefix = dbDriver() === 'pgsql' ? "split_part(p.name,' - ',1)" : "SUBSTRING_INDEX(p.name,' - ',1)";
            $where[] = "(LOWER(p.sku)=?
                OR LOWER($namePrefix) $regex ?
                OR EXISTS(
                    SELECT 1 FROM product_models numeric_pm
                    JOIN device_models numeric_m ON numeric_m.id=numeric_pm.model_id
                    WHERE numeric_pm.product_id=p.id AND LOWER(numeric_m.name) $regex ?
                ))";
            array_push($parameters, $term, $numericBoundary, $numericBoundary);
            continue;
        }
        $termCategorySlugs = array_keys(array_filter(
            $aliases,
            static fn(array $words): bool => in_array($term, $words, true)
        ));
        $variantConditions = [];
        if (!$termCategorySlugs) {
            foreach (catalogSearchTermVariants($term) as $variant) {
                $like = catalogLike($variant);
                $compact = catalogLike(catalogCompact($variant));
                $variantConditions[] = "(LOWER(p.sku) LIKE ? ESCAPE '!'
                    OR LOWER(p.name) LIKE ? ESCAPE '!'
                    OR LOWER(p.quality) LIKE ? ESCAPE '!'
                    OR LOWER(REPLACE(REPLACE(p.sku,' ',''),'-','')) LIKE ? ESCAPE '!'
                    OR LOWER(REPLACE(REPLACE(p.name,' ',''),'-','')) LIKE ? ESCAPE '!'
                    OR EXISTS(
                        SELECT 1 FROM product_models search_pm
                        JOIN device_models search_m ON search_m.id=search_pm.model_id
                        WHERE search_pm.product_id=p.id AND (
                            LOWER(search_m.name) LIKE ? ESCAPE '!'
                            OR LOWER(REPLACE(REPLACE(search_m.name,' ',''),'-','')) LIKE ? ESCAPE '!'
                        )
                    ))";
                array_push($parameters, $like, $like, $like, $compact, $compact, $like, $compact);
            }
        }
        $termWhere = '(' . ($variantConditions ? implode(' OR ', $variantConditions) : '1=0');
        if ($termCategorySlugs) {
            $marks = implode(',', array_fill(0, count($termCategorySlugs), '?'));
            $termWhere .= " OR p.category_id IN (SELECT id FROM categories WHERE slug IN ($marks))";
            array_push($parameters, ...$termCategorySlugs);
            array_push($matchedCategorySlugs, ...$termCategorySlugs);
        }
        $where[] = $termWhere . ')';
    }
    $partStatement = db()->prepare(
        'SELECT c.id,c.name,c.slug,COUNT(*) AS count,
            MAX(NULLIF(p.image_url,\'\')) AS image_url
         FROM products p
         JOIN categories c ON c.id=p.category_id
         WHERE ' . implode(' AND ', $where) . '
         GROUP BY c.id,c.name,c.slug
         ORDER BY CASE c.slug
            WHEN \'screens\' THEN 1
            WHEN \'batteries\' THEN 2
            WHEN \'housing\' THEN 3
            WHEN \'charging\' THEN 4
            WHEN \'cameras\' THEN 5
            WHEN \'flex\' THEN 6
            ELSE 20 END,
            count DESC,c.name
         LIMIT 8'
    );
    $partStatement->execute($parameters);
    $partOptions = array_map(static fn(array $row): array => [
        'id' => (int) $row['id'],
        'name' => (string) $row['name'],
        'slug' => (string) $row['slug'],
        'count' => (int) $row['count'],
        'image_url' => (string) ($row['image_url'] ?? ''),
    ], $partStatement->fetchAll(PDO::FETCH_ASSOC));
    $exact = mb_strtolower($search, 'UTF-8');
    $numericTerms = array_values(array_filter(
        $terms,
        static fn(string $term): bool => (bool) preg_match('/^\d{1,4}$/', $term)
    ));
    $iphonePreference = '';
    $rankingParameters = [];
    if ($numericTerms && !preg_match('/\b(samsung|galaxy|xiaomi|redmi|poco|google|pixel|huawei|honor|oneplus|oppo|motorola|nokia|sony|xperia)\b/u', $normalized)) {
        $iphonePreference = "CASE WHEN EXISTS(
            SELECT 1 FROM product_models rank_pm
            JOIN device_models rank_m ON rank_m.id=rank_pm.model_id
            WHERE rank_pm.product_id=p.id AND LOWER(rank_m.name) LIKE ? ESCAPE '!'
        ) THEN 0 ELSE 1 END,";
        $rankingParameters[] = catalogLike('iphone ' . $numericTerms[0]);
    }
    $statement = db()->prepare(
        'SELECT p.* FROM products p WHERE ' . implode(' AND ', $where) .
        " ORDER BY $iphonePreference CASE
            WHEN LOWER(p.sku)=? THEN 0
            WHEN LOWER(p.name)=? THEN 1
            WHEN LOWER(p.sku) LIKE ? ESCAPE '!' THEN 2
            WHEN LOWER(p.name) LIKE ? ESCAPE '!' THEN 3
            ELSE 4 END,
          p.stock>0 DESC,p.name,p.id
          LIMIT ?"
    );
    $statement->execute([
        ...$parameters,
        ...$rankingParameters,
        $exact,
        $exact,
        catalogLike($exact),
        catalogLike($exact),
        $limit + 1,
    ]);
    $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
    $hasMore = count($rows) > $limit;
    if ($hasMore) {
        array_pop($rows);
    }
    $products = catalogEnrichProducts($rows, $user);
    $intent = ['kind' => 'product', 'label' => 'Product match'];
    if ($products && mb_strtolower((string) $products[0]['sku'], 'UTF-8') === $exact) {
        $intent = ['kind' => 'sku', 'label' => 'Exact SKU'];
    } elseif ($products) {
        $recognizedModel = null;
        $intentNeedle = catalogCompact(implode(' ', $terms));
        foreach ($products[0]['models'] as $model) {
            $modelName = mb_strtolower((string) $model['name'], 'UTF-8');
            $modelCompact = catalogCompact($modelName);
            $numericMatch = $numericTerms && count(array_filter(
                $numericTerms,
                static fn(string $term): bool =>
                    (bool) preg_match('/(^|[^\d])' . preg_quote($term, '/') . '([^\d]|$)/u', $modelName)
            )) === count($numericTerms);
            $codedModelMatch = (bool) array_filter(
                $terms,
                static fn(string $term): bool =>
                    (bool) preg_match('/\d/u', $term)
                    && mb_strlen($term, 'UTF-8') >= 2
                    && str_contains($modelCompact, catalogCompact($term))
            );
            if (
                str_contains($intentNeedle, $modelCompact)
                || str_contains($modelCompact, $intentNeedle)
                || $numericMatch
                || $codedModelMatch
            ) {
                $recognizedModel = $model;
                break;
            }
        }
        $categoryLabels = [
            'screens' => 'Displays & touchscreens',
            'batteries' => 'Batteries',
            'charging' => 'Charging parts',
            'cameras' => 'Cameras',
            'housing' => 'Housings & back glass',
            'flex' => 'Flex cables & buttons',
            'audio' => 'Audio parts',
            'adhesive' => 'Adhesives',
            'tools' => 'Tools',
            'protection' => 'Protection',
            'accessories' => 'Accessories',
        ];
        $categorySlug = $matchedCategorySlugs
            ? array_values(array_unique($matchedCategorySlugs))[0]
            : null;
        if ($recognizedModel && $categorySlug) {
            $intent = [
                'kind' => 'model_part',
                'label' => $recognizedModel['name'] . ' · ' . ($categoryLabels[$categorySlug] ?? ucfirst($categorySlug)),
                'model_id' => (int) $recognizedModel['id'],
                'category' => $categorySlug,
            ];
        } elseif ($recognizedModel) {
            $intent = ['kind' => 'model', 'label' => $recognizedModel['name'], 'model_id' => (int) $recognizedModel['id']];
        } elseif ($categorySlug) {
            $intent = [
                'kind' => 'category',
                'label' => $categoryLabels[$categorySlug] ?? ucfirst($categorySlug),
                'category' => $categorySlug,
            ];
        }
    }
    $context = currencyContext();
    return [
        'products' => $products,
        'has_more' => $hasMore,
        'intent' => $intent,
        'part_options' => $partOptions,
        'currency' => $context['currency'],
        'currency_context' => $context,
    ];
}