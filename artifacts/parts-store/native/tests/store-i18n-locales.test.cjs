/* Focused buyer-store locale regression: dictionary keys used by store.js exist
 * for every supported locale and representative parameter interpolation works. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const document = {cookie: '', documentElement: {}, querySelectorAll: () => [], getElementById: () => null};
const sandbox = {
    window: {location: {search: ''}}, document,
    localStorage: {getItem: () => null, setItem: () => {}},
    navigator: {language: 'en'}, URLSearchParams, Intl, CustomEvent: function () {}
};
sandbox.window.window = sandbox.window;
vm.runInNewContext(fs.readFileSync('public/assets/i18n.js', 'utf8'), sandbox);
const keys = ['checkoutIntro', 'deliveryAddress', 'differentDeliveryAddress', 'addressLabelExample',
    'paymentMethod', 'calculatingQuote', 'quoteUpToDate', 'placeOrder', 'amountsChangedReview',
    'emailAddress', 'forgotPassword', 'requestReset', 'newPassword', 'saveSignIn',
    'enlargePhoto', 'stockCount', 'cartContext',
    'myAccount', 'personalDetails', 'addressSaved', 'removeAddressConfirm', 'orderNumber',
    'invoicePdf', 'packingSlipPdf', 'orderHistory', 'returnSubmitted', 'creditNotePdf',
    'totalCredited', 'screenBuyback', 'buybackIntro', 'buybackSubmitted', 'pdfDownloadFailed'];
// Buyer chrome must be explicit in every locale: silently falling through to English
// is especially easy to miss because I18n.t intentionally has an English fallback.
const invariant = new Set(['sku', 'postcode']);
const english = sandbox.window.I18n.dictionaries.en;
for (const locale of ['en', 'nl', 'de', 'fr', 'it']) {
    sandbox.window.I18n.locale = locale;
    for (const key of keys) assert.notStrictEqual(sandbox.window.I18n.t(key), key, `${locale} missing ${key}`);
    assert(!sandbox.window.I18n.t('stockCount', {count: 4}).includes('{count}'));
    assert(!sandbox.window.I18n.t('enlargePhoto', {name: 'SKU-42'}).includes('{name}'));
    assert(!sandbox.window.I18n.t('order', {number: 'SO-42'}).includes('{number}'));
    assert(!sandbox.window.I18n.t('quantityToReturn', {count: 3}).includes('{count}'));
    assert(!sandbox.window.I18n.t('pdfDownloadFailed', {message: 'network'}).includes('{message}'));
}
for (const locale of ['nl', 'de', 'fr', 'it']) {
    const dictionary = sandbox.window.I18n.dictionaries[locale];
    for (const [key, englishValue] of Object.entries(english)) {
        assert.notStrictEqual(dictionary[key], undefined, `${locale} missing explicit buyer key ${key}`);
        if (!invariant.has(key)) {
            assert.notStrictEqual(dictionary[key], englishValue, `${locale} falls back to English for ${key}`);
        }
    }
}
console.log('store and account buyer locale regression passed');

function loadI18n({languages = [], language = '', stored = null, cookie = '', query = ''} = {}) {
    const writes = [];
    const testDocument = {
        cookie,
        documentElement: {},
        querySelectorAll: () => [],
        getElementById: () => null,
        dispatchEvent: () => {}
    };
    const testWindow = {
        location: {search: query},
        navigator: {languages, language}
    };
    const context = {
        window: testWindow,
        document: testDocument,
        localStorage: {
            getItem: () => stored,
            setItem: (key, value) => writes.push([key, value])
        },
        URLSearchParams,
        Intl,
        CustomEvent: function () {}
    };
    testWindow.window = testWindow;
    vm.runInNewContext(fs.readFileSync('public/assets/i18n.js', 'utf8'), context);
    return {I18n: testWindow.I18n, writes, document: testDocument};
}

assert.strictEqual(loadI18n({languages: ['nl-NL', 'en-US']}).I18n.locale, 'nl',
    'a first visit follows the browser language');
assert.strictEqual(loadI18n({languages: ['de-CH'], stored: 'fr'}).I18n.locale, 'fr',
    'a manually stored choice overrides the browser language');
assert.strictEqual(loadI18n({languages: ['es-ES', 'it-IT']}).I18n.locale, 'it',
    'the first supported browser preference is selected');
assert.strictEqual(loadI18n({languages: ['es-ES']}).I18n.locale, 'en',
    'unsupported browser languages fall back to English');
const manual = loadI18n({languages: ['nl-NL']});
manual.I18n.set('de', false);
assert.strictEqual(manual.I18n.locale, 'de');
assert.strictEqual(manual.I18n.explicit, true);
assert.deepStrictEqual(manual.writes[0], ['ferry.storefront.locale', 'de']);
assert(manual.document.cookie.includes('ferry_storefront_locale=de'));

console.log('automatic and manual locale selection regression passed');