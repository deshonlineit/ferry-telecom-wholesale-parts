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