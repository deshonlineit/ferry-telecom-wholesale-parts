<?php
declare(strict_types=1);
require_once __DIR__ . '/lib/ecb-reference.php';

$now = new DateTimeImmutable('2026-09-06', new DateTimeZone('UTC'));
$fixture = static fn(string $date, string $quote): string =>
    '<gesmes:Envelope xmlns:gesmes="urn:test:envelope" xmlns="urn:test:reference"><Cube><Cube time="' . $date . '">' . $quote . '</Cube></Cube></gesmes:Envelope>';
$valid = $fixture('2026-09-04', '<Cube currency="CHF" rate="0.9405"/>');
$checks = 0;
$check = static function (bool $valid, string $description) use (&$checks): void {
    if (!$valid) throw new RuntimeException('FAIL: ' . $description);
    $checks++;
};
$result = ecbParseReference($valid, $now);
$check($result['rate_ppm'] === 940500, 'decimal converted to integer ppm');
$check($result['rate_date'] === '2026-09-04', 'weekend uses last publishing day');
$check($result['source_url'] === ECB_REFERENCE_URL, 'source is fixed official endpoint');
$result = ecbParseReference($fixture('2026-09-06', '<Cube currency="CHF" rate="1.123456"/>'), $now);
$check($result['rate_ppm'] === 1123456, 'six-decimal precision is preserved');
$result = ecbParseReference($fixture('2026-08-30', '<Cube currency="CHF" rate="1"/>'), $now);
$check($result['rate_ppm'] === 1000000, 'seven-day boundary remains valid');
$invalid = [
    'empty response' => '',
    'oversized response' => str_repeat('x', ECB_REFERENCE_MAX_BYTES + 1),
    'invalid XML' => '<Cube',
    'external entity' => '<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>' . $valid,
    'missing CHF quote' => $fixture('2026-09-04', '<Cube currency="USD" rate="1.1"/>'),
    'duplicate CHF quote' => $fixture('2026-09-04', '<Cube currency="CHF" rate="0.94"/><Cube currency="CHF" rate="0.95"/>'),
    'negative rate' => $fixture('2026-09-04', '<Cube currency="CHF" rate="-0.94"/>'),
    'zero rate' => $fixture('2026-09-04', '<Cube currency="CHF" rate="0"/>'),
    'exponential rate' => $fixture('2026-09-04', '<Cube currency="CHF" rate="9.4e-1"/>'),
    'precision overflow' => $fixture('2026-09-04', '<Cube currency="CHF" rate="0.9405001"/>'),
    'excessive rate' => $fixture('2026-09-04', '<Cube currency="CHF" rate="101"/>'),
    'future date' => $fixture('2026-09-07', '<Cube currency="CHF" rate="0.94"/>'),
    'stale date' => $fixture('2026-08-29', '<Cube currency="CHF" rate="0.94"/>'),
    'invalid calendar date' => $fixture('2026-02-30', '<Cube currency="CHF" rate="0.94"/>'),
];
foreach ($invalid as $description => $xml) {
    try {
        ecbParseReference($xml, $now);
        throw new RuntimeException('FAIL: accepted ' . $description);
    } catch (EcbReferenceError) {
        $checks++;
    }
}
echo "ECB reference parsing: {$checks} checks passed.\n";