const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const discovery = fs.readFileSync(path.join(__dirname, '../public/assets/discovery-controls.js'), 'utf8');
const header = fs.readFileSync(path.join(__dirname, '../public/index.php'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/assets/b2b-catalog.css'), 'utf8');

const localSearch = discovery.match(/<section class="model-part-search"[\s\S]*?<\/section>/)?.[0] || '';
assert(localSearch, 'A selected model needs its own local part search.');
assert.match(discovery, /\$\{model && housingReady \? `<section class="model-part-search"/, 'The local search must only appear for an exact selected model.');
assert.match(localSearch, /new URLSearchParams\(window\.location\.search\)/, 'Local search must preserve the selected model and existing scope.');
assert.match(localSearch, /\{q: this\.q\.value\.trim\(\), page: ''\}/, 'Local search must only refine the query and reset pagination.');
assert.doesNotMatch(localSearch, /handleSearchInput|handleSearchFocus|search-suggestions/, 'Local model search must never open global Smart Search.');
assert.match(header, /data-i18n="searchAllProducts"/, 'The header search must clearly describe its whole-catalogue scope.');
assert.match(css, /\.model-part-search/, 'The local model search needs a visually distinct surface.');

console.log('model local search regression passed');