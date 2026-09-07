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
$ch = commerceShippingMethods('CH');
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

$settings = ['tax_bps' => 810];
$priority = commerceTotals(10000, $settings, commerceShippingMethod('CH', 'swiss_post_priority'));
$pickup = commerceTotals(10000, $settings, commerceShippingMethod('CH', 'pickup'));
$express = commerceTotals(10000, $settings, commerceShippingMethod('DE', 'ups_express'));
shippingAssert($priority['shipping_cents'] === 600 && $priority['tax_cents'] === 859 && $priority['total_cents'] === 11459, 'Swiss Priority VAT arithmetic is wrong.');
shippingAssert($pickup['shipping_cents'] === 0 && $pickup['tax_cents'] === 810 && $pickup['total_cents'] === 10810, 'Pickup VAT arithmetic is wrong.');
shippingAssert($express['shipping_cents'] === 3000 && $express['tax_cents'] === 1053 && $express['total_cents'] === 14053, 'UPS Express VAT arithmetic is wrong.');

$base = ['country' => 'CH', 'currency' => 'CHF', 'exchange_rate' => [], 'items' => [], 'subtotal_cents' => 10000];
$priorityFingerprint = commerceQuoteFingerprint($base + $priority);
$pickupFingerprint = commerceQuoteFingerprint($base + $pickup);
shippingAssert(!hash_equals($priorityFingerprint, $pickupFingerprint), 'Shipping method is missing from the quote fingerprint.');

printf("qa-shipping-methods: %d checks passed.\n", $checks);