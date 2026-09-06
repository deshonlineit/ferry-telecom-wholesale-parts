const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const saved = new Map();
const listeners = {};
let focused = '';
let dialogOpen = false;
const document = {
    addEventListener(name, callback) { listeners[name] = callback; },
    querySelector() { return dialogOpen ? {} : null; },
    getElementById(id) { return {focus() { focused = id; }}; }
};
const context = vm.createContext({
    window: {APP_BASE: '/test-shop/', Core: {escapeHtml: value => String(value).replaceAll('"', '&quot;').replaceAll('<', '&lt;')}, Router: {add() {}}},
    document, URLSearchParams, console,
    localStorage: {getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key)}
});
for (const file of ['discovery-controls.js', 'quick-finder.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/', file), 'utf8'), context);
const finder = context.window.FastFinder;
const catalog = {
    brands: [{id: 1, name: 'Apple', count: 100}, {id: 2, name: 'Samsung', count: 50}],
    models: [
        {id: 132, brand_id: 1, name: 'iPhone 13', count: 13},
        {id: 133, brand_id: 1, name: 'iPhone 13 Pro', count: 25},
        {id: 30, brand_id: 2, name: 'Galaxy S22', count: 4},
        {id: 31, brand_id: 2, name: 'Galaxy S23', count: 0}
    ]
};
let count = 0;
function check(label, callback) { callback(); count++; console.log('PASS:', label); }
check('compact model search puts exact iPhone 13 before Pro despite fewer products', () => {
    assert.deepEqual(Array.from(finder.models(catalog, '', 'iphone13'), m => m.id), [132, 133]);
});
check('model queries tolerate spaces and hyphens', () => {
    assert.equal(finder.models(catalog, '', 'Galaxy-s22')[0].id, 30);
});
check('brand selection excludes other manufacturers and zero-count models', () => {
    assert.deepEqual(Array.from(finder.models(catalog, '2'), m => m.id), [30]);
});
check('unknown model query returns an explicit empty result', () => assert.equal(finder.models(catalog, '', 'unlisted-model').length, 0));
check('short model queries rank exact executions before higher-count variants', () => {
    const variants = {...catalog, models: [
        {id: 1, name: 'iPhone 13 Pro Max', brand_id: 1, count: 50},
        {id: 2, name: 'iPhone 13 Pro', brand_id: 1, count: 1},
        {id: 3, name: 'Samsung Galaxy S23 Ultra', brand_id: 2, count: 50},
        {id: 4, name: 'Samsung Galaxy S23', brand_id: 2, count: 1},
        {id: 5, name: 'Apple Watch Series 2 - 38mm', brand_id: 1, count: 100},
        {id: 6, name: 'MacBook Pro 13 inch', brand_id: 1, count: 100}
    ]};
    for (const query of ['13 Pro', '13pro', 'iPhone13Pro', 'Apple iPhone 13 Pro']) {
        assert.equal(finder.models(variants, '', query)[0].id, 2, query);
    }
    for (const query of ['S23', 'Samsung S23', 'Galaxy S23']) {
        assert.equal(finder.models(variants, '', query)[0].id, 4, query);
    }
    assert.equal(finder.models(variants, '', 'iPhone13ProMax')[0].id, 1);
    assert.equal(finder.models(variants, '', 'S23 Ultra')[0].id, 3);
    assert(!finder.models(variants, '', 'S23').some(model => model.id === 5), 'Do not match across unrelated word/number boundaries');
    assert(!finder.models(variants, '', '13 Pro').some(model => model.id === 6), 'Device terms must remain in the requested order');
});
check('part terms do not hide model suggestions from the unified home search', () => {
    assert.equal(finder.modelQuery('iPhone 13 Pro Max OLED'), 'iPhone 13 Pro Max');
    assert.equal(finder.modelQuery('LCD voor iPhone 13'), 'iPhone 13');
    assert.equal(finder.modelQuery('S23 batterij'), 'S23');
    assert.equal(finder.modelQuery('lcd'), '');
});
check('model order changes immediately between part count and natural A–Z', () => {
    assert.deepEqual(Array.from(finder.models(catalog, '', '', 'name'), m => m.id), [30, 132, 133]);
    assert.deepEqual(Array.from(finder.models(catalog), m => m.id), [133, 132, 30]);
    assert.equal(finder.models(catalog, '', 'iphone13', 'name')[0].id, 132);
});
check('model switching preserves precise housing type', () => {
    const url = new URL(finder.modelUrl(new URLSearchParams('category=5&part=frame&brand=2&model=30&q=galaxy&sort=name'), catalog.models[0]), 'https://shop.example.test');
    assert.equal(url.searchParams.get('part'), 'frame');
    assert.equal(url.searchParams.get('category'), '5');
    assert.equal(url.searchParams.has('q'), false);
});
check('inline model search exposes keyboard combobox and browse action', () => {
    const html = finder.inline(new URLSearchParams(), catalog.models[0]);
    assert.ok(html.includes('role="combobox"'));
    assert.ok(html.includes('aria-controls="inline-model-results"'));
    assert.ok(html.includes('data-change-device'));
    assert.ok(html.includes('model-command-popover" hidden'));
});
check('model link preserves category, quality, stock and sort; clears old query and pagination', () => {
    const url = new URL(finder.modelUrl(new URLSearchParams('brand=2&model=30&q=galaxy&category=1&quality=OLED&stock=in_stock&sort=name&page=9'), catalog.models[0]), 'https://shop.example.test');
    assert.equal(url.pathname, '/test-shop/catalog');
    for (const [key, value] of Object.entries({brand: '1', model: '132', category: '1', quality: 'OLED', stock: 'in_stock', sort: 'name'})) assert.equal(url.searchParams.get(key), value);
    assert.equal(url.searchParams.has('q'), false);
    assert.equal(url.searchParams.has('page'), false);
});
check('recent models use real records and are deduplicated newest first', () => {
    finder.remember(catalog.models[0]); finder.remember(catalog.models[2]); finder.remember(catalog.models[0]);
    assert.deepEqual(Array.from(finder.recent(catalog), m => m.id), [132, 30]);
    assert.equal(finder.recent({...catalog, models: []}).length, 0);
});
check('corrupt browser storage cannot break model lookup', () => {
    saved.set('parts_recent_models', '{"invalid":true}');
    assert.equal(finder.recent(catalog).length, 0);
    finder.remember(catalog.models[0]);
    assert.equal(finder.recent(catalog)[0].id, 132);
    saved.set('parts_recent_models', 'invalid json');
    assert.equal(finder.recent(catalog).length, 0);
});
check('storage disabled still permits working search', () => {
    context.localStorage.getItem = () => { throw new Error('Storage disabled'); };
    assert.equal(finder.recent(catalog).length, 0);
    finder.remember(catalog.models[0]);
    assert.equal(finder.models(catalog, '1').length, 2);
});
check('rendered models are real navigation links and use unique labelled search inputs', () => {
    const html = finder.render(catalog, new URLSearchParams(), 'home');
    assert.ok(html.includes('id="home-quick-model"'));
    assert.ok(html.includes('for="home-quick-model"'));
    assert.ok(html.includes('href="/test-shop/catalog?brand=1&amp;model=132"') || html.includes('href="/test-shop/catalog?brand=1&model=132"'));
    assert.equal(html.includes('data-finder-model="31"'), false);
});
function keyEvent(key, extra = {}) {
    return {key, defaultPrevented: false, target: {closest() { return null; }}, preventDefault() { this.defaultPrevented = true; }, ...extra};
}
check('slash focuses the homepage search without typing a slash', () => {
    const event = keyEvent('/');
    listeners.keydown(event);
    assert.equal(focused, 'home-search'); assert.equal(event.defaultPrevented, true);
});
check('command/control K focuses search', () => {
    focused = ''; listeners.keydown(keyEvent('k', {ctrlKey: true})); assert.equal(focused, 'home-search');
});
check('shortcut does not hijack editing or an open dialog', () => {
    focused = '';
    listeners.keydown(keyEvent('/', {target: {closest() { return {}; }}}));
    assert.equal(focused, '');
    dialogOpen = true;
    listeners.keydown(keyEvent('/'));
    assert.equal(focused, '');
});
console.log(`${count} quick-finder checks passed.`);