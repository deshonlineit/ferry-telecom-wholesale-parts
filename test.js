const dom = require('jsdom');
const { JSDOM } = dom;

const html = `<!DOCTYPE html><html><head></head><body></body></html>`;
const jsdom = new JSDOM(html);
const window = jsdom.window;
global.window = window;
global.document = window.document;

window.APP_BASE = '/test-shop/';
require('./artifacts/parts-store/native/public/assets/admin-shell.js');
console.log(window.Admin.layout('<h1>Test</h1>', 'dashboard'));
