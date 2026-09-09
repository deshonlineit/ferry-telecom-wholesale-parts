<?php
declare(strict_types=1);
require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/native-relay.php';

$now = 1700000000;
// A same-second UPDATE may report zero affected rows; the persisted owner and
// future deadline remain authoritative.
$sameSecond = nativeRelayLeaseIsOwned([
    'locked_owner' => 'worker-a',
    'locked_until' => gmdate('Y-m-d H:i:s', $now + 900),
], 'worker-a', $now);
$wrongOwner = nativeRelayLeaseIsOwned([
    'locked_owner' => 'worker-b',
    'locked_until' => gmdate('Y-m-d H:i:s', $now + 900),
], 'worker-a', $now);
$tooShort = nativeRelayLeaseIsOwned([
    'locked_owner' => 'worker-a',
    'locked_until' => gmdate('Y-m-d H:i:s', $now + 10),
], 'worker-a', $now);
if (!$sameSecond || $wrongOwner || $tooShort) throw new RuntimeException('Lease ownership regression.');
echo "PASS: native relay lease ownership is row-count independent.\n";