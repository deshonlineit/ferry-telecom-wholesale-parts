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
        $public['review_summary'] = null;
        return $public;
    }, $products);
}

function catalogB2bSearch(array $input, ?array $user): array
{
    $search = text($input['q'] ?? '', 190);
    if (mb_strlen($search, 'UTF-8') < 3) {
        throw new HttpError(422, 'Gebruik minimaal 3 tekens om producten te zoeken.');
    }
    $limit = integer($input['limit'] ?? 8, 1, 50);
    $normalized = mb_strtolower($search, 'UTF-8');
    $terms = preg_split('/[^\p{L}\p{N}]+/u', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $terms = array_slice(array_values(array_unique($terms)), 0, 8);
    if (!$terms) {
        throw new HttpError(422, 'Gebruik minimaal 3 tekens om producten te zoeken.');
    }

    $where = ['p.active=1'];
    $parameters = [];
    foreach ($terms as $term) {
        $like = catalogLike($term);
        $where[] = "(LOWER(p.sku) LIKE ? ESCAPE '!'
            OR LOWER(p.name) LIKE ? ESCAPE '!'
            OR LOWER(p.quality) LIKE ? ESCAPE '!'
            OR EXISTS(
                SELECT 1 FROM product_models search_pm
                JOIN device_models search_m ON search_m.id=search_pm.model_id
                WHERE search_pm.product_id=p.id AND LOWER(search_m.name) LIKE ? ESCAPE '!'
            ))";
        array_push($parameters, $like, $like, $like, $like);
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
    $context = currencyContext();
    return [
        'products' => catalogEnrichProducts($rows, $user),
        'has_more' => $hasMore,
        'currency' => $context['currency'],
        'currency_context' => $context,
    ];
}