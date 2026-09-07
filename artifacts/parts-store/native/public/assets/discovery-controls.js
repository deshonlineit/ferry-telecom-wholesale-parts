/* Catalog navigation and device selection. Kept separate from buying flows. */
(function () {
    const escape = window.Core.escapeHtml;
    const t = (key, values) => window.I18n.t(key, values);
    const allowed = ['q', 'department', 'category', 'part', 'brand', 'device_brand', 'family', 'model', 'quality', 'stock', 'featured', 'sort', 'page', 'limit'];
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
        modelResults(catalog, brand, selected = '', query = '', expanded = false) {
            const all = D.modelOptions(catalog, brand, selected);
            const ranked = query.trim()
                ? window.ModelSearch.rank(all, query)
                : [...all].sort((a, b) => Number(Boolean(b.order_known)) - Number(Boolean(a.order_known))
                    || Number(b.sort_order || 0) - Number(a.sort_order || 0)
                    || a.name.localeCompare(b.name, 'en', {numeric: true}));
            if (query.trim() || expanded || ranked.length <= 8) return {models: ranked, total: ranked.length};
            const models = ranked.slice(0, 8);
            const current = ranked.find(model => String(model.id) === String(selected));
            if (current && !models.some(model => String(model.id) === String(current.id))) models.unshift(current);
            return {models, total: ranked.length};
        },
        modelGroupLabel(familyId, label) {
            const value = String(label || '').trim();
            if (familyId !== 'iphone' || !value) return value;
            if (/^iPhone\b.*\bSeries$/i.test(value)) return value;
            const series = value.match(/^(?:iPhone\s+)?(.+?)\s+Series$/i);
            if (series) return `iPhone ${series[1]} Series`;
            const generation = value.match(/^iPhone\s+(.+)$/i);
            return generation ? `iPhone ${generation[1]} Series` : value;
        },
        modelGroups(catalog, models) {
            const families = new Map((catalog.device_families || []).map((family, index) => [family.id, {...family, index}]));
            const groups = new Map();
            models.forEach(model => {
                const familyId = model.family || `brand-${model.brand_id || 'other'}`;
                const family = families.get(familyId);
                const id = `${familyId}:${model.family_group || familyId}`;
                const brand = (catalog.brands || []).find(item => String(item.id) === String(model.brand_id));
                if (!groups.has(id)) groups.set(id, {
                    id,
                    label: D.modelGroupLabel(familyId, model.family_group_label || family?.label || brand?.name || t('other')),
                    order: family?.index ?? 999,
                    sortOrder: 0,
                    models: []
                });
                const group = groups.get(id);
                group.models.push(model);
                group.sortOrder = Math.max(group.sortOrder, Number(model.sort_order || 0));
            });
            return Array.from(groups.values()).sort((a, b) =>
                a.order - b.order || b.sortOrder - a.sortOrder || a.label.localeCompare(b.label, 'en', {numeric: true})
            );
        },
        renderDeviceFields(catalog, params, prefix) {
            params = getParams(params);
            const brand = params.get('brand') || '';
            const model = catalog.models.find(item => String(item.id) === params.get('model'));
            const category = params.get('category') || '';
            return `<div class="device-fields">
                <div class="field filter-step ${model ? 'has-value' : ''}" data-step="1"><label id="${prefix}-model-label">${t('model')}</label>
                    <input type="hidden" name="model" value="${model?.id || ''}">
                    <details class="model-picker">
                        <summary class="form-control" aria-labelledby="${prefix}-model-label ${prefix}-model-caption"><span id="${prefix}-model-caption" class="model-caption">${escape(model?.name || t('allModels'))}</span><span aria-hidden="true">⌄</span></summary>
                        <div class="model-picker-popover">
                            <label class="model-search-wrap">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-4-4"></path></svg>
                                <input class="form-control model-search" type="search" placeholder="${t('searchModelExample')}" aria-label="${t('searchModels')}" autocomplete="off">
                            </label>
                            <p class="model-search-help">${t('searchModelHint')}</p>
                            <div class="model-options">${D.renderModelOptions(catalog, brand, model?.id || '')}</div>
                            <p class="model-empty" hidden>${t('noMatchingModel')}</p>
                        </div>
                    </details>
                </div>
                <div class="field filter-step ${category ? 'has-value' : ''}" data-step="2"><label for="${prefix}-category">${t('part')}</label><select id="${prefix}-category" name="category" class="form-control"><option value="">${t('allParts')}</option>
                    ${window.App.sortCategories(catalog.categories).filter(c => c.count > 0 || String(c.id) === category).map(c => `<option value="${c.id}" ${String(c.id) === category ? 'selected' : ''}>${escape(c.name)} (${c.count})</option>`).join('')}
                </select></div>
                <div class="field filter-step part-type-field ${params.get('part') ? 'has-value' : ''}" data-step="3" ${!(catalog.part_types || []).some(type => !category || String(type.category_id) === category) ? 'hidden' : ''}><label for="${prefix}-part">${t('partType')}</label><select id="${prefix}-part" name="part" class="form-control"><option value="">${t('allTypes')}</option>${(catalog.part_types || []).filter(type => !category || String(type.category_id) === category).map(type => `<option value="${escape(type.id)}" ${type.id === params.get('part') ? 'selected' : ''}>${escape(type.name)} (${type.count})</option>`).join('')}</select></div>
            </div>`;
        },
        renderBrandField(catalog, params, prefix) {
            params = getParams(params);
            const brand = params.get('brand') || '';
            return `<div class="field secondary-filter ${brand ? 'has-value' : ''}"><label for="${prefix}-brand">${t('brand')}</label>
                <select id="${prefix}-brand" name="brand" class="form-control"><option value="">${t('allBrands')}</option>
                ${catalog.brands.filter(b => b.count > 0 || String(b.id) === brand).map(b => `<option value="${b.id}" ${String(b.id) === brand ? 'selected' : ''}>${escape(b.name)} (${b.count})</option>`).join('')}</select></div>`;
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
        renderModelOptions(catalog, brand, selected, query = '', expanded = false) {
            const result = D.modelResults(catalog, brand, selected, query, expanded);
            const groups = D.modelGroups(catalog, result.models);
            const headings = groups.length > 1 || expanded;
            const choices = groups.map(group => `<section class="model-option-group" data-model-group="${escape(group.id)}">
                ${headings ? `<h4>${escape(group.label)}</h4>` : ''}
                ${group.models.map(model => `<button type="button" class="model-option ${String(model.id) === String(selected) ? 'selected' : ''}" data-model="${model.id}" data-brand="${model.brand_id}" data-name="${escape(model.name)}"><span>${escape(model.name)}</span><small>${model.count}</small></button>`).join('')}
            </section>`).join('');
            const more = !query.trim() && result.total > result.models.length
                ? `<button type="button" class="model-show-all" data-model-show-all>${escape(t('showAllModels', {count: String(result.total)}))}</button>`
                : '';
            const caption = query.trim()
                ? t('modelsOfTotal', {shown: result.models.length, total: result.total})
                : (result.total > result.models.length ? t('modelSearch') : t('modelsWithParts', {count: String(result.total), models: t(result.total === 1 ? 'model' : 'models')}));
            return `<button type="button" class="model-option model-option-all" data-model="" data-name="${t('allModels')}">${t('allModels')}</button>
                <p class="model-result-count">${escape(caption)}</p>
                <div class="model-options-scroll">${choices}</div>${more}`;
        },
        bindDeviceFields(form, initialCatalog, {onChange, refreshFacets = true} = {}) {
            let catalog = initialCatalog;
            let sequence = 0;
            let modelsExpanded = false;
            const brand = form.elements.namedItem('brand');
            const model = form.elements.namedItem('model');
            const category = form.elements.namedItem('category');
            const part = form.elements.namedItem('part');
            const picker = form.querySelector('.model-picker');
            const search = form.querySelector('.model-search');
            const options = form.querySelector('.model-options');
            const caption = form.querySelector('.model-caption');
            const values = () => Object.fromEntries(new FormData(form));
            const syncFieldStates = () => {
                form.querySelectorAll('.field').forEach(field => {
                    const control = field.querySelector('select, input[name]');
                    field.classList.toggle('has-value', Boolean(control?.value));
                });
            };
            const filterModels = () => {
                const result = D.modelResults(catalog, brand.value, model.value, search.value, modelsExpanded);
                options.innerHTML = D.renderModelOptions(catalog, brand.value, model.value, search.value, modelsExpanded);
                form.querySelector('.model-empty').hidden = result.models.length > 0;
            };
            search.addEventListener('input', filterModels);
            search.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const matches = D.modelResults(catalog, brand.value, model.value, search.value, true).models;
                    if (matches.length === 1) options.querySelector('[data-model]:not([data-model=""])')?.click();
                    else options.querySelector('[data-model]:not([data-model=""])')?.focus();
                }
                if (event.key === 'ArrowDown') { event.preventDefault(); options.querySelector('[data-model]:not([data-model=""])')?.focus(); }
            });
            picker.addEventListener('toggle', () => { if (picker.open) { search.value = ''; modelsExpanded = false; filterModels(); search.focus(); } });
            picker.addEventListener('keydown', event => {
                if (event.key === 'Escape') { event.preventDefault(); picker.open = false; picker.querySelector('summary').focus(); }
            });
            form.addEventListener('click', event => {
                const showAll = event.target.closest('[data-model-show-all]');
                if (showAll) {
                    event.preventDefault();
                    event.stopPropagation();
                    modelsExpanded = true;
                    filterModels();
                    picker.open = true;
                    options.querySelector('[data-model]:not([data-model=""])')?.focus();
                    return;
                }
                const choice = event.target.closest('[data-model]');
                if (!choice) return;
                model.value = choice.dataset.model;
                if (choice.dataset.brand) brand.value = choice.dataset.brand;
                caption.textContent = choice.dataset.name;
                picker.open = false;
                syncFieldStates();
                picker.querySelector('summary').focus();
                model.dispatchEvent(new Event('change', {bubbles: true}));
            });
            form.addEventListener('change', async event => {
                if (event.target === category && part) part.value = '';
                if (event.target === brand) {
                    model.value = '';
                    caption.textContent = t('allModels');
                    modelsExpanded = false;
                    options.innerHTML = D.renderModelOptions(catalog, brand.value, '');
                }
                syncFieldStates();
                if (onChange && onChange(values()) === false) return;
                if (!['brand', 'model', 'category', 'part', 'quality', 'stock'].includes(event.target.name)) return;
                if (!refreshFacets) return;
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
                    options.innerHTML = D.renderModelOptions(catalog, brand.value, model.value, search.value, modelsExpanded);
                    filterModels();
                    const selectedCategory = category.value;
                    category.innerHTML = `<option value="">${t('allParts')}</option>` + window.App.sortCategories(next.categories)
                        .filter(c => c.count > 0 || String(c.id) === selectedCategory)
                        .map(c => `<option value="${c.id}" ${String(c.id) === selectedCategory ? 'selected' : ''}>${escape(c.name)} (${c.count})</option>`).join('');
                    if (part) {
                        const selectedPart = part.value;
                        const types = (next.part_types || []).filter(type => !selectedCategory || String(type.category_id) === selectedCategory);
                        part.innerHTML = `<option value="">${t('allTypes')}</option>` + types.map(type => `<option value="${escape(type.id)}" ${type.id === selectedPart ? 'selected' : ''}>${escape(type.name)} (${type.count})</option>`).join('');
                        form.querySelector('.part-type-field').hidden = !types.length;
                    }
                } catch (error) {
                    if (form.isConnected) {
                        let notice = form.querySelector('.facet-error');
                        if (!notice) { notice = document.createElement('p'); notice.className = 'facet-error text-danger small'; form.appendChild(notice); }
                        notice.textContent = t('optionsRefreshFailed');
                    }
                }
            });
        }
    };
    D.catalogMetadata = new Map();
    D.catalogCacheKey = params => {
        const key = getParams(params);
        key.delete('page');
        key.delete('sort');
        return [...key.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
    };
    D.getCatalog = (params, key, signal) => {
        const entry = D.catalogMetadata.get(key);
        const now = Date.now();
        if (entry && now - entry.at < 60000) return Promise.resolve(entry.data);
        // A stale facet snapshot is still structurally valid for this filter
        // context. Use it now, then refresh the next visit without delaying
        // the independently fetched product result.
        if (entry) {
            window.Core.fetch('/catalog?' + getParams(params).toString(), {signal}).then(data => {
                D.catalogMetadata.set(key, {data, at: Date.now()});
            }).catch(error => {
                if (error?.name !== 'AbortError') console.warn('Catalogue facets refresh failed', error);
            });
            return Promise.resolve(entry.data);
        }
        const request = window.Core.fetch('/catalog?' + getParams(params).toString(), {signal});
        return request.then(data => {
            D.catalogMetadata.set(key, {data, at: Date.now()});
            return data;
        });
    };
    D.catalogSkeleton = input => {
        const params = getParams(input);
        const familyNames = {
            iphone: 'iPhone',
            ipad: 'iPad',
            macbook: 'MacBook',
            'apple-watch': 'Apple Watch',
            samsung: 'Samsung Galaxy',
            pixel: 'Google Pixel'
        };
        const rawDevice = params.get('family') || '';
        const device = familyNames[rawDevice] || rawDevice.replace(/[-_]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
        const loadingText = device ? `${t('loadingParts')} ${t('for')} ${device}` : t('loadingParts');
        const rows = [1, 2, 3, 4, 5].map(() => `<div class="catalog-skeleton-row" aria-hidden="true">
            <i class="catalog-skeleton-photo"></i>
            <span class="catalog-skeleton-copy"><i></i><i></i><i></i></span>
            <i class="catalog-skeleton-stock"></i>
            <i class="catalog-skeleton-price"></i>
            <i class="catalog-skeleton-action"></i>
        </div>`).join('');
        return `<div data-catalog-shell class="catalog-skeleton" aria-busy="true">
            <div class="catalog-refresh-progress" aria-hidden="true"></div>
            <div class="catalog-skeleton-heading" role="status" aria-live="polite">
                <span class="catalog-eyebrow">${escape(t('catalogue'))}</span>
                <h1>${escape(loadingText)}</h1>
                <p>${escape(t('selectionApplied'))}</p>
            </div>
            <div class="catalog-layout">
                <aside class="catalog-sidebar" aria-hidden="true">
                    <div class="catalog-skeleton-side-title"><i></i><i></i></div>
                    ${[1,2,3,4,5,6].map(() => '<div class="catalog-skeleton-side-row"><i></i><span><i></i></span></div>').join('')}
                </aside>
                <section class="catalog-main" aria-hidden="true">
                    <div class="catalog-skeleton-toolbar"><i></i></div>
                    <div class="b2b-products">${rows}</div>
                </section>
            </div>
        </div>`;
    };
    D.setCatalogRefreshing = (shell, busy, params) => {
        shell.classList.toggle('is-catalog-refreshing', busy);
        shell.setAttribute('aria-busy', String(busy));
        const results = shell.querySelector('[data-catalog-results]');
        if (results) {
            results.setAttribute('aria-busy', String(busy));
            results.toggleAttribute('inert', busy);
        }
        if (busy) {
            shell.querySelectorAll('.quick-category, .part-type-option').forEach(link => {
                const url = new URL(link.href, location.origin);
                const active = url.pathname === location.pathname && url.search === location.search;
                link.classList.toggle('active', active);
                if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
            });
            let progress = shell.querySelector('.catalog-refresh-progress');
            if (!progress) { progress = document.createElement('div'); progress.className = 'catalog-refresh-progress'; progress.setAttribute('aria-hidden', 'true'); shell.prepend(progress); }
        } else {
            shell.querySelector('.catalog-refresh-progress')?.remove();
        }
    };
    D.showCatalogError = (shell, retry) => {
        let notice = shell.querySelector('.catalog-refresh-error');
        if (!notice) {
            notice = document.createElement('div');
            notice.className = 'catalog-refresh-error';
            notice.setAttribute('role', 'alert');
            shell.querySelector('[data-catalog-results]')?.prepend(notice);
        }
        notice.innerHTML = `${escape(t('optionsRefreshFailed'))} <button type="button" class="btn btn-outline btn-sm">${escape(t('retry'))}</button>`;
        notice.querySelector('button').addEventListener('click', retry);
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
        const previousShell = root.querySelector('[data-catalog-shell]');
        D.catalogAbort?.abort();
        const controller = new AbortController();
        D.catalogAbort = controller;
        const token = (D.catalogToken || 0) + 1;
        D.catalogToken = token;
        if (previousShell) D.setCatalogRefreshing(previousShell, true, params);
        else root.innerHTML = D.catalogSkeleton(params);
        try {
            const [catalog, result] = await Promise.all([
                D.getCatalog(params, D.catalogCacheKey(params), controller.signal),
                window.Core.fetch('/products?' + params.toString(), {signal: controller.signal})
            ]);
            if (renderVersion !== window.Router.renderVersion || token !== D.catalogToken || controller.signal.aborted) return;
            const part = (catalog.part_types || []).find(type => type.id === params.get('part'));
            const cat = catalog.categories.find(c => String(c.id) === (params.get('category') || String(part?.category_id || '')));
            const brand = catalog.brands.find(b => String(b.id) === params.get('brand'));
            const deviceBrand = catalog.brands.find(b => String(b.id) === params.get('device_brand'));
            const model = catalog.models.find(m => String(m.id) === params.get('model'));
            const family = (catalog.device_families || []).find(item => item.id === params.get('family'));
            if (model) window.FastFinder.remember(model);
            const query = params.get('q') || '';
            const categoryName = cat?.slug === 'housing' ? 'Housing & parts' : cat?.name;
            const department = ['parts', 'supplies'].includes(params.get('department')) ? params.get('department') : '';
            const subject = part?.name || categoryName || (department === 'supplies' ? t('supplies') : t('partsMenu'));
            const device = model?.name || family?.label || deviceBrand?.name || '';
            const title = device ? `${subject} ${t('for')} ${device}` : (part?.name || categoryName || (query ? t('searchResults') : (department === 'supplies' ? t('supplies') : t('allParts'))));
            const showCategoryModels = true;
            const chips = [
                query && ['q', `“${query}”`], cat && ['category', categoryName], part && ['part', part.name],
                deviceBrand && ['device_brand', deviceBrand.name], family && ['family', family.label], brand && ['brand', brand.name],
                model && ['model', model.name], params.get('quality') && ['quality', params.get('quality')],
                params.get('stock') && ['stock', params.get('stock') === 'out_of_stock' ? t('outOfStock') : t('inStock')],
                params.get('featured') && ['featured', t('featuredParts')]
            ].filter(Boolean);
            const removeLink = ([key, label]) => `<a class="filter-chip" href="${D.buildUrl(params, {[key]: ''})}" aria-label="${t('removeFilter', {label})}">${escape(label)}<span aria-hidden="true">×</span></a>`;
            const filterForm = (prefix, mobile = false) => `<form class="discovery-filters" id="${prefix}-filters" data-context="${escape(params.toString())}">
                ${D.renderDeviceFields(catalog, params, prefix)}
                <details class="advanced-filters" ${params.get('brand') || params.get('quality') || params.get('stock') ? 'open' : ''}><summary>${t('moreFilters')} <small>${t('optional')}</small></summary>
                    ${D.renderBrandField(catalog, params, prefix)}
                    <div class="field"><label for="${prefix}-quality">${t('typeQuality')}</label><select name="quality" id="${prefix}-quality" class="form-control"><option value="">${t('allTypes')}</option>
                    ${[...new Set([...catalog.qualities, params.get('quality')].filter(Boolean))].map(q => `<option ${q === params.get('quality') ? 'selected' : ''} value="${escape(q)}">${escape(q)}</option>`).join('')}</select></div>
                    <label class="check-label"><input type="checkbox" name="stock" value="in_stock" ${params.get('stock') === 'in_stock' || params.get('stock') === '1' ? 'checked' : ''}> ${t('inStockOnly')}</label>
                </details>
                ${mobile ? `<div class="filter-dialog-actions"><button type="button" class="btn btn-outline" data-reset-filters>${t('clear')}</button><button type="submit" class="btn btn-primary">${t('viewResults')}</button></div>` : `<p class="filter-auto-hint">${t('selectionApplied')}</p>`}
            </form>`;
            let view = 'list';
            try { view = localStorage.getItem('view_pref') || 'list'; } catch (_) {}
            if (!['grid', 'list'].includes(view)) view = 'list';
            const sort = params.get('sort') || (query ? 'relevance' : 'featured');
            const sortControl = `<div class="catalog-sort"><label for="catalog-sort">${t('sortBy')}</label><select id="catalog-sort" class="form-control">
                <option value="${query ? 'relevance' : 'featured'}" ${['featured','relevance'].includes(sort) ? 'selected' : ''}>${t(query ? 'bestMatch' : 'featuredFirst')}</option>
                <option value="name" ${sort === 'name' ? 'selected' : ''}>${t('nameAZ')}</option><option value="newest" ${sort === 'newest' ? 'selected' : ''}>${t('recentlyAdded')}</option>
                <option value="stock" ${sort === 'stock' ? 'selected' : ''}>${t('mostStock')}</option>
                ${window.Core.user ? `<option value="price_asc" ${sort === 'price_asc' ? 'selected' : ''}>${t('priceLowHigh')}</option><option value="price_desc" ${sort === 'price_desc' ? 'selected' : ''}>${t('priceHighLow')}</option>` : ''}
            </select></div>`;
            const pages = result.pages;
            const page = result.page;
            const numbered = [...new Set([1, Math.max(1, page - 1), page, Math.min(pages, page + 1), pages])].sort((a, b) => a - b);
            const pagination = pages > 1 ? `<nav class="catalog-pagination" aria-label="${t('pages')}">${page > 1 ? `<a class="btn btn-outline" href="${D.buildUrl(params, {page: page - 1})}">${t('previous')}</a>` : ''}${numbered.map((n, i) => `${i && n > numbered[i - 1] + 1 ? '<span>…</span>' : ''}<a class="btn ${n === page ? 'btn-primary' : 'btn-outline'}" ${n === page ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {page: n})}">${window.I18n.number(n)}</a>`).join('')}${page < pages ? `<a class="btn btn-outline" href="${D.buildUrl(params, {page: page + 1})}">${t('next')}</a>` : ''}</nav>` : '';
            const quickNames = {screens: 'LCDs & screens', batteries: 'Batteries', charging: 'Charging ports', cameras: 'Cameras', housing: 'Housing & parts', flex: 'Flex cables', audio: 'Audio', adhesive: 'Adhesive'};
            const groupedCategories = window.App.groupCategories(catalog.categories);
            const departmentCategories = department ? groupedCategories[department] : catalog.categories;
            const quickCategories = window.App.sortCategories(departmentCategories).filter(c => c.count > 0 || String(c.id) === params.get('category'));
            const partTypes = cat?.slug === 'housing' ? (catalog.part_types || []).filter(type => String(type.category_id) === String(cat.id)) : [];
            const typePicker = partTypes.length ? `<section class="part-type-picker" aria-label="Which part do you need?"><div class="part-type-intro"><span>Which part?</span><small>Not every item is a complete housing.</small></div><nav class="part-type-options" aria-label="Housing part type"><a class="part-type-option ${!part ? 'active' : ''}" ${!part ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {part: ''})}"><strong>All</strong><small>All variants</small></a>${partTypes.map(type => `<a class="part-type-option ${type.id === part?.id ? 'active' : ''} ${type.count === 0 ? 'is-empty' : ''}" ${type.id === part?.id ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: cat.id, part: type.id})}" title="${escape(type.description)}"><span><strong>${escape(type.name)}</strong><b>${type.count}</b></span><small>${escape(type.description)}</small></a>`).join('')}</nav></section>` : '';
            root.innerHTML = `<div data-catalog-shell><div class="catalog-breadcrumb"><a href="${window.APP_BASE}">${t('home')}</a><span>/</span><a href="${D.buildUrl('')}">${t('catalogue')}</a>${cat ? `<span>/</span><span>${escape(cat.name)}</span>` : ''}</div>
                <div class="catalog-heading"><div><span class="catalog-eyebrow">${t('exactlyRight')}</span><h1>${escape(title)}</h1><p class="catalog-description">${window.I18n.number(result.total)} ${t(result.total === 1 ? 'part' : 'parts')}${query ? ` ${t('for')} “${escape(query)}”` : ''}</p></div>${showCategoryModels ? '' : window.FastFinder.inline(params, model)}</div>
                <section class="catalog-smart-search" data-catalog-smart-search aria-label="${t('smartSearch')}" hidden>
                    <div class="catalog-smart-intro"><strong>${t('smartSearch')}</strong><span>${t('smartSearchPrompt')}</span></div>
                    <form class="catalog-smart-form" role="search" data-search-root onsubmit="event.preventDefault(); window.Router.navigate(window.Discovery.buildUrl(new URLSearchParams(window.location.search), {q: this.q.value})); window.UI.closeSuggestions();">
                        <div class="catalog-smart-field">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/></svg>
                            <input type="search" id="catalog-smart-search" name="q" value="${escape(query)}" placeholder="${t('smartSearchPlaceholder')}" aria-label="${t('smartSearchPrompt')}" role="combobox" aria-autocomplete="list" aria-haspopup="dialog" aria-expanded="false" aria-controls="catalog-smart-search-suggestions" autocomplete="off" oninput="window.App.handleSearchInput(this.value, 'catalog-smart-search')" onfocus="window.App.handleSearchFocus('catalog-smart-search')" onkeydown="window.App.handleSearchKeydown(event)">
                            <button type="submit">${t('smartSearch')}</button>
                        </div>
                        <div id="catalog-smart-search-suggestions" class="search-suggestions b2b-search-results" role="dialog" aria-label="${t('smartSearchResults')}" style="display:none;"></div>
                    </form>
                </section>
                <div class="catalog-layout">
                    <aside class="catalog-sidebar" aria-label="${t('browseFilterCatalogue')}">
                        <div class="catalog-sidebar-heading"><span>${t('catalogue')}</span><h2>${t('findRightPart')}</h2></div>
                        <nav class="quick-categories" aria-label="${t('choosePartCategory')}"><a class="quick-category ${!cat ? 'active' : ''}" ${!cat ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: ''})}">${D.railGlyph()}<span>${department === 'supplies' ? t('supplies') : t('allParts')}</span></a>${quickCategories.map(c => `<a class="quick-category ${c.id === cat?.id ? 'active' : ''}" ${cat?.id === c.id ? 'aria-current="page"' : ''} href="${D.buildUrl(params, {category: c.id, part: ''})}">${D.categoryThumb(c)}<span>${escape(window.I18n.dictionaries.en[c.slug] ? t(c.slug) : quickNames[c.slug] || c.name)}</span></a>`).join('')}</nav>
                        ${typePicker}
                        ${showCategoryModels ? window.CategoryModels.render(catalog, params, part?.name || categoryName || 'Your search') : ''}
                        <div class="catalog-desktop-filters">
                            <h3>${t('filterProducts')}</h3>
                            ${filterForm('desktop')}
                        </div>
                        ${chips.length ? `<div class="catalog-sidebar-active"><span>${t('activeFilters')}</span><div class="active-filters">${chips.map(removeLink).join('')}<a class="clear-filters" href="${D.buildUrl('')}">${t('clearAll')}</a></div></div>` : ''}
                    </aside>
                    <section class="catalog-main" data-catalog-results tabindex="-1" aria-label="Product results" aria-busy="false"><p class="catalog-result-status sr-only" aria-live="polite">${window.I18n.number(result.total)} ${t(result.total === 1 ? 'part' : 'parts')}</p>
                        <div class="catalog-refine-row">${showCategoryModels ? '' : `<label class="catalog-tool-field">Brand<select id="catalog-brand" class="form-control"><option value="">All brands</option>${catalog.brands.filter(b => b.count > 0 || String(b.id) === params.get('brand')).map(b => `<option value="${b.id}" ${String(b.id) === params.get('brand') ? 'selected' : ''}>${escape(b.name)}</option>`).join('')}</select></label>`}
                        <label class="catalog-tool-field">${t('quality')}<select id="quick-quality" class="form-control"><option value="">${t('allQualities')}</option>${[...new Set([...catalog.qualities, params.get('quality')].filter(Boolean))].map(q => `<option value="${escape(q)}" ${q === params.get('quality') ? 'selected' : ''}>${escape(q)}</option>`).join('')}</select></label>
                        <button type="button" class="stock-shortcut ${params.get('stock') === 'in_stock' ? 'active' : ''}" data-stock-toggle aria-pressed="${params.get('stock') === 'in_stock'}">${t('inStock')}</button>
                        <button type="button" class="btn btn-outline" id="open-catalog-filters">${t('allFilters')}${chips.length ? ` (${window.I18n.number(chips.length)})` : ''}</button></div>
                        ${chips.length ? `<div class="active-filters">${chips.map(removeLink).join('')}<a class="clear-filters" href="${D.buildUrl('')}">${t('clear')}</a></div>` : ''}
                        ${!window.Core.user ? `<div class="catalog-price-notice"><span>${t('wantPrices')}</span><a href="${window.APP_BASE}login">${t('signIn')} →</a></div>` : ''}
                        ${result.products.length ? window.App.renderProductTable(result.products, {headerHtml: sortControl}) : `<div class="catalog-empty-surface"><div class="b2b-products-toolbar">${sortControl}</div><div class="empty-state"><h2>${part ? t('noPartSelection', {part: part.name}) : t('noPartsCombination')}</h2><p>${part ? `${escape(part.description)} ${t('changeModelHint')}` : t('removeFilterHint')}</p><a class="btn btn-outline" href="${part ? D.buildUrl(params, {part: ''}) : D.buildUrl('')}">${t(part ? 'viewOtherVariants' : 'viewAllParts')}</a></div></div>`}${pagination}
                    </section>
                </div>
                <dialog id="catalog-filter-dialog" class="filter-dialog"><div class="filter-dialog-heading"><h2>${t('refineSelection')}</h2><button type="button" class="btn-close" aria-label="${t('closeFilters')}">×</button></div>${filterForm('mobile', true)}</dialog>
                <dialog id="device-finder-dialog" class="finder-dialog" aria-label="Choose another model"><button type="button" class="btn-close" data-close-finder aria-label="Close model selection">×</button><div data-finder-body></div></dialog></div>`;
            const apply = form => {
                const changes = Object.fromEntries(new FormData(form));
                if (!changes.stock) changes.stock = '';
                window.Router.navigate(D.buildUrl(params, changes));
            };
            for (const prefix of ['desktop', 'mobile']) {
                const form = document.getElementById(prefix + '-filters');
                D.bindDeviceFields(form, catalog, prefix === 'desktop' ? {onChange() { apply(form); return false; }} : {refreshFacets: false});
                if (prefix === 'desktop') {
                    form.querySelector('.advanced-filters')?.addEventListener('change', () => apply(form));
                    continue;
                }
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
            if (error?.name === 'AbortError' || controller.signal.aborted || renderVersion !== window.Router.renderVersion || token !== D.catalogToken) return;
            if (previousShell) {
                D.setCatalogRefreshing(previousShell, false);
                D.showCatalogError(previousShell, () => window.Router.route());
                return;
            }
            root.innerHTML = `<div class="alert error" role="alert"><h2>The catalogue could not be loaded</h2><p>${escape(error.message)}</p><a class="btn btn-outline" href="${D.buildUrl('')}">Try again</a></div>`;
        }
    });
})();