<?php
declare(strict_types=1);

use Sprain\SwissQrBill as SwissQr;

require_once __DIR__ . '/../vendor/autoload.php';

function swissQrEnvironmentProfile(): ?array
{
    $keys = [
        'name' => 'SWISS_QR_CREDITOR_NAME',
        'street' => 'SWISS_QR_CREDITOR_STREET',
        'house_number' => 'SWISS_QR_CREDITOR_HOUSE_NUMBER',
        'postal_code' => 'SWISS_QR_CREDITOR_POSTAL_CODE',
        'city' => 'SWISS_QR_CREDITOR_CITY',
        'country' => 'SWISS_QR_CREDITOR_COUNTRY',
        'iban' => 'SWISS_QR_CHF_IBAN',
    ];
    $profile = [];
    foreach ($keys as $field => $environmentKey) {
        $value = getenv($environmentKey);
        $profile[$field] = is_string($value) ? trim($value) : '';
    }
    $profile['country'] = strtoupper($profile['country']);
    $profile['iban'] = strtoupper((string) preg_replace('/\s+/', '', $profile['iban']));
    if (in_array('', $profile, true) || $profile['country'] !== 'CH' || !swissQrValidIban($profile['iban'])) {
        return null;
    }
    $referenceType = strtoupper(trim((string) (getenv('SWISS_QR_REFERENCE_TYPE') ?: 'NON')));
    if (!in_array($referenceType, ['NON', 'SCOR', 'QRR'], true)) {
        return null;
    }
    if ($referenceType === 'QRR') {
        $qrIban = strtoupper((string) preg_replace('/\s+/', '', (string) getenv('SWISS_QR_QR_IBAN')));
        if (!swissQrValidQrIban($qrIban)) {
            return null;
        }
        $profile['iban'] = $qrIban;
    } elseif (swissQrValidQrIban($profile['iban'])) {
        return null;
    }
    return $profile + ['currency' => 'CHF', 'reference_type' => $referenceType];
}

function swissQrValidIban(string $iban): bool
{
    if (!preg_match('/^CH\d{7}[A-Z0-9]{12}$/', $iban)) {
        return false;
    }
    $rearranged = substr($iban, 4) . substr($iban, 0, 4);
    $remainder = 0;
    foreach (str_split($rearranged) as $character) {
        $digits = ctype_alpha($character) ? (string) (ord($character) - 55) : $character;
        foreach (str_split($digits) as $digit) {
            $remainder = (($remainder * 10) + (int) $digit) % 97;
        }
    }
    return $remainder === 1;
}

function swissQrValidQrIban(string $iban): bool
{
    if (!swissQrValidIban($iban)) {
        return false;
    }
    $iid = (int) substr($iban, 4, 5);
    return $iid >= 30000 && $iid <= 31999;
}

function swissQrMod97(string $value): int
{
    $remainder = 0;
    foreach (str_split($value) as $character) {
        $digits = ctype_alpha($character) ? (string) (ord(strtoupper($character)) - 55) : $character;
        foreach (str_split($digits) as $digit) {
            $remainder = (($remainder * 10) + (int) $digit) % 97;
        }
    }
    return $remainder;
}

function swissQrScorReference(string $orderNumber): string
{
    $body = strtoupper((string) preg_replace('/[^A-Z0-9]/i', '', $orderNumber));
    if ($body === '' || strlen($body) > 21) {
        throw new RuntimeException('The order number cannot be represented as an ISO 11649 creditor reference.');
    }
    $check = 98 - swissQrMod97($body . 'RF00');
    return 'RF' . str_pad((string) $check, 2, '0', STR_PAD_LEFT) . $body;
}

function swissQrQrrChecksum(string $digits): int
{
    $table = [
        [0, 9, 4, 6, 8, 2, 7, 1, 3, 5],
        [9, 4, 6, 8, 2, 7, 1, 3, 5, 0],
        [4, 6, 8, 2, 7, 1, 3, 5, 0, 9],
        [6, 8, 2, 7, 1, 3, 5, 0, 9, 4],
        [8, 2, 7, 1, 3, 5, 0, 9, 4, 6],
        [2, 7, 1, 3, 5, 0, 9, 4, 6, 8],
        [7, 1, 3, 5, 0, 9, 4, 6, 8, 2],
        [1, 3, 5, 0, 9, 4, 6, 8, 2, 7],
        [3, 5, 0, 9, 4, 6, 8, 2, 7, 1],
        [5, 0, 9, 4, 6, 8, 2, 7, 1, 3],
    ];
    $carry = 0;
    foreach (str_split($digits) as $digit) {
        $carry = $table[$carry][(int) $digit];
    }
    return (10 - $carry) % 10;
}

function swissQrQrrReference(string $orderNumber): string
{
    if (!preg_match('/^TS-(\d{8})-([A-F0-9]{10})$/D', strtoupper($orderNumber), $match)) {
        throw new RuntimeException('The order number cannot be represented as a QR reference.');
    }
    $decimalId = base_convert($match[2], 16, 10);
    $body = '00000' . $match[1] . str_pad($decimalId, 13, '0', STR_PAD_LEFT);
    return $body . swissQrQrrChecksum($body);
}

function swissQrTermsForOrder(array $terms, string $orderNumber): array
{
    $type = (string) ($terms['reference_type'] ?? 'NON');
    if ($type === 'NON') {
        unset($terms['reference']);
        return $terms;
    }
    $terms['reference'] = $type === 'SCOR'
        ? swissQrScorReference($orderNumber)
        : swissQrQrrReference($orderNumber);
    return $terms;
}

function swissQrCreate(array $terms, array $order, array $debtor): SwissQr\QrBill
{
    $required = ['name', 'street', 'house_number', 'postal_code', 'city', 'country', 'iban'];
    foreach ($required as $field) {
        if (!isset($terms[$field]) || trim((string) $terms[$field]) === '') {
            throw new RuntimeException('The QR invoice creditor snapshot is incomplete.');
        }
    }
    $referenceType = (string) ($terms['reference_type'] ?? '');
    $reference = isset($terms['reference']) ? strtoupper((string) preg_replace('/\s+/', '', (string) $terms['reference'])) : null;
    if (($terms['currency'] ?? null) !== 'CHF'
        || !in_array($referenceType, ['NON', 'SCOR', 'QRR'], true)
        || !swissQrValidIban((string) $terms['iban'])
        || ($referenceType === 'QRR') !== swissQrValidQrIban((string) $terms['iban'])
        || ($referenceType === 'NON' && $reference !== null)) {
        throw new RuntimeException('The QR invoice creditor snapshot is invalid.');
    }
    foreach (['name', 'line1', 'postal_code', 'city', 'country'] as $field) {
        if (trim((string) ($debtor[$field] ?? '')) === '') {
            throw new RuntimeException('The QR invoice debtor address is incomplete.');
        }
    }

    $bill = SwissQr\QrBill::create();
    $bill->setCreditor(SwissQr\DataGroup\Element\StructuredAddress::createWithStreet(
        (string) $terms['name'], (string) $terms['street'], (string) $terms['house_number'],
        (string) $terms['postal_code'], (string) $terms['city'], (string) $terms['country']
    ));
    $bill->setCreditorInformation(SwissQr\DataGroup\Element\CreditorInformation::create((string) $terms['iban']));
    $bill->setUltimateDebtor(SwissQr\DataGroup\Element\StructuredAddress::createWithStreet(
        (string) $debtor['name'], (string) $debtor['line1'], null,
        (string) $debtor['postal_code'], (string) $debtor['city'], strtoupper((string) $debtor['country'])
    ));
    $bill->setPaymentAmountInformation(SwissQr\DataGroup\Element\PaymentAmountInformation::create(
        'CHF', ((int) $order['total_cents']) / 100
    ));
    $bill->setPaymentReference(SwissQr\DataGroup\Element\PaymentReference::create($referenceType, $reference));
    $bill->setAdditionalInformation(SwissQr\DataGroup\Element\AdditionalInformation::create(
        'Order #' . (string) $order['number']
    ));
    if (!$bill->isValid()) {
        throw new RuntimeException('The QR invoice data does not satisfy the Swiss payment standard.');
    }
    return $bill;
}