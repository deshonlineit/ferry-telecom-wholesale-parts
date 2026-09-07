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
    B2BOrdering: {canOrder() { return false; }},
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
assert.match(coreSource, /photo-preview-zoom-in/);
assert.match(coreSource, /photo-preview-zoom-out/);
assert.match(coreSource, /photo-preview-zoom-reset/);
assert.match(coreSource, /figure\.scrollLeft/);
assert.match(coreSource, /resetZoom\(\);\s*image\.src/);

assert.equal(window.App.thumbnailUrl({
    url: '/media/example-1280w.webp',
    variants: {'320': '/media/example-320w.webp'}
}), '/media/example-320w.webp');
assert.equal(
    window.App.thumbnailUrl({url: '/test-shop/media/products/1/hash-1280w.webp'}),
    '/test-shop/media/products/1/hash-320w.webp'
);
assert.equal(window.App.thumbnailUrl({url: '/legacy/photo.jpg'}), '/legacy/photo.jpg');

const adminSource = fs.readFileSync(path.join(__dirname, '../public/assets/admin-products.js'), 'utf8');
assert.match(adminSource, /id="img-upload"[^>]+multiple/);
assert.match(adminSource, /for \(const result of results\)/);
assert.match(adminSource, /Successful uploads have been retained/);
assert.match(adminSource, /Existing main image/);
assert.match(adminSource, /updateImageGallery\(response\.images \|\| images\)/);
assert.doesNotMatch(adminSource, /afbeelding\$\{successes === 1 \? '' : 'en'\} geüpload`, 'success'\);\s*window\.Router\.route/);

const mediaSource = fs.readFileSync(path.join(__dirname, '../src/media.php'), 'utf8');
assert.match(mediaSource, /image_url = ''/);
assert.match(mediaSource, /AND image_url = \?/);

console.log('PASS: native gallery uses responsive thumbnails, zoom/pan controls and cleanup hooks; staff multi-upload is sequential with persistent partial-failure feedback.');