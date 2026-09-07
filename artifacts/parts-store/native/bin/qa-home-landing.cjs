const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const routes = [];
const navigations = [];
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const context = vm.createContext({
    window: {
        APP_BASE: '/test-shop/',
        Core: {
            escapeHtml: esc,
            user: null,
            formatMoney: (cents, currency) => `${currency} ${(cents / 100).toFixed(2)}`
        },
        Router: {
            renderVersion: 1,
            add(pattern, handler) { routes.push({pattern, handler}); },
            navigate(url) { navigations.push(url); }
        },
        App: {
            sortCategories: categories => categories,
            thumbnailUrl: image => `${image.url}?thumb=1`,
            canOrderProduct: product => Boolean(product.orderable)
        },
        UI: {closeSuggestions() {}}
    },
    document: {addEventListener() {}, activeElement: null},
    URLSearchParams, AbortController, console, setTimeout, clearTimeout
});
for (const file of ['i18n.js', 'discovery-controls.js', 'home-landing.js', 'home.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets', file), 'utf8'), context, {filename: file});
}
const L = context.window.HomeLanding;

// 1. The front page is a landing page: one search entry, no product listing markup.
const shell = L.shell();
assert(shell.includes('id="home-search"'), 'The hero keeps the search field the keyboard shortcut expects');
assert(shell.includes('id="home-search-suggestions"'), 'Suggestions stay attached to the hero search');
assert(!/<table|b2b-table|data-product-row/.test(shell), 'Product rows belong to the shop and category pages');
assert(shell.includes(`href="/test-shop/catalog"`), 'The front page links through to the shop');
assert(shell.includes('lp-method-list'), 'The ordering explanation is part of the page');

// 2. Category cards open the category page; hostile names cannot break out.
const catalog = {
    total: 7856,
    categories: [
        {id: 3, slug: 'screens', name: 'Displays & touchscreens', count: 1058},
        {id: 9, slug: 'batteries', name: 'Batterijen', count: 328},
        {id: 42, slug: 'exotic', name: '"><script>alert(1)</script>', count: 5},
        {id: 11, slug: 'tools', name: 'Reparatiegereedschap', count: 0}
    ],
    device_families: [
        {id: 'samsung', label: 'Samsung Galaxy', count: 1561},
        {id: 'iphone', label: 'iPhone', count: 1736},
        {id: 'macbook', label: 'MacBook', count: 4},
        {id: 'empty', label: 'Leeg', count: 0}
    ],
    models: [
        {id: 150, name: 'iPhone 17 Pro', count: 12, sort_order: 202500091},
        {id: 60, name: 'iPhone 8', count: 44, sort_order: 201700081},
        {id: 22, name: 'Galaxy S24', count: 31, sort_order: 202400051},
        {id: 99, name: 'Zonder voorraad', count: 0, sort_order: 209900011}
    ]
};

const categories = L.renderCategories(catalog);
assert(categories.includes('href="/test-shop/catalog?category=3"'), 'A category card opens the category page');
assert(categories.includes('1,058 parts'), 'Real counts are shown in English notation');
assert(!categories.includes('category=11'), 'Empty categories stay out of the front page');
assert(categories.includes('&lt;script&gt;') && !categories.includes('<script>'), 'Category names are escaped');

const families = L.renderFamilies(catalog);
assert(families.indexOf('family=iphone') < families.indexOf('family=samsung'), 'Families follow the fixed device order');
assert(!families.includes('family=empty'), 'Families without parts are omitted');

const models = L.renderModels(catalog);
assert(models.indexOf('model=150') < models.indexOf('model=22'), 'Models stay ordered newest to oldest');
assert(models.indexOf('model=22') < models.indexOf('model=60'));
assert(!models.includes('model=99'), 'Models without parts are omitted');

const chips = L.renderChips(catalog);
assert(chips.indexOf('family=iphone') < chips.indexOf('family=samsung'), 'Hero shortcuts lead with the largest family');
assert(!chips.includes('family=empty'));

// 3. Featured cards respect pricing and ordering permissions.
const featured = L.renderFeatured({
    products: [
        {id: 7811, sku: 'PRIPH01', name: 'iPhone 17 Pro OLED', stock: 14, minimum_quantity: 2, image_url: '/test-shop/media/a.webp', price_cents: 12900, currency: 'CHF', quality: 'OLED', orderable: true, models: [{id: 150, name: 'iPhone 17 Pro'}]},
        {id: 7810, sku: '"><b>', name: 'Zonder prijs', stock: 0, minimum_quantity: 1, image_url: '', price_cents: null, currency: 'CHF', models: []}
    ]
});
assert(featured.includes('CHF 129.00'), 'A known price is shown as money');
assert(featured.includes('data-lp-add="7811" data-lp-quantity="2"'), 'Ordering honours the minimum quantity');
assert(featured.includes('Sign in for prices'), 'Without a price the visitor is sent to the login page');
assert(!featured.includes('data-lp-add="7810"'), 'Products the visitor cannot order have no add button');
assert(featured.includes('lp-product-placeholder'), 'Missing photos fall back to a placeholder');
assert(featured.includes('&quot;&gt;&lt;b&gt;') && !featured.includes('"><b>'), 'Product fields are escaped');
assert(featured.includes('14 in stock') && featured.includes('Out of stock'), 'Stock reality is shown as-is');
assert.equal(L.renderFeatured({products: []}), '<p class="lp-empty">There are no featured parts at present.</p>');

// 4. Painting fills the live numbers without inventing any.
const nodes = new Map();
const node = () => ({innerHTML: '', textContent: '', value: '', hidden: false, firstChild: {textContent: ''}, addEventListener() {}});
const root = {
    isConnected: true,
    innerHTML: '',
    addEventListener() {},
    querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, node());
        return nodes.get(selector);
    },
    querySelectorAll(selector) { return [root.querySelector(selector)]; }
};
L.paint(root, catalog, {products: []});
assert.match(root.querySelector('[data-lp-lead]').textContent, /7,856.*parts.*4.*models/);
assert(root.querySelector('[data-lp-stats]').innerHTML.includes('7,856'));
assert(root.querySelector('[data-lp-stats]').innerHTML.includes('categories'));
assert(root.querySelector('[data-lp-models-all]').firstChild.textContent.includes('View all 4 models'));
assert(root.querySelector('[data-lp-cta-note]').textContent.includes('7,856 parts'));

// 5. Filtered links keep working: the front page hands them to the shop page.
const home = routes.find(route => route.pattern.test(''));
assert(home, 'The front page route stays registered');

(async () => {
    await home.handler([''], root, new URLSearchParams('category=3&family=iphone'));
    assert.deepEqual(navigations, ['/test-shop/catalog?category=3&family=iphone'], 'Old filtered home links land on the category page');

    navigations.length = 0;
    const requested = [];
    context.window.Core.fetch = async url => {
        requested.push(url);
        return url.startsWith('/catalog') ? catalog : {products: [], total: 0};
    };
    await home.handler([''], root, new URLSearchParams(''));
    assert.equal(navigations.length, 0, 'A clean front page renders instead of redirecting');
    assert(root.innerHTML.includes('lp-hero'), 'The landing page is mounted');
    assert.deepEqual(requested, ['/catalog', '/products?featured=1&limit=4'], 'The front page reads the catalogue read-only');
    assert(root.querySelector('[data-lp-error]').hidden, 'No error notice on a healthy load');

    context.window.Core.fetch = async () => { throw new Error('Network error'); };
    await home.handler([''], root, new URLSearchParams(''));
    const notice = root.querySelector('[data-lp-error]');
    assert.equal(notice.hidden, false, 'A failing catalogue surfaces an explicit error');
    assert(notice.innerHTML.includes('Network error') && notice.innerHTML.includes('data-lp-retry'), 'The visitor can retry');

    // 6. A slow first attempt may never overwrite the newer retry.
    const pending = [];
    context.window.Core.fetch = () => new Promise(resolve => pending.push(resolve));
    const slow = L.load(root);
    const retry = L.load(root);
    assert.equal(pending.length, 4, 'Both attempts read the catalogue and the featured products');
    pending[2]({...catalog, total: 1234});
    pending[3]({products: []});
    await retry;
    assert(root.querySelector('[data-lp-lead]').textContent.includes('1,234'), 'The retry paints its own result');
    pending[0]({...catalog, total: 9999});
    pending[1]({products: []});
    await slow;
    assert(root.querySelector('[data-lp-lead]').textContent.includes('1,234'), 'A late first attempt cannot overwrite the retry');

    // 7. The page states nothing about availability that the data does not carry.
    assert(!/Direct leverbaar|binnen \d+ uur|volgende werkdag|gratis verzending|beoordeling|sterren/i.test(shell), 'No invented delivery, review or availability promises');

    console.log('PASS: front page renders live categories, devices and featured stock, keeps listings on the shop page and escapes catalog content.');
})();
