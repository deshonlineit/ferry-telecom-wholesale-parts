const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checkout = read('public/assets/store.js');
const admin = read('public/assets/admin.js');
const account = read('public/assets/account.js');
const i18n = read('public/assets/i18n.js');

assert.match(checkout, /const codes = \['stripe', 'pay_later', 'swiss_qr_invoice'\]/);
assert.match(checkout, /quote\.payment_methods \|\| \[\]/);
assert.match(checkout, /response\?\.reason \|\| response\?\.message/);
assert.match(checkout, /payment-card \$\{enabled \? '' : 'disabled'\}/);
assert.match(checkout, /checkout\.stripe\.com/);
assert.match(checkout, /window\.location\.assign\(target\.href\)/);
assert.doesNotMatch(checkout, /value="test_(invoice|card)"/);
assert.match(admin, /action-payment-entitlement/);
assert.match(admin, /payment_entitlements/);
assert.match(admin, /Fulfillment', 'Payment'/);
assert.doesNotMatch(account, /account\/buyback/);
assert.match(account, /accountFulfillmentState/);
assert.match(account, /order\.status === 'on_hold' && order\.payment_method === 'stripe'/);
assert.match(account, /buyer-order-card/);
assert.match(account, /pay_invoice_eligible/);
assert.doesNotMatch(account, /packing-slip\.pdf/);
for (const locale of ['en', 'nl', 'de', 'fr', 'it']) {
    assert.match(i18n, new RegExp(`Object\\.assign\\(source\\.${locale}, \\{[\\s\\S]{0,1000}?stripe:`));
}

console.log('PASS: checkout respects server payment eligibility; buyer and staff payment UI stay distinct.');