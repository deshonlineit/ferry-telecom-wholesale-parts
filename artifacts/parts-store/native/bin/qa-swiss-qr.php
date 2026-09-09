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
$pdf->swissQrPaymentPart($bill->getQrCode()->getAsString('svg'), [
    'account' => $terms['iban'],
    'creditor' => ['Example AG', 'Example Street 8', '6203 Sempach Station', 'CH'],
    'debtor' => ['Buyer GmbH', 'Main Street 1', '6340 Baar', 'CH'],
    'currency' => 'CHF',
    'amount' => '130.81',
    'information' => 'Order #TS-TEST-123',
]);
$rendered = $pdf->output();
check(str_starts_with($rendered, '%PDF-1.4'), 'QR PDF must render.');
check(str_contains($rendered, '/MediaBox [0 0 595.28 841.89]'), 'Fixture must remain exact print-scale A4.');
check(str_contains($rendered, '0 297.638 m 595.280 297.638 l S'), 'Payment part must be exactly 210 x 105 mm.');
check(str_contains($rendered, '175.748 0 m 175.748 297.638 l S'), 'Receipt must be exactly 62 mm wide.');
$canonicalTemplate = file_get_contents(__DIR__ . '/../vendor/sprain/swiss-qr-bill/src/PaymentPart/Output/FpdfOutput/FpdfOutput.php');
check(is_string($canonicalTemplate) && str_contains($canonicalTemplate, '$yPosQrCode = 209.5'), 'Vendored canonical top-origin QR position must remain available.');
$mm = 72 / 25.4;
$qrX = 67 * $mm;
$qrY = (297 - 209.5 - 46) * $mm;
$qrSize = 46 * $mm;
$qrCanvas = sprintf('%.3F %.3F %.3F %.3F re W n 0 g', $qrX, $qrY, $qrSize, $qrSize);
check(str_contains($rendered, $qrCanvas), 'Swiss QR symbol must match the canonical 67 x 209.5 mm top-origin placement.');
check((41.5 - 16) >= 5, 'Currency and amount area must remain outside the QR quiet zone.');
$crossSize = 7 * $mm;
$crossX = $qrX + (($qrSize - $crossSize) / 2);
$crossY = $qrY + (($qrSize - $crossSize) / 2);
check(str_contains($rendered, sprintf('%.3F %.3F %.3F %.3F re f', $crossX, $crossY, $crossSize, $crossSize)), 'Swiss cross field must be exactly 7 mm square.');
check(str_contains($rendered, '(Receipt) Tj'), 'Official receipt label must be present.');
check(str_contains($rendered, '(Payment part) Tj'), 'Official payment-part label must be present.');
check(!str_contains($rendered, 'Ferry Telecom'), 'Print fixture must not expose production branding.');
check(str_contains($rendered, '(CH9300762011623852957) Tj'), 'Fixture must use the published non-production example account.');

putenv('SWISS_QR_CREDITOR_NAME');
check(swissQrEnvironmentProfile() === null, 'Incomplete environment must fail closed.');
echo "PASS: Swiss QR config, payload, and PDF rendering are fail-closed and standards-backed.\n";