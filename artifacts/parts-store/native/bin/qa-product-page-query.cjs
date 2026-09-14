const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync(new URL('../public/index.php', `file://${__filename}`), 'utf8');
const productRoute = source.slice(
    source.indexOf("preg_match('#^products/"),
    source.indexOf('$entryRoute')
);

assert.match(
    productRoute,
    /active=TRUE/,
    'The product page must compare the active flag as a boolean on PostgreSQL.'
);
assert.doesNotMatch(
    productRoute,
    /active=1/,
    'PostgreSQL rejects boolean = integer on the production product page.'
);

console.log('PASS: product detail visibility query is portable across PostgreSQL and MySQL.');