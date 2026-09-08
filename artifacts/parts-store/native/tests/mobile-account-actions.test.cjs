const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const nativeRoot = path.resolve(__dirname, '..');
const indexSource = fs.readFileSync(path.join(nativeRoot, 'public', 'index.php'), 'utf8');
const navigationCss = fs.readFileSync(path.join(nativeRoot, 'public', 'assets', 'b2b-navigation.css'), 'utf8');
assert.strictEqual(
    (indexSource.match(/id="user-nav"/g) || []).length,
    1,
    'mobile navigation must have one account-action host'
);

const narrowHeaderRule = navigationCss.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n\}\n\n\n\/\* 2\./);
assert(narrowHeaderRule, 'narrowest supported viewport must have a dedicated header layout');
const narrowCss = narrowHeaderRule[1];
assert(/grid-template-rows:\s*40px 40px auto/.test(narrowCss),
    'narrow layout must reserve separate rows for the logo, actions, and search');
assert(/\.user-nav[\s\S]*?grid-row:\s*2/.test(narrowCss),
    'narrow account actions must not share the logo row');
assert(/(?:\.page-search-jump|\.search-bar)[\s\S]*?grid-row:\s*3/.test(narrowCss),
    'narrow search control must not share the account-action row');
assert(/\.user-nav \.nav-link[\s\S]*?min-width:\s*40px[\s\S]*?min-height:\s*40px/.test(narrowCss),
    'every narrow account action must retain a 40 by 40 pixel tap target');
assert(/\.logo img[\s\S]*?max-width:\s*min\(100%, 170px\)/.test(narrowCss),
    'the logo must shrink with its grid track at narrow boundary widths');
assert(/\.btn-primary[\s\S]*?max-width:\s*calc\(100% - 48px\)[\s\S]*?text-overflow:\s*ellipsis/.test(narrowCss),
    'long translated registration labels must stay inside the action row');

const mobileNav = {innerHTML: ''};
const document = {
    cookie: '',
    documentElement: {},
    body: {setAttribute() {}, removeAttribute() {}, appendChild() {}},
    activeElement: null,
    addEventListener() {},
    dispatchEvent() {},
    getElementById(id) {
        return id === 'user-nav' ? mobileNav : null;
    },
    querySelector() { return null; },
    querySelectorAll() { return []; }
};
const window = {
    innerWidth: 390,
    location: {search: ''},
    navigator: {languages: ['en'], language: 'en'},
    matchMedia(query) {
        return {
            matches: query === '(max-width: 480px)' || query === '(max-width: 768px)',
            media: query,
            addEventListener() {},
            removeEventListener() {}
        };
    },
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
        throw new Error('Unexpected fetch in mobile navigation rendering test');
    },
    console,
    clearTimeout,
    setTimeout
};
window.window = window;

const assetPath = filename => path.join(nativeRoot, 'public', 'assets', filename);
vm.runInNewContext(fs.readFileSync(assetPath('i18n.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(assetPath('core.js'), 'utf8'), sandbox);
window.Router.route = () => {};

function hrefs() {
    return Array.from(mobileNav.innerHTML.matchAll(/href="([^"]+)"/g), match => match[1]);
}

function assertMobileActions({requiredHrefs, forbiddenHrefs, requiredClasses, forbiddenClasses}, message) {
    const renderedHrefs = hrefs();
    for (const href of requiredHrefs) {
        assert(renderedHrefs.includes(href), `${message}: required mobile action "${href}" is missing`);
        assert.strictEqual(renderedHrefs.filter(value => value === href).length, 1,
            `${message}: mobile action "${href}" must be rendered once`);
    }
    for (const href of forbiddenHrefs) {
        assert(!renderedHrefs.includes(href), `${message}: contradictory mobile action "${href}" is visible`);
    }
    for (const className of requiredClasses) {
        assert(new RegExp(`class="[^"]*\\b${className}\\b`).test(mobileNav.innerHTML),
            `${message}: required mobile action class "${className}" is missing`);
    }
    for (const className of forbiddenClasses) {
        assert(!new RegExp(`class="[^"]*\\b${className}\\b`).test(mobileNav.innerHTML),
            `${message}: contradictory mobile action class "${className}" is visible`);
    }
    const actions = Array.from(mobileNav.innerHTML.matchAll(/<(a|button)\b([^>]*)>/g));
    assert(actions.length > 0, `${message}: account actions must be rendered`);
    for (const [, element, attributes] of actions) {
        if (element === 'button') {
            assert(/\btype="button"/.test(attributes), `${message}: buttons must not submit forms while keyboard navigating`);
        } else {
            assert(/\bhref="[^"]+"/.test(attributes), `${message}: links must remain keyboard focusable`);
        }
        assert(!/\btabindex="-1"/.test(attributes), `${message}: account actions must remain in the keyboard tab order`);
    }
}

window.Core.user = null;
window.Core.renderNav();
assertMobileActions({
    requiredHrefs: ['/test-shop/login', '/test-shop/register'],
    forbiddenHrefs: ['/test-shop/account', '/test-shop/admin'],
    requiredClasses: ['nav-signin', 'btn-primary'],
    forbiddenClasses: ['nav-account-action', 'nav-signout-action']
}, 'guest');
assert(mobileNav.innerHTML.includes(window.I18n.t('signIn')), 'guest: sign-in label must be rendered');
assert(mobileNav.innerHTML.includes(window.I18n.t('becomeCustomer')), 'guest: registration label must be rendered');

window.I18n.set('nl');
assert(mobileNav.innerHTML.includes(window.I18n.t('signIn')), 'guest: sign-in label must refresh after language change');
assert(mobileNav.innerHTML.includes(window.I18n.t('becomeCustomer')), 'guest: registration label must refresh after language change');
assert(!mobileNav.innerHTML.includes('Become a customer'), 'guest: stale English registration label must be removed');

for (const locale of ['en', 'nl', 'de', 'fr', 'it']) {
    window.I18n.set(locale);
    assert(mobileNav.innerHTML.includes(window.I18n.t('signIn')),
        `guest ${locale}: translated sign-in action must remain rendered`);
    assert(mobileNav.innerHTML.includes(window.I18n.t('becomeCustomer')),
        `guest ${locale}: translated registration action must remain rendered`);
}

window.Core.user = {id: 42, role: 'customer'};
window.Core.renderNav();
assertMobileActions({
    requiredHrefs: ['/test-shop/account', '/test-shop/cart'],
    forbiddenHrefs: ['/test-shop/login', '/test-shop/register', '/test-shop/admin'],
    requiredClasses: ['nav-account-action', 'nav-signout-action'],
    forbiddenClasses: ['nav-signin', 'btn-primary', 'text-danger']
}, 'signed-in customer');
assert(mobileNav.innerHTML.includes(`aria-label="${window.I18n.t('account')}"`),
    'customer: account label must use the active language');
assert(mobileNav.innerHTML.includes(`aria-label="${window.I18n.t('signOut')}"`),
    'customer: sign-out label must use the active language');

window.I18n.set('de');
assert(mobileNav.innerHTML.includes(`aria-label="${window.I18n.t('account')}"`),
    'customer: account label must refresh after language change');
assert(mobileNav.innerHTML.includes(`aria-label="${window.I18n.t('signOut')}"`),
    'customer: sign-out label must refresh after language change');
assert(!mobileNav.innerHTML.includes('aria-label="Mijn account"'),
    'customer: stale Dutch account label must be removed');

window.Core.user = {id: 7, role: 'staff'};
window.Core.renderNav();
assertMobileActions({
    requiredHrefs: ['/test-shop/account', '/test-shop/admin'],
    forbiddenHrefs: ['/test-shop/login', '/test-shop/register', '/test-shop/cart'],
    requiredClasses: ['nav-account-action', 'text-danger', 'nav-signout-action'],
    forbiddenClasses: ['nav-signin', 'btn-primary', 'nav-cart']
}, 'staff');
assert(mobileNav.innerHTML.includes('Backoffice'), 'staff: backoffice action must be rendered');

window.I18n.set('fr');
assert(mobileNav.innerHTML.includes(`aria-label="${window.I18n.t('account')}"`),
    'staff: account label must refresh after language change');
assert(mobileNav.innerHTML.includes(`aria-label="${window.I18n.t('signOut')}"`),
    'staff: sign-out label must refresh after language change');
assert(!mobileNav.innerHTML.includes('aria-label="Mein Konto"'),
    'staff: stale German account label must be removed');

console.log('mobile account actions regression passed');