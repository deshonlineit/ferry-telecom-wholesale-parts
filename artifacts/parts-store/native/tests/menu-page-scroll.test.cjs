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

assert(/overlay\.addEventListener\('wheel',\s*revealOnBrowse,\s*\{passive:\s*true\}\)/.test(menu),
    'A wheel gesture must reveal all models without cancelling page scroll');
assert(/overlay\.addEventListener\('touchmove',\s*revealOnBrowse,\s*\{passive:\s*true\}\)/.test(menu),
    'A touch gesture must reveal all models without cancelling page scroll');

console.log('menu page-scroll regression passed');