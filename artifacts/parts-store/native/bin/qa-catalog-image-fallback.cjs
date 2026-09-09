const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(
  new URL('../public/assets/b2b-catalog.js', `file://${__filename}`),
  'utf8',
);

const window = {
  APP_BASE: '/test-shop/',
  Core: {
    escapeHtml: (value) => String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;'),
    user: null,
    formatMoney: () => '',
  },
  I18n: {
    t: (key) => key,
    number: (value) => String(value),
  },
  App: {
    canOrderProduct: () => false,
    thumbnailUrl: ({ url }) => url,
  },
};

vm.runInNewContext(source, { window });

const base = {
  id: 1,
  sku: 'TEST',
  quality: '',
  stock: 0,
  price_cents: null,
  currency: 'CHF',
  minimum_quantity: 1,
  models: [],
};

const fallback = window.App.renderProductTable([
  { ...base, name: 'Original Battery for iPhone', image_url: '', part_type: { name: 'Batteries' } },
]);
if (!fallback.includes('data-fallback-kind="battery"') || !fallback.includes('/test-shop/products/1')) {
  throw new Error('Missing battery image must render a linked battery illustration.');
}

const real = window.App.renderProductTable([
  { ...base, name: 'Real product', image_url: '/test-shop/media/products/1/photo-1280w.webp' },
]);
if (!real.includes('<img ') || real.includes('data-fallback-kind=')) {
  throw new Error('A real product image must never be replaced by a fallback illustration.');
}

console.log('PASS: missing catalogue photos use part-specific fallbacks without replacing real photos.');