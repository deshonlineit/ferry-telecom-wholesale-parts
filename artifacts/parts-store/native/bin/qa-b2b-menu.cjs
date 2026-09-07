const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = require('./qa-scripts.cjs');
const menuSource = fs.readFileSync(new URL('../public/assets/b2b-menu.js', `file://${__filename}`), 'utf8');

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
app.window.location = {href: 'https://shop.example.test/test-shop/catalog', search: '?category=screens&part=oled&brand=99&q=iphone&page=4&quality=OEM&featured=1&limit=48&sort=name'};

const catalog = {
    categories: [],
    brands: [
        {id: 1, name: 'Apple', count: 9999},
        {id: 2, name: 'Samsung', count: 1},
        {id: 3, name: 'Google', count: 5000}
    ],
    device_families: [
        {id: 'iphone', label: 'iPhone', count: 2},
        {id: 'galaxy', label: 'Galaxy', count: 1},
        {id: 'pixel', label: 'Google Pixel', count: 5000}
    ],
    models: [
        {id: 10, name: 'iPhone oud', brand_id: 1, family: 'iphone', sort_order: 1, order_known: true},
        {id: 11, name: 'iPhone nieuw', brand_id: 1, family: 'iphone', sort_order: 9, order_known: true},
        {id: 12, name: 'Onbekende chronologie', brand_id: 1, family: 'iphone', sort_order: 100, order_known: false},
        {id: 20, name: 'Galaxy S', brand_id: 2, family: 'galaxy', sort_order: 2, order_known: true},
        {id: 30, name: 'Google Pixel 10', brand_id: 3, family: 'pixel', sort_order: 10, order_known: true}
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
    const immediateList = created.find(node => node.className.includes('b2b-top-nav-immediate'));
    assert.ok(immediateList, 'A usable navigation is rendered before the catalogue request settles');
    assert.equal(immediateList.children.length, 6, 'The immediate navigation exposes all primary destinations without skeleton placeholders');
    await new Promise(resolve => setImmediate(resolve));
    const error = created.find(node => node.className.includes('b2b-menu-error'));
    const retry = created.find(node => node.className === 'b2b-menu-retry');
    assert.ok(error && retry, 'A failed catalog request renders an explicit retry');
    fire(retry, 'click');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requests, 2, 'Retry performs a fresh request');

    const mobile = created.filter(node => node.className === 'b2b-mobile-toggle').at(-1);
    const list = created.find(node => node.className === 'b2b-top-nav');
    const deviceItem = created.find(node => node.className.includes('has-dropdown'));
    const brandLink = deviceItem.children[0];
    const trigger = deviceItem.children[1];
    const overlay = deviceItem.children[2];
    assert.equal(brandLink.tag, 'a', 'The brand label is a destination, not only a panel toggle');
    assert.match(brandLink.href, /device_brand=1/, 'Apple opens every part that fits an Apple device');
    assert.doesNotMatch(brandLink.href, /[?&]brand=/, 'Device browsing never applies a product manufacturer filter');
    assert.doesNotMatch(brandLink.href, /family=|model=/, 'A brand releases a narrower device scope');
    assert.equal(overlay.hidden, true);
    assert.equal(overlay.attributes.inert, '');
    assert.equal(trigger.tag, 'button');
    assert.equal(trigger.className, 'b2b-nav-caret');
    assert.ok(trigger.attributes['aria-label'], 'The panel control is labelled for screen readers');
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
    assert.doesNotMatch(url, /category=|part=|quality=|stock=|featured=/, 'A menu pick starts a fresh scope instead of carrying the previous part filter');
    assert.match(url, /family=iphone/);
    assert.match(url, /model=11/);
    assert.match(url, /sort=name/, 'How results are presented survives a menu pick');
    assert.match(url, /limit=48/, 'Page size is presentation too and survives a menu pick');
    assert.doesNotMatch(url, /brand=|q=|page=/, 'Device navigation never applies a product manufacturer filter');
    const modelLink = element('a');
    modelLink.className = 'b2b-model-link';
    modelLink.href = 'https://shop.example.test/test-shop/catalog?family=iphone&model=11&category=old';
    const categoryLink = element('a');
    categoryLink.className = 'b2b-acc-link';
    categoryLink.href = 'https://shop.example.test/test-shop/catalog?category=housing';
    app.window.location.search = '?category=batteries&stock=in_stock&brand=99&page=4&model=11';
    app.window.StoreMenu.refreshLinks({querySelectorAll: () => [modelLink, categoryLink]});
    assert.doesNotMatch(modelLink.href, /category=|stock=/, 'Choosing a model from the menu drops the part filter of the page you came from');
    assert.doesNotMatch(modelLink.href, /category=old|brand=|page=/);
    assert.equal(modelLink.attributes['aria-current'], 'page');
    assert.match(categoryLink.href, /category=housing/);
    assert.doesNotMatch(categoryLink.href, /model=|family=/, 'Part department links clear device restrictions');
    const familyLink = element('a');
    familyLink.className = 'b2b-family-link';
    familyLink.dataset.familyId = 'iphone';
    familyLink.href = 'https://shop.example.test/test-shop/catalog?family=iphone&category=old';
    app.window.StoreMenu.refreshLinks({querySelectorAll: () => [familyLink]});
    assert.match(familyLink.href, /family=iphone/);
    assert.doesNotMatch(familyLink.href, /category=/, 'A family row opens the whole family, not the part filter of the previous page');
    assert.doesNotMatch(familyLink.href, /model=11/, 'Choosing a family releases the previously chosen model');
    app.window.StoreMenu.refreshDestination(brandLink);
    assert.match(brandLink.href, /device_brand=1/);
    assert.doesNotMatch(brandLink.href, /category=/, 'A brand opens every part for that brand after client-side navigation');
    assert.doesNotMatch(brandLink.href, /model=11|[?&]brand=99/);

    app.window.innerWidth = 320;
    fire(mobile, 'click');
    fire(trigger, 'click');
    documentHandlers.keydown({key: 'Escape', preventDefault() {}});
    assert.equal(list.classList.contains('mobile-open'), false);
    assert.equal(focused, mobile, 'Mobile Escape restores the visible top-level toggle, not a hidden brand button');

    const groups = app.window.StoreMenu.deviceData(catalog);
    assert.deepEqual(Array.from(groups[0].families[0].models, model => model.id), [11, 10, 12], 'Every model is retained newest-to-oldest, with unknown chronology last');
    assert.equal(groups[0].brand.name, 'Apple');
    assert.equal(groups[1].brand.name, 'Samsung', 'Samsung is the second primary brand even when another brand has more models');
    assert.equal(groups[2].brand.name, 'Google');
    assert.equal(groups[0].modelCount, 3, 'Device brand ranking derives from real model memberships, not product-brand counts');
    const bigCatalog = {...catalog, models: Array.from({length: 20}, (_, index) => ({
        id: 100 + index, name: `iPhone ${index}`, brand_id: 1, family: 'iphone', sort_order: index, order_known: true
    }))};
    const bigEntry = app.window.StoreMenu.deviceData(bigCatalog)[0].families[0];
    const panel = app.window.StoreMenu.modelsMarkup(bigEntry);
    assert.equal((panel.match(/class="b2b-model-link"/g) || []).length, 12, 'The panel offers a workable shortlist instead of a scroll hunt');
    assert.match(panel, /12 newest of 20 models/, 'The visitor is told what is shown and how to reach the rest');
    assert.match(panel, /Show all 20 models/, 'A clear control expands the complete model overview');
    assert.match(panel, /aria-expanded="false"/);
    assert.match(panel, /data-model-id="119"/, 'The newest model leads the shortlist');
    assert.doesNotMatch(panel, /data-model-id="105"/, 'An older model waits behind the search');
    const expanded = app.window.StoreMenu.modelsMarkup(bigEntry, '', true);
    assert.equal((expanded.match(/class="b2b-model-link"/g) || []).length, 20, 'Expanding shows every real model in the family');
    assert.match(expanded, /All 20 models · newest to oldest/);
    assert.match(expanded, /Show newest 12/);
    assert.match(expanded, /data-model-id="105"/, 'Older models join the same at-a-glance panel after expansion');
    assert.match(
        menuSource,
        /addEventListener\('scroll'[\s\S]*b2b-mega-models[\s\S]*expandActiveModels\(false\)/,
        'Scrolling the open model browser automatically reveals the complete family'
    );
    assert.match(
        menuSource,
        /addEventListener\('wheel', revealOnMobileBrowse[\s\S]*addEventListener\('touchmove', revealOnMobileBrowse/,
        'Mobile wheel and touch browsing reveal all models even when the outer menu is already at its scroll limit'
    );
    const ipadEntry = {
        family: {id: 'ipad', label: 'iPad', count: 455},
        models: app.window.StoreMenu.orderedModels([
            {id: 31, name: 'iPad 10 (2022)', family: 'ipad', sort_order: 2022, order_known: true},
            {id: 32, name: 'iPad Air 13″ (6th Gen)', family: 'ipad', sort_order: 2024, order_known: true},
            {id: 33, name: 'iPad Pro 13″ (7th Gen)', family: 'ipad', sort_order: 2024, order_known: true},
            {id: 34, name: 'iPad mini 7', family: 'ipad', sort_order: 2024, order_known: true},
            {id: 35, name: 'iPad Pro 12.9 (6th Gen)', family: 'ipad', sort_order: 2022, order_known: true}
        ])
    };
    const groupedIpad = app.window.StoreMenu.modelsMarkup(ipadEntry, '', true);
    assert.match(groupedIpad, /b2b-model-series/, 'Expanded iPad models use scan-friendly product-line groups');
    assert(groupedIpad.indexOf('>iPad Pro<') < groupedIpad.indexOf('>iPad Air<'));
    assert(groupedIpad.indexOf('>iPad Air<') < groupedIpad.indexOf('>iPad mini<'));
    assert(groupedIpad.indexOf('>iPad mini<') < groupedIpad.indexOf('>iPad<'));
    assert.equal((groupedIpad.match(/class="b2b-model-link"/g) || []).length, 5, 'Grouping retains every iPad model');
    const searchedIpad = app.window.StoreMenu.modelsMarkup(ipadEntry, 'pro');
    assert.doesNotMatch(searchedIpad, /b2b-model-series/, 'Search remains one relevance-ranked result list');
    assert.equal((searchedIpad.match(/class="b2b-model-link"/g) || []).length, 2, 'Search still finds models across product-line groups');
    const samsungEntry = {
        family: {id: 'samsung', label: 'Samsung Galaxy', count: 1561},
        models: app.window.StoreMenu.orderedModels([
            {id: 41, name: 'Samsung Galaxy S25 Ultra', family: 'samsung', sort_order: 2025, order_known: true},
            {id: 42, name: 'Samsung Galaxy A56 5G', family: 'samsung', sort_order: 2025, order_known: true},
            {id: 43, name: 'Samsung Galaxy Z Fold 7 5G', family: 'samsung', sort_order: 2025, order_known: true},
            {id: 44, name: 'Samsung Galaxy Note 20 Ultra', family: 'samsung', sort_order: 2020, order_known: true}
        ])
    };
    const groupedSamsung = app.window.StoreMenu.modelsMarkup(samsungEntry);
    assert.match(groupedSamsung, /b2b-model-series/, 'Samsung is grouped immediately, not only after expanding');
    assert(groupedSamsung.indexOf('>Galaxy S<') < groupedSamsung.indexOf('>Galaxy A<'));
    assert(groupedSamsung.indexOf('>Galaxy A<') < groupedSamsung.indexOf('>Galaxy Z · Fold &amp; Flip<'));
    assert(groupedSamsung.indexOf('>Galaxy Z · Fold &amp; Flip<') < groupedSamsung.indexOf('>Galaxy Note<'));
    const iphoneEntry = {
        family: {id: 'iphone', label: 'iPhone', count: 1736},
        models: app.window.StoreMenu.orderedModels([
            {id: 51, name: 'iPhone 16 Pro Max', family: 'iphone', sort_order: 2024, order_known: true},
            {id: 52, name: 'iPhone 16', family: 'iphone', sort_order: 2024, order_known: true},
            {id: 53, name: 'iPhone 15 Pro', family: 'iphone', sort_order: 2023, order_known: true},
            {id: 54, name: 'iPhone SE 2022', family: 'iphone', sort_order: 2022, order_known: true},
            {id: 55, name: 'iPhone XS Max', family: 'iphone', sort_order: 2018, order_known: true}
        ])
    };
    const groupedIphone = app.window.StoreMenu.modelsMarkup(iphoneEntry);
    assert.match(groupedIphone, /b2b-model-series/);
    assert(groupedIphone.indexOf('>iPhone 16 Series<') < groupedIphone.indexOf('>iPhone 15 Series<'));
    assert.match(groupedIphone, />iPhone X · XR · XS Series</);
    assert.match(groupedIphone, />iPhone SE Series</);
    assert.doesNotMatch(groupedIphone, /<h4[^>]*>[^<]*<small>/, 'Series headings never expose group counts');
    const searched = app.window.StoreMenu.modelsMarkup(bigEntry, 'iphone 5');
    assert.match(searched, /1 of 20 models|2 of 20 models/);
    assert(searched.indexOf('data-model-id="105"') >= 0, 'A typed model surfaces however old it is');
    assert(searched.indexOf('data-model-id="105"') < searched.indexOf('data-model-id="115"'), 'The exact model outranks a partial name');
    assert.match(app.window.StoreMenu.modelsMarkup(bigEntry, 'zzz'), /No model with this name in iPhone/);
    const allMarkup = created.map(node => node.innerHTML).join('');
    assert.doesNotMatch(allMarkup, /[?&]brand=/, 'Rendered Apple and other device links contain no manufacturer fallback');
    assert.match(allMarkup, /All parts for iPhone/);
    assert.match(allMarkup, /b2b-model-search/);
    const topLabels = list.children.map(item => item.children[0]?.textContent || '').filter(Boolean);
    assert.deepEqual(topLabels.slice(0, 2), ['Apple', 'Samsung'], 'The top menu starts with Apple and then Samsung');
    assert.equal(topLabels.includes('Google'), false, 'Google is not a standalone primary-navigation item');
    assert.equal(list.children.at(-1).className.includes('has-dropdown'), true, 'Other brands is placed after the department menus');

    const count = created.length;
    app.window.StoreMenu.init();
    assert.equal(created.length, count, 'Repeated initialization preserves the mounted navigation');
    console.log('PASS: native mega-menu controller, retry, state, compatibility URLs and complete chronology.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});