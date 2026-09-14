const assert = require('assert');
const fs = require('fs');
const path = require('path');

const asset = name => fs.readFileSync(path.resolve(__dirname, '..', 'public', 'assets', name), 'utf8');
const css = asset('b2b-navigation.css');
const menu = asset('b2b-menu.js');

const rule = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
    assert(match, `Missing CSS rule for ${selector}`);
    return match[1];
};

const overlay = rule('body:not(:has(.admin-shell)) .b2b-dropdown-overlay');
assert(/\bheight:\s*auto\b/.test(overlay), 'Desktop dropdown must grow to its full content height');
assert(!/\bheight:\s*(?:min|max|clamp|calc)\(/.test(overlay), 'Desktop dropdown must not use a viewport-capped height');

const models = rule('body:not(:has(.admin-shell)) .b2b-mega-models');
assert(/\boverflow:\s*visible\b/.test(models), 'Model section must use page scrolling');
assert(!/\boverflow-y:\s*auto\b/.test(models), 'Model section must not own a vertical scrollbar');

const seriesLinks = rule('body:not(:has(.admin-shell)) .b2b-model-series-group .b2b-model-links');
assert(/\bmax-height:\s*none\b/.test(seriesLinks), 'Model groups must grow to their full content height');
assert(/\boverflow-y:\s*visible\b/.test(seriesLinks), 'Model groups must not own a vertical scrollbar');

const heading = rule('body:not(:has(.admin-shell)) .b2b-mega-heading');
assert(/\bposition:\s*sticky\b/.test(heading), 'Desktop close controls must stay reachable while the page scrolls');

const openHeader = rule('body:not(:has(.admin-shell)):has(.b2b-nav-item.is-open) .app-header');
assert(/\bposition:\s*relative\b/.test(openHeader), 'An open desktop menu must move with the document instead of remaining pinned');

assert(!/revealOnBrowse/.test(menu),
    'Scrolling or swiping must never expand the complete model catalogue.');
assert(/data-model-series-expand/.test(menu),
    'Customers need an explicit per-series action to reveal older models.');
assert(/status = t\('chooseSeriesOrSearch'/.test(menu),
    'Grouped model menus must explain that customers can search or open one series.');

console.log('menu page-scroll regression passed');