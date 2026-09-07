<?php
declare(strict_types=1);

require_once __DIR__ . '/catalog-part-types.php';
require_once __DIR__ . '/device-family-metadata.php';
require_once __DIR__ . '/catalog-b2b.php';

function catalogCompact(string $value): string
{
    return preg_replace('/[^\p{L}\p{N}]/u', '', mb_strtolower($value, 'UTF-8')) ?? '';
}

function catalogLike(string $value): string
{
    return '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $value) . '%';
}

function catalogUnfilteredFacets(): array
{
    static $facets = null;
    if ($facets !== null) {
        return $facets;
    }
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
    $models = deviceAnnotateModels($models, $brands);
    $facets = [
        'categories' => $categories, 'brands' => $brands, 'models' => $models,
        'qualities' => db()->query("SELECT DISTINCT quality FROM products WHERE active=1 AND quality<>'' ORDER BY quality")->fetchAll(PDO::FETCH_COLUMN),
        'total' => (int) db()->query('SELECT COUNT(*) FROM products WHERE active=1')->fetchColumn(),
    ];
    return $facets;
}

/**
 * Build the one product predicate used by listings and contextual facet counts.
 * Exclusions implement "selfless" facets without changing search interpretation.
 *
 * @return array{condition:string,parameters:array,search:string,compact_name:string}
 */
function catalogProductCondition(array $input, array $exclude = []): array
{
    $where = ['p.active=1'];
    $parameters = [];
    $search = text($input['q'] ?? '', 190);
    $tokens = catalogTokens($search);
    $searchPart = catalogPartTypeFromSearch($search);
    $ignoredSubtypeTokens = catalogPartTypeSearchTokensToIgnore($search, $searchPart);
    $compactName = "LOWER(REPLACE(REPLACE(REPLACE(REPLACE(p.name,' ',''),'-',''),'/',''),'.',''))";
    if ($search !== '' && !in_array('q', $exclude, true)) {
        // Search aliases must always come from the complete dictionaries, never contextual counts.
        $facets = catalogUnfilteredFacets();
        if (!$tokens) {
            $where[] = '1=0';
        }
        foreach ($tokens as $term) {
            if (in_array($term, $ignoredSubtypeTokens, true)) {
                continue;
            }
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
        if ($searchPart !== null) {
            $partPredicate = catalogPartTypeCondition($searchPart);
            $where[] = $partPredicate['condition'];
            array_push($parameters, ...$partPredicate['parameters']);
        }
    }
    foreach (['brand' => 'brand_id', 'category' => 'category_id'] as $key => $column) {
        if (!in_array($key, $exclude, true) && isset($input[$key]) && $input[$key] !== '') {
            $where[] = "p.$column=?";
            $parameters[] = integer($input[$key], 1);
        }
    }
    if (!in_array('family', $exclude, true) && !empty($input['family'])) {
        $family = text($input['family'], 30);
        $allowed = array_column(deviceFamilyDefinitions(), 'id');
        if (!in_array($family, $allowed, true)) throw new HttpError(400, 'Unknown device family.');
        $ids = array_map('intval', array_column(array_filter(catalogUnfilteredFacets()['models'], fn ($m) => ($m['family'] ?? null) === $family), 'id'));
        if (!$ids) $where[] = '1=0';
        else {
            $where[] = 'EXISTS(SELECT 1 FROM product_models family_pm WHERE family_pm.product_id=p.id AND family_pm.model_id IN (' . implode(',', array_fill(0, count($ids), '?')) . '))';
            array_push($parameters, ...$ids);
        }
    }
    // Device brand browsing ("alles voor Apple") is compatibility, never the manufacturer of the part itself.
    if (!in_array('device_brand', $exclude, true) && !empty($input['device_brand'])) {
        $where[] = 'EXISTS(SELECT 1 FROM product_models device_pm JOIN device_models device_dm ON device_dm.id=device_pm.model_id
            WHERE device_pm.product_id=p.id AND device_dm.brand_id=?)';
        $parameters[] = integer($input['device_brand'], 1);
    }
    if (!in_array('model', $exclude, true) && !empty($input['model'])) {
        $where[] = 'EXISTS(SELECT 1 FROM product_models pm WHERE pm.product_id=p.id AND pm.model_id=?)';
        $parameters[] = integer($input['model'], 1);
    }
    if (!in_array('quality', $exclude, true) && !empty($input['quality'])) {
        $where[] = 'p.quality=?';
        $parameters[] = text($input['quality'], 100);
    }
    if (!in_array('stock', $exclude, true) && in_array($input['stock'] ?? '', ['1', 'in_stock'], true)) {
        $where[] = 'p.stock>0';
    } elseif (!in_array('stock', $exclude, true) && ($input['stock'] ?? '') === 'out_of_stock') {
        $where[] = 'p.stock=0';
    }
    if (!in_array('featured', $exclude, true) && (string) ($input['featured'] ?? '') === '1') {
        $where[] = 'p.featured=1';
    }
    if (!in_array('part', $exclude, true) && array_key_exists('part', $input) && $input['part'] !== '') {
        $partPredicate = catalogPartTypeCondition(catalogValidatePartType($input['part']));
        $where[] = $partPredicate['condition'];
        array_push($parameters, ...$partPredicate['parameters']);
    }
    return [
        'condition' => implode(' AND ', $where),
        'parameters' => $parameters,
        'search' => $search,
        'compact_name' => $compactName,
    ];
}

function catalogFacetCounts(string $groupSql, array $input, array $exclude): array
{
    $predicate = catalogProductCondition($input, $exclude);
    $query = db()->prepare(
        "SELECT $groupSql AS id,COUNT(DISTINCT p.id) AS count
         FROM products p
         WHERE {$predicate['condition']}
         GROUP BY $groupSql"
    );
    $query->execute($predicate['parameters']);
    $counts = [];
    foreach ($query->fetchAll() as $row) {
        $counts[(int) $row['id']] = $row['count'];
    }
    return $counts;
}

function catalogFacets(array $input = []): array
{
    $base = catalogUnfilteredFacets();
    $partTypes = catalogPartTypeFacets($input);
    $contextKeys = ['category', 'brand', 'device_brand', 'model', 'family', 'q', 'quality', 'stock', 'featured', 'part'];
    $contextual = false;
    foreach ($contextKeys as $key) {
        if (isset($input[$key]) && $input[$key] !== '') {
            $contextual = true;
            break;
        }
    }
    if (!$contextual) {
        $base['part_types'] = $partTypes;
        $base['device_families'] = catalogDeviceFamilyFacets($input);
        return $base;
    }

    $categoryCounts = catalogFacetCounts('p.category_id', $input, ['category', 'part']);
    $brandCounts = catalogFacetCounts('p.brand_id', $input, ['brand', 'model']);
    // Model search is the cross-family escape hatch, so no device scope may narrow it.
    $modelPredicate = catalogProductCondition($input, ['model', 'family', 'device_brand']);
    $query = db()->prepare(
        "SELECT facet_pm.model_id AS id,COUNT(DISTINCT p.id) AS count
         FROM products p
         JOIN product_models facet_pm ON facet_pm.product_id=p.id
         WHERE {$modelPredicate['condition']}
         GROUP BY facet_pm.model_id"
    );
    $query->execute($modelPredicate['parameters']);
    $modelCounts = [];
    foreach ($query->fetchAll() as $row) {
        $modelCounts[(int) $row['id']] = $row['count'];
    }
    $withCounts = static function (array $rows, array $counts): array {
        return array_map(static function (array $row) use ($counts): array {
            $row['count'] = $counts[(int) $row['id']] ?? 0;
            return $row;
        }, $rows);
    };

    $qualityPredicate = catalogProductCondition($input, ['quality']);
    $query = db()->prepare(
        "SELECT DISTINCT p.quality FROM products p
         WHERE {$qualityPredicate['condition']} AND p.quality<>''
         ORDER BY p.quality"
    );
    $query->execute($qualityPredicate['parameters']);
    $totalPredicate = catalogProductCondition($input);
    $queryTotal = db()->prepare('SELECT COUNT(*) FROM products p WHERE ' . $totalPredicate['condition']);
    $queryTotal->execute($totalPredicate['parameters']);

    return [
        'categories' => $withCounts($base['categories'], $categoryCounts),
        'brands' => $withCounts($base['brands'], $brandCounts),
        'models' => $withCounts($base['models'], $modelCounts),
        'qualities' => $query->fetchAll(PDO::FETCH_COLUMN),
        'total' => (int) $queryTotal->fetchColumn(),
        'part_types' => $partTypes,
        'device_families' => catalogDeviceFamilyFacets($input),
    ];
}

function catalogDeviceFamilyFacets(array $input): array
{
    $base = catalogUnfilteredFacets();
    $familyInput = $input;
    if (!empty($familyInput['q'])) {
        $deviceTokens = [];
        foreach ($base['models'] as $model) {
            foreach (preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($model['name'], 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $token) $deviceTokens[$token] = true;
        }
        foreach ($base['brands'] as $brand) {
            foreach (preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($brand['name'], 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $token) $deviceTokens[$token] = true;
        }
        foreach (deviceFamilyDefinitions() as $family) {
            foreach (preg_split('/[^\p{L}\p{N}]+/u', mb_strtolower($family['label'], 'UTF-8'), -1, PREG_SPLIT_NO_EMPTY) ?: [] as $token) $deviceTokens[$token] = true;
        }
        $words = preg_split('/\s+/u', trim(mb_strtolower((string) $familyInput['q'], 'UTF-8')), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $familyInput['q'] = implode(' ', array_filter($words, static function ($word) use ($deviceTokens) {
            $token = preg_replace('/[^\p{L}\p{N}]/u', '', $word);
            return $token === '' || !isset($deviceTokens[$token]);
        }));
    }
    $predicate = catalogProductCondition($familyInput, ['family', 'model', 'brand']);
    $counts = [];
    foreach (deviceFamilyDefinitions() as $family) {
        $ids = array_map('intval', array_column(array_filter($base['models'], fn ($model) => ($model['family'] ?? null) === $family['id']), 'id'));
        if (!$ids) { $counts[$family['id']] = 0; continue; }
        $sql = "SELECT COUNT(DISTINCT p.id) FROM products p WHERE {$predicate['condition']} AND EXISTS(SELECT 1 FROM product_models dfpm WHERE dfpm.product_id=p.id AND dfpm.model_id IN (" . implode(',', array_fill(0, count($ids), '?')) . '))';
        $query = db()->prepare($sql);
        $query->execute([...$predicate['parameters'], ...$ids]);
        $counts[$family['id']] = (int) $query->fetchColumn();
    }
    return array_map(static fn ($family) => [
        'id' => $family['id'], 'label' => $family['label'], 'count' => $counts[$family['id']] ?? 0, 'groups' => $family['groups']
    ], deviceFamilyDefinitions());
}

function catalogCategoryAliases(): array
{
    return [
        'screens' => ['scherm', 'schermen', 'display', 'displays', 'screen', 'screens', 'touchscreen', 'touchscreens'],
        'batteries' => ['batterij', 'batterijen', 'accu', 'accus', 'battery', 'batteries'],
        'charging' => ['laadpoort', 'laadpoorten', 'oplaadpoort', 'dockconnector', 'chargingport'],
        'cameras' => ['camera', 'cameras', 'lens', 'lenzen'],
        'housing' => ['behuizing', 'achterkant', 'housing'],
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
    $predicate = catalogProductCondition($input);
    $condition = $predicate['condition'];
    $parameters = $predicate['parameters'];
    $search = $predicate['search'];
    $compactName = $predicate['compact_name'];
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
        $order = 'COALESCE(gp.price_eur_cents,p.list_price_eur_cents) ' . ($sort === 'price_asc' ? 'ASC' : 'DESC') . ',p.id ASC';
        $orderParams = [];
    }
    $query = db()->prepare("SELECT p.* FROM products p $priceJoin WHERE $condition ORDER BY $order LIMIT ? OFFSET ?");
    $query->execute([...$priceParams, ...$parameters, ...$orderParams, $limit, ($page - 1) * $limit]);
    $context = currencyContext();
    return [
        'products' => catalogEnrichProducts($query->fetchAll(), $user),
        'total' => $total, 'page' => $page, 'pages' => $pages,
        'currency' => $context['currency'], 'currency_context' => $context,
    ];
}