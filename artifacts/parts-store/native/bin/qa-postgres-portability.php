<?php
declare(strict_types=1);

// Guard runtime SQL against accidentally reintroducing MySQL-only syntax.
$root = dirname(__DIR__);
$files = glob($root . '/src/*.php') ?: [];
$patterns = [
    'ON DUPLICATE KEY',
    'UTC_TIMESTAMP',
    'DATE_ADD(',
    'DATE_SUB(',
    'REGEXP',
    'SUBSTRING_INDEX(',
    '`',
    'UPDATE .* ORDER BY .* LIMIT',
    '->lastInsertId(',
    'nativeLastInsertId(',
    'status="',
    'VALUES(?, "',
];
$errors = [];
foreach ($files as $file) {
    if (basename($file) === basename(__FILE__)) continue;
    $lines = file($file, FILE_IGNORE_NEW_LINES);
    foreach ($lines ?: [] as $index => $line) {
        foreach ($patterns as $pattern) {
            $matched = str_contains(strtoupper($line), strtoupper($pattern));
            if ($pattern === 'UPDATE .* ORDER BY .* LIMIT') {
                $matched = preg_match('/UPDATE\s+.+ORDER BY.+LIMIT/i', $line) === 1;
            }
            if (!$matched || str_starts_with(trim($line), '//')) continue;
            if (($pattern === '->lastInsertId(' || $pattern === 'nativeLastInsertId(') && basename($file) === 'bootstrap.php') continue;
            $window = implode("\n", array_slice($lines, max(0, $index - 12), 25));
            // MySQL spellings are permitted only as the explicitly selected
            // false branch of a dbDriver() dialect expression.
            if (!str_contains($window, 'dbDriver() === \'pgsql\'')
                && !str_contains($window, 'dbDriver() === "pgsql"')) {
                $errors[] = $file . ':' . ($index + 1) . ' ' . $pattern;
            }
        }
    }
}
if ($errors !== []) {
    fwrite(STDERR, implode(PHP_EOL, $errors) . PHP_EOL);
    exit(1);
}
echo "PostgreSQL portability scan passed.\n";