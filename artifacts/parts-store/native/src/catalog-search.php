<?php
declare(strict_types=1);

function catalogCompact(string $value): string
{
    return preg_replace('/[^\p{L}\p{N}]/u', '', mb_strtolower($value, 'UTF-8')) ?? '';
}

function catalogLike(string $value): string
{
    return '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value) . '%';
}

function catalogFacets(): array
{
    $categories = db()->query(
        "SELECT c.id,c.name,c.slug,COUNT(p.id) AS count,
            COALESCE((SELECT pi.image_url FROM products pi
                WHERE pi.category_id=c.id AND pi.active=1 AND pi.image_url<>''
                ORDER BY pi.featured DESC,pi.id DESC LIMIT 1),'') AS image_url
         FROM categories c LEFT JOIN products p ON p.category_id=c.id AND p.active=1
         GROUP BY c.id ORDER BY count DESC,c.name"
    )->fetchAll();
    $brands = db()->query(
        'SELECT b.id,b.name,COUNT(p.id) AS count FROM brands b
         LEFT JOIN products p ON p.brand_id=b.id AND p.active=1
         GROUP BY b.id ORDER BY count DESC,b.name'
    )->fetchAll();
    $models = db()->query(
        'SELECT m.id,m.brand_id,m.name,COUNT(p.id) AS count FROM device_models m
         LEFT JOIN product_models pm ON pm.model_id=m.id
         LEFT JOIN products p ON p.id=pm.product_id AND p.active=1
         GROUP BY m.id ORDER BY m.name'
    )->fetchAll();
    return [
        'categories' => $categories, 'brands' => $brands, 'models' => $models,
        'qualities' => db()->query("SELECT DISTINCT quality FROM products WHERE active=1 AND quality<>'' ORDER BY quality")->fetchAll(PDO::FETCH_COLUMN),
        'total' => (int) db()->query('SELECT COUNT(*) FROM products WHERE active=1')->fetchColumn(),
    ];
}

function catalogCategoryAliases(): array
{
    return [
        'screens' => ['scherm', 'schermen', 'display', 'displays', 'screen', 'screens', 'touchscreen', 'touchscreens'],
        'batteries' => ['batterij', 'batterijen', 'accu', 'accus', 'battery', 'batteries'],
        'charging' => ['laadpoort', 'laadpoorten', 'oplaadpoort', 'dockconnector', 'chargingport'],
        'cameras' => ['camera', 'cameras', 'lens', 'lenzen'],
        'housing' => ['behuizing', 'achterglas', 'achterkant', 'backcover', 'housing', 'backglass'],
        'flex' => ['flex', 'flexkabel', 'flexkabels', 'knop', 'knoppen', 'button', 'buttons'],
        'audio' => ['speaker', 'speakers', 'luidspreker', 'luidsprekers', 'microfoon', 'audio', 'earpiece'],
        'adhesive' => ['adhesive', 'lijm', 'afdichting', 'plakstrip', 'plakstrips', 'tape'],
        'tools' => ['gereedschap', 'reparatiegereedschap', 'tool', 'tools'],
        'protection' => ['hoesje', 'hoesjes', 'hoes', 'bescherming', 'case', 'cases', 'screenprotector'],
        'accessories' => ['accessoire', 'accessoires', 'accessory', 'accessories'],
    ];
}

function catalogTokens(string $search): array
{
    $normalized = preg_replace('/[^\p{L}\p{N}]+/u', ' ', mb_strtolower($search, 'UTF-8')) ?? '';
    // Keep device phrases together: "iPhone 13" must not match an iPhone 6 SKU ending in 13.
    $normalized = preg_replace(
        '/\b(iphone|ipad|ipod|pixel|galaxy|oneplus|redmi|poco|nokia|xperia)\s+([a-z]?\d[\p{L}\p{N}]*)/u',
        '$1$2',
        $normalized
    ) ?? $normalized;
    $normalized = preg_replace_callback(
        '/\b((?:iphone|pixel|galaxy|oneplus|redmi|poco|xperia)[a-z]?\d+[a-z]?)\s+(pro|max|mini|plus|ultra|lite)\b(?:\s+(max|plus|ultra))?/u',
        static fn ($m) => $m[1] . $m[2] . ($m[3] ?? ''),
        $normalized
    ) ?? $normalized;
    $tokens = preg_split('/\s+/u', trim($normalized), -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $tokens = array_values(array_diff($tokens, ['voor', 'for', 'van', 'de', 'the', 'en', 'and', 'met', 'with']));
    return array_slice(array_unique($tokens), 0, 8);
}

/** Read-only matching: suggestions never create or infer compatibility records. */
function catalogMatchedFacets(array $facets, string $search): array
{
    $tokens = catalogTokens($search);
    $aliases = catalogCategoryAliases();
    $matches = ['categories' => [], 'models' => []];
    if (!$tokens) {
        return $matches;
    }
    $brandNames = array_column($facets['brands'], 'name', 'id');
    $modelNames = array_map(
        fn ($m) => catalogCompact(($brandNames[$m['brand_id']] ?? '') . ' ' . $m['name']),
        $facets['models']
    );
    $modelTokens = array_values(array_filter($tokens, static function ($token) use ($modelNames) {
        foreach ($modelNames as $name) {
            if (str_contains($name, $token)) return true;
        }
        return false;
    }));
    foreach (['categories', 'models'] as $kind) {
        foreach ($facets[$kind] as $item) {
            if ((int) $item['count'] === 0) {
                continue;
            }
            $name = catalogCompact($item['name']);
            if ($kind === 'models') {
                if (!$modelTokens) continue;
                $modelName = catalogCompact(($brandNames[$item['brand_id']] ?? '') . ' ' . $item['name']);
                $allMatch = true;
                foreach ($modelTokens as $token) {
                    if (!str_contains($modelName, $token)) $allMatch = false;
                }
                if ($allMatch) $matches[$kind][] = $item;
                continue;
            }
            foreach ($tokens as $token) {
                $exactSlugs = array_keys(array_filter($aliases, fn ($terms) => in_array($token, $terms, true)));
                $match = $exactSlugs ? in_array($item['slug'], $exactSlugs, true) : str_contains($name, $token);
                if ($match) {
                    $matches[$kind][] = $item;
                    break;
                }
            }
        }
        usort($matches[$kind], static function ($a, $b) use ($search) {
            $needle = catalogCompact($search);
            $aName = catalogCompact($a['name']);
            $bName = catalogCompact($b['name']);
            $aRank = $aName === $needle ? 0 : (str_contains($aName, $needle) ? 1 : 2);
            $bRank = $bName === $needle ? 0 : (str_contains($bName, $needle) ? 1 : 2);
            return ($aRank <=> $bRank) ?: ($b['count'] <=> $a['count']) ?: strnatcasecmp($a['name'], $b['name']);
        });
    }
    return $matches;
}

function catalogProductList(array $input, ?array $user, ?array $facets = null): array
{
    $page = integer($input['page'] ?? 1, 1, 100000);
    $limit = integer($input['limit'] ?? 24, 1, 100);
    $where = ['p.active=1'];
    $parameters = [];
    $search = text($input['q'] ?? '', 190);
    $tokens = catalogTokens($search);
    $compactName = "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(p.name,' ',''),'-',''),'/',''),'.',''))";
    if ($search !== '') {
        $facets ??= catalogFacets();
        if (!$tokens) {
            $where[] = '1=0';
        }
        foreach ($tokens as $term) {
            $alternatives = ["p.name LIKE ? ESCAPE '!'", "p.sku LIKE ? ESCAPE '!'", "p.quality LIKE ? ESCAPE '!'"];
            array_push($parameters, catalogLike($term), catalogLike($term), catalogLike($term));
            if (preg_match('/[\p{L}].*\d|\d.*[\p{L}]/u', $term)) {
                $alternatives[] = "$compactName LIKE ? ESCAPE '!'";
                $parameters[] = catalogLike($term);
            }
            $matched = catalogMatchedFacets($facets, $term);
            foreach (['categories' => 'category_id', 'brands' => 'brand_id'] as $kind => $column) {
                $rows = $kind === 'categories' ? $matched['categories'] : array_filter(
                    $facets['brands'], fn ($b) => str_contains(catalogCompact($b['name']), $term)
                );
                $ids = array_map('intval', array_column($rows, 'id'));
                if ($ids) {
                    $alternatives[] = "p.$column IN (" . implode(',', array_fill(0, count($ids), '?')) . ')';
                    array_push($parameters, ...$ids);
                }
            }
            $ids = array_map('intval', array_column($matched['models'], 'id'));
            if ($ids) {
                $alternatives[] = 'EXISTS(SELECT 1 FROM product_models pm WHERE pm.product_id=p.id AND pm.model_id IN ('
                    . implode(',', array_fill(0, count($ids), '?')) . '))';
                array_push($parameters, ...$ids);
            }
            $where[] = '(' . implode(' OR ', $alternatives) . ')';
        }
    }
    foreach (['brand' => 'brand_id', 'category' => 'category_id'] as $key => $column) {
        if (isset($input[$key]) && $input[$key] !== '') {
            $where[] = "p.$column=?";
            $parameters[] = integer($input[$key], 1);
        }
    }
    if (!empty($input['model'])) {
        $where[] = 'EXISTS(SELECT 1 FROM product_models pm WHERE pm.product_id=p.id AND pm.model_id=?)';
        $parameters[] = integer($input['model'], 1);
    }
    if (!empty($input['quality'])) {
        $where[] = 'p.quality=?';
        $parameters[] = text($input['quality'], 100);
    }
    if (in_array($input['stock'] ?? '', ['1', 'in_stock'], true)) {
        $where[] = 'p.stock>0';
    } elseif (($input['stock'] ?? '') === 'out_of_stock') {
        $where[] = 'p.stock=0';
    }
    if ((string) ($input['featured'] ?? '') === '1') {
        $where[] = 'p.featured=1';
    }
    $condition = implode(' AND ', $where);
    $query = db()->prepare('SELECT COUNT(*) FROM products p WHERE ' . $condition);
    $query->execute($parameters);
    $total = (int) $query->fetchColumn();
    $pages = max(1, (int) ceil($total / $limit));
    $page = min($page, $pages);
    $sort = $input['sort'] ?? 'featured';
    $sorts = [
        'name' => 'p.name ASC,p.id ASC',
        'newest' => 'p.created_at DESC,p.id DESC',
        'stock' => 'p.stock DESC,p.name ASC,p.id ASC',
        'featured' => "p.featured DESC,p.stock>0 DESC,p.image_url<>'' DESC,p.id DESC",
    ];
    $order = $sorts[$sort] ?? $sorts['featured'];
    $orderParams = [];
    if ($search !== '' && in_array($sort, ['featured', 'relevance'], true)) {
        $order = "CASE WHEN p.sku=? THEN 0 WHEN p.name=? THEN 1 WHEN $compactName LIKE ? ESCAPE '!' THEN 2 ELSE 3 END,
            p.stock>0 DESC,p.image_url<>'' DESC,p.name ASC,p.id ASC";
        $orderParams = [$search, $search, catalogLike(catalogCompact($search))];
    }
    $priceJoin = '';
    $priceParams = [];
    if (in_array($sort, ['price_asc', 'price_desc'], true) && $user) {
        $priceJoin = ' LEFT JOIN group_prices gp ON gp.product_id=p.id AND gp.group_id=? ';
        $priceParams[] = $user['group_id'];
        $order = 'COALESCE(gp.price_cents,p.list_price_cents) ' . ($sort === 'price_asc' ? 'ASC' : 'DESC') . ',p.id ASC';
        $orderParams = [];
    }
    $query = db()->prepare("SELECT p.* FROM products p $priceJoin WHERE $condition ORDER BY $order LIMIT ? OFFSET ?");
    $query->execute([...$priceParams, ...$parameters, ...$orderParams, $limit, ($page - 1) * $limit]);
    return [
        'products' => array_map(fn ($p) => productForUser($p, $user), $query->fetchAll()),
        'total' => $total, 'page' => $page, 'pages' => $pages,
    ];
}