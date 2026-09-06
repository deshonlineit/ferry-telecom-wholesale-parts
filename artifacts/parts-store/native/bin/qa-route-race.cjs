const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const mount = {current: null, replaceChildren(child) { this.current = child; }};
let modalOpen = true;
const overlay = {parentNode: {removeChild() { modalOpen = false; }}};
const location = {pathname: '/test-shop/products/1', search: ''};
const bodyAttributes = {};
const context = vm.createContext({
    window: {APP_BASE: '/test-shop/', addEventListener() {}},
    document: {
        body: { setAttribute(name, value) { bodyAttributes[name] = value; }, removeAttribute(name) { delete bodyAttributes[name]; } },
        addEventListener() {},
        querySelectorAll() { return modalOpen ? [overlay] : []; },
        getElementById() { return mount; },
        createElement() { return {innerHTML: '', className: ''}; }
    },
    location, URLSearchParams, console
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/assets/core.js'), 'utf8'), context);
const router = context.window.Router;
let finishProduct;
const slowProduct = new Promise(resolve => { finishProduct = resolve; });
router.add(/^products\/1$/, async (_, root) => { await slowProduct; root.innerHTML = 'old product'; });
router.add(/^catalog$/, async (_, root) => { root.innerHTML = 'current catalog'; });
(async () => {
    const original = router.route();
    location.pathname = '/test-shop/catalog';
    await router.route();
    finishProduct();
    await original;
    assert.equal(mount.current.innerHTML, 'current catalog');
    assert.equal(modalOpen, false);
    console.log('PASS: navigation closes global success modals.');
    console.log('PASS: a late product response cannot replace the newer catalog.');
    router.add(/^admin$/, async (_, root) => { root.innerHTML = 'staff workspace'; });
    context.window.Core.user = { role: 'staff' };
    location.pathname = '/test-shop/admin';
    await router.route();
    assert.equal(bodyAttributes['data-area'], 'admin');
    location.pathname = '/test-shop/catalog';
    await router.route();
    assert.equal(bodyAttributes['data-area'], undefined);
    context.window.Core.user = { role: 'customer' };
    location.pathname = '/test-shop/admin';
    await router.route();
    assert.equal(bodyAttributes['data-area'], undefined);
    console.log('PASS: only staff admin routes use the separate backoffice shell mode.');
})().catch(error => { console.error(error); process.exitCode = 1; });