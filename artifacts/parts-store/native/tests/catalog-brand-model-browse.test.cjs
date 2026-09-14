const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
assert.doesNotMatch(discovery, /['"]brand['"] in changes[^;\n]*delete\(['"]model['"]\)/, 'Product brand selection must preserve the compatible model.');
assert.match(models, /isSelected \|\| \(openFirst && index === 0\)/, 'The relevant model family must open without an extra click.');
assert.match(models, /SERIES_LIMIT = 5/, 'Model browsing must stay compact until a customer expands one series.');
assert.match(models, /data-category-series-all/, 'Each model series needs its own explicit expansion action.');
assert.match(models, /searchYourModel/, 'Model search must be presented as the primary route.');

console.log('catalogue brand/model browse regression passed');