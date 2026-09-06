const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = {};
const document = {
    addEventListener(type, handler) { listeners[type] = handler; }
};
const window = {
    APP_BASE: '/test-shop/',
    Core: {
        user: null,
        escapeHtml(value) {
            return String(value ?? '').replace(/[&<"']/g, char => ({
                '&': '&amp;', '<': '&lt;', '"': '&quot;', "'": '&#039;'
            })[char]);
        },
        formatMoney: cents => `${cents / 100} CHF`
    },
    App: {},
    Router: {add() {}},
    UI: {showGallery() {}}
};
const context = vm.createContext({window, document, console});
vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../public/assets/store.js'), 'utf8'),
    context,
    {filename: 'store.js'}
);

const withPhoto = window.App.renderProductCard({
    id: 7,
    name: 'Scherm "Pro"',
    sku: 'SCREEN-7',
    image_url: '/uploads/screen-7.jpg',
    quality: '',
    part_type: {id: 3, name: 'Frame <Premium & Co'},
    stock: 3,
    minimum_quantity: 1,
    price_cents: 1200
});
assert.match(withPhoto, /<button type="button" class="part-img-link part-photo-preview"/);
assert.doesNotMatch(withPhoto, /<a[^>]+class="part-img-link"/);
assert.match(withPhoto, /data-photo-name="Scherm &quot;Pro&quot;"/);
assert.match(withPhoto, /<h3 class="part-name"><a href="\/test-shop\/products\/7">/);
assert.match(withPhoto, /class="part-type-badge">Frame &lt;Premium &amp; Co<\/span>/);

const withoutPhoto = window.App.renderProductCard({
    id: 8,
    name: 'Eerlijke placeholder',
    sku: 'NONE-8',
    image_url: '',
    quality: '',
    part_type: null,
    stock: 0,
    minimum_quantity: 1,
    price_cents: null
});
assert.match(withoutPhoto, /class="part-img-link part-no-photo"/);
assert.doesNotMatch(withoutPhoto, /part-photo-preview/);
assert.doesNotMatch(withoutPhoto, /part-type-badge/);

const coreSource = fs.readFileSync(path.join(__dirname, '../public/assets/core.js'), 'utf8');
assert.match(coreSource, /document\.createElement\('dialog'\)/);
assert.match(coreSource, /dialog\.showModal\(\)/);
assert.match(coreSource, /dialog\.addEventListener\('cancel'/);
assert.match(coreSource, /dialog\.addEventListener\('close', cleanup\)/);
assert.match(coreSource, /opener\.focus\(\)/);
assert.match(coreSource, /window\.UI\.closeGallery\(\)/);

console.log('PASS: photo thumbnails stay buttons, titles stay links, missing photos stay honest, and the native dialog has keyboard/navigation cleanup hooks.');