const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const routes = [];
let productsData;
let requestedProductsUrl = '';
const inertElement = { addEventListener() {} };
const context = vm.createContext({
    window: {
        APP_BASE: '/test-shop/',
        Admin: { layout: html => html },
        Core: {
            user: { role: 'staff' },
            escapeHtml: value => String(value ?? ''),
            formatMoney: value => String(value),
            renderPagination: () => '',
            async fetch(url) {
                if (url === '/catalog') return { categories: [], brands: [], qualities: [] };
                if (url.startsWith('/admin/products?')) {
                    requestedProductsUrl = url;
                    return productsData;
                }
                if (url === '/admin/settings') {
                    return { settings: { shipping_cents: 0, free_shipping_cents: 0, tax_bps: 0, low_stock_threshold: 0 } };
                }
                throw new Error(`Unexpected request: ${url}`);
            }
        },
        Router: {
            add(pattern, handler) { routes.push({ pattern, handler }); },
            navigate() {}
        },
        UI: {}
    },
    document: {
        body: { appendChild() {} },
        createElement: () => ({ style: {}, remove() {} }),
        getElementById: () => ({}),
        addEventListener() {}
    },
    URLSearchParams,
    FormData: class {},
    console,
    setTimeout() {}
});

vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/admin.js'), 'utf8'), context);

const productRoute = routes.find(route => route.pattern.test('admin/products')).handler;
const settingsRoute = routes.find(route => route.pattern.test('admin/settings')).handler;

function rootFixture() {
    return {
        innerHTML: '',
        querySelector: () => inertElement,
        querySelectorAll: () => []
    };
}

async function renderProducts(threshold, stocks, query = 'stock=low_stock') {
    productsData = {
        products: stocks.map((stock, index) => ({
            id: index + 1,
            sku: `STOCK-${stock}`,
            name: `Stock ${stock}`,
            featured: 0,
            active: 1,
            stock,
            list_price_cents: 100
        })),
        page: 1,
        pages: 1,
        stock_threshold: threshold
    };
    const root = rootFixture();
    await productRoute([], root, query);
    return root.innerHTML;
}

(async () => {
    const defaultBoundary = await renderProducts(undefined, [0, 4, 5, 6]);
    assert(requestedProductsUrl.includes('stock=low_stock'), 'selected filter must send stock=low_stock');
    assert(defaultBoundary.includes('<option value="low_stock" selected>Low stock</option>'));
    assert(defaultBoundary.includes('<option value="in_stock" >In stock</option>'));
    assert(defaultBoundary.includes('<option value="out_of_stock" >Out of stock</option>'));
    assert(defaultBoundary.includes('Low stock: ≤ 5 units'));
    assert(defaultBoundary.includes('0 units · Out of stock'));
    assert(defaultBoundary.includes('4 units · Low stock'));
    assert(defaultBoundary.includes('5 units · Low stock'));
    assert(defaultBoundary.includes('6 units</span>'));
    assert(!defaultBoundary.includes('6 units · Low stock'));

    const zeroThreshold = await renderProducts(0, [0, 1]);
    assert(zeroThreshold.includes('Low stock: ≤ 0 units'));
    assert(zeroThreshold.includes('0 units · Out of stock'));
    assert(!zeroThreshold.includes('1 units · Low stock'));

    const tenThreshold = await renderProducts(10, [10, 11]);
    assert(tenThreshold.includes('Low stock: ≤ 10 units'));
    assert(tenThreshold.includes('10 units · Low stock'));
    assert(!tenThreshold.includes('11 units · Low stock'));

    const settingsRoot = rootFixture();
    await settingsRoute([], settingsRoot);
    assert(settingsRoot.innerHTML.includes('name="low_stock_threshold" value="0"'));

    console.log('PASS: native admin low-stock queries, labels, inclusive boundaries, configurable thresholds, and zero-valued settings.');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});