const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const routes = [];
const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const context = vm.createContext({
    URLSearchParams, console,
    window: {
        APP_BASE: '/test-shop/',
        Core: { escapeHtml, formatMoney: cents => (cents / 100).toFixed(2) + ' CHF' },
        Router: { add(pattern, handler) { routes.push({ pattern, handler }); } }
    }
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/admin-invoices.js'), 'utf8'), context);
const ui = context.window.AdminInvoices;
assert(routes.some(route => route.pattern.test('admin/invoices')));
assert.equal(ui.parseCents('12.30'), 1230);
assert.equal(ui.parseCents('12,3'), 1230);
assert.equal(ui.parseCents('0'), 0);
for (const value of ['', '-1', '12.345', '1e4', 'Infinity', 'NaN', '1.2junk', '1000001']) assert.throws(() => ui.parseCents(value));
const url = new URL(ui.buildUrl(new URLSearchParams('q=fixture&status=unpaid&sort=due&page=4&limit=25'), { sort: 'oldest' }), 'https://test.invalid');
assert.equal(url.searchParams.get('q'), 'fixture');
assert.equal(url.searchParams.get('status'), 'unpaid');
assert.equal(url.searchParams.get('sort'), 'oldest');
assert.equal(url.searchParams.get('page'), null);
assert.equal(url.searchParams.get('limit'), '25');
const paged = new URL(ui.buildUrl(url.searchParams, { page: 2 }), 'https://test.invalid');
assert.equal(paged.searchParams.get('page'), '2');
assert.equal(paged.searchParams.get('status'), 'unpaid');
const invoice = { id: 1, order_number: '<unsafe>', company: '<img src=x>', customer_name: 'Test', issued_at: '2026-09-06', due_date: null, total_cents: 10000, credited_cents: 0, paid_cents: 0, outstanding_cents: null, credit_balance_cents: 0, payment_status: 'unverified', verified: false };
const html = ui.renderRows([invoice]);
assert(html.includes('&lt;unsafe&gt;'));
assert(!html.includes('<img src=x>'));
assert(html.includes('Not confirmed'));
assert(html.includes('To be checked'));
assert(html.includes('06-09-2026'));
assert(html.includes('/test-shop/api/documents/1/invoice.pdf'));
assert(!html.includes('onclick='));
const paid = ui.renderRows([{ ...invoice, verified: true, payment_status: 'paid', paid_cents: 10000, outstanding_cents: 0 }]);
assert(paid.includes('status-paid'));
assert(paid.includes('100.00 CHF'));
const summary = ui.renderSummary({ unpaid_count: 3, outstanding_cents: 20000, overdue_count: 1, overdue_cents: 10000, unverified_count: 2, paid_count: 4 }, new URLSearchParams('q=specific'));
assert(summary.includes('200.00 CHF'));
assert(!summary.includes('q=specific'));
console.log('PASS: invoice route, integer-cent validation, URL/filter preservation, unverified vs paid display, escaping and summary links.');

(async () => {
    const win = context.window;
    const noop = () => {};
    const filter = { addEventListener: noop, querySelectorAll: () => [] };
    const root = {
        isConnected: true, innerHTML: '',
        querySelector: selector => selector === '#invoice-filter-form' ? filter : { addEventListener: noop },
        querySelectorAll: () => []
    };
    win.Core.user = { role: 'staff' };
    win.Core.fetch = async () => ({ invoices: [invoice], total: 120, page: 2, pages: 3, summary: { unpaid_count: 0, outstanding_cents: 0, overdue_count: 0, overdue_cents: 0, unverified_count: 120, paid_count: 0 } });
    win.Core.renderPagination = (page, pages, params, base) => {
        assert.equal(page, 2);
        assert.equal(pages, 3);
        assert(params instanceof URLSearchParams);
        assert.equal(params.get('q'), 'fixture');
        assert.equal(params.get('status'), 'unverified');
        assert.equal(base, '/test-shop/admin/invoices');
        return 'Verified pagination';
    };
    win.Admin = { layout: html => html };
    win.Router.renderVersion = 1;
    await routes[0].handler([], root, new URLSearchParams('q=fixture&status=unverified&page=2'));
    assert(root.innerHTML.includes('Verified pagination'));
    assert(root.innerHTML.includes('&lt;unsafe&gt;'));
    win.Core.fetch = async () => {
        win.Router.renderVersion++;
        return { invoices: [], summary: {} };
    };
    const before = root.innerHTML;
    await routes[0].handler([], root, new URLSearchParams());
    assert.equal(root.innerHTML, before);
    console.log('PASS: real pagination contract and stale invoice-route response protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });