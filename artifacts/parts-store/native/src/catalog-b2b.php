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
    $terms = preg_split('/[^\p{L}\p{N}]+/u', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $terms = array_slice(array_values(array_unique($terms)), 0, 8);
    if (!$terms) {
        throw new HttpError(422, 'Enter a search term to look for products.');
    }

    $where = ['p.active=1'];
    $parameters = [];
    $aliases = catalogCategoryAliases();
    $matchedCategorySlugs = [];
    foreach ($terms as $term) {
        $like = catalogLike($term);
        $compact = catalogLike(catalogCompact($term));
        if (preg_match('/^\d{1,4}$/', $term)) {
            // A standalone number is normally a device model. Do not let it match
            // digits buried inside a SKU or supplier code such as GH82-28143A.
            $numericBoundary = '(^|[^0-9])' . preg_quote($term, '/') . '([^0-9]|$)';
            $where[] = "(LOWER(p.sku)=?
                OR LOWER(SUBSTRING_INDEX(p.name,' - ',1)) REGEXP ?
                OR EXISTS(
                    SELECT 1 FROM product_models numeric_pm
                    JOIN device_models numeric_m ON numeric_m.id=numeric_pm.model_id
                    WHERE numeric_pm.product_id=p.id AND LOWER(numeric_m.name) REGEXP ?
                ))";
            array_push($parameters, $term, $numericBoundary, $numericBoundary);
            continue;
        }
        $termCategorySlugs = array_keys(array_filter(
            $aliases,
            static fn(array $words): bool => in_array($term, $words, true)
        ));
        $termWhere = "(LOWER(p.sku) LIKE ? ESCAPE '!'
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
            )";
        array_push($parameters, $like, $like, $like, $compact, $compact, $like, $compact);
        if ($termCategorySlugs) {
            $marks = implode(',', array_fill(0, count($termCategorySlugs), '?'));
            $termWhere .= " OR p.category_id IN (SELECT id FROM categories WHERE slug IN ($marks))";
            array_push($parameters, ...$termCategorySlugs);
            array_push($matchedCategorySlugs, ...$termCategorySlugs);
        }
        $where[] = $termWhere . ')';
    }
    $exact = mb_strtolower($search, 'UTF-8');
    $statement = db()->prepare(
        'SELECT p.* FROM products p WHERE ' . implode(' AND ', $where) .
        " ORDER BY CASE
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
    } elseif ($products && array_filter($terms, static fn(string $term): bool => (bool) preg_match('/^\d{1,4}$/', $term))) {
        $numericTerms = array_values(array_filter(
            $terms,
            static fn(string $term): bool => (bool) preg_match('/^\d{1,4}$/', $term)
        ));
        foreach ($products[0]['models'] as $model) {
            $modelName = mb_strtolower((string) $model['name'], 'UTF-8');
            $matches = array_filter($numericTerms, static fn(string $term): bool =>
                (bool) preg_match('/(^|[^\d])' . preg_quote($term, '/') . '([^\d]|$)/u', $modelName)
            );
            if (count($matches) === count($numericTerms)) {
                $intent = ['kind' => 'model', 'label' => $model['name'], 'model_id' => (int) $model['id']];
                break;
            }
        }
    } elseif ($matchedCategorySlugs) {
        $slug = array_values(array_unique($matchedCategorySlugs))[0];
        $intent = [
            'kind' => 'category',
            'label' => ucwords(str_replace(['-', '_'], ' ', $slug)),
            'category' => $slug,
        ];
    } else {
        $needle = catalogCompact($search);
        if (mb_strlen($needle, 'UTF-8') >= 3) {
            foreach ($products as $product) {
                foreach ($product['models'] as $model) {
                    $modelName = catalogCompact((string) $model['name']);
                    if (str_contains($modelName, $needle) || str_contains($needle, $modelName)) {
                        $intent = ['kind' => 'model', 'label' => $model['name'], 'model_id' => (int) $model['id']];
                        break 2;
                    }
                }
            }
        }
    }
    $context = currencyContext();
    return [
        'products' => $products,
        'has_more' => $hasMore,
        'intent' => $intent,
        'currency' => $context['currency'],
        'currency_context' => $context,
    ];
}