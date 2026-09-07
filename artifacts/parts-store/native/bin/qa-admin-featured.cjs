const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const routes = [];
let filterForm = {};
let quickForm = {};
let quickButton = null;
let requests = [];
let routeCalls = 0;

const inertControl = { addEventListener() {}, appendChild() {} };
const context = vm.createContext({
    window: {
        APP_BASE: '/test-shop/',
        Admin: { layout: html => html },
        Core: {
            user: { role: 'staff' },
            escapeHtml: String,
            formatMoney: String,
            renderPagination: () => '',
            fetch: async url => {
                requests.push(url);
                if (url === '/catalog') return { categories: [], brands: [], qualities: [] };
                throw new Error(`Unexpected request: ${url}`);
            },
        },
        Router: {
            add(pattern, handler) { routes.push({ pattern, handler }); },
            navigate() {},
            route() { routeCalls += 1; },
        },
        UI: {
            showModal() { return {}; },
            closeModal() {},
        },
    },
    document: {
        addEventListener() {},
        getElementById(id) {
            if (id === 'admin-filter-form') return filterForm;
            if (id === 'quick-edit-form') return quickForm;
            return inertControl;
        },
        createElement() { return { appendChild() {}, remove() {}, style: {} }; },
        body: { appendChild() {} },
    },
    FormData: class {
        constructor(target) { this.values = target.values || {}; }
        get(name) { return this.values[name] ?? null; }
        *entries() { yield* Object.entries(this.values); }
    },
    URLSearchParams,
    setTimeout,
    confirm: () => true,
    console,
});

vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/admin.js'), 'utf8'), context);
const handler = routes.find(route => route.pattern.test('admin/products')).handler;

function rootWithQuickButton(button = null) {
    quickButton = button;
    return {
        innerHTML: '',
        querySelector() { return inertControl; },
        querySelectorAll(selector) {
            return selector === '.action-quick-edit' && quickButton ? [quickButton] : [];
        },
    };
}

function listing(featuredTotal, products = []) {
    return {
        products,
        total: products.length,
        page: 1,
        pages: 1,
        status: 'all',
        counts: { all: products.length, active: products.length, archived: 0 },
        featured_total: featuredTotal,
        stock_threshold: 5,
    };
}

(async () => {
    let response = listing(7);
    context.window.Core.fetch = async url => {
        requests.push(url);
        return url === '/catalog' ? { categories: [], brands: [], qualities: [] } : response;
    };
    const filteredRoot = rootWithQuickButton();
    await handler([], filteredRoot, 'q=no-match&category=4&status=archived&page=9&limit=1');
    assert(requests.some(url => url.includes('q=no-match') && url.includes('category=4') && url.includes('status=archived') && url.includes('page=9')));
    assert(filteredRoot.innerHTML.includes('data-testid="admin-featured-total"'));
    assert(filteredRoot.innerHTML.includes('aria-live="polite"'));
    assert(filteredRoot.innerHTML.includes('Total featured: 7'));

    response = listing(0);
    const zeroRoot = rootWithQuickButton();
    await handler([], zeroRoot, '');
    assert(zeroRoot.innerHTML.includes('Total featured: 0'));

    response = listing(1, [{
        id: 91, sku: 'QA-FEATURED', name: 'QA fixture', list_price_cents: 100,
        stock: 2, active: true, featured: true,
    }]);
    const listeners = {};
    const button = {
        dataset: { id: '91', stock: '2', priceEur: '100', version: '0', featured: '1' },
        addEventListener(type, listener) { listeners[type] = listener; },
    };
    quickForm = {};
    await handler([], rootWithQuickButton(button), '');
    listeners.click({ currentTarget: button });
    const submitButton = { disabled: false, textContent: '' };
    quickForm.values = { stock: '2', list_price_eur: '1.00', pricing_version: '0' };
    quickForm.querySelector = () => submitButton;
    context.window.Core.fetch = async (url, options) => {
        assert.equal(url, '/admin/products/91');
        assert.equal(options.method, 'PATCH');
        assert.equal(options.body.featured, 0);
        return { product: {} };
    };
    await quickForm.onsubmit({ preventDefault() {}, target: quickForm });
    assert.equal(routeCalls, 1);

    response = listing(0);
    context.window.Core.fetch = async url => url === '/catalog'
        ? { categories: [], brands: [], qualities: [] }
        : response;
    const refreshedRoot = rootWithQuickButton();
    await handler([], refreshedRoot, '');
    assert(refreshedRoot.innerHTML.includes('Total featured: 0'));
    console.log('PASS: global featured badge ignores listing context, renders zero, and quick-edit refreshes after toggling off.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});