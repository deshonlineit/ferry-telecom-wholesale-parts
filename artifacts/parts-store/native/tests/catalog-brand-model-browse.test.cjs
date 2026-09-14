const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const discovery = fs.readFileSync(path.join(__dirname, '../public/assets/discovery-controls.js'), 'utf8');
const models = fs.readFileSync(path.join(__dirname, '../public/assets/category-models.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/assets/category-models.css'), 'utf8');

assert.match(discovery, /return category\?\.slug === 'housing' \? D\.renderHousingBrowse/, 'Only Housing may render a dedicated category browse surface.');
assert.doesNotMatch(discovery, /category-brand-options|category-brand-choice/, 'Ordinary category pages must not duplicate brand and model filters above the products.');
assert.match(discovery, /cat\?\.slug === 'housing' \? \(hasExactCatalog/, 'Ordinary category pages must start directly with their products.');
assert.match(discovery, /if \(cat\?\.slug === 'housing' && !hasExactCatalog\)/, 'Only the Housing guide may request a second exact browse surface.');
assert.match(discovery, /renderHousingBrowse\(catalog, params, category\)/, 'Housing must use a dedicated guided model-to-part flow.');
assert.match(discovery, /housingReady\s*=\s*cat\?\.slug !== 'housing' \|\| Boolean\(params\.get\('model'\) && params\.get\('part'\)\)/, 'Housing products must wait for both model and part selections.');
assert.match(discovery, /data-housing-part-step/, 'Model selection must have a clear next-step focus target.');
assert.match(discovery, /if \(!form\) continue;/, 'Guided Housing state must not bind a filter form that is intentionally hidden.');
assert.match(discovery, /D\.catalogMetadata\.set\(key, \{data: exact, at: Date\.now\(\)\}\)/, 'Exact category facets must replace the shared snapshot.');
assert.match(discovery, /window\.umami\?\.track\(name, data\)/, 'Housing funnel analytics must be a safe no-op when Replit Analytics is unavailable.');
assert.match(discovery, /catch \(_\)[\s\S]*Catalogue navigation must never depend on analytics/, 'Analytics failures must never interrupt catalogue navigation.');
assert.match(models, /root\.closest\('\.housing-guide'\)[\s\S]*housing_guide_model_selected[\s\S]*model_family/, 'Housing model selection must record only its structured model family.');
assert.match(discovery, /housing_guide_part_selected[\s\S]*model_family[\s\S]*part_type/, 'Housing part selection must record structured model-family and part-type dimensions.');
assert.match(discovery, /housing_guide_results_viewed[\s\S]*model_family[\s\S]*part_type/, 'A completed Housing result view must close the queryable funnel with the same dimensions.');
assert.doesNotMatch(discovery + models, /housing_guide_[\s\S]{0,200}\b(query|search|customer|email)\s*:/, 'Housing funnel events must not include searches or customer data.');
assert.doesNotMatch(discovery, /['"]brand['"] in changes[^;\n]*delete\(['"]model['"]\)/, 'Product brand selection must preserve the compatible model.');
assert.match(models, /isSelected \|\| \(openFirst && index === 0\)/, 'The relevant model family must open without an extra click.');
assert.match(models, /SERIES_LIMIT = 5/, 'Model browsing must stay compact until a customer expands one series.');
assert.match(models, /data-category-series-all/, 'Each model series needs its own explicit expansion action.');
assert.match(models, /searchYourModel/, 'Model search must be presented as the primary route.');

const tracked = [];
const context = {
    window: {
        Core: {escapeHtml: value => String(value)},
        I18n: {t: key => key},
        umami: {track: (name, data) => tracked.push({name, data})},
        Router: {add() {}}
    },
    document: {addEventListener() {}},
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout
};
vm.runInNewContext(discovery, context);
let delegatedClick;
const root = {
    dataset: {},
    addEventListener(type, listener) {
        if (type === 'click') delegatedClick = listener;
    }
};
context.window.Discovery.bindHousingGuideAnalytics(root, 'iphone');
delegatedClick({
    target: {
        closest(selector) {
            assert.equal(selector, '[data-housing-part]');
            return {dataset: {housingPart: 'rear-glass'}};
        }
    }
});
assert.deepEqual(JSON.parse(JSON.stringify(tracked)), [{
    name: 'housing_guide_part_selected',
    data: {model_family: 'iphone', part_type: 'rear-glass'}
}], 'A Housing part inserted after the initial loading render must still emit the structured funnel event.');
context.window.umami.track = () => { throw new Error('analytics unavailable'); };
assert.doesNotThrow(() => delegatedClick({
    target: {closest: () => ({dataset: {housingPart: 'complete-housing'}})}
}), 'A failing analytics tracker must not interrupt delegated Housing navigation.');

const tracked = [];
const context = {
    window: {
        Core: {escapeHtml: value => String(value)},
        I18n: {t: key => key},
        umami: {track: (name, data) => tracked.push({name, data})},
        Router: {add() {}}
    },
    document: {addEventListener() {}},
    URLSearchParams,
    console,
    setTimeout,
    clearTimeout
};
vm.runInNewContext(discovery, context);
let delegatedClick;
const root = {
    dataset: {},
    addEventListener(type, listener) {
        if (type === 'click') delegatedClick = listener;
    }
};
context.window.Discovery.bindHousingGuideAnalytics(root, 'iphone');
delegatedClick({
    target: {
        closest(selector) {
            assert.equal(selector, '[data-housing-part]');
            return {dataset: {housingPart: 'rear-glass'}};
        }
    }
});
assert.deepEqual(JSON.parse(JSON.stringify(tracked)), [{
    name: 'housing_guide_part_selected',
    data: {model_family: 'iphone', part_type: 'rear-glass'}
}], 'A Housing part inserted after the initial loading render must still emit the structured funnel event.');
context.window.umami.track = () => { throw new Error('analytics unavailable'); };
assert.doesNotThrow(() => delegatedClick({
    target: {closest: () => ({dataset: {housingPart: 'complete-housing'}})}
}), 'A failing analytics tracker must not interrupt delegated Housing navigation.');

console.log('catalogue brand/model browse regression passed');