#!/usr/bin/env php
<?php
/**
 * One-time DEVELOPMENT-ONLY importer for the isolated native MySQL database.
 *
 * This file is intentionally not referenced by build/startup code.  It refuses
 * production environments and requires an explicit schema-scoped truncate
 * confirmation before changing PostgreSQL.
 */
declare(strict_types=1);

const SOURCE_DB = 'ferry_isolated_test';
const TARGET_SCHEMA = 'parts_store';
const SKIP_TABLES = ['sessions', 'login_attempts', 'reset_tokens'];
const BATCH_SIZE = 500;

function usage(): never
{
    fwrite(STDERR, "Usage: php bin/import-mysql-to-postgres.php [--dry-run|--count] [--confirm-truncate=parts_store]\n");
    exit(2);
}

$options = getopt('', ['dry-run', 'count', 'confirm-truncate:']);
$dryRun = isset($options['dry-run']) || isset($options['count']);
$confirmation = $options['confirm-truncate'] ?? null;

$environment = strtolower((string)(getenv('APP_ENV') ?: getenv('NODE_ENV') ?: ''));
if ($environment === 'production') {
    throw new RuntimeException('Refusing to run in production.');
}
$databaseUrl = getenv('DATABASE_URL');
if (!is_string($databaseUrl) || $databaseUrl === '') {
    throw new RuntimeException('DATABASE_URL is required for the development PostgreSQL target.');
}
$workspace = dirname(__DIR__);
$socket = $workspace . '/.local/native-mysql/mysql.sock';
$marker = $workspace . '/.local/native-mysql/isolated.marker';
if (!is_file($marker) || trim((string)file_get_contents($marker)) !== 'FERRY_LOCAL_TEST_ONLY') {
    throw new RuntimeException('The local MySQL isolation marker is missing or invalid.');
}
// is_file() is false for Unix-domain sockets on some PHP builds.
if (!file_exists($socket)) {
    throw new RuntimeException("The local MySQL socket does not exist: {$socket}");
}
if (!$dryRun && $confirmation !== TARGET_SCHEMA) {
    throw new RuntimeException('Import writes require --confirm-truncate=parts_store.');
}
if (!extension_loaded('pdo_mysql') || !extension_loaded('pdo_pgsql')) {
    throw new RuntimeException('Both pdo_mysql and pdo_pgsql extensions are required.');
}

$source = new PDO(
    'mysql:unix_socket=' . realpath($socket) . ';dbname=' . SOURCE_DB . ';charset=utf8mb4',
    'ferry_test_app',
    '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
     PDO::ATTR_CASE => PDO::CASE_LOWER,
     PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_STRINGIFY_FETCHES => false]
);
$source->exec("SET time_zone = '+00:00'");
$parsedUrl = parse_url($databaseUrl);
if (!is_array($parsedUrl) || empty($parsedUrl['host']) || empty($parsedUrl['path'])) {
    throw new RuntimeException('DATABASE_URL is not a valid PostgreSQL URL.');
}
$pgDsn = 'pgsql:host=' . $parsedUrl['host']
    . ';port=' . (int)($parsedUrl['port'] ?? 5432)
    . ';dbname=' . ltrim($parsedUrl['path'], '/');
$target = new PDO($pgDsn, isset($parsedUrl['user']) ? rawurldecode($parsedUrl['user']) : null,
    isset($parsedUrl['pass']) ? rawurldecode($parsedUrl['pass']) : null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_STRINGIFY_FETCHES => false,
]);
$target->exec("SET TIME ZONE 'UTC'");
$target->exec('SET search_path TO parts_store, public');

function ident(string $name): string
{
    if (!preg_match('/^[a-z_][a-z0-9_]*$/', $name)) throw new RuntimeException("Unsafe identifier: {$name}");
    return '"' . $name . '"';
}
function quoteTable(string $table, string $schema = TARGET_SCHEMA): string { return ident($schema) . '.' . ident($table); }
function mysqlIdent(string $name): string
{
    if (!preg_match('/^[a-z_][a-z0-9_]*$/', $name)) throw new RuntimeException("Unsafe identifier: {$name}");
    return '`' . $name . '`';
}
function mysqlTable(string $table): string { return mysqlIdent(SOURCE_DB) . '.' . mysqlIdent($table); }

$targetTables = $target->query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='parts_store' AND table_type='BASE TABLE' ORDER BY table_name"
)->fetchAll(PDO::FETCH_COLUMN);
$sourceTables = $source->query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='ferry_isolated_test' AND table_type='BASE TABLE' ORDER BY table_name"
)->fetchAll(PDO::FETCH_COLUMN);
$tables = $targetTables;
if (count($tables) !== 42) {
    throw new RuntimeException('Expected 42 target parts_store tables, found ' . count($tables) . '.');
}
$missingSource = array_values(array_diff($tables, $sourceTables));
if (array_diff($missingSource, SKIP_TABLES)) {
    throw new RuntimeException('Source is missing non-policy tables: ' . implode(', ', array_diff($missingSource, SKIP_TABLES)));
}

// Introspect columns rather than assuming the migration and native schemas match.
$sourceColumns = $targetColumns = [];
foreach ($tables as $table) {
    if (!in_array($table, $sourceTables, true)) {
        $sourceColumns[$table] = [];
        $targetColumns[$table] = [];
        continue;
    }
    $q = $source->prepare("SELECT column_name,data_type,is_nullable,column_default,ordinal_position
        FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position");
    $q->execute([SOURCE_DB, $table]);
    $sourceColumns[$table] = array_map(static fn(array $column): array => array_change_key_case($column, CASE_LOWER), $q->fetchAll());
    $q = $target->prepare("SELECT column_name,data_type,is_nullable,column_default,ordinal_position
        FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ordinal_position");
    $q->execute([TARGET_SCHEMA, $table]);
    $targetColumns[$table] = array_map(static fn(array $column): array => array_change_key_case($column, CASE_LOWER), $q->fetchAll());
}

// Build FK-safe order from the target's actual constraints.
$dependencies = array_fill_keys($tables, []);
$fkRows = $target->query("SELECT tc.table_name, ccu.table_name AS referenced_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema=tc.constraint_schema AND ccu.constraint_name=tc.constraint_name
    WHERE tc.constraint_schema='parts_store' AND tc.constraint_type='FOREIGN KEY'")->fetchAll();
foreach ($fkRows as $fk) {
    if (isset($dependencies[$fk['table_name']], $dependencies[$fk['referenced_table']])
        && $fk['table_name'] !== $fk['referenced_table']) {
        $dependencies[$fk['table_name']][$fk['referenced_table']] = true;
    }
}
$ordered = [];
while ($dependencies) {
    $ready = array_keys(array_filter($dependencies, static fn(array $deps): bool => $deps === []));
    if ($ready === []) throw new RuntimeException('Target foreign-key graph contains a cycle.');
    sort($ready);
    foreach ($ready as $table) {
        $ordered[] = $table;
        unset($dependencies[$table]);
        foreach ($dependencies as &$deps) unset($deps[$table]);
        unset($deps);
    }
}

$sourceCounts = $targetCounts = [];
foreach ($tables as $table) {
    $sourceCounts[$table] = in_array($table, $sourceTables, true)
        ? (int)$source->query('SELECT COUNT(*) FROM ' . mysqlTable($table))->fetchColumn() : 0;
    $targetCounts[$table] = (int)$target->query('SELECT COUNT(*) FROM ' . quoteTable($table))->fetchColumn();
}
echo ($dryRun ? "DRY RUN (no writes)\n" : "IMPORT DEVELOPMENT ONLY\n");
echo 'Tables: ' . count($tables) . '; copy order: ' . implode(', ', $ordered) . "\n";
foreach ($ordered as $table) {
    echo sprintf("%-32s source=%d target_before=%d%s\n", $table, $sourceCounts[$table], $targetCounts[$table],
        in_array($table, SKIP_TABLES, true) ? ' (SKIPPED BY POLICY)' : '');
}
if ($dryRun) exit(0);

$target->beginTransaction();
try {
    // This is the only destructive statement and is protected by the explicit flag.
    $target->exec('TRUNCATE ' . implode(', ', array_map(static fn(string $t): string => quoteTable($t), $tables))
        . ' RESTART IDENTITY CASCADE');
    $inserted = [];
    foreach ($ordered as $table) {
        $inserted[$table] = 0;
        if (in_array($table, SKIP_TABLES, true)) continue;
        $src = $sourceColumns[$table];
        $dstByName = [];
        foreach ($targetColumns[$table] as $column) $dstByName[$column['column_name']] = $column;
        $columns = [];
        foreach ($src as $column) {
            if (isset($dstByName[$column['column_name']])) $columns[] = $column;
        }
        if (!$columns) throw new RuntimeException("No common columns for {$table}.");
        $names = array_map(static fn(array $c): string => $c['column_name'], $columns);
        $select = implode(',', array_map('ident', $names));
        $insertSql = 'INSERT INTO ' . quoteTable($table) . ' (' . implode(',', array_map('ident', $names))
            . ') VALUES (' . implode(',', array_fill(0, count($names), '?')) . ')';
        $insert = $target->prepare($insertSql);
        $offset = 0;
        while (true) {
            $rows = $source->query('SELECT ' . implode(',', array_map('mysqlIdent', $names)) . ' FROM ' . mysqlTable($table)
                . ' ORDER BY ' . implode(',', array_map('mysqlIdent', $names))
                . " LIMIT " . BATCH_SIZE . " OFFSET {$offset}")->fetchAll();
            if (!$rows) break;
            foreach ($rows as $row) {
                $values = [];
                foreach ($columns as $column) {
                    $name = $column['column_name'];
                    $value = $row[$name];
                    $targetType = $dstByName[$name]['data_type'];
                    if ($value !== null && strtolower((string)$targetType) === 'boolean') {
                        // MySQL legacy TINYINT fields occasionally contain an empty
                        // string; PostgreSQL booleans must receive a real bool.
                        $value = !in_array(strtolower(trim((string)$value)), ['', '0', 'false', 'no', 'off'], true);
                    }
                    if ($value !== null && $targetType === 'jsonb') {
                        json_decode((string)$value, true, 512, JSON_THROW_ON_ERROR);
                    }
                    if (is_string($value) && preg_match('/^0000-00-00(?: 00:00:00)?$/', $value)) {
                        if ($dstByName[$name]['is_nullable'] === 'YES') $value = null;
                        else throw new RuntimeException("Zero date in non-nullable {$table}.{$name}");
                    }
                    $values[] = $value;
                }
                foreach ($values as $index => $value) {
                    $type = $dstByName[$columns[$index]['column_name']]['data_type'];
                    $insert->bindValue($index + 1, $value, strtolower((string)$type) === 'boolean'
                        ? PDO::PARAM_BOOL : ($value === null ? PDO::PARAM_NULL : PDO::PARAM_STR));
                }
                $insert->execute();
                $inserted[$table]++;
            }
            $offset += count($rows);
        }
    }
    // Restore every identity, including empty policy-excluded tables.
    $identities = $target->query("SELECT table_name,column_name FROM information_schema.columns
        WHERE table_schema='parts_store' AND is_identity='YES'")->fetchAll();
    foreach ($identities as $identity) {
        $table = $identity['table_name']; $column = $identity['column_name'];
        $sequence = $target->query("SELECT pg_get_serial_sequence('parts_store." . $table . "', '" . $column . "')")->fetchColumn();
        if ($sequence) {
            $max = $target->query('SELECT MAX(' . ident($column) . ') FROM ' . quoteTable($table))->fetchColumn();
            $target->exec("SELECT setval(" . $target->quote($sequence, PDO::PARAM_STR) . ", " . ($max === null ? '1, false' : ((int)$max . ', true')) . ')');
        }
    }
    $target->commit();
} catch (Throwable $e) {
    if ($target->inTransaction()) $target->rollBack();
    throw $e;
}

$failures = [];
foreach ($ordered as $table) {
    $actual = (int)$target->query('SELECT COUNT(*) FROM ' . quoteTable($table))->fetchColumn();
    $expected = in_array($table, SKIP_TABLES, true) ? 0 : $sourceCounts[$table];
    echo sprintf("%-32s source=%d target=%d%s\n", $table, $expected, $actual,
        $actual === $expected ? '' : ' MISMATCH');
    if ($actual !== $expected) $failures[] = "{$table}: count {$actual} != {$expected}";
}
$violations = $target->query("SELECT c.conname, child.relname AS table_name, parent.relname AS referenced_table,
    array_agg(ca.attname ORDER BY u.ord) AS child_columns,
    array_agg(pa.attname ORDER BY u.ord) AS parent_columns
    FROM pg_constraint c
    JOIN pg_class child ON child.oid=c.conrelid
    JOIN pg_namespace ns ON ns.oid=child.relnamespace AND ns.nspname='parts_store'
    JOIN pg_class parent ON parent.oid=c.confrelid
    CROSS JOIN LATERAL unnest(c.conkey,c.confkey) WITH ORDINALITY u(child_attnum,parent_attnum,ord)
    JOIN pg_attribute ca ON ca.attrelid=c.conrelid AND ca.attnum=u.child_attnum
    JOIN pg_attribute pa ON pa.attrelid=c.confrelid AND pa.attnum=u.parent_attnum
    WHERE c.contype='f' GROUP BY c.conname,child.relname,parent.relname")->fetchAll();
$badFks = 0;
foreach ($violations as $fk) {
    $childColumns = trim($fk['child_columns'], '{}') === '' ? [] : str_getcsv(trim($fk['child_columns'], '{}'), ',', '"', '\\');
    $parentColumns = trim($fk['parent_columns'], '{}') === '' ? [] : str_getcsv(trim($fk['parent_columns'], '{}'), ',', '"', '\\');
    $join = [];
    foreach ($childColumns as $i => $column) {
        $join[] = 'c.' . ident(trim($column, '"')) . '=p.' . ident(trim($parentColumns[$i], '"'));
    }
    $nullCheck = implode(' OR ', array_map(static fn(string $column): string => 'c.' . ident(trim($column, '"')) . ' IS NOT NULL', $childColumns));
    $badFks += (int)$target->query('SELECT COUNT(*) FROM ' . quoteTable($fk['table_name']) . ' c LEFT JOIN '
        . quoteTable($fk['referenced_table']) . ' p ON ' . implode(' AND ', $join)
        . ' WHERE (' . $nullCheck . ') AND p.' . ident(trim($parentColumns[0], '"')) . ' IS NULL')->fetchColumn();
}
echo "FK violations: {$badFks}\n";
if ($badFks) $failures[] = "foreign-key violations: {$badFks}";
if ($failures) {
    fwrite(STDERR, "FAILURES:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}
echo "Import completed successfully; skipped tables remain empty: " . implode(', ', SKIP_TABLES) . "\n";