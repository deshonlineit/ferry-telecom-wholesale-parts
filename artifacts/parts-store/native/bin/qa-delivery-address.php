#!/usr/bin/env php
<?php
declare(strict_types=1);

/**
 * The header no longer has a country picker, so the delivery address is the only
 * thing that decides where an order goes and which currency it is billed in.
 * An address stored before the Europe-only rule stays editable, but it must not
 * be usable for a quote or an order. This proves both halves of that rule
 * against real rows; everything is rolled back.
 */

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/commerce.php';

$checks = 0;
function qaAssert(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

/** @return array{status:int,message:string} */
function qaRejects(callable $call): array
{
    try {
        $call();
    } catch (HttpError $error) {
        return ['status' => $error->status, 'message' => $error->getMessage()];
    }
    return ['status' => 0, 'message' => 'no rejection'];
}

assertIsolated();
$db = db();
$db->beginTransaction();
try {
    $email = 'qa-delivery-' . bin2hex(random_bytes(6)) . '@test.invalid';
    $passwordHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
    $db->prepare(
        "INSERT INTO users(name,email,password_hash,company,role,group_id,status)
         VALUES('QA delivery fixture',?,?,'QA isolated test','customer',1,'active')"
    )->execute([$email, $passwordHash]);
    $userId = (int) $db->lastInsertId();

    $insertAddress = $db->prepare(
        'INSERT INTO addresses(user_id,label,name,company,line1,line2,postal_code,city,country,is_default)
         VALUES(?,?,?,?,?,?,?,?,?,?)'
    );
    $insertAddress->execute([$userId, 'QA Swiss', 'QA fixture', 'QA isolated test', 'Example Street 1', '', '8000', 'Zürich', 'CH', 1]);
    $swissId = (int) $db->lastInsertId();
    // Written straight to the table: the API would refuse to create this today.
    $insertAddress->execute([$userId, 'QA legacy overseas', 'QA fixture', 'QA isolated test', '1 Market Street', '', '94103', 'San Francisco', 'US', 0]);
    $legacyId = (int) $db->lastInsertId();
    $insertAddress->execute([$userId, 'QA German', 'QA fixture', 'QA isolated test', 'Beispielweg 2', '', '10115', 'Berlin', 'DE', 0]);
    $germanId = (int) $db->lastInsertId();

    // 1. A stored non-European address cannot be used for a quote or an order.
    $rejected = qaRejects(static fn() => commerceCheckoutAddress(['address_id' => $legacyId], $userId));
    qaAssert($rejected['status'] === 422, 'A stored non-European address was accepted at checkout.');
    qaAssert(str_contains($rejected['message'], 'Europe'), 'Rejection did not name the Europe-only rule: ' . $rejected['message']);

    // 2. Stored European addresses still work, including under the row lock.
    qaAssert(commerceCheckoutAddress(['address_id' => $swissId], $userId)['country'] === 'CH', 'Swiss address was not accepted.');
    qaAssert(commerceCheckoutAddress(['address_id' => $germanId], $userId, true)['country'] === 'DE', 'German address was not accepted with a lock.');

    // 3. Another customer still cannot reach the address at all.
    $otherRejected = qaRejects(static fn() => commerceCheckoutAddress(['address_id' => $swissId], $userId + 100000));
    qaAssert($otherRejected['status'] === 404, 'An address of another customer was not hidden.');

    // 4. A freshly typed address is held to the same rule.
    $typed = ['name' => 'QA fixture', 'line1' => 'Example Street 1', 'postal_code' => '8000', 'city' => 'Zürich'];
    $typedRejected = qaRejects(static fn() => commerceCheckoutAddress(['address' => $typed + ['country' => 'US']], $userId));
    qaAssert($typedRejected['status'] === 422, 'A typed non-European address was accepted at checkout.');
    qaAssert(
        commerceCheckoutAddress(['address' => $typed + ['country' => 'nl']], $userId)['country'] === 'NL',
        'A typed Dutch address was not accepted.'
    );

    // 5. The delivery country decides the currency; there is no other source left.
    qaAssert(currencyContext('CH')['currency'] === 'CHF', 'A Swiss delivery is not billed in CHF.');
    qaAssert(currencyContext('DE')['currency'] === 'EUR', 'A German delivery is not billed in EUR.');
    qaAssert(currencyContext('NL')['country'] === 'NL', 'The delivery country was not carried into the currency context.');
    qaAssert(qaRejects(static fn() => currencyDeliveryCountry('US'))['status'] === 422, 'The Europe rule accepted a US delivery.');

    // 6. Browsing currency follows the address book, not a stale session value.
    startSession();
    $_SESSION['user_id'] = $userId;
    $_SESSION['auth_fingerprint'] = hash('sha256', $passwordHash);
    unset($_SESSION['currency_country']);
    qaAssert(currencyContext()['country'] === 'CH', 'The default address did not set the browsing currency.');
    $_SESSION['currency_country'] = 'DE';
    qaAssert(currencyContext()['currency'] === 'EUR', 'An owned German address was not honoured as the delivery country.');
    $_SESSION['currency_country'] = 'FR';
    qaAssert(currencyContext()['country'] === 'CH', 'A session country the customer has no address for was not discarded.');
    unset($_SESSION['user_id'], $_SESSION['auth_fingerprint'], $_SESSION['currency_country']);

    printf("qa-delivery-address: %d checks passed.\n", $checks);
} finally {
    $db->rollBack();
}
