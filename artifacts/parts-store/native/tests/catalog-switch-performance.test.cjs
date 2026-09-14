const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '../public/assets/discovery-controls.js'),
    'utf8'
);
const css = fs.readFileSync(
    path.join(__dirname, '../public/assets/b2b-catalog.css'),
    'utf8'
);

let fetchCalls = 0;
let resolveRefresh;
const refreshRequest = new Promise(resolve => {
    resolveRefresh = resolve;
});
const context = vm.createContext({
    window: {
        APP_BASE: '/test-shop/',
        Core: {
            escapeHtml: String,
            fetch() {
                fetchCalls += 1;
                if (fetchCalls === 1) {
                    return Promise.resolve({categories: [{id: 1, name: 'Screens'}]});
                }
                return refreshRequest;
            },
        },
        Router: {add() {}},
        I18n: {t: key => key},
        ModelSearch: {rank: models => models},
    },
    document: {addEventListener() {}},
    URLSearchParams,
    URL,
    console,
});
vm.runInContext(source, context);
const discovery = context.window.Discovery;
let completed = false;
process.on('beforeExit', () => {
    if (!completed) {
        console.error('Catalogue switch performance assertions did not complete.');
        process.exitCode = 1;
    }
});

(async () => {
    const firstKey = discovery.catalogCacheKey('category=1');
    const first = await discovery.getCatalog('category=1', firstKey);

    const switchedKey = discovery.catalogCacheKey('category=2');
    let timeout;
    const switched = await Promise.race([
        discovery.getCatalog('category=2', switchedKey),
        new Promise((_, reject) => {
            timeout = setTimeout(
                () => reject(new Error('A catalogue context switch waited for metadata instead of reusing it.')),
                100
            );
        }),
    ]).finally(() => clearTimeout(timeout));
    assert.equal(switched, first, 'A new catalogue context must immediately reuse loaded metadata.');
    assert.equal(fetchCalls, 2, 'The reused snapshot must still start one background metadata refresh.');

    let inertChanges = 0;
    const resultAttributes = {};
    const results = {
        setAttribute(name, value) {
            resultAttributes[name] = value;
        },
        toggleAttribute() {
            inertChanges += 1;
        },
    };
    const shell = {
        classList: {toggle() {}},
        setAttribute() {},
        querySelector(selector) {
            if (selector === '[data-catalog-results]') return results;
            if (selector === '.catalog-refresh-progress') return {remove() {}};
            return null;
        },
        querySelectorAll() {
            return [];
        },
        prepend() {},
    };
    discovery.setCatalogRefreshing(shell, true);
    assert.equal(resultAttributes['aria-busy'], 'true');
    assert.equal(inertChanges, 0, 'Refreshing must not make existing results inert.');
    assert.doesNotMatch(
        source,
        /results\.toggleAttribute\(\s*['"]inert['"]/,
        'The refresh path must keep existing product controls interactive.'
    );
    assert.match(
        css,
        /\.is-catalog-refreshing\s+\[data-catalog-results\]\s*\{[^}]*opacity:\s*1\b/s,
        'Refreshing must keep existing results fully visible.'
    );

    resolveRefresh({categories: [{id: 2, name: 'Batteries'}]});
    await Promise.resolve();
    completed = true;
    console.log('catalogue switch performance test passed');
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});