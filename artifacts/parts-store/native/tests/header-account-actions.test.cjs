const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const header = {innerHTML: ''};
const document = {
    cookie: '',
    documentElement: {},
    body: {setAttribute() {}, removeAttribute() {}, appendChild() {}},
    activeElement: null,
    addEventListener() {},
    dispatchEvent() {},
    getElementById(id) {
        return id === 'user-nav' ? header : null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
};
const window = {
    location: {search: ''},
    navigator: {languages: ['en'], language: 'en'},
    addEventListener() {}
};
const sandbox = {
    window,
    document,
    localStorage: {getItem: () => null, setItem() {}},
    navigator: window.navigator,
    location: {origin: 'https://example.test', pathname: '/test-shop/', search: ''},
    history: {pushState() {}},
    URL,
    URLSearchParams,
    Intl,
    CustomEvent: function CustomEvent(type, options) {
        this.type = type;
        this.detail = options?.detail;
    },
    FormData: function FormData() {},
    fetch() {
        throw new Error('Unexpected fetch in header rendering test');
    },
    console,
    clearTimeout,
    setTimeout
};
window.window = window;

const assetPath = filename => path.resolve(__dirname, '..', 'public', 'assets', filename);
vm.runInNewContext(fs.readFileSync(assetPath('i18n.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(assetPath('core.js'), 'utf8'), sandbox);
window.Router.route = () => {};

function hasClass(className) {
    return new RegExp(`class="[^"]*\\b${className}\\b`).test(header.innerHTML);
}

function assertHeader({required, forbidden}, message) {
    for (const action of required) {
        assert(hasClass(action), `${message}: required header action "${action}" is missing`);
    }
    for (const action of forbidden) {
        assert(!hasClass(action), `${message}: contradictory header action "${action}" is visible`);
    }
}

window.Core.user = null;
window.Core.renderNav();
assertHeader({
    required: ['nav-signin', 'btn-primary'],
    forbidden: ['nav-account-action', 'nav-signout-action', 'text-danger']
}, 'guest');
assert(header.innerHTML.includes('Sign in'), 'guest: sign-in label must be rendered');
assert(header.innerHTML.includes('Become a customer'), 'guest: registration label must be rendered');

window.Core.user = {id: 42, role: 'customer'};
window.Core.renderNav();
assertHeader({
    required: ['nav-account-action', 'nav-signout-action'],
    forbidden: ['nav-signin', 'btn-primary', 'text-danger']
}, 'signed in customer');
assert(header.innerHTML.includes('aria-label="My account"'), 'customer: account label must be rendered');
assert(header.innerHTML.includes('aria-label="Sign out"'), 'customer: sign-out label must be rendered');

window.I18n.set('nl');
assertHeader({
    required: ['nav-account-action', 'nav-signout-action'],
    forbidden: ['nav-signin', 'btn-primary', 'text-danger']
}, 'signed in customer after language change');
assert(header.innerHTML.includes('aria-label="Mijn account"'), 'customer: account label must refresh after language change');
assert(header.innerHTML.includes('aria-label="Uitloggen"'), 'customer: sign-out label must refresh after language change');
assert(!header.innerHTML.includes('aria-label="My account"'), 'customer: stale English account label must be removed');

window.Core.user = {id: 7, role: 'staff'};
window.Core.renderNav();
assertHeader({
    required: ['nav-account-action', 'text-danger', 'nav-signout-action'],
    forbidden: ['nav-signin', 'btn-primary', 'nav-cart']
}, 'staff');
assert(header.innerHTML.includes('Backoffice'), 'staff: backoffice action must be rendered');

window.I18n.set('de');
assertHeader({
    required: ['nav-account-action', 'text-danger', 'nav-signout-action'],
    forbidden: ['nav-signin', 'btn-primary', 'nav-cart']
}, 'staff after language change');
assert(header.innerHTML.includes('aria-label="Mein Konto"'), 'staff: account label must refresh after language change');
assert(header.innerHTML.includes('aria-label="Abmelden"'), 'staff: sign-out label must refresh after language change');

console.log('header account actions regression passed');