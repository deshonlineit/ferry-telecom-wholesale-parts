/* Catalog navigation and device selection. Kept separate from buying flows. */
(function () {
    const escape = window.Core.escapeHtml;
    const allowed = ['q', 'category', 'part', 'brand', 'device_brand', 'family', 'model', 'quality', 'stock', 'featured', 'sort', 'page', 'limit'];
    const getParams = value => new URLSearchParams(value instanceof URLSearchParams ? value.toString() : value || '');
    const D = window.Discovery = {
        buildUrl(params, changes = {}) {
            const next = getParams(params);
            for (const key of [...next.keys()]) if (!allowed.includes(key)) next.delete(key);
            for (const [key, value] of Object.entries(changes)) {
                if (!allowed.includes(key)) continue;
                if (value === '' || value === null || value === undefined || value === false) next.delete(key);
                else next.set(key, String(value));
            }
            if ('brand' in changes && String(changes.brand || '') !== String(getParams(params).get('brand') || '') && !('model' in changes)) next.delete('model');
            if ('family' in changes && String(changes.family || '') !== String(getParams(params).get('family') || '') && !('model' in changes)) next.delete('model');
            // A different device brand invalidates a family or model from the previous brand.
            if ('device_brand' in changes && String(changes.device_brand || '') !== String(getParams(params).get('device_brand') || '')) {
                if (!('model' in changes)) next.delete('model');
                if (!('family' in changes)) next.delete('family');
            }
            if ('category' in changes && !('part' in changes) && (!changes.category || String(changes.category) !== String(getParams(params).get('category') || ''))) next.delete('part');
            if (Object.keys(changes).some(key => key !== 'page')) next.delete('page');
            return window.APP_BASE + 'catalog' + (next.size ? '?' + next.toString() : '');
        },
        modelOptions(catalog, brand, selected = '') {
            return catalog.models.filter(model => (!brand || String(model.brand_id) === String(brand)) && (model.count > 0 || String(model.id) === String(selected)))
                .sort((a, b) => a.name.localeCompare(b.name, 'en', {numeric: true}));
        },
        renderDeviceFields(catalog, params, prefix) {
            params = getParams(params);
            const brand = params.get('brand') || '';
            const model = catalog.models.find(item => String(item.id) === params.get('model'));
            const category = params.get('category') || '';
            return `<div class="device-fields">
                <div class="field"><label for="${prefix}-brand">Brand</label>
                    <select id="${prefix}-brand" name="brand" class="form-control"><option value="">All brands</option>
                    ${catalog.brands.filter(b => b.count > 0 || String(b.id) === brand).map(b => `<option value="${b.id}" ${String(b.id) === brand ? 'selected' : ''}>${escape(b.name)} (${b.count})</option>`).join('')}</select></div>
                <div class="field"><label id="${prefix}-model-label">Model</label>
                    <input type="hidden" name="model" value="${model?.id || ''}">
                    <details class="model-picker">
                        <summary class="form-control" aria-labelledby="${prefix}-model-label ${prefix}-model-caption"><span id="${prefix}-model-caption" class="model-caption">${escape(model?.name || 'All models')}</span><span aria-hidden="true">⌄</span></summary>
                        <div class="model-picker-popover">
                            <input class="form-control model-search" type="search" placeholder="Search, for example, iPhone 13" aria-label="Search models" autocomplete="off">
                            <div class="model-options">${D.renderModelOptions(catalog, brand, model?.id || '')}</div>
                            <p class="model-empty" hidden>No matching model. Try another search term or change the category.</p>
                        </div>
                    </details>
                </div>
                <div class="field"><label for="${prefix}-category">Part</label><select id="${prefix}-category" name="category" class="form-control"><option value="">All parts</option>
                    ${window.App.sortCategories(catalog.categories).filter(c => c.count > 0 || String(c.id) === category).map(c => `<option value="${c.id}" ${String(c.id) === category ? 'selected' : ''}>${escape(c.name)} (${c.count})</option>`).join('')}
                </select></div>
                <div class="field part-type-field" ${!(catalog.part_types || []).some(type => !category || String(type.category_id) === category) ? 'hidden' : ''}><label for="${prefix}-part">Part type</label><select id="${prefix}-part" name="part" class="form-control"><option value="">All types</option>${(catalog.part_types || []).filter(type => !category || String(type.category_id) === category).map(type => `<option value="${escape(type.id)}" ${type.id === params.get('part') ? 'selected' : ''}>${escape(type.name)} (${type.count})</option>`).join('')}</select></div>
            </div>`;
        },
        // The rail shows the real part photo the category already carries; the 320w variant keeps it light.
        railGlyph() {
            return '<span class="quick-category-thumb is-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg></span>';
        },
        categoryThumb(category) {
            const image = String(category?.image_url || '');
            // Legacy uploads carry no variant set; the glyph is cheaper than pulling a full-size file into a 38px circle.
            if (!image.endsWith('-1280w.webp')) return D.railGlyph();
            return `<span class="quick-category-thumb" aria-hidden="true"><img src="${escape(image.replace('-1280w.webp', '-320w.webp'))}" alt="" width="48" height="48" loading="lazy" decoding="async"></span>`;
        },
        renderModelOptions(catalog, brand, selected) {
            return `<button type="button" class="model-option" data-model="" data-name="All models">All models</button>` +
                D.modelOptions(catalog, brand, selected).map(model => `<button type="button" class="model-option ${String(model.id) === String(selected) ? 'selected' : ''}" data-model="${model.id}" data-brand="${model.brand_id}" data-name="${escape(model.name)}"><span>${escape(model.name)}</span><small>${model.count}</small></button>`).join('');
        },
        bindDeviceFields(form, initialCatalog, {onChange} = {}) {
            let catalog = initialCatalog;
            let sequence = 0;
            const brand = form.elements.namedItem('brand');
            const model = form.elements.namedItem('model');
            const category = form.elements.namedItem('category');
            const part = form.elements.namedItem('part');
            const picker = form.querySelector('.model-picker');
            const search = form.querySelector('.model-search');
            const options = form.querySelector('.model-options');
            const caption = form.querySelector('.model-caption');
            const values = () => Object.fromEntries(new FormData(form));
            const filterModels = () => {
                const term = search.value.toLocaleLowerCase().replace(/\s/g, '');
                let visible = 0;
                options.querySelectorAll('[data-model]').forEach(button => {
                    const match = !term || button.dataset.name.toLocaleLowerCase().replace(/\s/g, '').includes(term);
                    button.hidden = !match;
                    if (match) visible++;
                });
                form.querySelector('.model-empty').hidden = visible > 0;
            };
            search.addEventListener('input', filterModels);
            search.addEventListener('keydown', event => {
                if (event.key === 'Enter') { event.preventDefault(); options.querySelector('button:not([hidden])')?.click(); }
                if (event.key === 'ArrowDown') { event.preventDefault(); options.querySelector('button:not([hidden])')?.focus(); }
            });
            picker.addEventListener('toggle', () => { if (picker.open) { search.value = ''; filterModels(); search.focus(); } });
            picker.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); picker.open = false; picker.querySelector('summary').focus(); }
            });
            form.addEventListener('click', event => {
                const choice = event.target.closest('[data-model]');
                if (!choice) return;
                model.value = choice.dataset.model;
                if (choice.dataset.brand) brand.value = choice.dataset.brand;
                caption.textContent = choice.dataset.name;
                picker.open = false;
                picker.querySelector('summary').focus();
                model.dispatchEvent(new Event('change', {bubbles: true}));
            });
            form.addEventListener('change', async event => {
                if (event.target === category && part) part.value = '';
                if (event.target === brand) {
                    model.value = '';
                    caption.textContent = 'All models';
                    options.innerHTML = D.renderModelOptions(catalog, brand.value, '');
                }
                if (onChange && onChange(values()) === false) return;
                if (!['brand', 'model', 'category', 'part', 'quality', 'stock'].includes(event.target.name)) return;
                const version = ++sequence;
                const context = getParams(form.dataset.context || '');
                if (form.elements.namedItem('stock') && !form.elements.namedItem('stock').checked) context.delete('stock');
                for (const [key, value] of Object.entries(values())) {
                    if (!allowed.includes(key)) continue;
                    if (value) context.set(key, value); else context.delete(key);
                }
                try {
                    const next = await window.Core.fetch('/catalog?' + context.toString());
                    if (version !== sequence || !form.isConnected) return;
                    catalog = next;
                    options.innerHTML = D.renderModelOptions(catalog, brand.value, model.value);
                    filterModels();
                    const selectedCategory = category.value;
                    category.innerHTML = '<option value="">All parts</option>' + window.App.sortCategories(next.categories)
                        .filter(c => c.count > 0 || String(c.id) === selectedCategory)
                        .map(c => `<option value="${c.id}" ${String(c.id) === selectedCategory ? 'selected' : ''}>${escape(c.name)} (${c.count})</option>`).join('');
                    if (part) {
                        const selectedPart = part.value;
                        const types = (next.part_types || []).filter(type => !selectedCategory || String(type.category_id) === selectedCategory);
                        part.innerHTML = '<option value="">All types</option>' + types.map(type => `<option value="${escape(type.id)}" ${type.id === selectedPart ? 'selected' : ''}>${escape(type.name)} (${type.count})</option>`).join('');
                        form.querySelector('.part-type-field').hidden = !types.length;
                    }
                } catch (error) {
                    if (form.isConnected) {
                        let notice = form.querySelector('.facet-error');
                        if (!notice) { notice = document.createElement('p'); notice.className = 'facet-error text-danger small'; form.appendChild(notice); }
                        notice.textContent = 'The available options could not be refreshed. You can still apply your selection.';
                    }
                }
            });
        }
    };

    document.addEventListener('click', event => {
        document.querySelectorAll('.model-picker[open]').forEach(picker => {
            if (!picker.contains(event.target)) picker.open = false;
        });
    });

    window.Router.add(/^catalog$/, async (match, root, input) => {
        const renderVersion = window.Router.renderVersion;
        const params = getParams(input);
        const headerSearch = document.getElementById('search-input');
        if (headerSearch) headerSearch.value = params.get('q') || '';
        root.innerHTML = '<div class="page-loader" role="status"><div class="spinner"></div><p>Loading parts…</p></div>';
        try {
            const [catalog, result] = await Promise.all([
                window.Core.fetch('/catalog?' + params.toString()),
                window.Core.fetch('/products?' + params.toString())
            ]);
            if (renderVersion !== window.Router.renderVersion) return;
            const part = (catalog.part_types || []).find(type => type.id === params.get('part'));
            const cat = catalog.categories.find(c => String(c.id) === (params.get('category') || String(part?.category_id || '')));
            const brand = catalog.brands.find(b => String(b.id) === params.get('brand'));
            const deviceBrand = catalog.brands.find(b => String(b.id) === params.get('device_brand'));
            const model = catalog.models.find(m => String(m.id) === params.get('model'));
            const family = (catalog.device_families || []).find(item => item.id === params.get('family'));
            if (model) window.FastFinder.remember(model);
            const query = params.get('q') || '';
            const categoryName = cat?.slug === 'housing' ? 'Housing & parts' : cat?.name;
            const subject = part?.name || categoryName || 'Parts';
            const device = model?.name || family?.label || deviceBrand?.name || '';
            const title = device ? `${subject} for ${device}` : (part?.name || categoryName || (query ? 'Search results' : 'All parts'));
            const showCategoryModels = true;
            const chips = [
                query && ['q', `“${query}”`], cat && ['category', categoryName], part && ['part', part.name],
                deviceBrand && ['device_brand', deviceBrand.name], family && ['family', family.label], brand && ['brand', brand.name],
                model && ['model', model.name], params.get('quality') && ['quality', params.get('quality')],
                params.get('stock') && ['stock', params.get('stock') === 'out_of_stock' ? 'Temporarily out of stock' : 'In stock'],
                params.get('featured') && ['featured', 'Featured']
            ].filter(Boolean);
            const removeLink = ([key, label]) => `<a class="filter-chip" href="${D.buildUrl(params, {[key]: ''})}" aria-label="Remove ${escape(label)}">${escape(label)}<span aria-hidden="true">×</span></a>`;
            const filterForm = (prefix, mobile = false) => `<form class="discovery-filters" id="${prefix}-filters" data-context="${escape(params.toString())}">
                ${D.renderDeviceFields(catalog, params, prefix)}
                <details class="advanced-filters" ${params.get('quality') || params.get('stock') ? 'open' : ''}><summary>More filters <small>Optional</small></summary>
                    <div class="field"><label for="${prefix}-quality">Type / quality</label><select name="quality" id="${prefix}-quality" class="form-control"><option value="">All types</option>
                    ${[...new Set([...catalog.qualities, params.get('quality')].filter(Boolean))].map(q => `<option ${q === params.get('quality') ? 'selected' : ''} value="${escape(q)}">${escape(q)}</option>`).join('')}</select></div>
                    <label class="check-label"><input type="checkbox" name="stock" value="in_stock" ${params.get('stock') === 'in_stock' || params.get('stock') === '1' ? 'checked' : ''}> In stock only</label>
                </details>
                ${mobile ? '<div class="filter-dialog-actions"><button type="button" class="btn btn-outline" data-reset-filters>Clear</button><button type="submit" class="btn btn-primary">View results</button></div>' : '<p class="filter-auto-hint">Your selection is applied immediately.</p>'}
            </form>`;
            let view = 'list';
            try { view = localStorage.getItem('view_pref') || 'list'; } catch (_) {}
            if (!['grid', 'list'].includes(view)) view = 'list';
            const sort = params.get('sort') || (query ? 'relevance' : 'featured');
            const pages = result.pages;
            const page = result.page;
            const numbered = [...new Set([1, Math.max(1, page - 1), page, Math.min(pages, page + 1), pages])].sort((a, b) => a - b);
            const pagination = pages > 1 ? `<nav class="catalog-pagination" aria-label="Pages">${page > 1 ? `<a class="btn btn-outline" href="${D.buildUrl(params, {page: page - 1})}">Previous</a>` : ''}${numbered.map((n, i) => `${i && n > numbered[i - 1] + 1 ? '<span>…</span>' : ''}<a class="btn ${n === page ? 'btn-primary' : 'btn-outline'}" ${n === page ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {page: n})}">${n}</a>`).join('')}${page < pages ? `<a class="btn btn-outline" href="${D.buildUrl(params, {page: page + 1})}">Next</a>` : ''}</nav>` : '';
            const quickNames = {screens: 'LCDs & screens', batteries: 'Batteries', charging: 'Charging ports', cameras: 'Cameras', housing: 'Housing & parts', flex: 'Flex cables', audio: 'Audio', adhesive: 'Adhesive'};
            const quickCategories = window.App.sortCategories(catalog.categories).filter(c => c.count > 0 || String(c.id) === params.get('category'));
            const partTypes = cat?.slug === 'housing' ? (catalog.part_types || []).filter(type => String(type.category_id) === String(cat.id)) : [];
            const typePicker = partTypes.length ? `<section class="part-type-picker" aria-label="Which part do you need?"><div class="part-type-intro"><span>Which part?</span><small>Not every item is a complete housing.</small></div><nav class="part-type-options" aria-label="Housing part type"><a class="part-type-option ${!part ? 'active' : ''}" ${!part ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {part: ''})}"><strong>All</strong><small>All variants</small></a>${partTypes.map(type => `<a class="part-type-option ${type.id === part?.id ? 'active' : ''} ${type.count === 0 ? 'is-empty' : ''}" ${type.id === part?.id ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: cat.id, part: type.id})}" title="${escape(type.description)}"><span><strong>${escape(type.name)}</strong><b>${type.count}</b></span><small>${escape(type.description)}</small></a>`).join('')}</nav></section>` : '';
            root.innerHTML = `<div class="catalog-breadcrumb"><a href="${window.APP_BASE}">Home</a><span>/</span><a href="${D.buildUrl('')}">Catalogue</a>${cat ? `<span>/</span><span>${escape(cat.name)}</span>` : ''}</div>
                <div class="catalog-heading"><div><span class="catalog-eyebrow">Exactly the right part</span><h1>${escape(title)}</h1><p class="catalog-description">${result.total.toLocaleString('en-GB')} ${result.total === 1 ? 'part' : 'parts'}${query ? ` for “${escape(query)}”` : ''}</p></div>${showCategoryModels ? '' : window.FastFinder.inline(params, model)}</div>
                <section class="catalog-smart-search" data-catalog-smart-search aria-label="Smart Search" hidden>
                    <div class="catalog-smart-intro"><strong>Smart search</strong><span>Describe what you need in your own words</span></div>
                    <form class="catalog-smart-form" role="search" data-search-root onsubmit="event.preventDefault(); window.Router.navigate(window.Discovery.buildUrl(new URLSearchParams(window.location.search), {q: this.q.value})); window.UI.closeSuggestions();">
                        <div class="catalog-smart-field">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/></svg>
                            <input type="search" id="catalog-smart-search" name="q" value="${escape(query)}" placeholder="Ask for any model, part, colour or quality…" aria-label="Describe the part you need" role="combobox" aria-autocomplete="list" aria-haspopup="dialog" aria-expanded="false" aria-controls="catalog-smart-search-suggestions" autocomplete="off" oninput="window.App.handleSearchInput(this.value, 'catalog-smart-search')" onfocus="window.App.handleSearchFocus('catalog-smart-search')" onkeydown="window.App.handleSearchKeydown(event)">
                            <button type="submit">Smart search</button>
                        </div>
                        <div id="catalog-smart-search-suggestions" class="search-suggestions b2b-search-results" role="dialog" aria-label="Smart Search results" style="display:none;"></div>
                    </form>
                </section>
                <nav class="quick-categories" aria-label="Choose a part quickly"><a class="quick-category ${!cat ? 'active' : ''}" ${!cat ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: ''})}">${D.railGlyph()}<span>All parts</span></a>${quickCategories.map(c => `<a class="quick-category ${c.id === cat?.id ? 'active' : ''}" ${c.id === cat?.id ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: c.id, part: ''})}">${D.categoryThumb(c)}<span>${escape(quickNames[c.slug] || c.name)}</span><small>${c.count}</small></a>`).join('')}</nav>
                ${typePicker}
                ${showCategoryModels ? window.CategoryModels.render(catalog, params, part?.name || categoryName || 'Your search') : ''}
                <div class="catalog-layout">
                    <section class="catalog-main" data-catalog-results tabindex="-1" aria-label="Product results">
                        <div class="catalog-refine-row">${showCategoryModels ? '' : `<label class="catalog-tool-field">Brand<select id="catalog-brand" class="form-control"><option value="">All brands</option>${catalog.brands.filter(b => b.count > 0 || String(b.id) === params.get('brand')).map(b => `<option value="${b.id}" ${String(b.id) === params.get('brand') ? 'selected' : ''}>${escape(b.name)}</option>`).join('')}</select></label>`}
                        <label class="catalog-tool-field">Quality<select id="quick-quality" class="form-control"><option value="">All qualities</option>${[...new Set([...catalog.qualities, params.get('quality')].filter(Boolean))].map(q => `<option value="${escape(q)}" ${q === params.get('quality') ? 'selected' : ''}>${escape(q)}</option>`).join('')}</select></label>
                        <button type="button" class="stock-shortcut ${params.get('stock') === 'in_stock' ? 'active' : ''}" data-stock-toggle aria-pressed="${params.get('stock') === 'in_stock'}">In stock</button>
                        <button type="button" class="btn btn-outline" id="open-catalog-filters">All filters${chips.length ? ` (${chips.length})` : ''}</button></div>
                        ${chips.length ? `<div class="active-filters">${chips.map(removeLink).join('')}<a class="clear-filters" href="${D.buildUrl('')}">Clear</a></div>` : ''}
                        <div class="catalog-toolbar"><span class="result-range">${result.total ? `${(page - 1) * (Number(params.get('limit')) || 24) + 1}–${Math.min(page * (Number(params.get('limit')) || 24), result.total)} of ${result.total.toLocaleString('en-GB')}` : 'No results'}</span>
                            <div class="catalog-sort"><label for="catalog-sort">Sort by</label><select id="catalog-sort" class="form-control">
                                <option value="${query ? 'relevance' : 'featured'}" ${['featured','relevance'].includes(sort) ? 'selected' : ''}>${query ? 'Best match' : 'Featured first'}</option>
                                <option value="name" ${sort === 'name' ? 'selected' : ''}>Name A–Z</option><option value="newest" ${sort === 'newest' ? 'selected' : ''}>Recently added</option>
                                <option value="stock" ${sort === 'stock' ? 'selected' : ''}>Most stock</option>
                                ${window.Core.user ? `<option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>Price low–high</option><option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>Price high–low</option>` : ''}
                            </select></div>
                        </div>
                        ${!window.Core.user ? `<div class="catalog-price-notice"><span>Want to see your customer prices?</span><a href="${window.APP_BASE}login">Sign in →</a></div>` : ''}
                        ${result.products.length ? window.App.renderProductTable(result.products) : `<div class="empty-state"><h2>${part ? 'No ' + escape(part.name.toLocaleLowerCase('en')) + ' in this selection' : 'No parts match this combination'}</h2><p>${part ? escape(part.description) + ' Choose another model or view the other variants.' : 'Remove a filter or try another search term.'}</p><a class="btn btn-outline" href="${part ? D.buildUrl(params, {part: ''}) : D.buildUrl('')}">${part ? 'View other variants' : 'View all parts'}</a></div>`}${pagination}
                    </section>
                </div>
                <dialog id="catalog-filter-dialog" class="filter-dialog"><div class="filter-dialog-heading"><h2>Refine your selection</h2><button type="button" class="btn-close" aria-label="Close filters">×</button></div>${filterForm('mobile', true)}</dialog>
                <dialog id="device-finder-dialog" class="finder-dialog" aria-label="Choose another model"><button type="button" class="btn-close" data-close-finder aria-label="Close model selection">×</button><div data-finder-body></div></dialog>`;
            const apply = form => {
                const changes = Object.fromEntries(new FormData(form));
                if (!changes.stock) changes.stock = '';
                window.Router.navigate(D.buildUrl(params, changes));
            };
            for (const prefix of ['mobile']) {
                const form = document.getElementById(prefix + '-filters');
                D.bindDeviceFields(form, catalog, prefix === 'desktop' ? {onChange() { apply(form); return false; }} : {});
                form.addEventListener('submit', event => {
                    event.preventDefault();
                    document.getElementById('catalog-filter-dialog').close();
                    apply(form);
                });
            }
            document.getElementById('catalog-brand')?.addEventListener('change', event => window.Router.navigate(D.buildUrl(params, {brand: event.target.value})));
            window.CategoryModels.bind(root.querySelector('[data-category-models]'), catalog, params);
            if (D.focusResultsAfterModel) {
                D.focusResultsAfterModel = false;
                const results = root.querySelector('[data-catalog-results]');
                results.focus({preventScroll: true});
                results.scrollIntoView({block: 'start'});
            }
            document.getElementById('quick-quality').addEventListener('change', event => window.Router.navigate(D.buildUrl(params, {quality: event.target.value})));
            root.querySelector('[data-stock-toggle]').addEventListener('click', () => window.Router.navigate(D.buildUrl(params, {stock: params.get('stock') === 'in_stock' ? '' : 'in_stock'})));
            document.getElementById('catalog-sort').addEventListener('change', event => window.Router.navigate(D.buildUrl(params, {sort: event.target.value})));
            const dialog = document.getElementById('catalog-filter-dialog');
            const opener = document.getElementById('open-catalog-filters');
            opener.addEventListener('click', () => dialog.showModal());
            dialog.querySelector('.btn-close').addEventListener('click', () => dialog.close());
            dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
            dialog.addEventListener('close', () => opener.focus());
            dialog.querySelector('[data-reset-filters]').addEventListener('click', () => {
                dialog.close();
                window.Router.navigate(D.buildUrl(''));
            });
            const finderDialog = root.querySelector('#device-finder-dialog');
            const finderOpener = root.querySelector('[data-change-device]');
            if (finderOpener) {
            let choicesPromise;
            const loadChoices = () => {
                if (!choicesPromise) {
                    const context = getParams(params);
                    ['model', 'brand', 'q', 'page'].forEach(key => context.delete(key));
                    choicesPromise = window.Core.fetch('/catalog?' + context.toString()).catch(error => { choicesPromise = null; throw error; });
                }
                return choicesPromise;
            };
            window.FastFinder.bindInline(root.querySelector('[data-inline-model]'), catalog, params, loadChoices);
            let finderReady = false;
            finderOpener.addEventListener('click', async () => {
                finderDialog.showModal();
                if (finderReady) return;
                finderReady = true;
                const body = finderDialog.querySelector('[data-finder-body]');
                body.innerHTML = '<div class="page-loader" role="status">Loading models…</div>';
                try {
                    const choices = await loadChoices();
                    if (!root.isConnected) return;
                    body.innerHTML = window.FastFinder.render(choices, params, 'catalog');
                    window.FastFinder.bind(body.querySelector('[data-fast-finder]'), choices, params);
                    finderReady = true;
                    if (finderDialog.open) body.querySelector('.finder-model-search input').focus();
                } catch (error) {
                    finderReady = false;
                    if (root.isConnected) body.innerHTML = `<p class="alert error">${escape(error.message)} Close this window and try again.</p>`;
                }
            });
            finderDialog.querySelector('[data-close-finder]').addEventListener('click', () => finderDialog.close());
            finderDialog.addEventListener('click', event => { if (event.target === finderDialog) finderDialog.close(); });
            finderDialog.addEventListener('close', () => finderOpener.focus());
            }
            root.querySelectorAll('.quick-categories, .part-type-options').forEach(rail => {
                const selected = rail.querySelector('[aria-current="page"]');
                if (selected && rail.scrollWidth > rail.clientWidth) {
                    rail.scrollLeft += selected.getBoundingClientRect().left - rail.getBoundingClientRect().left - 12;
                }
            });
        } catch (error) {
            if (renderVersion !== window.Router.renderVersion) return;
            root.innerHTML = `<div class="alert error" role="alert"><h2>The catalogue could not be loaded</h2><p>${escape(error.message)}</p><a class="btn btn-outline" href="${D.buildUrl('')}">Try again</a></div>`;
        }
    });
})();