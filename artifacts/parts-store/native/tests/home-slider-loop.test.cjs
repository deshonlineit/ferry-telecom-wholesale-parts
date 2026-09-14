const assert = require('assert');
const fs = require('fs');
const path = require('path');

const asset = name => fs.readFileSync(path.resolve(__dirname, '..', 'public', 'assets', name), 'utf8');
const css = asset('home-landing.css');
const js = asset('home-landing.js');

const sliderRule = css.match(/\.lp-product-slider\s*\{([^}]+)\}/)?.[1] || '';
assert(/\bdisplay:\s*flex\b/.test(sliderRule), 'Homepage slider must use a transformable flex track');
assert(!/\boverflow-x:\s*auto\b/.test(sliderRule), 'Homepage slider must not be a native horizontal scroller');
assert(!/\bscrollbar-width\b/.test(sliderRule), 'Homepage slider must not render a scrollbar');
assert(/slideProducts\(track,\s*direction\)/.test(js), 'Homepage slider needs a loop controller');
assert(/track\.append\(first\)/.test(js), 'Next must recycle the first card to the end');
assert(/track\.prepend\(last\)/.test(js), 'Previous must recycle the last card to the start');
assert(!/track\.scrollBy\(/.test(js), 'Slider controls must not use fixed-width scrollBy');

console.log('homepage infinite slider regression passed');