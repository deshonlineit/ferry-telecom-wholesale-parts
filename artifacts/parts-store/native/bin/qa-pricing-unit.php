<?php
declare(strict_types=1);

require_once __DIR__ . '/../src/bootstrap.php';
require_once __DIR__ . '/../src/operations.php';

function pricingQa(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: $message\n");
        exit(1);
    }
}

pricingQa(pricingAdjustedValue(100, 'percent', 500) === 105, 'positive basis points');
pricingQa(pricingAdjustedValue(101, 'percent', 500) === 106, 'half-up percentage rounding');
pricingQa(pricingAdjustedValue(100, 'percent', -10000) === 0, 'minus one hundred percent');
pricingQa(pricingAdjustedValue(0, 'add', 0) === 0, 'zero is a valid price');
pricingQa(pricingAdjustedValue(100, 'add', -100) === 0, 'adjustment may produce zero');

try {
    pricingAdjustedValue(null, 'add', 1);
    pricingQa(false, 'unknown costs must not be manufactured');
} catch (HttpError $error) {
    pricingQa($error->status === 422, 'unknown cost error status');
}

try {
    pricingInteger('12');
    pricingQa(false, 'JSON numeric strings must be rejected');
} catch (HttpError $error) {
    pricingQa($error->status === 422, 'strict integer error status');
}

fwrite(STDOUT, "pricing unit checks passed\n");