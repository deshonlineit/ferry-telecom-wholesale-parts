#!/usr/bin/env php
<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/commerce.php';

$checks = 0;
function shippingAssert(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

function shippingRejects(callable $call): bool
{
    try {
        $call();
    } catch (HttpError $error) {
        return $error->status === 422;
    }
    return false;
}

assertIsolated();
$zurich = new DateTimeZone('Europe/Zurich');
$fridayBeforeCutoff = new DateTimeImmutable('2026-09-11 16:59:59', $zurich);
$fridayAtCutoff = new DateTimeImmutable('2026-09-11 17:00:00', $zurich);
$fridayAfterCutoff = new DateTimeImmutable('2026-09-11 17:00:01', $zurich);
$thursday = new DateTimeImmutable('2026-09-10 12:00:00', $zurich);
$summerFriday = new DateTimeImmutable('2026-07-10 16:30:00', $zurich);
$winterFriday = new DateTimeImmutable('2026-12-11 16:30:00', $zurich);

$ch = commerceShippingMethods('CH', $fridayBeforeCutoff);
$de = commerceShippingMethods('DE');

shippingAssert(array_column($ch, 'code') === ['swiss_post_priority', 'swiss_post_saturday', 'pickup'], 'Swiss methods or ordering changed.');
shippingAssert(array_column($ch, 'amount_cents') === [600, 1500, 0], 'Swiss net shipping rates changed.');
shippingAssert(count(array_filter($ch, static fn(array $method): bool => $method['currency'] === 'CHF')) === 3, 'Swiss methods are not all CHF.');
shippingAssert(array_column($de, 'code') === ['ups_standard', 'ups_express'], 'International UPS methods or ordering changed.');
shippingAssert(array_column($de, 'amount_cents') === [1500, 3000], 'International UPS net rates changed.');
shippingAssert(count(array_filter($de, static fn(array $method): bool => $method['currency'] === 'EUR')) === 2, 'International methods are not all EUR.');
shippingAssert(commerceShippingMethod('CH')['code'] === 'swiss_post_priority', 'Swiss default is not Priority.');
shippingAssert(commerceShippingMethod('DE')['code'] === 'ups_standard', 'International default is not UPS Standard.');
shippingAssert(shippingRejects(static fn() => commerceShippingMethod('CH', 'ups_standard')), 'A foreign UPS method was accepted for Switzerland.');
shippingAssert(shippingRejects(static fn() => commerceShippingMethod('DE', 'pickup')), 'Swiss pickup was accepted outside Switzerland.');
shippingAssert(commerceSaturdayDeliveryAvailable($fridayBeforeCutoff), 'Saturday Delivery is unavailable before Friday cutoff.');
shippingAssert(commerceSaturdayDeliveryAvailable($fridayAtCutoff), 'Saturday Delivery is unavailable exactly at Friday cutoff.');
shippingAssert(!commerceSaturdayDeliveryAvailable($fridayAfterCutoff), 'Saturday Delivery remains available after Friday cutoff.');
shippingAssert(!commerceSaturdayDeliveryAvailable($thursday), 'Saturday Delivery is available outside Friday.');
shippingAssert(commerceSaturdayDeliveryAvailable($summerFriday) && commerceSaturdayDeliveryAvailable($winterFriday), 'Zürich daylight-saving handling changed availability.');
shippingAssert(!in_array('swiss_post_saturday', array_column(commerceShippingMethods('CH', $fridayAfterCutoff), 'code'), true), 'Saturday Delivery is returned after cutoff.');
shippingAssert(!in_array('swiss_post_saturday', array_column(commerceShippingMethods('CH', $thursday), 'code'), true), 'Saturday Delivery is returned on a non-Friday.');
shippingAssert(shippingRejects(static fn() => commerceShippingMethod('CH', 'swiss_post_saturday', $fridayAfterCutoff)), 'Saturday Delivery can be forced after cutoff.');
shippingAssert(shippingRejects(static fn() => commerceShippingMethod('CH', 'swiss_post_saturday', $thursday)), 'Saturday Delivery can be forced on a non-Friday.');

$priority = commerceTotals(10000, 'CH', commerceShippingMethod('CH', 'swiss_post_priority', $fridayBeforeCutoff));
$pickup = commerceTotals(10000, 'CH', commerceShippingMethod('CH', 'pickup'));
$express = commerceTotals(10000, 'DE', commerceShippingMethod('DE', 'ups_express'));
shippingAssert($priority['shipping_cents'] === 600 && $priority['tax_cents'] === 859 && $priority['total_cents'] === 11459, 'Swiss Priority VAT arithmetic is wrong.');
shippingAssert($pickup['shipping_cents'] === 0 && $pickup['tax_cents'] === 810 && $pickup['total_cents'] === 10810, 'Pickup VAT arithmetic is wrong.');
shippingAssert($express['shipping_cents'] === 3000 && $express['tax_bps'] === 0 && $express['tax_cents'] === 0 && $express['total_cents'] === 13000, 'Export UPS VAT arithmetic is wrong.');

$base = ['country' => 'CH', 'currency' => 'CHF', 'exchange_rate' => [], 'items' => [], 'subtotal_cents' => 10000];
$priorityFingerprint = commerceQuoteFingerprint($base + $priority);
$pickupFingerprint = commerceQuoteFingerprint($base + $pickup);
shippingAssert(!hash_equals($priorityFingerprint, $pickupFingerprint), 'Shipping method is missing from the quote fingerprint.');
$priorityAfterCutoff = commerceTotals(10000, 'CH', commerceShippingMethod('CH', 'swiss_post_priority', $fridayAfterCutoff));
$beforeCutoffFingerprint = commerceQuoteFingerprint($base + $priority + ['shipping_methods' => commerceShippingMethods('CH', $fridayBeforeCutoff)]);
$afterCutoffFingerprint = commerceQuoteFingerprint($base + $priorityAfterCutoff + ['shipping_methods' => commerceShippingMethods('CH', $fridayAfterCutoff)]);
shippingAssert(!hash_equals($beforeCutoffFingerprint, $afterCutoffFingerprint), 'Saturday cutoff availability is missing from the quote fingerprint.');

printf("qa-shipping-methods: %d checks passed.\n", $checks);