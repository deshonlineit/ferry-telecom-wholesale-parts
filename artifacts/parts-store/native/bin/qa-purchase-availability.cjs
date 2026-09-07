const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const routes = [];
let product;
const core = {
    user: {role: 'customer'},
    escapeHtml: value => String(value ?? ''),
    formatMoney: cents => `${cents / 100} CHF`,
    fetch: async () => ({product, related: [], models: [], images: []})
};
const context = vm.createContext({
    window: {
        Core: core,
        App: {},
        B2BOrdering: {canOrder() { return core.user?.role === 'customer'; }},
        Router: {add(pattern, handler) { routes.push({pattern, handler}); }},
        APP_BASE: '/test-shop/'
    },
    document: {addEventListener() {}}, console
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/store.js'), 'utf8'), context);
const app = context.window.App;
const detail = routes.find(route => route.pattern.test('products/1')).handler;
(async () => {
    let checks = 0;
    for (const [role, price, stock, minimum, expected] of [
        ['customer', 1000, 2, 3, false],
        ['customer', 1000, 3, 3, true],
        ['customer', 1000, 0, 1, false],
        ['customer', 0, 1, 1, true],
        ['staff', 1000, 5, 1, false],
        [null, null, 5, 1, false],
        [null, 1000, 5, 1, false]
    ]) {
        core.user = role ? {role} : null;
        product = {id: 1, name: 'Fixture part', sku: 'FIXTURE', description: '', image_url: '', quality: '', price_cents: price, stock, minimum_quantity: minimum};
        assert.equal(app.canOrderProduct(product), expected);
        const card = app.renderProductCard(product);
        assert.equal(card.includes('class="part-action"'), expected, 'card purchase availability');
        const root = {innerHTML: ''};
        await detail(['products/1', '1'], root);
        assert.equal(root.innerHTML.includes('id="pd-qty"'), expected, 'detail purchase availability');
        if (stock > 0 && stock < minimum) assert.ok(root.innerHTML.includes('this part cannot be ordered at present'));
        checks++;
    }
    console.log(`PASS: ${checks} purchase-availability cases in both product cards and detail pages.`);
})().catch(error => { console.error(error); process.exitCode = 1; });