<?php
declare(strict_types=1);

/**
 * Housing subtypes are derived from explicit product-title wording only.
 * Keep the PHP classifier and SQL CASE in the same conservative priority order.
 */
function catalogHousingPartTypes(): array
{
    return [
        [
            'id' => 'frame-chassis',
            'name' => 'Frame / chassis',
            'description' => 'Middenframe, frame of chassis; geen achterglas.',
        ],
        [
            'id' => 'rear-glass',
            'name' => 'Achterglas',
            'description' => 'Achterglas, ook wanneer een cameralens is inbegrepen.',
        ],
        [
            'id' => 'rear-cover',
            'name' => 'Achter- / batterijcover',
            'description' => 'Achtercover of batterijcover zonder expliciet achterglas.',
        ],
        [
            'id' => 'housing-with-parts',
            'name' => 'Behuizing met onderdelen',
            'description' => 'Met voorgemonteerde onderdelen.',
        ],
        [
            'id' => 'complete-housing',
            'name' => 'Complete behuizing',
            'description' => 'Alleen titels die de behuizing expliciet als compleet benoemen.',
        ],
        [
            'id' => 'other-housing',
            'name' => 'Overige / ongespecificeerde behuizing',
            'description' => 'Behuizing waarvan de titel geen preciezer subtype bewijst.',
        ],
    ];
}

function catalogHousingPartTypeIds(): array
{
    return array_column(catalogHousingPartTypes(), 'id');
}

function catalogHousingCategoryId(): int
{
    static $id = null;
    if ($id === null) {
        $query = db()->prepare('SELECT id FROM categories WHERE slug=? LIMIT 1');
        $query->execute(['housing']);
        $value = $query->fetchColumn();
        if ($value === false) {
            throw new RuntimeException('De behuizingscategorie ontbreekt in de geïsoleerde catalogus.');
        }
        $id = (int) $value;
    }
    return $id;
}

function catalogValidatePartType(mixed $value): string
{
    $part = text($value, 60);
    if (!in_array($part, catalogHousingPartTypeIds(), true)) {
        throw new HttpError(400, 'Ongeldig onderdeeltype.');
    }
    return $part;
}

function catalogHousingPartTypeForTitle(string $title): string
{
    $title = mb_strtolower($title, 'UTF-8');
    if (preg_match('/\b(back\s+cover\s+glass|back\s+glass|rear\s+glass|achterglas)\b/u', $title)) {
        return 'rear-glass';
    }
    if (preg_match('/\b(mid(?:dle)?[\s-]*frame|frame|chassis)\b/u', $title)) {
        return 'frame-chassis';
    }
    if (preg_match('/\b(housing|behuizing)\b.*\b(small\s+components|parts|pre[\s-]*installed|voorgemonteerde?\s+onderdelen)\b/u', $title)) {
        return 'housing-with-parts';
    }
    if (preg_match('/\b(complete\s+(?:housing|behuizing)|(?:housing|behuizing)\s+complete|full\s+housing)\b/u', $title)) {
        return 'complete-housing';
    }
    if (preg_match('/\b(back\s+cover|rear\s+cover|battery\s+cover|achtercover|batterijcover)\b/u', $title)) {
        return 'rear-cover';
    }
    return 'other-housing';
}

function catalogHousingPartTypeSqlCase(string $nameSql = 'p.name'): string
{
    return "CASE
        WHEN LOWER($nameSql) REGEXP '(^|[^[:alnum:]])(back[[:space:]]+cover[[:space:]]+glass|back[[:space:]]+glass|rear[[:space:]]+glass|achterglas)([^[:alnum:]]|$)' THEN 'rear-glass'
        WHEN LOWER($nameSql) REGEXP '(^|[^[:alnum:]])(mid(dle)?[[:space:]-]*frame|frame|chassis)([^[:alnum:]]|$)' THEN 'frame-chassis'
        WHEN LOWER($nameSql) REGEXP '(^|[^[:alnum:]])(housing|behuizing)([^[:alnum:]]|$).*(^|[^[:alnum:]])(small[[:space:]]+components|parts|pre[[:space:]-]*installed|voorgemonteerde?[[:space:]]+onderdelen)([^[:alnum:]]|$)' THEN 'housing-with-parts'
        WHEN LOWER($nameSql) REGEXP '(^|[^[:alnum:]])(complete[[:space:]]+(housing|behuizing)|(housing|behuizing)[[:space:]]+complete|full[[:space:]]+housing)([^[:alnum:]]|$)' THEN 'complete-housing'
        WHEN LOWER($nameSql) REGEXP '(^|[^[:alnum:]])(back[[:space:]]+cover|rear[[:space:]]+cover|battery[[:space:]]+cover|achtercover|batterijcover)([^[:alnum:]]|$)' THEN 'rear-cover'
        ELSE 'other-housing'
    END";
}

function catalogPartTypeCondition(string $part, string $categorySql = 'p.category_id', string $nameSql = 'p.name'): array
{
    $part = catalogValidatePartType($part);
    return [
        'condition' => "$categorySql=? AND " . catalogHousingPartTypeSqlCase($nameSql) . '=?',
        'parameters' => [catalogHousingCategoryId(), $part],
    ];
}

/** @return array{id:string,phrase:string}|null */
function catalogPartTypeSearchMatch(string $search): ?array
{
    $normalized = preg_replace('/[^\p{L}\p{N}]+/u', ' ', mb_strtolower($search, 'UTF-8')) ?? '';
    $normalized = trim($normalized);
    $aliases = [
        'complete-housing' => '/\b(?:complete\s+(?:behuizing|housing)|(?:behuizing|housing)\s+complete|full\s+housing)\b/u',
        'rear-glass' => '/\b(?:achter\s*glas|back\s*cover\s*glass|back\s*glass|rear\s*glass)\b/u',
        'frame-chassis' => '/\b(?:mid\s*frame|middle\s*frame|frame|chassis)\b/u',
        'housing-with-parts' => '/\b(?:behuizing\s+met\s+onderdelen|housing\s+with\s+(?:small\s+components|parts)|voorgemonteerde?|pre\s*installed)\b/u',
        'rear-cover' => '/\b(?:achtercover|batterijcover|back\s*cover|rear\s*cover|battery\s*cover)\b/u',
    ];
    foreach ($aliases as $id => $pattern) {
        if (preg_match($pattern, $normalized, $match)) {
            return ['id' => $id, 'phrase' => $match[0]];
        }
    }
    return null;
}

function catalogPartTypeFromSearch(string $search): ?string
{
    return catalogPartTypeSearchMatch($search)['id'] ?? null;
}

function catalogPartTypeSearchTokensToIgnore(string $search, ?string $part): array
{
    $match = catalogPartTypeSearchMatch($search);
    if ($part === null || $match === null || $match['id'] !== $part) {
        return [];
    }
    // Consume exactly the recognized alias phrase. Device/model words outside it remain filters.
    return catalogTokens($match['phrase']);
}

function catalogPartTypePublic(?string $id): ?array
{
    if ($id === null) {
        return null;
    }
    foreach (catalogHousingPartTypes() as $type) {
        if ($type['id'] === $id) {
            return ['id' => $type['id'], 'name' => $type['name']];
        }
    }
    return null;
}

function catalogProductWithPartType(array $product, ?array $user): array
{
    $public = productForUser($product, $user);
    $public['part_type'] = (int) $product['category_id'] === catalogHousingCategoryId()
        ? catalogPartTypePublic(catalogHousingPartTypeForTitle((string) $product['name']))
        : null;
    return $public;
}

function catalogPartTypeFacets(array $input): array
{
    $predicate = catalogProductCondition($input, ['part']);
    $case = catalogHousingPartTypeSqlCase();
    $query = db()->prepare(
        "SELECT $case AS id,COUNT(DISTINCT p.id) AS count
         FROM products p
         WHERE {$predicate['condition']} AND p.category_id=?
         GROUP BY $case"
    );
    $query->execute([...$predicate['parameters'], catalogHousingCategoryId()]);
    $counts = [];
    foreach ($query->fetchAll() as $row) {
        $counts[(string) $row['id']] = (int) $row['count'];
    }
    return array_map(static function (array $type) use ($counts): array {
        $type['category_id'] = catalogHousingCategoryId();
        $type['count'] = $counts[$type['id']] ?? 0;
        return $type;
    }, catalogHousingPartTypes());
}