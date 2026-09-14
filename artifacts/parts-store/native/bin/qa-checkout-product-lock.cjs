const assert = require('node:assert/strict');
const fs = require('node:fs');

const commerce = fs.readFileSync(new URL('../src/commerce.php', `file://${__filename}`), 'utf8');
const checkout = commerce.slice(
    commerce.indexOf('function commerceCheckout('),
    commerce.indexOf('function commerceListOrders(')
);

assert.match(
    checkout,
    /dbDriver\(\) === 'pgsql' \? ' FOR UPDATE OF p' : ' FOR UPDATE'/,
    'PostgreSQL checkout must lock only the product row while MySQL retains FOR UPDATE.'
);
assert.doesNotMatch(
    checkout,
    /publication_status = \\\\'visible\\\\' FOR UPDATE'/,
    'Checkout must not apply an unqualified lock to the nullable group-price join.'
);

console.log('PASS: checkout product locking is safe for PostgreSQL LEFT JOIN pricing.');