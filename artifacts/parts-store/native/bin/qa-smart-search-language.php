<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';
require_once dirname(__DIR__) . '/src/catalog.php';

function searchLanguageCheck(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

searchLanguageCheck(
    catalogSearchTermVariants('zonder') === ['zonder', 'no', 'without', 'ohne', 'sans', 'senza'],
    'Dutch without must expand to supplier-language variants.'
);
searchLanguageCheck(in_array('frame', catalogSearchTermVariants('kader'), true), 'Kader must resolve to frame.');
searchLanguageCheck(catalogFrameIntent('S23 Ultra zonder frame') === 'without', 'Dutch no-frame intent.');
searchLanguageCheck(catalogFrameIntent('S23 Ultra NO FRAME') === 'without', 'English no-frame intent.');
searchLanguageCheck(catalogFrameIntent('S23 Ultra met frame') === 'with', 'Dutch with-frame intent.');

$pdo = db();
$categoryId = (int)$pdo->query('SELECT id FROM categories ORDER BY id LIMIT 1')->fetchColumn();
$insert = $pdo->prepare(
    "INSERT INTO products(sku,name,description,category_id,quality,stock,list_price_cents,list_price_eur_cents,
      minimum_quantity,active,publication_status)
     VALUES(?,?,?,?,?,?,?,?,1,TRUE,'visible')"
);
$pdo->beginTransaction();
try {
    $insert->execute(['QA-S23-NO-FRAME', 'Galaxy S23 Ultra (NO FRAME) OLED Touchscreen', '', $categoryId, 'QA', 1, 100, 100]);
    $noFrameId = (int)$pdo->lastInsertId();
    $insert->execute(['QA-S23-WITH-FRAME', 'Galaxy S23 Ultra OLED Touchscreen With Frame', '', $categoryId, 'QA', 1, 100, 100]);
    $withFrameId = (int)$pdo->lastInsertId();
    $insert->execute(['QA-S23-NO-BEZEL', 'Galaxy S23 Ultra OLED Touchscreen No Bezel', '', $categoryId, 'QA', 1, 100, 100]);
    $noBezelId = (int)$pdo->lastInsertId();

    $without = catalogB2bSearch(['q' => 's23 ultra zonder frame', 'limit' => 20], null);
    $withoutIds = array_map(static fn(array $row): int => (int)$row['id'], $without['products']);
    searchLanguageCheck(in_array($noFrameId, $withoutIds, true), 'Zonder frame must find a NO FRAME title.');
    searchLanguageCheck(!in_array($withFrameId, $withoutIds, true), 'Zonder frame must exclude framed titles.');

    $with = catalogB2bSearch(['q' => 's23 ultra met frame', 'limit' => 20], null);
    $withIds = array_map(static fn(array $row): int => (int)$row['id'], $with['products']);
    searchLanguageCheck(in_array($withFrameId, $withIds, true), 'Met frame must find the framed title.');
    searchLanguageCheck(!in_array($noFrameId, $withIds, true), 'Met frame must exclude NO FRAME titles.');

    $noBezel = catalogB2bSearch(['q' => 's23 ultra no bezel', 'limit' => 20], null);
    $noBezelIds = array_map(static fn(array $row): int => (int)$row['id'], $noBezel['products']);
    searchLanguageCheck(in_array($noBezelId, $noBezelIds, true), 'No bezel must find the exact supplier-title phrase.');
    searchLanguageCheck(!in_array($withFrameId, $noBezelIds, true), 'No bezel must exclude framed titles.');
    $pdo->rollBack();
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    throw $error;
}

echo "PASS: multilingual frame intent keeps framed and frameless products distinct.\n";