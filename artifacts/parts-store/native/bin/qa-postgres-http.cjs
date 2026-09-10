#!/usr/bin/env node
'use strict';

/*
 * Read-only production HTTP smoke test.  This deliberately uses only GET,
 * apart from the login request, so it is safe to run against a real database.
 */
const assert = require('node:assert/strict');

const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:19111/test-shop/');
const password = process.env.NATIVE_STAFF_PASSWORD;
if (!password) {
    console.error('NATIVE_STAFF_PASSWORD is required');
    process.exit(2);
}
const cookies = new Map();
let csrf = '';
let count = 0;

function url(path) {
    return new URL(path.replace(/^\/+/, ''), base).toString();
}
function saveCookies(response) {
    const values = response.headers.getSetCookie?.() ||
        (response.headers.get('set-cookie') ? response.headers.get('set-cookie').split(/,(?=[^;,]+=)/) : []);
    for (const value of values) {
        const pair = value.split(';', 1)[0].split('=');
        if (pair.length === 2) cookies.set(pair[0], pair[1]);
    }
}
function cookieHeader() {
    return [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
}
function jsonValue(value) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value;
    return value;
}
async function request(path, options = {}) {
    const method = options.method || 'GET';
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (cookieHeader()) headers.Cookie = cookieHeader();
    if (method !== 'GET' && method !== 'HEAD') {
        headers['X-CSRF-Token'] = csrf;
        headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(url(path), {
        redirect: 'manual', ...options, headers,
        body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
    });
    saveCookies(response);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    if (response.status >= 500) throw new Error(`${method} ${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    if (!response.ok) throw new Error(`${method} ${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error(`${method} ${path} returned ${contentType || 'no content type'}, expected application/json`);
    }
    let data;
    try { data = JSON.parse(text); } catch (error) {
        throw new Error(`${method} ${path} returned invalid JSON: ${error.message}`);
    }
    count++;
    console.log(`OK ${method} ${path}`);
    return jsonValue(data);
}
async function page(path) {
    const response = await fetch(url(path), { headers: { Accept: 'text/html', ...(cookieHeader() ? { Cookie: cookieHeader() } : {}) } });
    saveCookies(response);
    const type = response.headers.get('content-type') || '';
    const text = await response.text();
    if (response.status >= 500 || !response.ok) throw new Error(`GET ${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    if (!type.includes('text/html')) throw new Error(`GET ${path} returned ${type || 'no content type'}, expected text/html`);
    if (!text.includes('<html') && !text.includes('<!doctype')) throw new Error(`GET ${path} did not return root HTML`);
    count++; console.log(`OK GET ${path}`);
}
function firstId(data, keys) {
    for (const key of keys) {
        const value = data?.[key];
        if (Array.isArray(value) && value.length) {
            const item = value[0];
            if (item && item.id != null) return item.id;
        }
    }
    return null;
}
async function establishSession(email) {
    const session = await request('/api/session');
    assert.equal(session.test_mode, true, 'published preview must keep test_mode enabled');
    assert.deepEqual(
      session.capabilities,
      { live_stock: false, payments: false, email: false },
      'published preview must keep every live integration disabled',
    );
    csrf = session.csrf;
    assert(csrf, 'session did not return CSRF token');
    const login = await request('/api/auth/login', {
        method: 'POST', body: { email, password }
    });
    csrf = login.csrf || csrf;
    return login;
}

(async () => {
    const origin = new URL(base);
    await Promise.all(['/health', '/ready'].map(async path => {
        const response = await fetch(url(path), { headers: { Accept: 'application/json' } });
        const type = response.headers.get('content-type') || '';
        const text = await response.text();
        if (response.status >= 500 || !response.ok) throw new Error(`GET ${path} returned HTTP ${response.status}: ${text.slice(0, 300)}`);
        if (!type.includes('application/json')) throw new Error(`GET ${path} returned ${type || 'no content type'}, expected application/json`);
        try { JSON.parse(text); } catch { throw new Error(`GET ${path} returned invalid JSON`); }
        console.log(`OK GET ${path}`);
    }));
    await page('');
    // Public discovery is intentionally exercised before authenticating.
    const catalog = await request('/api/catalog?limit=20');
    const products = await request('/api/products?limit=20');
    const productId = firstId(products, ['products']) || firstId(catalog, ['products']);
    const query = await request('/api/search/products?q=part&limit=10');
    await request('/api/search/suggestions?q=part');
    // Cover the same facet/device combinations used by discovery-controls.js.
    await request('/api/catalog?facets=1');
    const brandId = firstId(catalog, ['brands']);
    const familyId = firstId(catalog, ['device_families']);
    const modelId = firstId(catalog, ['models', 'device_models']);
    await request(`/api/catalog?device_brand=${brandId || ''}&family=${familyId || ''}&model=${modelId || ''}&limit=20`);
    if (productId != null) await request(`/api/products/${productId}`);

    // Buyer/session APIs must be checked as a customer, not as staff.
    const buyer = await establishSession('customer@test.invalid');
    assert.equal(buyer.user?.role, 'customer', 'customer login did not return customer role');
    console.log('OK POST /api/auth/login (customer role; password omitted)');
    await request('/api/cart');
    await request('/api/profile');
    const addresses = await request('/api/addresses');
    const orders = await request('/api/orders');
    const orderId = firstId(orders, ['orders']);
    const returns = await request('/api/returns');
    const returnId = firstId(returns, ['returns']);
    await request('/api/workspace/order-lists');
    await request('/api/workspace/stock-alerts');
    await request('/api/workspace/billing-preferences');
    if (orderId != null) await request(`/api/orders/${orderId}`);
    if (returnId != null) await request(`/api/returns/${returnId}`);
    for (const path of ['cart', 'account', 'account/lists', 'account/alerts', 'account/documents', 'account/billing']) {
        await page(path);
    }

    // Logout and establish a genuinely fresh cookie jar before switching roles.
    await request('/api/auth/logout', { method: 'POST' });
    cookies.clear();
    csrf = '';
    const staff = await establishSession('staff@test.invalid');
    assert.equal(staff.user?.role, 'staff', 'staff login did not return staff role');
    console.log('OK POST /api/auth/login (staff role; password omitted)');

    const admin = [
        '/api/admin/dashboard', '/api/admin/products?limit=20', '/api/admin/prices?page=1&limit=20',
        '/api/admin/orders', '/api/admin/invoices?limit=20', '/api/admin/customers',
        '/api/admin/returns', '/api/admin/settings', '/api/admin/integrations',
        '/api/admin/diagnostics', '/api/admin/audit'
    ];
    const adminData = {};
    for (const path of admin) adminData[path] = await request(path);
    const adminProductId = firstId(adminData['/api/admin/products?limit=20'], ['products']) || productId;
    const adminOrderId = firstId(adminData['/api/admin/orders'], ['orders']) || orderId;
    const adminReturnId = firstId(adminData['/api/admin/returns'], ['returns']) || returnId;
    const customerId = firstId(adminData['/api/admin/customers'], ['customers']);
    const diagnosticId = firstId(adminData['/api/admin/diagnostics'], ['diagnostics']);
    if (adminProductId != null) await request(`/api/admin/products/${adminProductId}`);
    if (adminOrderId != null) await request(`/api/admin/orders/${adminOrderId}`);
    if (adminReturnId != null) await request(`/api/admin/returns/${adminReturnId}`);
    if (customerId != null) await request(`/api/admin/customers/${customerId}/detail`);
    if (diagnosticId != null) await request(`/api/admin/diagnostics/${diagnosticId}`);

    // Exercise the page entry points as well as their JSON dependencies.
    for (const path of ['', 'catalog', 'products', 'quick-order', 'admin', 'admin/products',
        'admin/prices', 'admin/orders', 'admin/invoices', 'admin/customers', 'admin/returns',
        'admin/settings', 'admin/integrations', 'admin/diagnostics', 'admin/audit']) {
        await page(path);
    }
    console.log(`PASS: ${count} production HTTP smoke checks completed against ${origin.origin}`);
})().catch(error => {
    // Do not include request bodies (and therefore never the staff password) in diagnostics.
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
});