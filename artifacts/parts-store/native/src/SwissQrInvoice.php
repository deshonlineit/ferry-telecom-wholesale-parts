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
    return $profile + ['currency' => 'CHF', 'reference_type' => 'NON'];
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

function swissQrCreate(array $terms, array $order, array $debtor): SwissQr\QrBill
{
    $required = ['name', 'street', 'house_number', 'postal_code', 'city', 'country', 'iban'];
    foreach ($required as $field) {
        if (!isset($terms[$field]) || trim((string) $terms[$field]) === '') {
            throw new RuntimeException('The QR invoice creditor snapshot is incomplete.');
        }
    }
    if (($terms['currency'] ?? null) !== 'CHF'
        || ($terms['reference_type'] ?? null) !== 'NON'
        || !swissQrValidIban((string) $terms['iban'])) {
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
    $bill->setPaymentReference(SwissQr\DataGroup\Element\PaymentReference::create(
        SwissQr\DataGroup\Element\PaymentReference::TYPE_NON
    ));
    $bill->setAdditionalInformation(SwissQr\DataGroup\Element\AdditionalInformation::create(
        'Order #' . (string) $order['number']
    ));
    if (!$bill->isValid()) {
        throw new RuntimeException('The QR invoice data does not satisfy the Swiss payment standard.');
    }
    return $bill;
}