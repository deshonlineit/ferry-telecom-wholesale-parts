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
        Router: { add(pattern, handler) { routes.push({pattern, handler}); } },
        App: { sortCategories: categories => categories, renderProductCard: product => `<article>${esc(product.name)}</article>` }
    },
    document: { addEventListener() {}, activeElement: null },
    URLSearchParams, AbortController, console, setTimeout, clearTimeout
});
for (const file of ['discovery-controls.js', 'quick-finder.js', 'category-models.js', 'home-search.js', 'home.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets', file), 'utf8'), context, {filename: file});
}
const H = context.window.HomeSearch;
const params = new URLSearchParams('category=1&q=iphone+lcd&sort=stock');
const shell = H.shell(params);
assert(shell.includes('value="iphone lcd"'));
assert(!/<select|<dialog|type="submit"/.test(shell), 'No dropdown, popup or compulsory submit control');
assert(!shell.includes('data-fast-finder'), 'No competing brand/model form');
assert(shell.includes('id="home-search"'));
assert(H.shell(new URLSearchParams('q=%22%3E%3Cscript%3E')).includes('&quot;&gt;&lt;script&gt;'));
assert(!H.requests(new URLSearchParams())[1].includes('featured='), 'Alles includes the whole assortment, not only featured products');
assert(!H.requests(params)[1].includes('featured='));
assert.equal(new URLSearchParams(H.requests(params)[1].split('?')[1]).get('limit'), '8');
assert(routes.some(route => route.pattern.test('')), 'Homepage route is registered');
console.log('PASS: homepage has one live search field, no dropdown/modal/submit step, scoped read-only requests and safe query rendering.');

(async () => {
    let active = true;
    const requests = [], paints = [], syncs = [], errors = [];
    const controller = H.controller(params, {
        delay: 0, active: () => active, busy() {},
        load(selection, signal) { return new Promise((resolve, reject) => requests.push({selection, signal, resolve, reject})); },
        render(data, selection) { paints.push({data, selection}); },
        sync(selection, typing) { syncs.push({selection: selection.toString(), typing}); },
        error(error) { errors.push(error); }
    });
    const initial = controller.start();
    const modelPick = controller.change({model: 132});
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(requests[1].selection.get('category'), '1');
    assert.equal(requests[1].selection.get('q'), 'iphone lcd');
    assert.equal(requests[1].selection.get('model'), '132');
    assert.equal(requests[1].selection.has('brand'), false);
    requests[1].resolve('new results'); await modelPick;
    requests[0].resolve('old results'); await initial;
    assert.equal(paints.length, 1);
    assert.equal(paints[0].data, 'new results');
    console.log('PASS: model click immediately searches, retains LCD/category/sort, does not infer brand; late responses cannot overwrite results.');

    controller.search('iphone 14');
    controller.search('iphone 14 lcd');
    await new Promise(resolve => setTimeout(resolve, 15));
    assert.equal(requests.length, 3, 'Rapid typing produces one debounced load');
    assert.equal(requests[2].selection.get('q'), 'iphone 14 lcd');
    assert.equal(requests[2].selection.get('category'), '1');
    assert.equal(requests[2].selection.has('model'), false, 'Typing a new device is not locked to the previous model');
    assert.equal(syncs.at(-1).typing, true);
    requests[2].resolve('typed results');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(paints.at(-1).data, 'typed results');
    console.log('PASS: typing alone refreshes results, preserves the part category and clears a stale device; no button click required.');

    const failed = controller.change({category: 2});
    requests[3].reject(new Error('network unavailable')); await failed;
    assert.equal(errors.length, 1);
    const retry = controller.start();
    assert.equal(requests[4].selection.get('category'), '2');
    requests[4].resolve('retried'); await retry;
    const reset = controller.reset();
    assert.equal(requests[5].selection.toString(), '');
    requests[5].resolve('featured'); await reset;
    active = false;
    await controller.change({q: 'must-not-fetch'});
    assert.equal(requests.length, 6);
    console.log('PASS: explicit failures, retry, full reset and navigation-away request guard.');

    const nodes = new Map();
    const root = {
        querySelector(selector) {
            if (!nodes.has(selector)) nodes.set(selector, {innerHTML: '', textContent: '', hidden: false, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; }});
            return nodes.get(selector);
        },
        querySelectorAll: () => [], classList: { remove() {} }
    };
    const catalog = {
        categories: [{id: 1, slug: 'screens', name: 'Displays', count: 6}],
        models: [{id: 132, name: 'iPhone 13', count: 6}, {id: 133, name: 'iPhone 13 Mini', count: 1}, {id: 199, name: 'No match', count: 0}]
    };
    H.paint(root, [catalog, {total: 6, products: [{name: 'iPhone 13 LCD'}]}], new URLSearchParams('category=1&q=iphone+lcd&model=132'));
    assert.equal(nodes.get('.instant-models').hidden, false, 'Models stay visible even after choosing one');
    assert.equal(nodes.get('.instant-model-options').scrollTop, 0, 'A chosen or searched model is not hidden by the previous scroll position');
    assert(nodes.get('.instant-model-options').innerHTML.includes('data-home-model="133"'));
    assert(nodes.get('.instant-model-options').innerHTML.indexOf('data-home-model="132"') < nodes.get('.instant-model-options').innerHTML.indexOf('data-home-model="133"'), 'Selected model remains immediately visible');
    assert(!nodes.get('.instant-model-options').innerHTML.includes('No match'));
    assert(nodes.get('[data-home-products]').innerHTML.includes('iPhone 13 LCD'));
    assert.equal(nodes.get('.instant-results').attrs['aria-busy'], 'false');
    assert(nodes.get('[data-home-all]').href.includes('model=132'));
    H.paint(root, [{...catalog, models: []}, {total: 0, products: []}], new URLSearchParams('q=unmatched'));
    assert(nodes.get('[data-home-products]').innerHTML.includes('Geen passende onderdelen'));
    assert.equal(nodes.get('[data-home-all]').hidden, true);
    console.log('PASS: actual render path shows products inline, keeps model choices open, includes one-product groups and handles empty results honestly.');
})().catch(error => { console.error(error); process.exitCode = 1; });