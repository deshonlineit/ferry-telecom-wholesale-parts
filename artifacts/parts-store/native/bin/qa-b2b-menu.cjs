const assert = require('node:assert/strict');
const app = require('./qa-scripts.cjs');
const created = [];
const handlers = {};
let focused;
function element(tag) {
    const node = {
        tag, children: [], dataset: {}, attributes: {}, events: {}, innerHTML: '',
        classList: {toggle() {}, add() {}, remove() {}},
        appendChild(child) { child.parentElement = this; this.children.push(child); },
        setAttribute(key, value) { this.attributes[key] = String(value); },
        addEventListener(key, fn) { this.events[key] = fn; },
        querySelectorAll() { return []; }, querySelector() { return null; },
        focus() { focused = this; },
        contains(target) { while (target) { if (target === this) return true; target = target.parentElement; } return false; }
    };
    created.push(node);
    return node;
}
const nav = element('nav');
const header = {parentNode: {insertBefore() {}}};
app.document.querySelector = () => header;
app.document.getElementById = id => id === 'store-menu' ? nav : null;
app.document.createElement = element;
app.document.addEventListener = (key, fn) => { handlers[key] = fn; };
let requests = 0;
app.window.Core.fetch = async url => {
    assert.equal(url, '/catalog');
    requests++;
    return {categories: [], brands: [], models: [], device_families: []};
};
(async () => {
    app.window.StoreMenu.init();
    const button = created.find(node => node.className === 'b2b-menu-btn');
    const dropdown = created.find(node => node.id === 'b2b-menu-dropdown');
    assert.equal(dropdown.hidden, true);
    const click = () => button.events.click({stopPropagation() {}});
    click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dropdown.hidden, false, 'First click opens the menu');
    assert.equal(button.attributes['aria-expanded'], 'true');
    assert.equal(requests, 1, 'First opening fetches actual catalog metadata');
    assert.match(dropdown.innerHTML, /b2b-menu-slider/);
    click();
    assert.equal(dropdown.hidden, true, 'Second click closes the menu');
    click();
    handlers.keydown({key: 'Escape'});
    assert.equal(dropdown.hidden, true);
    assert.equal(focused, button, 'Escape restores trigger focus');
    click();
    handlers.click({target: {}});
    assert.equal(dropdown.hidden, true, 'Outside click closes menu');
    assert.equal(requests, 1, 'Reopening does not refetch cached metadata');
    const count = created.length;
    app.window.StoreMenu.init();
    assert.equal(created.length, count, 'Repeated initialization preserves current navigation');
    console.log('PASS: actual MENU initialization, first-open fetch, toggle, Escape, outside close and reuse.');
})().catch(error => { console.error(error); process.exitCode = 1; });