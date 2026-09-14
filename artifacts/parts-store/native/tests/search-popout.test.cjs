const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ordering = fs.readFileSync(path.join(__dirname, '../public/assets/b2b-ordering.js'), 'utf8');
const core = fs.readFileSync(path.join(__dirname, '../public/assets/core.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../public/assets/b2b-catalog.css'), 'utf8');

assert.match(ordering, /search-popout-close/, 'Search results need an obvious close action.');
assert.match(ordering, /data-search-scroll-cue/, 'Scrollable results need a visible scroll cue.');
assert.match(ordering, /container\.scrollHeight > container\.clientHeight/, 'The cue must only show when results actually overflow.');
assert.match(ordering, /activateSearchPopout\(container, input\)/, 'Opening results must visibly activate search mode.');
assert.match(ordering, /document\.body\.appendChild\(container\)/, 'The mobile popout must escape lower header stacking contexts.');
assert.match(core, /classList\.remove\('search-popout-enter', 'has-more-below'\)/, 'Closing results must clear the active popout state.');
assert.match(core, /parent\.insertBefore\(el, next\?\.parentNode === parent \? next : null\)/, 'Closing the mobile popout must restore it to its search surface.');
assert.match(css, /@keyframes search-popout-enter/, 'The result popout needs a clear opening motion.');
assert.match(css, /@keyframes active-search-rainbow/, 'Active search needs the requested animated border.');
assert.match(css, /scrollbar-color:/, 'Scrollable results need a visible scrollbar.');
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'Search animation must respect reduced-motion preferences.');

console.log('search popout regression passed');