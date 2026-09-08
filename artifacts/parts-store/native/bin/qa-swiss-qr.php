<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/SwissQrInvoice.php';
require_once __DIR__ . '/../src/PdfWriter.php';

function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}

check(swissQrValidIban('CH9300762011623852957'), 'Known valid Swiss IBAN must pass.');
check(!swissQrValidIban('CH9300762011623852958'), 'Invalid checksum must fail.');
check(!swissQrValidIban('DE89370400440532013000'), 'Non-Swiss IBAN must fail.');

$terms = [
    'kind' => 'qr_invoice', 'currency' => 'CHF', 'reference_type' => 'NON',
    'name' => 'Example AG', 'street' => 'Example Street', 'house_number' => '8',
    'postal_code' => '6203', 'city' => 'Sempach Station', 'country' => 'CH',
    'iban' => 'CH9300762011623852957',
];
$order = ['number' => 'TS-TEST-123', 'total_cents' => 13081];
$debtor = ['name' => 'Buyer GmbH', 'line1' => 'Main Street 1', 'postal_code' => '6340', 'city' => 'Baar', 'country' => 'CH'];
$bill = swissQrCreate($terms, $order, $debtor);
$payload = $bill->getQrCode()->getText();
check(str_starts_with($payload, "SPC\n0200\n1\n"), 'SPC header must be present.');
check(str_contains($payload, "\n130.81\nCHF\n"), 'Exact CHF amount must be present.');
check(str_contains($payload, "\nNON\n"), 'NON reference must be present.');
check(str_contains($payload, 'Order #TS-TEST-123'), 'Order information must be present.');
$pdf = new PdfWriter('TEST', 'INVOICE');
$pdf->qrSvg($bill->getQrCode()->getAsString('svg'));
check(str_starts_with($pdf->output(), '%PDF-1.4'), 'QR PDF must render.');

putenv('SWISS_QR_CREDITOR_NAME');
check(swissQrEnvironmentProfile() === null, 'Incomplete environment must fail closed.');
echo "PASS: Swiss QR config, payload, and PDF rendering are fail-closed and standards-backed.\n";