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
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/core.js'), 'utf8'), context);
const app = window.App;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = [], renders = [], navigations = [];
window.Core.fetch = url => new Promise(resolve => pending.push({url, resolve}));
app.renderSuggestions = (_, query) => renders.push(query);
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
    assert.equal(pending.length, 4, 'one-character queries do not request suggestions');
    app.handleSearchInput('ip');
    app.handleSearchInput('iph');
    app.handleSearchInput('iphone');
    await sleep(210);
    assert.equal(pending.length, 5, 'rapid input is debounced to one request');
    window.UI.closeSuggestions();
    pending[4].resolve({});
    await sleep(0);

    options = [0, 1, 2].map(i => ({
        id: 'search-option-' + i,
        href: '/test-shop/products/' + (i + 1),
        classList: {toggle() {}}, setAttribute() {}, scrollIntoView() {}
    }));
    results.style.display = 'block';
    const key = name => app.handleSearchKeydown({key: name, preventDefault() {}, currentTarget: input});
    key('ArrowUp');
    assert.equal(app.searchIndex, 2, 'first up arrow selects last option');
    key('ArrowDown');
    assert.equal(app.searchIndex, 0, 'down arrow wraps');
    key('ArrowDown');
    assert.equal(attrs['aria-activedescendant'], 'search-option-1');
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
    console.log('PASS: search debounce, stale-response protection, dismissal, short queries, keyboard selection and ARIA state.');
})().catch(error => { console.error(error); process.exitCode = 1; });