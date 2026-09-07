<?php
declare(strict_types=1);

require_once __DIR__ . '/catalog-search.php';

function handleCatalog(string $method, string $path): bool
{
    if ($method !== 'GET') {
        return false;
    }
    if ($path === '/catalog') {
        respond(catalogFacets($_GET));
    }
    if ($path === '/products') {
        respond(catalogProductList($_GET, currentUser()));
    }
    if ($path === '/search/products') {
        respond(catalogB2bSearch($_GET, currentUser()));
    }
    if ($path === '/search/suggestions') {
        $search = text($_GET['q'] ?? '', 190);
        if ($search === '') {
            respond(['products' => [], 'categories' => [], 'models' => [], 'total' => 0]);
        }
        $facets = catalogFacets();
        $matches = catalogMatchedFacets($facets, $search);
        $result = catalogProductList(['q' => $search, 'limit' => 6], currentUser(), $facets);
        respond([
            'products' => $result['products'], 'total' => $result['total'],
            'categories' => array_slice($matches['categories'], 0, 4),
            'models' => array_slice($matches['models'], 0, 6),
        ]);
    }
    if (preg_match('#^/products/(\d+)$#', $path, $match)) {
        $query = db()->prepare('SELECT * FROM products WHERE id=? AND active=1');
        $query->execute([(int) $match[1]]);
        $product = $query->fetch();
        if (!$product) {
            throw new HttpError(404, 'Product not found.');
        }
        $user = currentUser();
        $query = db()->prepare('SELECT id,url,variants FROM images WHERE product_id=? ORDER BY id');
        $query->execute([$product['id']]);
        $images = $query->fetchAll();
        foreach ($images as &$image) {
            $image['variants'] = json_decode($image['variants'], true);
        }
        unset($image);
        if (!$images && $product['image_url']) {
            $images = [['id' => 0, 'url' => $product['image_url']]];
        }
        $query = db()->prepare('SELECT m.id,m.name FROM product_models pm JOIN device_models m ON m.id=pm.model_id WHERE pm.product_id=? ORDER BY m.name');
        $query->execute([$product['id']]);
        $models = $query->fetchAll();
        $query = db()->prepare('SELECT * FROM products WHERE active=1 AND category_id=? AND id<>? ORDER BY featured DESC,stock>0 DESC LIMIT 4');
        $query->execute([$product['category_id'], $product['id']]);
        $context = currencyContext();
        $enriched = catalogEnrichProducts([$product], $user);
        $related = catalogEnrichProducts($query->fetchAll(), $user);
        respond([
            'product' => $enriched[0], 'images' => $images, 'models' => $models,
            'related' => $related,
            'currency' => $context['currency'], 'currency_context' => $context,
        ]);
    }
    return false;
}