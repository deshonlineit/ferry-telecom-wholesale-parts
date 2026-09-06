const fs = require('fs');

function assert(condition, message) {
    if (!condition) {
        console.error('FAIL:', message);
        process.exit(1);
    }
}

// Exercise the actual application scripts in their shared load order.
const app = require('./qa-scripts.cjs');
const parseCentsStrict = app.window.Workbench.parseCentsStrict;

console.log('Testing parseCentsStrict...');
assert(parseCentsStrict('5,25') === 525, '5,25 should be 525');
assert(parseCentsStrict('5.25') === 525, '5.25 should be 525');
assert(parseCentsStrict('0') === 0, '0 should be 0');
assert(parseCentsStrict('0,05') === 5, '0,05 should be 5');
assert(parseCentsStrict('') === null, 'empty string should be null');
assert(parseCentsStrict(null) === null, 'null should be null');
assert(parseCentsStrict('-') === null, '- should be null');
assert(Number.isNaN(parseCentsStrict('abc')), 'abc should be NaN');
assert(Number.isNaN(parseCentsStrict('-5.25')), '-5.25 should be NaN'); // Negative rejected here
assert(Number.isNaN(parseCentsStrict('5.255')), '5.255 should be NaN'); // 3 decimals rejected
assert(Number.isNaN(parseCentsStrict('1e3')), 'Exponent notation must be rejected');
assert(Number.isNaN(parseCentsStrict('999999999999999999999999')), 'Overflow must be rejected');

// 2. Verify files locally (Mock tests)
const adminJs = fs.readFileSync(__dirname + '/../public/assets/admin.js', 'utf8');
const adminProdJs = fs.readFileSync(__dirname + '/../public/assets/admin-products.js', 'utf8');
const adminPricesJs = fs.readFileSync(__dirname + '/../public/assets/admin-prices.js', 'utf8');

console.log('Verifying admin.js...');
assert(!adminJs.includes('shipping_chf'), 'shipping_chf should be completely removed from admin.js');
assert(!adminJs.includes('formatMoney(p.list_price_cents)'), 'list_price_cents formatMoney should be removed');
assert(adminJs.includes('list_price_eur_cents'), 'list_price_eur_cents should be used in table');
assert(adminJs.includes('window.Workbench.parseCentsStrict ='), 'parseCentsStrict should be defined in admin.js');

console.log('Verifying admin-products.js...');
assert(!adminProdJs.includes('list_price_cents: p.list_price_cents'), 'legacy list_price_cents fallback should be removed');
assert(adminProdJs.includes('inputmode="decimal"'), 'inputmode="decimal" should be used for prices');

console.log('Verifying admin-prices.js...');
assert(adminPricesJs.includes('inputmode="decimal"'), 'inputmode="decimal" should be used for grid prices');
assert(!adminPricesJs.includes("split('\\\\n')"), 'split strings should be literal \\n');

console.log('All QA deterministic tests passed!');
