const assert = require('node:assert/strict');
const app = require('./qa-scripts.cjs');

class ClassList {
    constructor(node) { this.node = node; }
    values() { return new Set(String(this.node.className || '').split(/\s+/).filter(Boolean)); }
    add(...names) { const set = this.values(); names.forEach(name => set.add(name)); this.node.className = [...set].join(' '); }
    remove(...names) { const set = this.values(); names.forEach(name => set.delete(name)); this.node.className = [...set].join(' '); }
    contains(name) { return this.values().has(name); }
    toggle(name, force) {
        const enabled = force === undefined ? !this.contains(name) : force;
        if (enabled) this.add(name); else this.remove(name);
        return enabled;
    }
}

const created = [];
const documentHandlers = {};
const windowHandlers = {};
let focused;
function element(tag) {
    const node = {
        tag, children: [], dataset: {}, attributes: {}, events: {}, className: '', innerHTML: '', hidden: false,
        style: {}, parentElement: null, textContent: '',
        appendChild(child) { child.parentElement = this; this.children.push(child); },
        replaceChildren(...children) { this.children = []; children.forEach(child => this.appendChild(child)); this.innerHTML = ''; },
        setAttribute(key, value) { this.attributes[key] = String(value); },
        removeAttribute(key) { delete this.attributes[key]; },
        addEventListener(key, fn) { (this.events[key] ||= []).push(fn); },
        querySelectorAll() { return []; },
        querySelector() { return null; },
        focus() { focused = this; },
        contains(target) {
            while (target) {
                if (target === this) return true;
                target = target.parentElement;
            }
            return false;
        }
    };
    Object.defineProperty(node, 'classList', {value: new ClassList(node)});
    created.push(node);
    return node;
}
const fire = (node, type, event = {}) => node.events[type].forEach(handler => handler({
    stopPropagation() {},
    preventDefault() {},
    target: node,
    ...event
}));

const nav = element('nav');
const header = {parentNode: {insertBefore() {}}};
app.document.querySelector = () => header;
app.document.getElementById = id => id === 'store-menu' ? nav : null;
app.document.createElement = element;
app.document.addEventListener = (key, fn) => { documentHandlers[key] = fn; };
app.document.activeElement = null;
app.window.addEventListener = (key, fn) => { windowHandlers[key] = fn; };
app.window.innerWidth = 1200;
app.window.APP_BASE = '/test-shop/';
app.window.location = {href: 'https://shop.example.test/test-shop/catalog', search: '?category=screens&part=oled&brand=99&q=iphone&page=4&quality=OEM'};

const catalog = {
    categories: [],
    brands: [
        {id: 1, name: 'Apple', count: 9999},
        {id: 2, name: 'Samsung', count: 1}
    ],
    device_families: [
        {id: 'iphone', label: 'iPhone', count: 2},
        {id: 'galaxy', label: 'Galaxy', count: 1}
    ],
    models: [
        {id: 10, name: 'iPhone oud', brand_id: 1, family: 'iphone', sort_order: 1, order_known: true},
        {id: 11, name: 'iPhone nieuw', brand_id: 1, family: 'iphone', sort_order: 9, order_known: true},
        {id: 12, name: 'Onbekende chronologie', brand_id: 1, family: 'iphone', sort_order: 100, order_known: false},
        {id: 20, name: 'Galaxy S', brand_id: 2, family: 'galaxy', sort_order: 2, order_known: true}
    ]
};

let requests = 0;
let rejectFirst = true;
app.window.Core.fetch = async url => {
    assert.equal(url, '/catalog');
    requests++;
    if (rejectFirst) {
        rejectFirst = false;
        throw new Error('temporary');
    }
    return catalog;
};

(async () => {
    app.window.StoreMenu.init();
    await new Promise(resolve => setImmediate(resolve));
    const error = created.find(node => node.className.includes('b2b-menu-error'));
    const retry = created.find(node => node.className === 'b2b-menu-retry');
    assert.ok(error && retry, 'A failed catalog request renders an explicit retry');
    fire(retry, 'click');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 2, 'Retry performs a fresh request');

    const mobile = created.find(node => node.className === 'b2b-mobile-toggle');
    const list = created.find(node => node.className === 'b2b-top-nav');
    const deviceItem = created.find(node => node.className.includes('has-dropdown'));
    const trigger = deviceItem.children[0];
    const overlay = deviceItem.children[1];
    assert.equal(overlay.hidden, true);
    assert.equal(overlay.attributes.inert, '');
    assert.equal(trigger.tag, 'button');
    assert.ok(trigger.attributes['aria-controls']);

    fire(trigger, 'click');
    assert.equal(deviceItem.classList.contains('is-open'), true);
    assert.equal(overlay.hidden, false);
    assert.equal(trigger.attributes['aria-expanded'], 'true');
    documentHandlers.keydown({key: 'Escape', preventDefault() {}});
    assert.equal(overlay.hidden, true);
    assert.equal(focused, trigger, 'Escape restores the dropdown trigger without blurring unrelated controls');

    fire(trigger, 'click');
    documentHandlers.click({target: {}});
    assert.equal(overlay.hidden, true, 'Outside click closes the open dropdown');
    const item = trigger.parentElement;
    fire(item, 'mouseenter');
    assert.equal(overlay.hidden, false, 'Pointer entry previews the menu');
    fire(trigger, 'click');
    assert.equal(overlay.hidden, false, 'A real pointer-entry then click must not immediately reclose the menu');
    fire(trigger, 'click');
    assert.equal(overlay.hidden, true, 'Second deliberate click closes the pinned menu');
    fire(mobile, 'click');
    assert.equal(list.classList.contains('mobile-open'), true);
    fire(mobile, 'click');
    assert.equal(list.classList.contains('mobile-open'), false, 'Mobile toggle truly closes its list');

    const url = app.window.StoreMenu.compatibilityUrl({family: 'iphone', model: 11});
    assert.match(url, /category=screens/);
    assert.match(url, /part=oled/);
    assert.match(url, /quality=OEM/);
    assert.match(url, /family=iphone/);
    assert.match(url, /model=11/);
    assert.doesNotMatch(url, /brand=|q=|page=/, 'Device navigation never applies a product manufacturer filter');
    const modelLink = element('a');
    modelLink.className = 'b2b-model-link';
    modelLink.href = 'https://shop.example.test/test-shop/catalog?family=iphone&model=11&category=old';
    const categoryLink = element('a');
    categoryLink.className = 'b2b-acc-link';
    categoryLink.href = 'https://shop.example.test/test-shop/catalog?category=housing';
    app.window.location.search = '?category=batteries&brand=99&page=4&model=11';
    app.window.StoreMenu.refreshLinks({querySelectorAll: () => [modelLink, categoryLink]});
    assert.match(modelLink.href, /category=batteries/, 'Mounted menu links use current category after client-side navigation');
    assert.doesNotMatch(modelLink.href, /category=old|brand=|page=/);
    assert.equal(modelLink.attributes['aria-current'], 'page');
    assert.match(categoryLink.href, /category=housing/);
    assert.doesNotMatch(categoryLink.href, /model=|family=/, 'Part department links clear device restrictions');

    app.window.innerWidth = 320;
    fire(mobile, 'click');
    fire(trigger, 'click');
    documentHandlers.keydown({key: 'Escape', preventDefault() {}});
    assert.equal(list.classList.contains('mobile-open'), false);
    assert.equal(focused, mobile, 'Mobile Escape restores the visible top-level toggle, not a hidden brand button');

    const groups = app.window.StoreMenu.deviceData(catalog);
    assert.deepEqual(Array.from(groups[0].families[0].models, model => model.id), [11, 10, 12], 'Every model is retained newest-to-oldest, with unknown chronology last');
    assert.equal(groups[0].brand.name, 'Apple');
    assert.equal(groups[0].modelCount, 3, 'Device brand ranking derives from real model memberships, not product-brand counts');
    const allMarkup = created.map(node => node.innerHTML).join('');
    assert.doesNotMatch(allMarkup, /[?&]brand=/, 'Rendered Apple and other device links contain no manufacturer fallback');
    assert.match(allMarkup, /Alle onderdelen voor iPhone/);
    assert.match(allMarkup, /b2b-model-search/);

    const count = created.length;
    app.window.StoreMenu.init();
    assert.equal(created.length, count, 'Repeated initialization preserves the mounted navigation');
    console.log('PASS: native mega-menu controller, retry, state, compatibility URLs and complete chronology.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});