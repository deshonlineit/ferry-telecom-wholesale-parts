const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const routes = [];
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const context = vm.createContext({
    window: {
        APP_BASE: '/test-shop/',
        Core: { escapeHtml: esc },
        Router: { renderVersion: 1, add(pattern, handler) { routes.push({ pattern, handler }); } }
    },
    document: { addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {} },
    URLSearchParams, console
});
for (const file of ['discovery-controls.js', 'quick-finder.js', 'category-models.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets', file), 'utf8'), context, { filename: file });
}
const C = context.window.CategoryModels;
const catalog = {
    categories: [{ id: 1, name: 'LCD & schermen', slug: 'screens', count: 9 }],
    brands: [{ id: 1, name: 'Apple', count: 8 }, { id: 2, name: 'Samsung', count: 1 }],
    qualities: ['OLED'], part_types: [],
    models: [
        { id: 132, name: 'iPhone 13', brand_id: 1, count: 6 },
        { id: 133, name: 'iPhone 13 Mini', brand_id: 1, count: 2 },
        { id: 22, name: 'Galaxy S22', brand_id: 2, count: 1 },
        { id: 23, name: '<unsafe "name">', brand_id: 2, count: 1 },
        { id: 24, name: 'No mapped products', brand_id: 1, count: 0 }
    ]
};
const params = new URLSearchParams('q=iphone+lcd&category=1&quality=OLED&stock=in_stock&sort=name&page=8&featured=1');
const chosen = new URL(C.modelUrl(params, catalog.models[0]), 'http://native.test');
for (const key of ['q', 'category', 'quality', 'stock', 'sort', 'featured']) assert.equal(chosen.searchParams.get(key), params.get(key));
assert.equal(chosen.searchParams.get('model'), '132');
assert.equal(chosen.searchParams.has('brand'), false, 'A compatible model does not impose a product manufacturer');
assert.equal(chosen.searchParams.has('page'), false);
assert.equal(params.get('page'), '8', 'URL input is not mutated');
assert.equal(new URL(C.modelUrl(new URLSearchParams('category=5&part=frame&brand=1'), catalog.models[0]), 'http://native.test').searchParams.get('part'), 'frame');
assert.deepEqual(Array.from(C.options(catalog, 'IPHONE13'), model => model.id), [132, 133]);
assert(C.options(catalog).some(model => model.id === 22), 'One-product models stay selectable');
assert(!C.options(catalog).some(model => model.id === 24), 'Zero-count models are not invented as choices');
const html = C.render(catalog, params, 'LCD & schermen');
assert(html.includes('data-category-models open'));
assert(html.includes('Kies uw model'));
assert(html.includes('data-category-model="132"'));
assert(html.includes('&lt;unsafe &quot;name&quot;&gt;'));
assert(!html.includes('<unsafe'));
const selectedHtml = C.render(catalog, new URLSearchParams('category=1&model=132'), 'Schermen');
assert(!selectedHtml.includes('data-category-models open'), 'Chosen model makes the next results compact');
assert(selectedHtml.includes('Model wijzigen'));
assert(selectedHtml.includes('aria-current="page"'));
assert(C.render({ ...catalog, models: [] }, params, 'LCD').includes('geen modellen gekoppeld'));
console.log('PASS: visible category-first model choices, contextual URLs, query preservation, counts, small groups, escaping, selection and empty state.');

const inputEvents = {};
const input = { value: '', addEventListener(event, handler) { inputEvents[event] = handler; } };
let clicks = 0, focus = 0;
const list = { innerHTML: '', scrollTop: 0, querySelector: () => list.innerHTML.includes('<a ') ? { click() { clicks++; }, focus() { focus++; } } : null };
const count = {};
const empty = {};
const panel = {
    querySelector(selector) {
        return { '[data-category-model-search]': input, '.category-model-options': list, '[data-category-model-count]': count, '.category-model-empty': empty }[selector];
    },
    addEventListener() {}
};
C.bind(panel, catalog, params);
input.value = 'iphone13';
inputEvents.input();
assert(count.textContent.startsWith('2 modellen'));
assert(list.innerHTML.includes('iPhone 13 Mini'));
assert(!list.innerHTML.includes('Galaxy S22'));
inputEvents.keydown({ key: 'Enter', preventDefault() {} });
inputEvents.keydown({ key: 'ArrowDown', preventDefault() {} });
assert.equal(clicks, 1);
assert.equal(focus, 1);
input.value = 'no-such-model';
inputEvents.input();
assert.equal(empty.hidden, false);
assert.equal(list.innerHTML, '');
inputEvents.keydown({ key: 'Escape', preventDefault() {} });
assert.equal(input.value, '');
assert.equal(empty.hidden, true);
console.log('PASS: model search, live counts, keyboard choice, no-match handling and Escape reset.');

(async () => {
    const element = { value: '', addEventListener() {}, querySelector() { return element; }, close() {}, showModal() {} };
    context.document.getElementById = id => id === 'catalog-brand' ? null : element;
    context.window.Core.fetch = async url => url.startsWith('/catalog') ? catalog : { total: 1, pages: 1, page: 1, products: [{ id: 1 }] };
    context.window.App = { sortCategories: categories => categories, renderProductCard: () => '<article>Fixture product</article>' };
    context.window.Discovery.bindDeviceFields = () => {};
    let bound = false;
    C.bind = node => { bound = Boolean(node); };
    context.window.FastFinder.bindInline = () => { throw new Error('The old hidden model picker must not be used on a category page'); };
    const root = {
        innerHTML: '', isConnected: true,
        querySelector(selector) { return selector === '[data-change-device]' ? null : element; },
        querySelectorAll() { return []; }
    };
    await routes.find(route => route.pattern.test('catalog')).handler([], root, params);
    assert(!root.innerHTML.includes('Het assortiment kon niet worden geladen'));
    assert(root.innerHTML.indexOf('data-category-models') < root.innerHTML.indexOf('class="product-container'));
    assert(!root.innerHTML.includes('data-inline-model'));
    assert(bound, 'Visible model control is wired by the real catalog route');
    console.log('PASS: real catalog route places and binds the visible model step before products, with no duplicate hidden picker.');
})().catch(error => { console.error(error); process.exitCode = 1; });