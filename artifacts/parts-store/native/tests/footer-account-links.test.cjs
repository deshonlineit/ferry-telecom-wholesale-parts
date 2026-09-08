const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const footer = {innerHTML: ''};
const document = {
    cookie: '',
    documentElement: {},
    body: {setAttribute() {}, removeAttribute() {}, appendChild() {}},
    activeElement: null,
    addEventListener() {},
    dispatchEvent() {},
    getElementById(id) {
        return id === 'footer-account-links' ? footer : null;
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
        throw new Error('Unexpected fetch in footer rendering test');
    },
    console,
    clearTimeout,
    setTimeout
};
window.window = window;

vm.runInNewContext(fs.readFileSync('public/assets/i18n.js', 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync('public/assets/core.js', 'utf8'), sandbox);
window.Router.route = () => {};

function footerLinks() {
    return [...footer.innerHTML.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(match => ({
        html: match[0],
        label: match[1].replace(/<[^>]+>/g, '').trim()
    }));
}

function assertFooter({labels, forbidden}, message) {
    const links = footerLinks();
    assert.strictEqual(links.length, 3, `${message}: footer must contain exactly three navigation links`);
    assert.deepStrictEqual(Array.from(links, link => link.label), labels, `${message}: unexpected footer labels`);
    for (const label of forbidden) {
        assert(!links.some(link => link.label === label), `${message}: contradictory account action "${label}" is visible`);
    }
}

window.Core.user = null;
window.Core.renderNav();
assertFooter({
    labels: ['Catalogue', 'Sign in', 'Request an account'],
    forbidden: ['My account', 'Sign out']
}, 'guest');

window.Core.user = {id: 42, role: 'customer'};
window.Core.renderNav();
assertFooter({
    labels: ['Catalogue', 'My account', 'Sign out'],
    forbidden: ['Sign in', 'Request account']
}, 'signed in');

window.I18n.set('nl');
assertFooter({
    labels: ['Catalogus', 'Mijn account', 'Uitloggen'],
    forbidden: ['Inloggen', 'Account aanvragen']
}, 'signed in after language change');

window.Core.user = null;
window.I18n.set('de');
assertFooter({
    labels: ['Katalog', 'Anmelden', 'Konto beantragen'],
    forbidden: ['Mein Konto', 'Abmelden']
}, 'guest after language change');

console.log('footer account links regression passed');