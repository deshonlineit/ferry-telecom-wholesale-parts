const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const attrs = {};
const input = {
    setAttribute: (key, value) => { attrs[key] = value; },
    removeAttribute: key => { delete attrs[key]; }
};
let options = [];
const results = {style: {display: 'none'}, querySelectorAll: () => options};
const window = {addEventListener() {}, location: {pathname: '/test-shop/'}};
const document = {
    addEventListener() {},
    getElementById: id => id === 'search-input' ? input : id === 'search-suggestions' ? results : null
};
const context = vm.createContext({window, document, console, setTimeout, clearTimeout, AbortController, URLSearchParams});
// The search behaviour itself lives in the ordering module; loading only core.js
// leaves App.handleSearchInput pointing at nothing.
for (const file of ['i18n.js', 'core.js', 'b2b-ordering.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/' + file), 'utf8'), context);
}
const app = window.App;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = [], renders = [], navigations = [];
window.Core.fetch = url => new Promise(resolve => pending.push({url, resolve}));
window.B2BOrdering.renderSuggestions = (_, query) => renders.push(query);
window.Router.navigate = url => navigations.push(url);

(async () => {
    app.handleSearchInput('iphone');
    await sleep(210);
    assert.equal(pending.length, 1);
    app.handleSearchInput('');
    pending[0].resolve({});
    await sleep(0);
    assert.equal(renders.length, 0, 'clearing input prevents an in-flight response reopening suggestions');

    app.handleSearchInput('iphone13');
    await sleep(210);
    app.handleSearchInput('samsung');
    await sleep(210);
    pending[2].resolve({});
    await sleep(0);
    pending[1].resolve({});
    await sleep(0);
    assert.deepEqual(renders, ['samsung'], 'late old responses cannot replace newer results');

    app.handleSearchInput('battery');
    await sleep(210);
    window.UI.closeSuggestions();
    pending[3].resolve({});
    await sleep(0);
    assert.deepEqual(renders, ['samsung'], 'closing suggestions invalidates pending requests');
    app.handleSearchInput('a');
    await sleep(210);
    assert.equal(pending.length, 5, 'a single character already asks for suggestions');
    app.handleSearchInput('ip');
    app.handleSearchInput('iph');
    app.handleSearchInput('iphone');
    await sleep(210);
    assert.equal(pending.length, 6, 'rapid input is debounced to one request');
    window.UI.closeSuggestions();
    pending[4].resolve({});
    pending[5].resolve({});
    await sleep(0);

    const focused = [];
    options = [0, 1, 2].map(i => ({
        id: 'search-option-' + i,
        href: '/test-shop/products/' + (i + 1),
        classList: {toggle() {}}, setAttribute() {}, scrollIntoView() {},
        focus() { focused.push(this.id); }
    }));
    results.style.display = 'block';
    const key = name => app.handleSearchKeydown({key: name, preventDefault() {}, stopPropagation() {}, currentTarget: input});
    key('ArrowUp');
    assert.equal(app.searchIndex, 2, 'first up arrow selects last option');
    key('ArrowDown');
    assert.equal(app.searchIndex, 0, 'down arrow wraps');
    key('ArrowDown');
    assert.deepEqual(focused, ['search-option-2', 'search-option-0', 'search-option-1'],
        'the arrow keys move real focus into the results, they do not only point at it');
    key('Enter');
    assert.deepEqual(navigations, ['/test-shop/products/2']);
    assert.equal(attrs['aria-expanded'], 'false');
    results.style.display = 'block';
    let escapePrevented = false;
    input.value = 'iphone13';
    app.handleSearchKeydown({key: 'Escape', preventDefault() { escapePrevented = true; }, currentTarget: input});
    assert.equal(escapePrevented, true, 'Escape prevents the native search-input clear action');
    assert.equal(input.value, 'iphone13');
    assert.equal(results.style.display, 'none');
    console.log('PASS: search debounce, stale-response protection, dismissal, single-character queries, keyboard selection and ARIA state.');
})().catch(error => { console.error(error); process.exitCode = 1; });