<?php
declare(strict_types=1);

function deviceFamilyMetadataData(): array
{
    static $data;
    if ($data === null) {
        $data = json_decode((string) file_get_contents(__DIR__ . '/device-family-metadata.json'), true, 512, JSON_THROW_ON_ERROR);
    }
    return $data;
}

function deviceFamilyDefinitions(): array
{
    return deviceFamilyMetadataData()['families'];
}

/** Remove supplier packaging suffixes that describe a product bundle, not a device model. */
function deviceCanonicalModelName(string $name): string
{
    return trim((string) preg_replace('/\s*\(\s*\d+\s*pack\s*\)\s*$/iu', '', $name));
}

function deviceFamilyId(array $model, array $brandNames): ?string
{
    $brand = mb_strtolower((string) ($brandNames[$model['brand_id']] ?? ''), 'UTF-8');
    $name = mb_strtolower(trim((string) $model['name']), 'UTF-8');
    foreach (deviceFamilyDefinitions() as $family) {
        if ($brand !== mb_strtolower($family['brand'], 'UTF-8')) continue;
        foreach ($family['prefixes'] as $prefix) {
            if (str_starts_with($name, $prefix)) return $family['id'];
        }
    }
    return null;
}

function deviceFamilyGroup(string $family, string $name): array
{
    $name = mb_strtolower($name, 'UTF-8');
    if ($family === 'iphone') {
        if (preg_match('/^iphone\s+(\d+)(?:s|c)?\b/i', $name, $match)) return ["series-{$match[1]}", "iPhone {$match[1]} Series"];
        if (preg_match('/^iphone\s+x[rs]?(?:\s|\(|$)/i', $name)) return ['series-x', 'iPhone X · XR · XS Series'];
        if (preg_match('/^iphone\s+se(?:\s|\(|$)/i', $name)) return ['series-se', 'iPhone SE Series'];
        return ['iphone-other', 'Other iPhone models'];
    }
    if ($family === 'ipad') {
        foreach (['pro', 'air', 'mini'] as $group) if (str_contains($name, "ipad $group")) return [$group, "iPad " . ucfirst($group)];
        return ['ipad', 'iPad'];
    }
    if ($family === 'samsung') {
        $plain = preg_replace('/^samsung\s+/i', '', $name);
        foreach (['z' => 'Galaxy Z', 's' => 'Galaxy S', 'a' => 'Galaxy A', 'note' => 'Galaxy Note', 'm' => 'Galaxy M', 'j' => 'Galaxy J', 'xcover' => 'Galaxy XCover'] as $id => $label) {
            if (($id === 'z' && preg_match('/^(?:galaxy\s+)?z\s+(?:flip|fold)/i', $plain))
                || preg_match('/^(?:galaxy\s+)?' . preg_quote($id, '/') . '\s*\d/i', $plain)
                || ($id === 'xcover' && str_contains($plain, 'xcover'))) return [$id, $label];
        }
        return ['other', 'Other Galaxy models'];
    }
    $labels = ['pixel' => 'Google Pixel', 'watch' => 'Apple Watch', 'macbook' => 'MacBook'];
    return [$family, $labels[$family] ?? 'Other models'];
}

/** Curated chronology key. Unknown generations are explicitly placed after known ones. */
function deviceModelChronology(string $family, string $name): array
{
    $lower = mb_strtolower(trim($name), 'UTF-8');
    static $years;
    if ($years === null) {
        $years = [];
        foreach (deviceFamilyMetadataData()['release_years'] as $year => $names) {
            foreach ($names as $modelName) $years[$modelName] = (int) $year;
        }
    }
    $year = $years[$lower] ?? null;
    $generation = 0;
    if (preg_match('/\((\d+)(?:st|nd|rd|th)\s+gen\)/i', $name, $match)) $generation = (int) $match[1];
    elseif (preg_match('/(?:iphone|ipad(?:\s+(?:air|mini))?|pixel|series|(?:galaxy\s+)?(?:s|a|m|j|note|xcover)|z\s+(?:flip|fold))\s*(\d+)/i', $name, $match)) $generation = (int) $match[1];
    $variant = str_contains($lower, 'ultra') || str_contains($lower, 'pro max') || str_contains($lower, 'pro xl') ? 5
        : (str_contains($lower, 'pro') ? 4
        : (str_contains($lower, 'plus') ? 3 : (str_contains($lower, 'fe') || str_contains($lower, 'mini') || preg_match('/\d+a\b/', $lower) ? 1 : 2)));
    $key = $year === null ? 0 : $year * 100000 + $generation * 10 + $variant;
    return ['sort_order' => $key, 'order_known' => $year !== null, 'release_year' => $year, 'release_month' => null];
}

function deviceAnnotateModels(array $models, array $brands): array
{
    $brandNames = array_column($brands, 'name', 'id');
    foreach ($models as &$model) {
        $family = deviceFamilyId($model, $brandNames);
        $model['family'] = $family;
        if ($family) {
            [$model['family_group'], $model['family_group_label']] = deviceFamilyGroup($family, $model['name']);
            $model += deviceModelChronology($family, $model['name']);
        }
    }
    unset($model);
    return $models;
}