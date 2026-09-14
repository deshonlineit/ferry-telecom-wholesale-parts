const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const routes = [];
const fixtures = {
    '/profile': {
        user: {
            name: 'Fixture Customer',
            company: 'Fixture Repair GmbH',
            email: 'customer@example.test'
        }
    },
    '/addresses': {
        addresses: [{
            id: 301,
            label: 'Workshop',
            is_default: 1,
            name: 'Fixture Customer',
            company: 'Fixture Repair GmbH',
            line1: 'Teststrasse 1',
            line2: '',
            postal_code: '8000',
            city: 'Zürich',
            country: 'CH'
        }]
    },
    '/orders': {
        orders: [{
            id: 101,
            number: 'ORD-2026-0101',
            created_at: '2026-09-14T08:30:00Z',
            status: 'processing',
            payment_state: 'paid',
            payment_method: 'swiss_qr_invoice',
            total_cents: 12990,
            currency: 'CHF'
        }]
    },
    '/orders/101': {
        order: {
            id: 101,
            number: 'ORD-2026-0101',
            created_at: '2026-09-14T08:30:00Z',
            status: 'processing',
            payment_state: 'paid',
            payment_method: 'swiss_qr_invoice',
            shipping_method_code: 'swiss_post_priority',
            subtotal_cents: 12000,
            shipping_cents: 290,
            tax_cents: 700,
            total_cents: 12990,
            tax_bps: 810,
            currency: 'CHF',
            notes: 'Deliver during business hours.'
        },
        address: {
            name: 'Fixture Customer',
            company: 'Fixture Repair GmbH',
            line1: 'Teststrasse 1',
            postal_code: '8000',
            city: 'Zürich',
            country: 'CH'
        },
        items: [{
            id: 501,
            name: 'Fixture display',
            sku: 'FIX-DISPLAY-1',
            quantity: 2,
            price_cents: 6000,
            total_cents: 12000
        }],
        events: [{
            status: 'processing',
            note: 'Fixture event',
            created_at: '2026-09-14T09:00:00Z'
        }]
    },
    '/returns': {
        returns: [{
            id: 201,
            number: 'RMA-2026-0201',
            order_id: 101,
            created_at: '2026-09-14T10:00:00Z',
            status: 'credited',
            credit_cents: 6000,
            currency: 'CHF'
        }]
    },
    '/returns/201': {
        return: {
            id: 201,
            number: 'RMA-2026-0201',
            order_id: 101,
            created_at: '2026-09-14T10:00:00Z',
            status: 'credited',
            reason: 'Fixture return reason',
            note: 'Fixture support note',
            credit_cents: 6000,
            currency: 'CHF'
        },
        order: {id: 101, currency: 'CHF'},
        items: [{
            id: 601,
            name: 'Fixture display',
            price_cents: 6000,
            quantity: 1
        }],
        events: [{
            status: 'credited',
            note: 'Fixture credit completed',
            created_at: '2026-09-14T11:00:00Z'
        }]
    },
    '/workspace/order-lists': {
        lists: [{
            id: 401,
            name: 'Fixture restock list',
            item_count: 1,
            updated_at: '2026-09-14T12:00:00Z'
        }]
    },
    '/workspace/order-lists/401': {
        list: {id: 401, name: 'Fixture restock list'},
        items: [{
            product_id: 501,
            name: 'Fixture display',
            sku: 'FIX-DISPLAY-1',
            quantity: 2,
            price_cents: 6000,
            currency: 'CHF',
            orderable: true,
            active: true,
            stock: 8
        }],
        total_cents: 12000,
        currency: 'CHF'
    },
    '/workspace/stock-alerts': {
        alerts: [{
            product_id: 502,
            name: 'Fixture battery',
            sku: 'FIX-BATTERY-1',
            price_cents: 2490,
            currency: 'CHF',
            alert_status: 'available',
            stock: 4,
            expected_restock_date: '2026-09-20',
            requested_at: '2026-09-13T12:00:00Z',
            minimum_quantity: 1
        }]
    },
    '/workspace/billing-preferences': {
        preferences: {
            invoice_email: 'invoices@example.test',
            account_email: 'customer@example.test',
            copy_email: 'accounts@example.test',
            reference_label: 'Purchase order',
            auto_send: true,
            reference_required: false,
            effective_email: 'invoices@example.test'
        },
        deliveries: [{
            created_at: '2026-09-14T13:00:00Z',
            recipient: 'invoices@example.test',
            copy_recipient: 'accounts@example.test',
            document_kind: 'invoice'
        }]
    }
};

const domElement = () => ({
    innerHTML: '',
    value: '',
    checked: false,
    disabled: false,
    hidden: false,
    dataset: {},
    style: {},
    options: [{textContent: ''}],
    selectedIndex: 0,
    appendChild() {},
    remove() {},
    click() {},
    addEventListener() {},
    setAttribute() {},
    querySelector() { return domElement(); },
    querySelectorAll() { return []; }
});

const root = {
    innerHTML: '',
    querySelector() { return domElement(); },
    querySelectorAll() { return []; }
};

const document = {
    body: {appendChild() {}, removeChild() {}},
    createElement: domElement,
    getElementById() { return domElement(); }
};

const window = {
    APP_BASE: '/test-shop/',
    Core: {
        user: {id: 42, role: 'customer'},
        escapeHtml(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        },
        async fetch(endpoint, options) {
            assert.strictEqual(options, undefined, `route rendering must not perform a mutation: ${endpoint}`);
            if (endpoint.startsWith('/workspace/documents?')) {
                return {
                    documents: [{
                        issued_at: '2026-09-14',
                        document_number: 'INV-2026-0101',
                        type: 'invoice',
                        customer_reference: 'PO-FIXTURE',
                        order_number: 'ORD-2026-0101',
                        amount_cents: 12990,
                        currency: 'CHF',
                        outstanding_cents: 0,
                        due_date: '2026-10-14',
                        payment_status: 'paid',
                        download_path: '/fixture/invoice.pdf'
                    }],
                    years: [2026],
                    totals: [{
                        currency: 'CHF',
                        amount_cents: 12990,
                        outstanding_known: true,
                        outstanding_cents: 0,
                        document_count: 1
                    }],
                    archive_limit: 120,
                    period: {label: '2026'},
                    preferences: {effective_email: 'invoices@example.test'}
                };
            }
            assert(Object.hasOwn(fixtures, endpoint), `unexpected API request: ${endpoint}`);
            return fixtures[endpoint];
        }
    },
    I18n: {
        t(key, values = {}) {
            return Object.entries(values).reduce(
                (text, [name, value]) => `${text} ${name}=${value}`,
                key
            );
        },
        date(value) { return `date:${value}`; },
        number(value) { return String(value); },
        formatMoney(cents, currency) { return `${currency} ${(cents / 100).toFixed(2)}`; }
    },
    Router: {
        add(pattern, handler) { routes.push({pattern, handler}); },
        navigate() { throw new Error('customer account fixtures must not redirect'); }
    },
    OrderWorkspace: {reorder() {}},
    Wsp: {
        emptyState(title, body, action = '') { return `<div>${title}${body}${action}</div>`; },
        productCell(product) { return `<strong>${product.name}</strong><small>${product.sku}</small>`; },
        orderable(item) { return Boolean(item.orderable); },
        applyCart() {},
        download() {}
    },
    UI: {},
    prompt() { return null; },
    confirm() { return false; }
};
window.window = window;

const sandbox = {
    window,
    document,
    URL,
    URLSearchParams,
    FormData: function FormData() {},
    console,
    setTimeout,
    clearTimeout
};

const accountAsset = path.resolve(__dirname, '..', 'public', 'assets', 'account.js');
vm.runInNewContext(fs.readFileSync(accountAsset, 'utf8'), sandbox, {filename: accountAsset});
const workspaceAsset = path.resolve(__dirname, '..', 'public', 'assets', 'account-workspace.js');
vm.runInNewContext(fs.readFileSync(workspaceAsset, 'utf8'), sandbox, {filename: workspaceAsset});

async function renderRoute(routePath, expectedContent) {
    const registered = routes.filter(({pattern}) => {
        pattern.lastIndex = 0;
        return pattern.test(routePath);
    });
    assert(registered.length > 0, `${routePath}: no account route was registered`);

    for (const {pattern, handler} of registered) {
        pattern.lastIndex = 0;
        const match = pattern.exec(routePath);
        root.innerHTML = '';

        await handler(match, root);

        assert(root.innerHTML, `${routePath}: route rendered no content`);
        assert(
            root.innerHTML.includes(expectedContent),
            `${routePath}: representative fixture content "${expectedContent}" was not rendered`
        );
        assert(
            !/<div class="alert error">/i.test(root.innerHTML),
            `${routePath}: route rendered an unexpected error panel: ${root.innerHTML}`
        );
        assert(
            !/\b(?:ReferenceError|is not defined)\b/i.test(root.innerHTML),
            `${routePath}: route rendered a JavaScript reference error`
        );
    }
}

(async () => {
    const routeFixtures = new Map([
        ['account', 'Fixture Repair GmbH'],
        ['account/addresses', 'Teststrasse 1'],
        ['account/orders', 'ORD-2026-0101'],
        ['account/orders/101', 'FIX-DISPLAY-1'],
        ['account/returns', 'RMA-2026-0201'],
        ['account/returns/201', 'Fixture return reason'],
        ['account/lists', 'Fixture restock list'],
        ['account/lists/401', 'Fixture display'],
        ['account/alerts', 'Fixture battery'],
        ['account/documents', 'INV-2026-0101'],
        ['account/billing', 'invoices@example.test']
    ]);

    for (const [routePath, expectedContent] of routeFixtures) {
        await renderRoute(routePath, expectedContent);
    }

    console.log('customer account route rendering regression passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});