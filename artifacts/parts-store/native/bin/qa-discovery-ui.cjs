const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({
    window: {
        APP_BASE: '/test-shop/', Core: {escapeHtml: String}, Router: {add() {}},
        I18n: {
            number: String,
            t(key, values = {}) {
                const labels = {allModels: 'All models', modelSearch: 'Search models', modelsWithParts: '{count} {models}', model: 'model', models: 'models', showAllModels: 'Show all {count} models', other: 'Other'};
                return (labels[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
            }
        },
        ModelSearch: {rank(models, query) { const q = String(query).toLowerCase().replace(/\s/g, ''); return models.filter(model => model.name.toLowerCase().replace(/\s/g, '').includes(q)); }}
    },
    document: {addEventListener() {}}, URLSearchParams, console
});
const discoverySource = fs.readFileSync(path.join(__dirname, '../public/assets/discovery-controls.js'), 'utf8');
vm.runInContext(discoverySource, context);
const discovery = context.window.Discovery;
const parse = (source, changes) => new URL(discovery.buildUrl(source, changes), 'https://example.test').searchParams;
let passed = 0;
function check(label, callback) { callback(); passed++; console.log('PASS:', label); }
check('sort is a real parameter and preserves search and device filters', () => {
    const result = parse('q=iphone13+scherm&category=1&brand=1&model=15&page=3', {sort: 'price_asc'});
    assert.equal(result.get('q'), 'iphone13 scherm');
    assert.equal(result.get('sort'), 'price_asc');
    assert.equal(result.get('category'), '1');
    assert.equal(result.get('brand'), '1');
    assert.equal(result.get('model'), '15');
    assert.equal(result.has('page'), false);
});
check('sort without existing query parameters works', () => assert.equal(parse('', {sort: 'stock'}).get('sort'), 'stock'));
check('changing brand removes stale model', () => assert.equal(parse('brand=1&model=15', {brand: 2}).has('model'), false));
check('removing brand also removes its model', () => {
    const result = parse('q=batterij&brand=1&model=15', {brand: ''});
    assert.equal(result.has('model'), false);
    assert.equal(result.get('q'), 'batterij');
});
check('a deliberately chosen brand/model pair survives', () => assert.equal(parse('brand=1&model=15', {brand: 2, model: 25}).get('model'), '25'));
check('removing a model keeps brand and other filters', () => {
    const result = parse('brand=1&model=15&category=1', {model: ''});
    assert.equal(result.get('brand'), '1');
    assert.equal(result.get('category'), '1');
});
check('pagination keeps sort and all filters', () => {
    const result = parse('q=x&brand=1&sort=name&stock=in_stock', {page: 2});
    assert.equal(result.get('page'), '2');
    assert.equal(result.get('sort'), 'name');
    assert.equal(result.get('stock'), 'in_stock');
});
check('catalogue omits manual sorting and keeps the product surface compact', () => {
    assert.doesNotMatch(discoverySource, /class="result-range"/);
    assert.doesNotMatch(discoverySource, /class="catalog-toolbar"/);
    assert.doesNotMatch(discoverySource, /id="catalog-sort"/);
    assert.match(discoverySource, /renderProductTable\(result\.products, \{productHeaderHtml: productHeader\}\)/);
});
check('the selected model context remains visibly identified above the catalogue', () => {
    assert.match(discoverySource, /class="catalog-table-model"/);
    assert.match(discoverySource, /\$\{escape\(device\)\}/);
    const navigationCss = fs.readFileSync(path.join(__dirname, '../public/assets/b2b-navigation.css'), 'utf8');
    assert.match(navigationCss, /\.catalog-table-model\s*\{/);
});
check('left and right catalogue headers use the same fixed height', () => {
    const navigationCss = fs.readFileSync(path.join(__dirname, '../public/assets/b2b-navigation.css'), 'utf8');
    const catalogueCss = fs.readFileSync(path.join(__dirname, '../public/assets/b2b-catalog.css'), 'utf8');
    assert.match(navigationCss, /\.catalog-sidebar-heading\s*\{[^}]*height:\s*56px[^}]*flex:\s*0 0 56px/s);
    assert.match(navigationCss, /\.catalog-sidebar\s*\{[^}]*gap:\s*0/s);
    assert.match(catalogueCss, /\.catalog-main > \.b2b-products \.b2b-table th\s*\{[^}]*height:\s*56px/s);
});
check('facet metadata cache key is shared by sort and pagination changes', () => {
    const base = discovery.catalogCacheKey('category=5&model=132&sort=name&page=3');
    assert.equal(base, discovery.catalogCacheKey('model=132&category=5&sort=stock&page=9'));
    assert.notEqual(base, discovery.catalogCacheKey('category=5&model=133'));
});
check('first catalogue load has a shaped shell and table-row skeletons', () => {
    const previousT = context.window.I18n.t;
    context.window.I18n.t = (key, values) => ({loadingParts: 'Onderdelen laden…', for: 'voor', catalogue: 'Catalogus', selectionApplied: 'Uw selectie wordt toegepast.'})[key] || previousT(key, values);
    const html = discovery.catalogSkeleton('family=iphone');
    assert.match(html, /data-catalog-shell/);
    assert.match(html, /catalog-sidebar/);
    assert.match(html, /catalog-skeleton-row/);
    assert.equal((html.match(/catalog-skeleton-toolbar"><i><\/i><\/div>/g) || []).length, 1);
    assert.match(html, /Onderdelen laden… voor iPhone/);
    assert.match(html, /role="status"/);
    assert.match(html, /catalog-skeleton-photo/);
});
check('department scope survives catalogue navigation and limits the category rail', () => {
    const result = parse('department=supplies&sort=name', {page: 2});
    assert.equal(result.get('department'), 'supplies');
    assert.equal(result.get('sort'), 'name');
    assert.match(discoverySource, /const departmentCategories = department \? groupedCategories\[department\] : catalog\.categories/);
    assert.match(discoverySource, /department === 'supplies' \? t\('supplies'\) : t\('allParts'\)/);
});
check('filter changes reset pagination', () => assert.equal(parse('page=9&sort=name', {quality: 'OLED'}).has('page'), false));
check('changing category removes a stale housing subtype', () => {
    const result = parse('category=5&part=frame&model=132&sort=name', {category: 1});
    assert.equal(result.has('part'), false);
    assert.equal(result.get('model'), '132');
    assert.equal(result.get('sort'), 'name');
});
check('all categories clears even an implicit housing subtype', () => assert.equal(parse('part=frame&model=132', {category: ''}).has('part'), false));
check('explicit type and parent survive together', () => assert.equal(parse('category=1&model=132', {category: 5, part: 'frame'}).get('part'), 'frame'));
check('sorting and pagination retain the exact part type', () => {
    assert.equal(parse('category=5&part=frame&model=132', {sort: 'price_asc'}).get('part'), 'frame');
    assert.equal(parse('category=5&part=frame&model=132', {page: 2}).get('part'), 'frame');
});
check('special characters cannot become extra query parameters', () => {
    const result = parse('', {q: 'A&B / "13" + Pro'});
    assert.equal(result.get('q'), 'A&B / "13" + Pro');
    assert.equal([...result].length, 1);
});
check('unsupported parameters are discarded', () => assert.equal(parse('redirect=https%3A%2F%2Fexample.test', {foo: 1}).size, 0));
check('small model groups remain selectable and wrong-brand models do not', () => {
    const models = discovery.modelOptions({models: [
        {id: 1, name: 'iPhone 9', brand_id: 1, count: 1},
        {id: 2, name: 'iPhone 10', brand_id: 1, count: 1},
        {id: 3, name: 'Galaxy S22', brand_id: 2, count: 8},
        {id: 4, name: 'iPhone 11', brand_id: 1, count: 0}
    ]}, '1');
    assert.deepEqual(Array.from(models, model => model.id), [1, 2]);
});
check('model picker starts compact and makes the full list deliberate', () => {
    const models = Array.from({length: 14}, (_, index) => ({
        id: index + 1, name: `iPhone ${index + 5}`, brand_id: 1, count: 1,
        family: 'iphone', family_group: `series-${index + 5}`, family_group_label: `${index + 5} Series`,
        sort_order: 202600000 - index, order_known: true
    }));
    const catalog = {models, brands: [{id: 1, name: 'Apple'}], device_families: [{id: 'iphone', label: 'iPhone'}]};
    const html = discovery.renderModelOptions(catalog, '', '');
    assert.equal((html.match(/data-model="\d+"/g) || []).length, 8);
    assert.match(html, /data-model-show-all/);
    assert.match(html, /Show all 14 models/);
    const expandedHtml = discovery.renderModelOptions(catalog, '', '', '', true);
    assert.equal((expandedHtml.match(/data-model="\d+"/g) || []).length, 14);
    assert.match(expandedHtml, />iPhone 5 Series</);
    assert.match(expandedHtml, />iPhone 6 Series</);
    assert.doesNotMatch(expandedHtml, /<h4[^>]*>[^<]*\s\d+\s*</, 'Generation headings never end in a loose count');
    assert.doesNotMatch(expandedHtml, /data-model-show-all/);
    const searchHtml = discovery.renderModelOptions(catalog, '', '', 'iphone18');
    assert.equal((searchHtml.match(/data-model="\d+"/g) || []).length, 1);
    assert.doesNotMatch(searchHtml, /data-model-show-all/);
});
check('the category rail asks for the thumbnail variant, not the full-size photo', () => {
    const html = discovery.categoryThumb({image_url: '/test-shop/media/products/7811/054abc-1280w.webp'});
    assert.match(html, /class="quick-category-thumb"/);
    assert.match(html, /054abc-320w\.webp/);
    assert.equal(html.includes('1280w'), false);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /alt=""/);
});
check('a category without a photo falls back to the glyph instead of a broken image', () => {
    assert.match(discovery.categoryThumb({}), /quick-category-thumb is-glyph/);
    assert.equal(discovery.categoryThumb({image_url: ''}).includes('<img'), false);
    assert.match(discovery.railGlyph(), /<svg/);
});
check('a legacy photo without a variant set never lands full size in the rail', () => {
    ['/test-shop/media/legacy/scherm.jpg', '/test-shop/media/legacy/scherm-1280w.png', 'https://elders.test/foto-1280w.webp?v=2'].forEach(url => {
        const html = discovery.categoryThumb({image_url: url});
        assert.equal(html.includes('<img'), false, `expected glyph for ${url}`);
        assert.match(html, /quick-category-thumb is-glyph/);
    });
});
console.log(`${passed} discovery UI navigation checks passed.`);