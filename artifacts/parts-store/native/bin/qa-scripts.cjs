const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    console, URL, URLSearchParams,
});
for (const file of ['core.js', 'b2b-ordering.js', 'buyer-currency.js', 'model-search.js', 'discovery-controls.js', 'quick-finder.js', 'category-models.js', 'store.js', 'b2b-catalog.js', 'b2b-menu.js', 'home-landing.js', 'home.js', 'account.js', 'admin-shell.js', 'admin.js', 'admin-products.js', 'admin-prices.js', 'admin-operations.js', 'admin-invoices.js']) {
    const p = path.join(__dirname, '../public/assets/', file);
    vm.runInContext(fs.readFileSync(p, 'utf8'), context, { filename: file });
}
const required = [
    '', 'catalog', 'login', 'register', 'forgot', 'reset', 'cart', 'checkout',
    'account', 'account/addresses', 'account/orders', 'account/returns',
    'admin', 'admin/products', 'admin/products/new', 'admin/products/1', 'admin/prices',
    'admin/orders', 'admin/customers', 'admin/returns', 'admin/returns/1', 'admin/invoices',
    'admin/buyback', 'admin/settings', 'admin/messages', 'admin/audit', 'admin/integrations',
];
for (const route of required) {
    if (!context.window.Router.routes.some(entry => entry.pattern.test(route))) {
        throw new Error(`No registered route: ${route}`);
    }
}
console.log(`PASS: classic-script execution and ${required.length} required routes.`);
if (typeof context.window.Workbench.parseCentsStrict !== 'function') {
    throw new Error('Shared staff money parser is unavailable after all scripts loaded');
}
for (const capability of [context.window.B2BOrdering?.quickAdd, context.window.App.renderProductTable, context.window.StoreMenu?.init]) {
    if (typeof capability !== 'function') throw new Error('Missing B2B ordering capability after shared script load');
}
module.exports = context;