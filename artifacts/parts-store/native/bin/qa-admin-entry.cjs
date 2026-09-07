const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const routes = [];
const form = {};
const errorBox = { style: {} };
const context = vm.createContext({
    window: {
        APP_BASE: '/test-shop/', location: {}, App: {}, UI: {},
        Core: { escapeHtml: String },
        Router: { add(pattern, handler) { routes.push({ pattern, handler }); } }
    },
    document: { addEventListener() {}, getElementById: id => id === 'login-form' ? form : errorBox },
    URLSearchParams, console
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/store.js'), 'utf8'), context);
(async () => {
    const login = routes.find(route => route.pattern.test('login'));
    assert(login);
    await login.handler([], { innerHTML: '' }, new URLSearchParams());
    for (const role of ['staff', 'customer']) {
        context.window.Core.fetch = async (url, options) => {
            assert.equal(url, '/auth/login');
            assert.equal(options.method, 'POST');
            return { user: { role }, csrf: 'unit-fixture' };
        };
        await form.onsubmit({ preventDefault() {}, target: { email: { value: 'qa-entry@test.invalid' }, password: { value: 'unit-only-not-an-account' } } });
        assert.equal(context.window.location.href, role === 'staff' ? '/test-shop/admin' : '/test-shop/');
    }
    context.window.Core.fetch = async () => { throw new Error('Invalid fixture'); };
    const destination = context.window.location.href;
    await form.onsubmit({ preventDefault() {}, target: { email: {}, password: {} } });
    assert.equal(context.window.location.href, destination);
    assert.equal(errorBox.textContent, 'Invalid fixture');
    assert.equal(errorBox.style.display, 'block');
    console.log('PASS: real login form routes staff to admin, customers to shop, and shows failed-login errors without redirecting.');
    context.window.Admin = { layout: html => html };
    context.window.Core.user = { role: 'staff' };
    context.window.Core.formatMoney = value => String(value);
    context.window.Core.fetch = async () => ({
        stats: { products: 8000, customers: 12, orders: 45, low_stock: 123 },
        finance: { unpaid_count: 1, outstanding_cents: 10, overdue_count: 0, overdue_cents: 0, unverified_count: 2, paid_count: 3 },
        invoice_attention: [], recent_orders: [],
        low_stock: [{ id: 1, sku: 'QA-STOCK', name: 'Fixture', stock: 1 }],
        safety: { test_mode: true }
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/admin.js'), 'utf8'), context);
    const dashboardRoot = { innerHTML: '' };
    await routes.find(route => route.pattern.test('admin')).handler([], dashboardRoot);
    assert(dashboardRoot.innerHTML.includes('stock=low_stock">123</a>'));
    assert(dashboardRoot.innerHTML.includes('Total Orders'));
    assert(!dashboardRoot.innerHTML.includes('Open Orders'));
    assert(context.window.Workbench.badge('archived').includes('Archived'));
    console.log('PASS: dashboard uses full low-stock count rather than sample length, truthful order labels, and distinct archived product status.');
})().catch(error => { console.error(error); process.exitCode = 1; });