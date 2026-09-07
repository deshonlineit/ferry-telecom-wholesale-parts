const assert = require('node:assert/strict');
const app = require('./qa-scripts.cjs');
const {Core, App, B2BOrdering: ordering} = app.window;
app.setTimeout = setTimeout;
app.clearTimeout = clearTimeout;
app.AbortController = AbortController;
app.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
app.location = {pathname: '/test-shop/'};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const nodes = new Map();
const input = {
    isConnected: true, value: '', attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    focus() { app.document.activeElement = input; App.handleSearchFocus(); }
};
const popup = {
    style: {display: 'none'}, innerHTML: '', classList: {add() {}},
    setAttribute() {}, querySelectorAll() { return []; }
};
nodes.set('search-input', input);
nodes.set('search-suggestions', popup);
app.document.getElementById = id => nodes.get(id);
app.document.querySelectorAll = () => [];
app.document.dispatchEvent = () => {};
const button = () => {
    const feedback = {textContent: '', classList: {toggle() {}}};
    return {
        dataset: {}, disabled: false, feedback,
        setAttribute() {}, removeAttribute() {},
        closest() { return {querySelector() { return feedback; }}; }
    };
};

(async () => {
    let calls = [];
    let resolveSearch;
    Core.fetch = (url, options) => {
        calls.push({url, options});
        return new Promise(resolve => { resolveSearch = resolve; });
    };
    App.handleSearchInput('   ');
    await pause(180);
    assert.equal(calls.length, 0, 'An empty box has nothing to look for');
    App.handleSearchInput('ab');
    await pause(180);
    assert.equal(calls.length, 1, 'A short fragment is a real search, there is no character minimum');
    assert.equal(calls[0].url, '/search/products?q=ab&limit=8');
    App.handleSearchInput('  abc  ');
    await pause(180);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].url, '/search/products?q=abc&limit=8');
    App.handleSearchInput('');
    const unchanged = popup.innerHTML;
    resolveSearch({products: [], has_more: false});
    await pause(0);
    assert.equal(popup.style.display, 'none');
    assert.equal(popup.innerHTML, unchanged, 'Late results do not reopen or overwrite a cleared search box');

    Core.user = {id: 1, role: 'customer', status: 'active'};
    ordering.renderSuggestions({products: [{
        id: 7, sku: 'ROW-7', name: '<unsafe>', stock: 15, minimum_quantity: 2,
        quality: 'OEM', price_cents: 1250, currency: 'EUR'
    }]}, 'row');
    assert.match(popup.innerHTML, /&lt;unsafe>/);
    assert.match(popup.innerHTML, /12\.50 EUR/);
    assert.match(popup.innerHTML, /min="2" max="15"/);
    assert.match(popup.innerHTML, /data-quick-add="7"/);
    const focusedLink = {classList: {toggle() {}}, focus() { app.document.activeElement = this; }, scrollIntoView() {}};
    popup.querySelectorAll = selector => selector === '[data-search-option]' ? [focusedLink] : [];
    App.handleSearchKeydown({key: 'ArrowDown', preventDefault() {}});
    assert.equal(app.document.activeElement, focusedLink, 'ArrowDown moves real focus into the results dialog');
    popup.onkeydown({key: 'Escape', preventDefault() {}, stopPropagation() {}});
    assert.equal(app.document.activeElement, input);
    assert.equal(popup.style.display, 'none', 'Escape restores focus without reopening suggestions');
    Core.user = {role: 'customer', status: 'pending'};
    assert.equal(App.canOrderProduct({stock: 10, minimum_quantity: 1, price_cents: 100}), false);
    assert.doesNotMatch(App.renderProductTable([{id: 7, name: 'Pending', sku: 'ROW-7', models: [], stock: 10, minimum_quantity: 1, price_cents: 100, currency: 'EUR'}]), /class="b2b-add-btn"/);
    Core.user = null;
    ordering.renderSuggestions({products: [{
        id: 7, sku: 'ROW-7', name: 'Row', stock: 15, minimum_quantity: 2,
        price_cents: null, currency: 'EUR'
    }]}, 'row');
    assert.doesNotMatch(popup.innerHTML, /data-quick-add=/);
    assert.match(popup.innerHTML, /Sign in for prices/);

    Core.user = {id: 1, role: 'customer', status: 'active'};
    calls = [];
    const pending = [];
    Core.fetch = (url, options) => {
        calls.push({url, options});
        return new Promise((resolve, reject) => pending.push({resolve, reject}));
    };
    const first = button(), second = button();
    const add1 = App.addToCartWithQty(7, 2, first);
    const duplicate = App.addToCartWithQty(7, 2, first);
    const add2 = App.addToCartWithQty(7, 3, second);
    assert.equal(first.disabled, true);
    assert.equal(await duplicate, null);
    await pause(0);
    assert.equal(calls.length, 1, 'Cart requests serialize, duplicate pending click suppressed');
    assert.equal(calls[0].url, '/cart/quick-add');
    assert.equal(calls[0].options.body.quantity, 2);
    pending[0].resolve({items: [{product_id: 7, quantity: 2}], currency: 'EUR', country: 'NL'});
    await add1;
    await pause(0);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.body.quantity, 3, 'Second add is a delta, not a stale absolute total');
    pending[1].resolve({items: [{product_id: 7, quantity: 5}], currency: 'EUR', country: 'NL'});
    await add2;
    assert.equal(Core.cart.items[0].quantity, 5);
    assert.match(second.feedback.textContent, /5 in your cart/);
    assert.equal(second.disabled, false);
    const invalid = await App.addToCartWithQty(7, 1.5, second);
    assert.equal(invalid, null);
    assert.equal(calls.length, 2);
    const failing = App.addToCartWithQty(7, 100, second);
    await pause(0);
    pending[2].reject(new Error('Insufficient stock'));
    assert.equal(await failing, null);
    assert.equal(Core.cart.items[0].quantity, 5, 'Failed add preserves last confirmed cart');
    assert.match(second.feedback.textContent, /Insufficient stock/);
    assert.equal(second.disabled, false);
    console.log('PASS: actual B2B scripts — threshold, stale search, privacy, decimals, serialized additive cart and inline failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });