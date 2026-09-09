<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/SwissQrInvoice.php';

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message . ': expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
    }
}

$order = 'TS-20260909-ABCDEF0123';
$scor = swissQrScorReference($order);
assertSameValue(1, swissQrMod97(substr($scor, 4) . substr($scor, 0, 4)), 'SCOR checksum');
assertSameValue(24, strlen($scor), 'SCOR length');
$scorElement = Sprain\SwissQrBill\DataGroup\Element\PaymentReference::create('SCOR', $scor);
assertSameValue(true, $scorElement->isValid(), 'SCOR library validation');

$qrr = swissQrQrrReference($order);
assertSameValue(27, strlen($qrr), 'QRR length');
assertSameValue((int) substr($qrr, -1), swissQrQrrChecksum(substr($qrr, 0, 26)), 'QRR checksum');
$qrrElement = Sprain\SwissQrBill\DataGroup\Element\PaymentReference::create('QRR', $qrr);
assertSameValue(true, $qrrElement->isValid(), 'QRR library validation');
assertSameValue(['reference_type' => 'NON'], swissQrTermsForOrder(['reference_type' => 'NON'], $order), 'NON snapshot');
assertSameValue($scor, swissQrTermsForOrder(['reference_type' => 'SCOR'], $order)['reference'], 'SCOR snapshot');
assertSameValue($qrr, swissQrTermsForOrder(['reference_type' => 'QRR'], $order)['reference'], 'QRR snapshot');

echo "structured payment reference tests passed\n";