const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const commerce = read('src/commerce.php');
const schema = read('database/schema.sql');
const checkout = read('public/assets/store.js');
const admin = read('public/assets/admin.js');
const account = read('public/assets/account.js');
const media = read('src/media.php');

assert.match(schema, /status VARCHAR\(30\) NOT NULL DEFAULT 'on_hold'/);
assert.ok(commerce.includes("['swiss_qr_invoice', 'pay_later']"));
assert.match(commerce, /\$expectedPaymentMethod = strtoupper[^;]+=== 'CH'\s*\? 'swiss_qr_invoice'\s*: 'pay_later'/s);
assert.ok(commerce.includes('$paymentMethod !== $expectedPaymentMethod'));
assert.ok(commerce.includes("$number, (int) $user['id'], 'on_hold'"));
assert.ok(commerce.includes("'on_hold' => ['on_hold', 'processing', 'cancelled']"));
assert.doesNotMatch(checkout, /value="test_(invoice|card)"/);
assert.ok(checkout.includes("swiss ? 'swiss_qr_invoice' : 'pay_later'"));
assert.match(admin, /On hold — awaiting payment/);
assert.match(admin, /Payment method/);
assert.match(account, /swiss_qr_invoice: 'swissQrInvoice'/);
assert.match(media, /Order status:.*On hold - awaiting payment/);
assert.ok(media.includes('Swiss QR Invoice (payment due)'));

console.log('PASS: unpaid orders stay on hold; country-specific pay-later methods remain separate from manual processing.');